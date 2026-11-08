import type { SimulationRuntime } from './runtime';
import {
  BotProfileId,
  CombatCellLog,
  ForestCellState,
  InvariantViolationReport,
  MachineState,
  MachineType,
  PlayerForestGroup,
  RepairCellLog,
  SecretVillainDraw,
  SimulationConfig,
  SingleGameResult,
  StealthCellLog,
  TacticType,
  TurnTrace,
  VictoryBracket,
} from './types';
import { SeededRNG } from './rng';
import {
  BOT_PROFILE_META,
  resolveTacticsTrackFromPreset,
  resolveTargetPlayerRank1Based,
  TACTIC_META,
} from './i18n';
import { executePhase2BotsDetailed } from './bots';

function isHarvesterCard(t: TacticType): boolean {
  return t === 'A1' || t === 'A2' || t === 'A3';
}

function isBulldozerCard(t: TacticType): boolean {
  return t === 'B1' || t === 'B2' || t === 'B3';
}

function computeVictoryBracket(survivalRateHorizon: number): VictoryBracket {
  if (survivalRateHorizon >= 0.85) return 'MIRACLE';
  if (survivalRateHorizon >= 0.65) return 'MAJOR_VICTORY';
  if (survivalRateHorizon >= 0.45) return 'COSTLY_VICTORY';
  return 'DEFEAT';
}

function countStandingTreesForPlayer(p: PlayerForestGroup): number {
  let sum = 0;
  for (let i = 0; i < p.cells.length; i++) {
    sum += p.cells[i].standingTrees;
  }
  return sum;
}

/**
 * Calcule le stock écologique réel d'un joueur (arbres debout + jusqu'à 1 souche régénérable par case)
 * afin que initialStumpCell2 = true ne fausse jamais le nombre d'"Arbres Perdus" en fin de partie.
 */
function countEcologicalStockForPlayer(p: PlayerForestGroup): number {
  let sum = 0;
  for (let i = 0; i < p.cells.length; i++) {
    sum += p.cells[i].standingTrees + Math.min(1, p.cells[i].stumps);
  }
  return sum;
}

function countTotalActiveStealthTokens(players: PlayerForestGroup[]): number {
  let total = 0;
  for (const p of players) {
    if (p.harvester.status !== 'DESTROYED' && p.harvester.hasSabotage) total++;
    if (p.bulldozer.status !== 'DESTROYED' && p.bulldozer.hasSabotage) total++;
    for (const cell of p.cells) {
      if (cell.hasTrap) total++;
    }
  }
  return total;
}

export function runSingleGame(
  params: SimulationConfig,
  botProfilesInput: BotProfileId[],
  seed: number,
  tableConfigId: string = 'CUSTOM',
  recordTraces: boolean = false,
  runtime?: SimulationRuntime
): SingleGameResult {
  const rng = runtime?.environment ?? new SeededRNG(seed);
  const N = params.numPlayers;
  const X = params.numTurns;
  const a = params.initialTreesPerCell ?? 2;
  const shift = params.combatThresholdShift || 0;
  const cap = params.tacticalDefenderCap || 99;
  const parryHsRule = params.parryHsRule ?? 'SYNERGY_TRAP_SAB';

  // Normalisation de la liste des bots (taille N)
  const botProfiles: BotProfileId[] = [];
  for (let i = 0; i < N; i++) {
    botProfiles.push(botProfilesInput[i % botProfilesInput.length] ?? 'COORD_HYBRID');
  }

  // Configuration de la Piste des Tactiques (6 emplacements) selon tacticsTrackPreset (défaut ASSAULT_LOW en v3.3)
  const presetTrack = params.tacticsTrackPreset
    ? resolveTacticsTrackFromPreset(params.tacticsTrackPreset)
    : params.tacticsTrackSetup;
  const tacticsTrack: TacticType[] =
    presetTrack && presetTrack.length === 6
      ? [...presetTrack]
      : ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];

  if (params.shuffleTacticsTrack) {
    rng.shuffleInPlace(tacticsTrack);
  }

  // En v3.3, l'Abatteuse et le Bulldozer démarrent TOUJOURS ensemble en case 1 à l'état NORMAL
  const allocatedCellsPerTrack = Math.max(X + 5, 16);

  // Initialisation des N groupes de forêt
  const players: PlayerForestGroup[] = [];
  for (let i = 0; i < N; i++) {
    const cells: ForestCellState[] = [];
    for (let c = 1; c <= allocatedCellsPerTrack; c++) {
      // Si initialStumpCell2 == true : pour J1 (i=0) et J2 (i=1), la case 2 démarre avec 1 souche et (a-1) arbres debout
      const hasInitialStump =
        params.initialStumpCell2 && (i === 0 || i === 1) && c === 2;
      const initStumps = hasInitialStump ? 1 : 0;
      const initTrees = Math.max(0, a - initStumps);

      cells.push({
        cellIndex: c,
        standingTrees: initTrees,
        stumps: initStumps,
        hasTrap: false,
        tacticalDefenders: 0,
        stealthDefenders: 0,
        faceUpCards: [],
        faceDownCards: [],
        explodedHereThisTurn: false,
      });
    }

    players.push({
      playerIndex: i,
      rankOnEvilEye: i + 1,
      cells,
      harvester: {
        type: 'A',
        status: 'NORMAL',
        position: 1,
        startOfTurnPosition: 1,
        hasSabotage: false,
      },
      bulldozer: {
        type: 'B',
        status: 'NORMAL',
        position: 1,
        startOfTurnPosition: 1,
        hasSabotage: false,
      },
    });
  }

  // Stock initial réel d'arbres debout + souches régénérables par joueur (= allocatedCellsPerTrack * a)
  const initialEcologicalPotentialPerPlayer = players.map((p) =>
    countEcologicalStockForPlayer(p)
  );
  const initialTotalTreesAllocated = initialEcologicalPotentialPerPlayer.reduce(
    (acc, v) => acc + v,
    0
  );
  const referenceHorizonTrees = Math.max(1, N * X * a);

  const violations: InvariantViolationReport[] = [];
  const traces: TurnTrace[] = [];

  const treesLostPerTurn: number[] = [];
  let cutsCount = 0;
  let bulldozerDestroyedTreesCount = 0;
  let clearingsCount = 0;
  let stumpsClearedCount = 0;
  let overheatTriggersCount = 0;
  let overheatTreesRemovedCount = 0;
  let assaultTriggersCount = 0;
  let simpleParriesCount = 0;
  let parryAndHSCount = 0;
  let explosionsCount = 0;
  let trapsPlacedCount = 0;
  let sabotagesPlacedCount = 0;
  let stealthFailuresCount = 0;
  let stealthBlockedByLimitCount = 0;
  let orphanStealthTokensCount = 0;
  let tacticalOverkillTokensCount = 0;
  let repairsCount = 0;
  let activeRepairsStep31Count = 0;
  let sabotageClearedByRepairCount = 0;
  let respiteDrawsOnDestroyedCount = 0;
  let tacticalDefendersPlaced = 0;
  let stealthDefendersPlaced = 0;

  let step2RevisionsCount = 0;
  let successfulSignalCompletionsCount = 0;
  let sumTurnRelevanceScores = 0;

  let maxCellIndexVisited = 1;

  // Boucle principale des X tours
  for (let turn = 1; turn <= X; turn++) {
    const ecologicalBeforeTurnPerPlayer = players.map((p) =>
      countEcologicalStockForPlayer(p)
    );

    // Enregistrement des positions initiales du tour (pour Étape 3.3 Furtivité)
    for (const p of players) {
      p.harvester.startOfTurnPosition =
        p.harvester.status !== 'DESTROYED' ? p.harvester.position : null;
      p.bulldozer.startOfTurnPosition =
        p.bulldozer.status !== 'DESTROYED' ? p.bulldozer.position : null;
      for (const cell of p.cells) {
        cell.explodedHereThisTurn = false;
        cell.faceUpCards = [];
        cell.faceDownCards = [];
        cell.tacticalDefenders = 0;
        cell.stealthDefenders = 0;
      }
    }

    // =========================================================================
    // PHASE 1 : PLANIFICATION SECRÈTE DU MALFAITEUR (LANCERS DE DÉS 2D6)
    // =========================================================================
    const draws: SecretVillainDraw[] = [];
    for (let k = 0; k < N; k++) {
      const { d1, d2, mIndex } = rng.roll2D6();
      const tactic = tacticsTrack[mIndex - 1];
      const targetRank1Based = resolveTargetPlayerRank1Based(d1, d2, N);
      const targetPlayerIndex = targetRank1Based - 1;
      draws.push({
        rollerPlayerIndex: k,
        d1,
        d2,
        mIndex,
        tactic,
        targetPlayerIndex,
      });
    }

    // =========================================================================
    // PHASE 2 : MOBILISATION DES DÉFENSEURS (2 JETONS PAR JOUEUR)
    // =========================================================================
    const phase2Res = runtime ? runtime.phase2(params, players, draws, botProfiles) : executePhase2BotsDetailed(
      params,
      players,
      draws,
      botProfiles,
      rng
    );
    const placements = phase2Res.decisions;
    step2RevisionsCount += phase2Res.step2RevisionsCount;

    // Vérification Invariant I3 : chaque joueur pose exactement 2 jetons et respecte tacticalDefenderCap
    if (placements.length !== 2 * N) {
      violations.push({
        code: 'I3_DEFENDER_COUNT_MISMATCH',
        turn,
        phase: 'PHASE_2',
        message: `Attendu ${2 * N} placements de Défenseurs, obtenu ${placements.length}.`,
        seed,
      });
    }

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.tacticalDefenders > cap) {
          cell.tacticalDefenders = cap;
        }
      }
    }

    for (const pl of placements) {
      if (pl.track === 'TACTICAL') tacticalDefendersPlaced++;
      else stealthDefendersPlaced++;
    }

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.1 : RÉVÉLATION, POSE DES CARTES & AVANCÉE DES MACHINES
    // =========================================================================
    const initialStep31Status = players.map((p) => ({
      harvesterStatus: p.harvester.status,
      harvesterPos: p.harvester.position,
      bulldozerStatus: p.bulldozer.status,
      bulldozerPos: p.bulldozer.position,
    }));

    const drawsCountByTargetMachine = new Map<string, number>();
    const drawsSeenIndexByTargetMachine = new Map<string, number>();
    for (const draw of draws) {
      const mType: MachineType = isHarvesterCard(draw.tactic) ? 'A' : 'B';
      const key = `${draw.targetPlayerIndex}-${mType}`;
      drawsCountByTargetMachine.set(
        key,
        (drawsCountByTargetMachine.get(key) ?? 0) + 1
      );
    }

    const cardPlacements: TurnTrace['cardPlacements'] = [];

    for (const draw of draws) {
      const targetPlayer = players[draw.targetPlayerIndex];
      const mType: MachineType = isHarvesterCard(draw.tactic) ? 'A' : 'B';
      const key = `${draw.targetPlayerIndex}-${mType}`;
      const totalHitsOnMachine = drawsCountByTargetMachine.get(key) ?? 1;
      const hitIdx = drawsSeenIndexByTargetMachine.get(key) ?? 0;
      drawsSeenIndexByTargetMachine.set(key, hitIdx + 1);

      const stBefore =
        mType === 'A'
          ? initialStep31Status[draw.targetPlayerIndex].harvesterStatus
          : initialStep31Status[draw.targetPlayerIndex].bulldozerStatus;
      const posBefore =
        mType === 'A'
          ? initialStep31Status[draw.targetPlayerIndex].harvesterPos
          : initialStep31Status[draw.targetPlayerIndex].bulldozerPos;

      if (stBefore === 'DESTROYED' || posBefore === null) {
        respiteDrawsOnDestroyedCount++;
        cardPlacements.push({
          fromPlayerIndex: draw.rollerPlayerIndex,
          targetPlayerIndex: draw.targetPlayerIndex,
          tactic: draw.tactic,
          machineType: mType,
          machineStatusBefore: stBefore,
          placedCell: null,
          faceUp: false,
          ignoredBecauseDestroyed: true,
        });
      } else if (stBefore === 'HS') {
        if (totalHitsOnMachine >= 2) {
          if (hitIdx === 0) {
            const machineObj =
              mType === 'A' ? targetPlayer.harvester : targetPlayer.bulldozer;
            machineObj.status = 'NORMAL';
            repairsCount++;
            activeRepairsStep31Count++;
            let sabCleared = false;
            if (machineObj.hasSabotage) {
              machineObj.hasSabotage = false;
              sabotageClearedByRepairCount++;
              sabCleared = true;
            }
            cardPlacements.push({
              fromPlayerIndex: draw.rollerPlayerIndex,
              targetPlayerIndex: draw.targetPlayerIndex,
              tactic: draw.tactic,
              machineType: mType,
              machineStatusBefore: stBefore,
              placedCell: posBefore,
              faceUp: false,
              ignoredBecauseDestroyed: false,
              repairedImmediatelyInStep31: true,
              sabotageClearedInStep31: sabCleared,
            });
          } else {
            const targetCellIdx = posBefore + 1;
            const cell = targetPlayer.cells[targetCellIdx - 1];
            cell.faceUpCards.push(draw.tactic);
            cardPlacements.push({
              fromPlayerIndex: draw.rollerPlayerIndex,
              targetPlayerIndex: draw.targetPlayerIndex,
              tactic: draw.tactic,
              machineType: mType,
              machineStatusBefore: stBefore,
              placedCell: targetCellIdx,
              faceUp: true,
              ignoredBecauseDestroyed: false,
              repairedImmediatelyInStep31: false,
            });
          }
        } else {
          const cell = targetPlayer.cells[posBefore - 1];
          cell.faceDownCards.push(draw.tactic);
          cardPlacements.push({
            fromPlayerIndex: draw.rollerPlayerIndex,
            targetPlayerIndex: draw.targetPlayerIndex,
            tactic: draw.tactic,
            machineType: mType,
            machineStatusBefore: stBefore,
            placedCell: posBefore,
            faceUp: false,
            ignoredBecauseDestroyed: false,
            repairedImmediatelyInStep31: false,
          });
        }
      } else {
        const targetCellIdx = posBefore + 1;
        const cell = targetPlayer.cells[targetCellIdx - 1];
        cell.faceUpCards.push(draw.tactic);
        cardPlacements.push({
          fromPlayerIndex: draw.rollerPlayerIndex,
          targetPlayerIndex: draw.targetPlayerIndex,
          tactic: draw.tactic,
          machineType: mType,
          machineStatusBefore: stBefore,
          placedCell: targetCellIdx,
          faceUp: true,
          ignoredBecauseDestroyed: false,
        });
      }
    }

    const machineMoves: TurnTrace['machineMoves'] = [];
    for (const p of players) {
      if (p.harvester.status === 'NORMAL' && p.harvester.position !== null) {
        const nextCellIdx = p.harvester.position + 1;
        const nextCell = p.cells[nextCellIdx - 1];
        if (nextCell && nextCell.faceUpCards.some(isHarvesterCard)) {
          const fromCell = p.harvester.position;
          p.harvester.position = nextCellIdx;
          maxCellIndexVisited = Math.max(maxCellIndexVisited, nextCellIdx);
          machineMoves.push({
            playerIndex: p.playerIndex,
            machineType: 'A',
            fromCell,
            toCell: nextCellIdx,
          });
        }
      }
      if (p.bulldozer.status === 'NORMAL' && p.bulldozer.position !== null) {
        const nextCellIdx = p.bulldozer.position + 1;
        const nextCell = p.cells[nextCellIdx - 1];
        if (nextCell && nextCell.faceUpCards.some(isBulldozerCard)) {
          const fromCell = p.bulldozer.position;
          p.bulldozer.position = nextCellIdx;
          maxCellIndexVisited = Math.max(maxCellIndexVisited, nextCellIdx);
          machineMoves.push({
            playerIndex: p.playerIndex,
            machineType: 'B',
            fromCell,
            toCell: nextCellIdx,
          });
        }
      }
    }

    const knockedHSInCombatThisTurn = new Set<string>();

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.2 : RÉSOLUTION DES COMBATS (AVEC RÈGLE parryHsRule v3.3)
    // =========================================================================
    const combats: CombatCellLog[] = [];
    let turnOverkillTokens = 0;
    let turnUsefulTacticalTokensOnAttacked = 0;

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.faceUpCards.length === 0) {
          if (cell.tacticalDefenders > 0) {
            tacticalOverkillTokensCount += cell.tacticalDefenders;
            turnOverkillTokens += cell.tacticalDefenders;
          }
          continue;
        }

        const c = cell.cellIndex;
        const engagedA =
          p.harvester.status !== 'DESTROYED' &&
          p.harvester.position === c &&
          cell.faceUpCards.some(isHarvesterCard);
        const engagedB =
          p.bulldozer.status !== 'DESTROYED' &&
          p.bulldozer.position === c &&
          cell.faceUpCards.some(isBulldozerCard);

        const trapBonus = cell.hasTrap ? 1 : 0;
        const sabotageBonus =
          (engagedA && p.harvester.hasSabotage ? 1 : 0) +
          (engagedB && p.bulldozer.hasSabotage ? 1 : 0);
        const defenseScoreS = cell.tacticalDefenders + trapBonus + sabotageBonus;

        const assaultCountK = cell.faceUpCards.filter(
          (t) => t === 'A3' || t === 'B3'
        ).length;
        assaultTriggersCount += assaultCountK;

        const parryThreshold = 2 + assaultCountK + shift;
        const standardHsThreshold = 3 + assaultCountK + shift;
        const hasStealthSynergy = trapBonus + sabotageBonus >= 1;
        const triggersHS =
          defenseScoreS >= standardHsThreshold ||
          (parryHsRule !== 'STANDARD_S3' &&
            defenseScoreS >= parryThreshold &&
            hasStealthSynergy);

        // Calcul de l'Overkill Tactique en cohérence avec parryHsRule
        const maxUsefulS =
          parryHsRule !== 'STANDARD_S3' && hasStealthSynergy
            ? parryThreshold
            : standardHsThreshold;
        const maxUsefulTacticalDefenders = Math.max(
          0,
          maxUsefulS - (trapBonus + sabotageBonus)
        );
        const tacticalOverkillOnCell = Math.max(
          0,
          cell.tacticalDefenders - maxUsefulTacticalDefenders
        );
        tacticalOverkillTokensCount += tacticalOverkillOnCell;
        turnOverkillTokens += tacticalOverkillOnCell;
        turnUsefulTacticalTokensOnAttacked += Math.max(
          0,
          cell.tacticalDefenders - tacticalOverkillOnCell
        );

        let outcome: CombatCellLog['outcome'];
        let harvesterExploded = false;
        let bulldozerExploded = false;
        let treesCutToStumps = 0;
        let bulldozerDestroyedTreeOnZeroStump = 0;
        let stumpsCleared = 0;
        let treesRemovedByOverheat = 0;
        let treesDestroyedByExplosion = 0;
        let harvesterBecameHS = false;
        let bulldozerBecameHS = false;

        if (defenseScoreS < parryThreshold) {
          // CAS 1 : L'ATTAQUE RÉUSSIT (S < 2 + k + shift)
          outcome = 'ATTACK_SUCCESS';

          if (engagedA) {
            const nA1 = cell.faceUpCards.filter((t) => t === 'A1').length;
            const nA2 = cell.faceUpCards.filter((t) => t === 'A2').length;
            const nA3 = cell.faceUpCards.filter((t) => t === 'A3').length;

            if (nA2 >= 1 && nA3 >= 1) {
              harvesterExploded = true;
              explosionsCount++;
              treesDestroyedByExplosion += cell.standingTrees;
              cell.standingTrees = 0;
              cell.stumps = 0;
              p.harvester.status = 'DESTROYED';
              p.harvester.position = null;
              p.harvester.hasSabotage = false;
              cell.explodedHereThisTurn = true;
            } else {
              const nAbattages = nA1 + nA2 + nA3;
              const cut = Math.min(cell.standingTrees, nAbattages);
              cell.standingTrees -= cut;
              cell.stumps += cut;
              treesCutToStumps += cut;
              cutsCount += cut;

              if (nA2 >= 1) {
                overheatTriggersCount += nA2;
                for (let r = 0; r < nA2; r++) {
                  if (cell.standingTrees >= 1) {
                    cell.standingTrees -= 1;
                    treesRemovedByOverheat += 1;
                    overheatTreesRemovedCount += 1;
                  } else if (cell.stumps >= 1) {
                    cell.stumps -= 1;
                    treesRemovedByOverheat += 1;
                    overheatTreesRemovedCount += 1;
                  }
                }
                p.harvester.status = 'HS';
                harvesterBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-A`);
              }

              if (nA3 >= 1) {
                p.harvester.status = 'HS';
                harvesterBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-A`);
              }
            }
          }

          if (engagedB) {
            const nB1 = cell.faceUpCards.filter((t) => t === 'B1').length;
            const nB2 = cell.faceUpCards.filter((t) => t === 'B2').length;
            const nB3 = cell.faceUpCards.filter((t) => t === 'B3').length;

            if (nB2 >= 1 && nB3 >= 1) {
              bulldozerExploded = true;
              explosionsCount++;
              treesDestroyedByExplosion += cell.standingTrees;
              cell.standingTrees = 0;
              cell.stumps = 0;
              p.bulldozer.status = 'DESTROYED';
              p.bulldozer.position = null;
              p.bulldozer.hasSabotage = false;
              cell.explodedHereThisTurn = true;
            } else {
              const nActionsB = nB1 + nB2 + nB3;

              if (nActionsB >= 1) {
                if (cell.stumps > 0) {
                  clearingsCount += 1;
                  stumpsCleared += cell.stumps;
                  stumpsClearedCount += cell.stumps;
                  cell.stumps = 0;
                } else if (params.bulldozerZeroStumpAction === 'DESTROY_TREE') {
                  if (cell.standingTrees > 0) {
                    cell.standingTrees -= 1;
                    bulldozerDestroyedTreeOnZeroStump += 1;
                    bulldozerDestroyedTreesCount += 1;
                  }
                } else {
                  clearingsCount += 1;
                }

                if (nActionsB > 1) {
                  const extraCut = Math.min(cell.standingTrees, nActionsB - 1);
                  cell.standingTrees -= extraCut;
                  cell.stumps += extraCut;
                  treesCutToStumps += extraCut;
                  cutsCount += extraCut;
                }
              }

              if (nB2 >= 1) {
                overheatTriggersCount += nB2;
                for (let r = 0; r < nB2; r++) {
                  if (cell.standingTrees >= 1) {
                    cell.standingTrees -= 1;
                    treesRemovedByOverheat += 1;
                    overheatTreesRemovedCount += 1;
                  } else if (cell.stumps >= 1) {
                    cell.stumps -= 1;
                    treesRemovedByOverheat += 1;
                    overheatTreesRemovedCount += 1;
                  }
                }
                p.bulldozer.status = 'HS';
                bulldozerBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-B`);
              }

              if (nB3 >= 1) {
                p.bulldozer.status = 'HS';
                bulldozerBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-B`);
              }
            }
          }
        } else if (triggersHS) {
          // CAS 3 : PARADE + MISE HORS SERVICE (S >= 3+k+shift OU Synergie Piège/Sabotage dès S >= 2+k+shift)
          outcome = 'PARRY_AND_HS';
          parryAndHSCount++;
          if (engagedA && p.harvester.status !== 'DESTROYED') {
            p.harvester.status = 'HS';
            harvesterBecameHS = true;
            knockedHSInCombatThisTurn.add(`${p.playerIndex}-A`);
          }
          if (engagedB && p.bulldozer.status !== 'DESTROYED') {
            p.bulldozer.status = 'HS';
            bulldozerBecameHS = true;
            knockedHSInCombatThisTurn.add(`${p.playerIndex}-B`);
          }
        } else {
          // CAS 2 : PARADE SIMPLE (S == 2 + k + shift sans Synergie Piège/Sabotage)
          outcome = 'SIMPLE_PARRY';
          simpleParriesCount++;
        }

        // Si un combat a abouti à une Parade ou Mise HS grâce à >= 1 jeton allié posé en 2.2 (complétion de signal), on incrémente successfulSignalCompletionsCount
        if (outcome === 'SIMPLE_PARRY' || outcome === 'PARRY_AND_HS') {
          const hasAllySupportIn22 = placements.some(
            (pl) =>
              pl.step === 2 &&
              pl.track === 'TACTICAL' &&
              pl.targetPlayerIndex === p.playerIndex &&
              pl.cellIndex === c
          );
          if (hasAllySupportIn22 && cell.tacticalDefenders >= 1) {
            successfulSignalCompletionsCount += 1;
          }
        }

        // Nettoyage post-combat de la case c
        cell.hasTrap = false;
        if (engagedA) p.harvester.hasSabotage = false;
        if (engagedB) p.bulldozer.hasSabotage = false;

        combats.push({
          playerIndex: p.playerIndex,
          cellIndex: c,
          faceUpCards: [...cell.faceUpCards],
          engagedHarvester: engagedA,
          engagedBulldozer: engagedB,
          tacticalDefenders: cell.tacticalDefenders,
          trapBonus,
          sabotageBonus,
          defenseScoreS,
          assaultCountK,
          thresholdShift: shift,
          outcome,
          harvesterExploded,
          bulldozerExploded,
          treesCutToStumps,
          bulldozerDestroyedTreeOnZeroStump,
          stumpsCleared,
          treesRemovedByOverheat,
          treesDestroyedByExplosion,
          harvesterBecameHS,
          bulldozerBecameHS,
          tacticalOverkillOnCell,
        });
      }
    }

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.3 : RÉSOLUTION DE LA PISTE FURTIVITÉ
    // =========================================================================
    const stealthActions: StealthCellLog[] = [];
    let turnSuccessfulStealthTokens = 0;

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.stealthDefenders === 0) continue;
        const c = cell.cellIndex;

        if (cell.stealthDefenders === 1) {
          orphanStealthTokensCount += 1;
          stealthActions.push({
            playerIndex: p.playerIndex,
            cellIndex: c,
            stealthDefenders: 1,
            outcome: 'ORPHAN_SINGLE_TOKEN',
            sabotagedMachines: [],
          });
          continue;
        }

        if (cell.stealthDefenders > 2) {
          orphanStealthTokensCount += cell.stealthDefenders - 2;
        }

        const machinesPresentAfter: MachineState[] = [];
        if (p.harvester.status !== 'DESTROYED' && p.harvester.position === c) {
          machinesPresentAfter.push(p.harvester);
        }
        if (p.bulldozer.status !== 'DESTROYED' && p.bulldozer.position === c) {
          machinesPresentAfter.push(p.bulldozer);
        }

        const wasOccupiedBefore =
          p.harvester.startOfTurnPosition === c ||
          p.bulldozer.startOfTurnPosition === c;

        if (machinesPresentAfter.length >= 1) {
          let activeTokens = countTotalActiveStealthTokens(players);
          const unsabotagedMachines = machinesPresentAfter.filter(
            (m) => !m.hasSabotage
          );

          if (unsabotagedMachines.length > 0 && activeTokens >= N) {
            stealthFailuresCount++;
            stealthBlockedByLimitCount++;
            stealthActions.push({
              playerIndex: p.playerIndex,
              cellIndex: c,
              stealthDefenders: cell.stealthDefenders,
              outcome: 'FAILED_TOKEN_LIMIT_REACHED',
              sabotagedMachines: [],
            });
          } else {
            const sabotagedTypes: MachineType[] = [];
            for (const m of machinesPresentAfter) {
              if (!m.hasSabotage) {
                if (activeTokens < N) {
                  m.hasSabotage = true;
                  sabotagesPlacedCount++;
                  activeTokens++;
                  sabotagedTypes.push(m.type);
                } else {
                  stealthBlockedByLimitCount++;
                }
              } else {
                sabotagedTypes.push(m.type);
              }
            }
            turnSuccessfulStealthTokens += 2;
            successfulSignalCompletionsCount += 1;
            stealthActions.push({
              playerIndex: p.playerIndex,
              cellIndex: c,
              stealthDefenders: cell.stealthDefenders,
              outcome: 'SABOTAGE_PLACED',
              sabotagedMachines: sabotagedTypes,
            });
          }
        } else if (
          machinesPresentAfter.length === 0 &&
          !wasOccupiedBefore &&
          !cell.explodedHereThisTurn
        ) {
          const activeTokens = countTotalActiveStealthTokens(players);
          if (!cell.hasTrap && activeTokens >= N) {
            stealthFailuresCount++;
            stealthBlockedByLimitCount++;
            stealthActions.push({
              playerIndex: p.playerIndex,
              cellIndex: c,
              stealthDefenders: cell.stealthDefenders,
              outcome: 'FAILED_TOKEN_LIMIT_REACHED',
              sabotagedMachines: [],
            });
          } else {
            if (!cell.hasTrap) {
              cell.hasTrap = true;
              trapsPlacedCount++;
            }
            turnSuccessfulStealthTokens += 2;
            successfulSignalCompletionsCount += 1;
            stealthActions.push({
              playerIndex: p.playerIndex,
              cellIndex: c,
              stealthDefenders: cell.stealthDefenders,
              outcome: 'TRAP_PLACED',
              sabotagedMachines: [],
            });
          }
        } else {
          stealthFailuresCount++;
          stealthActions.push({
            playerIndex: p.playerIndex,
            cellIndex: c,
            stealthDefenders: cell.stealthDefenders,
            outcome: 'FAILED_VACATED_OR_EXPLODED',
            sabotagedMachines: [],
          });
        }
      }
    }

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.4 : RÉPARATION DES MACHINES HS & FIN DU TOUR
    // =========================================================================
    const repairs: RepairCellLog[] = [];

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.faceDownCards.length === 0) continue;
        const c = cell.cellIndex;

        let harvesterRepaired = false;
        let bulldozerRepaired = false;
        let harvesterSabotageCleared = false;
        let bulldozerSabotageCleared = false;

        if (
          p.harvester.status === 'HS' &&
          p.harvester.position === c &&
          cell.faceDownCards.some(isHarvesterCard)
        ) {
          if (knockedHSInCombatThisTurn.has(`${p.playerIndex}-A`)) {
            violations.push({
              code: 'I1_SAME_TURN_COMBAT_HS_REPAIRED',
              turn,
              phase: 'STEP_3_4',
              message: `Abatteuse du joueur J${p.playerIndex + 1} mise HS en combat et réparée le même tour.`,
              seed,
            });
          }
          p.harvester.status = 'NORMAL';
          harvesterRepaired = true;
          repairsCount++;
          if (p.harvester.hasSabotage) {
            p.harvester.hasSabotage = false;
            harvesterSabotageCleared = true;
            sabotageClearedByRepairCount++;
          }
        }

        if (
          p.bulldozer.status === 'HS' &&
          p.bulldozer.position === c &&
          cell.faceDownCards.some(isBulldozerCard)
        ) {
          if (knockedHSInCombatThisTurn.has(`${p.playerIndex}-B`)) {
            violations.push({
              code: 'I1_SAME_TURN_COMBAT_HS_REPAIRED',
              turn,
              phase: 'STEP_3_4',
              message: `Bulldozer du joueur J${p.playerIndex + 1} mis HS en combat et réparé le même tour.`,
              seed,
            });
          }
          p.bulldozer.status = 'NORMAL';
          bulldozerRepaired = true;
          repairsCount++;
          if (p.bulldozer.hasSabotage) {
            p.bulldozer.hasSabotage = false;
            bulldozerSabotageCleared = true;
            sabotageClearedByRepairCount++;
          }
        }

        repairs.push({
          playerIndex: p.playerIndex,
          cellIndex: c,
          faceDownCards: [...cell.faceDownCards],
          harvesterRepaired,
          bulldozerRepaired,
          harvesterSabotageCleared,
          bulldozerSabotageCleared,
        });
      }
    }

    // Vérification des invariants I2 et I4 avant le nettoyage de fin de tour
    if (countTotalActiveStealthTokens(players) > N) {
      violations.push({
        code: 'I4_INVALID_TRAP_OR_SABOTAGE',
        turn,
        phase: 'END_OF_TURN',
        message: `Dépassement de la réserve de ${N} jetons Furtivité (${countTotalActiveStealthTokens(players)} présents).`,
        seed,
      });
    }

    for (const p of players) {
      if (p.harvester.status === 'DESTROYED' && p.harvester.hasSabotage) {
        violations.push({
          code: 'I4_INVALID_TRAP_OR_SABOTAGE',
          turn,
          phase: 'END_OF_TURN',
          message: `Machine A détruite possède encore un jeton Sabotage (J${p.playerIndex + 1}).`,
          seed,
        });
      }
      if (p.bulldozer.status === 'DESTROYED' && p.bulldozer.hasSabotage) {
        violations.push({
          code: 'I4_INVALID_TRAP_OR_SABOTAGE',
          turn,
          phase: 'END_OF_TURN',
          message: `Machine B détruite possède encore un jeton Sabotage (J${p.playerIndex + 1}).`,
          seed,
        });
      }
      for (const cell of p.cells) {
        if (cell.standingTrees < 0 || cell.stumps < 0) {
          violations.push({
            code: 'I2_NEGATIVE_TREES_OR_STUMPS',
            turn,
            phase: 'END_OF_TURN',
            message: `Valeurs négatives sur J${p.playerIndex + 1} case ${cell.cellIndex}: arbres=${cell.standingTrees}, souches=${cell.stumps}.`,
            seed,
          });
        }
      }
    }

    // Nettoyage de fin de tour
    for (const p of players) {
      for (const cell of p.cells) {
        cell.faceUpCards = [];
        cell.faceDownCards = [];
        cell.tacticalDefenders = 0;
        cell.stealthDefenders = 0;
        cell.explodedHereThisTurn = false;
      }
    }

    // Calcul des arbres (potentiel écologique) perdus ce tour-ci par joueur
    const treesLostThisTurnPerPlayer = players.map((p, idx) =>
      Math.max(
        0,
        ecologicalBeforeTurnPerPlayer[idx] - countEcologicalStockForPlayer(p)
      )
    );
    const totalTreesLostThisTurn = treesLostThisTurnPerPlayer.reduce(
      (acc, v) => acc + v,
      0
    );
    treesLostPerTurn.push(totalTreesLostThisTurn);

    // Calcul de la pertinence des poses de jetons du tour (placementRelevanceScore in [0, 1])
    const effectiveTokensCount =
      turnUsefulTacticalTokensOnAttacked + turnSuccessfulStealthTokens;
    const tokenEfficiencyRatio = Math.max(
      0,
      Math.min(1, effectiveTokensCount / Math.max(1, 2 * N))
    );
    const parriedCombatsCount = combats.filter(
      (cb) => cb.outcome === 'SIMPLE_PARRY' || cb.outcome === 'PARRY_AND_HS'
    ).length;
    const combatDefenseRatio =
      combats.length > 0 ? parriedCombatsCount / combats.length : 1;
    const turnRelevance = Math.max(
      0,
      Math.min(1, 0.55 * tokenEfficiencyRatio + 0.45 * combatDefenseRatio)
    );
    sumTurnRelevanceScores += turnRelevance;

    if (recordTraces) {
      traces.push({
        turn,
        draws,
        placements,
        cardPlacements,
        machineMoves,
        combats,
        stealthActions,
        repairs,
        treesLostThisTurnPerPlayer,
        totalTreesLostThisTurn,
        endOfTurnSnapshot: players.map((p) => ({
          playerIndex: p.playerIndex,
          harvesterPos: p.harvester.position,
          harvesterStatus: p.harvester.status,
          harvesterSabotaged: p.harvester.hasSabotage,
          bulldozerPos: p.bulldozer.position,
          bulldozerStatus: p.bulldozer.status,
          bulldozerSabotaged: p.bulldozer.hasSabotage,
          trappedCells: p.cells.filter((c) => c.hasTrap).map((c) => c.cellIndex),
        })),
      });
    }
  }

  // ===========================================================================
  // FIN DE PARTIE : RÉGÉNÉRATION ÉCOLOGIQUE (TOUJOURS ACTIVE) & BILAN
  // ===========================================================================
  let regeneratedTreesCount = 0;
  for (const p of players) {
    for (const cell of p.cells) {
      if (cell.stumps >= 1) {
        cell.stumps -= 1;
        cell.standingTrees += 1;
        regeneratedTreesCount += 1;
      }
    }
  }

  const finalStandingTreesPerPlayer = players.map((p) =>
    countStandingTreesForPlayer(p)
  );
  const finalStandingTreesTotal = finalStandingTreesPerPlayer.reduce(
    (acc, v) => acc + v,
    0
  );

  const treesLostPerPlayer = players.map((_p, idx) =>
    Math.max(
      0,
      initialEcologicalPotentialPerPlayer[idx] - finalStandingTreesPerPlayer[idx]
    )
  );
  const totalTreesLost = treesLostPerPlayer.reduce((acc, v) => acc + v, 0);

  const survivalRateHorizon = Math.max(
    0,
    Math.min(
      1,
      (referenceHorizonTrees - totalTreesLost) / referenceHorizonTrees
    )
  );

  const visitedCellHorizonPerTrack = Math.min(
    allocatedCellsPerTrack,
    maxCellIndexVisited + 1
  );
  const visitedInitialTrees = Math.max(1, N * visitedCellHorizonPerTrack * a);
  const survivalRateVisited = Math.max(
    0,
    Math.min(1, (visitedInitialTrees - totalTreesLost) / visitedInitialTrees)
  );

  const survivingTreesPerPlayerOnHorizon = treesLostPerPlayer.map((lost) =>
    Math.max(0, X * a - lost)
  );

  const victoryBracket = computeVictoryBracket(survivalRateHorizon);
  const placementRelevanceScore = Math.max(
    0,
    Math.min(1, sumTurnRelevanceScores / Math.max(1, X))
  );

  const result: SingleGameResult = {
    seed,
    params,
    tableConfigId,
    botProfiles,
    allocatedCellsPerTrack,
    initialTotalTreesAllocated,
    referenceHorizonTrees,
    finalStandingTreesTotal,
    totalTreesLost,
    survivalRateHorizon,
    survivalRateVisited,
    regeneratedTreesCount,
    victoryBracket,
    treesLostPerTurn,
    treesLostPerPlayer,
    survivingTreesPerPlayerOnHorizon,
    cutsCount,
    bulldozerDestroyedTreesCount,
    clearingsCount,
    stumpsClearedCount,
    overheatTriggersCount,
    overheatTreesRemovedCount,
    assaultTriggersCount,
    simpleParriesCount,
    parryAndHSCount,
    explosionsCount,
    trapsPlacedCount,
    sabotagesPlacedCount,
    stealthFailuresCount,
    stealthBlockedByLimitCount,
    orphanStealthTokensCount,
    tacticalOverkillTokensCount,
    repairsCount,
    activeRepairsStep31Count,
    sabotageClearedByRepairCount,
    respiteDrawsOnDestroyedCount,
    tacticalDefendersPlaced,
    stealthDefendersPlaced,
    step2RevisionsCount,
    successfulSignalCompletionsCount,
    placementRelevanceScore,
    violations,
    traces: recordTraces ? traces : undefined,
  };

  if (recordTraces) {
    result.textualJournal = formatGameCombatLog(result);
  }

  return result;
}

/**
 * Génère le Journal de Combat textuel détaillé ("Combat Log" v3.3) d'une partie
 */
export function formatGameCombatLog(game: SingleGameResult): string {
  const lines: string[] = [];
  const p = game.params;

  lines.push(
    `================================================================================`
  );
  lines.push(
    `JOURNAL DE COMBAT (COMBAT LOG v3.3) — GRAINE #${game.seed}`
  );
  lines.push(
    `================================================================================`
  );
  lines.push(
    `Paramètres : N=${p.numPlayers} joueurs | X=${p.numTurns} tours | a=${p.initialTreesPerCell} arbres/case | Horizon réf.=${game.referenceHorizonTrees} arbres`
  );
  lines.push(
    `Leviers v3.3 : CapTactique=${p.tacticalDefenderCap === 99 ? 'Illimité(99)' : p.tacticalDefenderCap} | ShiftS=+${p.combatThresholdShift} | SynergieHS=${p.parryHsRule ?? 'SYNERGY_TRAP_SAB'} | Bull0Souche=${p.bulldozerZeroStumpAction} | SoucheInitCase2(J1,J2)=${p.initialStumpCell2 ? 'Oui' : 'Non'} | Piste=${p.tacticsTrackPreset}`
  );
  lines.push(
    `Invariants figés v3.3 : a=2 | ASSAULT_LOW | DESTROY_TREE | initialStumpCell2=true | D2-Double | CumulA2 | Régén | ActRep(3.1) | PurgeSab | MaxN(${p.numPlayers})`
  );
  lines.push(
    `Profils de Bots : ${game.botProfiles.map((b, i) => `J${i + 1}:${BOT_PROFILE_META[b]?.shortLabel ?? b}`).join(' | ')}`
  );
  lines.push(
    `--------------------------------------------------------------------------------`
  );

  if (!game.traces || game.traces.length === 0) {
    lines.push(`(Traces détaillées non enregistrées pour cette partie)`);
    return lines.join('\n');
  }

  for (const t of game.traces) {
    lines.push(`\n▶ TOUR ${t.turn} / ${p.numTurns}`);
    lines.push(`  [Phase 1 — Tirages Secrets 2D6 sous Gobelets (Info Privée I1)]`);
    for (const d of t.draws) {
      lines.push(
        `    • J${d.rollerPlayerIndex + 1} lance (${d.d1}, ${d.d2}) → M=min(${d.d1},${d.d2})=${d.mIndex} [${d.tactic} - ${TACTIC_META[d.tactic].name}] | Cible : Piste J${d.targetPlayerIndex + 1}`
      );
    }

    lines.push(
      `  [Phase 2 — Placement des Jetons Défenseurs & Boucle de Révision 2.2 (I1+I2+I3)]`
    );
    for (const pl of t.placements) {
      const stepLabel =
        pl.step === 1
          ? 'Étape 2.1 (Sa forêt - Simultané)'
          : `Étape 2.2 (Soutien allié - Ronde R${pl.revisionsRound ?? 1})`;
      const trackLabel =
        pl.track === 'TACTICAL' ? 'Piste Tactique' : 'Piste Furtivité';
      lines.push(
        `    • J${pl.playerIndex + 1} [${stepLabel}] → Piste J${pl.targetPlayerIndex + 1}, Case ${pl.cellIndex} (${trackLabel}) — ${pl.reason}`
      );
    }

    lines.push(`  [Phase 3.1 — Révélation des Cartes & Avancée des Machines]`);
    for (const cp of t.cardPlacements) {
      if (cp.ignoredBecauseDestroyed) {
        lines.push(
          `    • Carte [${cp.tactic}] de J${cp.fromPlayerIndex + 1} vers J${cp.targetPlayerIndex + 1} : Machine ${cp.machineType} DÉTRUITE → Sans effet (Répit écologique)`
        );
      } else if (cp.repairedImmediatelyInStep31) {
        lines.push(
          `    • Carte [${cp.tactic}] de J${cp.fromPlayerIndex + 1} → Piste J${cp.targetPlayerIndex + 1}, Case ${cp.placedCell} (RÉPARATION ACTIVE 3.1 — Machine ${cp.machineType} revient en ÉTAT NORMAL${cp.sabotageClearedInStep31 ? ' + Sabotage purgé' : ''})`
        );
      } else if (cp.faceUp) {
        lines.push(
          `    • Carte [${cp.tactic}] de J${cp.fromPlayerIndex + 1} → Piste J${cp.targetPlayerIndex + 1}, Case ${cp.placedCell} (FACE VISIBLE — Machine ${cp.machineType})`
        );
      } else {
        lines.push(
          `    • Carte [${cp.tactic}] de J${cp.fromPlayerIndex + 1} → Piste J${cp.targetPlayerIndex + 1}, Case ${cp.placedCell} (FACE CACHÉE — Machine ${cp.machineType} HS)`
        );
      }
    }
    for (const mv of t.machineMoves) {
      lines.push(
        `    ↳ Mouvement : Machine ${mv.machineType} de J${mv.playerIndex + 1} avance de Case ${mv.fromCell} → Case ${mv.toCell}`
      );
    }

    lines.push(
      `  [Phase 3.2 — Résolution des Combats (Règle HS : ${p.parryHsRule ?? 'SYNERGY_TRAP_SAB'})]`
    );
    if (t.combats.length === 0) {
      lines.push(`    • Aucun combat ce tour-ci.`);
    } else {
      for (const cb of t.combats) {
        const hasSynergy = cb.trapBonus + cb.sabotageBonus >= 1;
        const outcomeFr =
          cb.outcome === 'ATTACK_SUCCESS'
            ? `ATTAQUE RÉUSSIE (S <= ${1 + cb.assaultCountK + cb.thresholdShift})`
            : cb.outcome === 'SIMPLE_PARRY'
            ? `PARADE SIMPLE (S == ${2 + cb.assaultCountK + cb.thresholdShift})`
            : `PARADE + MISE HS (${
                hasSynergy && (p.parryHsRule ?? 'SYNERGY_TRAP_SAB') !== 'STANDARD_S3'
                  ? 'Synergie Piège/Sabotage dès S >= ' +
                    (2 + cb.assaultCountK + cb.thresholdShift)
                  : 'S >= ' + (3 + cb.assaultCountK + cb.thresholdShift)
              })`;
        lines.push(
          `    • Piste J${cb.playerIndex + 1}, Case ${cb.cellIndex} | Cartes: [${cb.faceUpCards.join(', ')}] | S=${cb.defenseScoreS} (Déf:${cb.tacticalDefenders} + Piège:${cb.trapBonus} + Sab:${cb.sabotageBonus}) vs k=${cb.assaultCountK}, shift=+${cb.thresholdShift} ⇒ ${outcomeFr}`
        );
        if (cb.outcome === 'ATTACK_SUCCESS') {
          const details: string[] = [];
          if (cb.harvesterExploded) details.push(`EXPLOSION Abatteuse A !`);
          if (cb.bulldozerExploded) details.push(`EXPLOSION Bulldozer B !`);
          if (cb.treesCutToStumps > 0)
            details.push(
              `${cb.treesCutToStumps} arbre(s) abattu(s) en souche(s)`
            );
          if (cb.bulldozerDestroyedTreeOnZeroStump > 0)
            details.push(
              `${cb.bulldozerDestroyedTreeOnZeroStump} arbre(s) debout détruit(s) par Bulldozer sur 0 souche`
            );
          if (cb.stumpsCleared > 0)
            details.push(`${cb.stumpsCleared} souche(s) rasée(s)`);
          if (cb.treesRemovedByOverheat > 0)
            details.push(
              `${cb.treesRemovedByOverheat} pion(s) retiré(s) par Surchauffe`
            );
          if (cb.treesDestroyedByExplosion > 0)
            details.push(
              `${cb.treesDestroyedByExplosion} arbre(s) détruit(s) par Explosion`
            );
          if (cb.harvesterBecameHS) details.push(`Abatteuse A passe HS`);
          if (cb.bulldozerBecameHS) details.push(`Bulldozer B passe HS`);
          if (details.length > 0) {
            lines.push(`      ↳ Effets : ${details.join(' | ')}`);
          }
        } else if (cb.outcome === 'PARRY_AND_HS') {
          const hsList: string[] = [];
          if (cb.harvesterBecameHS) hsList.push('Abatteuse A');
          if (cb.bulldozerBecameHS) hsList.push('Bulldozer B');
          lines.push(
            `      ↳ Mise HS : ${hsList.join(', ') || 'Machines engagées'}`
          );
        }
      }
    }

    lines.push(`  [Phase 3.3 — Résolution de la Piste Furtivité]`);
    if (t.stealthActions.length === 0) {
      lines.push(`    • Aucune action furtive ce tour-ci.`);
    } else {
      for (const st of t.stealthActions) {
        if (st.outcome === 'SABOTAGE_PLACED') {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (${st.stealthDefenders} jetons) → SABOTAGE posé sur Machine(s) [${st.sabotagedMachines.join(', ')}]`
          );
        } else if (st.outcome === 'TRAP_PLACED') {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (${st.stealthDefenders} jetons) → PIÈGE posé sur la case`
          );
        } else if (st.outcome === 'ORPHAN_SINGLE_TOKEN') {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (1 seul jeton) → FURTIVITÉ ORPHELINE (jeton isolé perdu sans effet)`
          );
        } else if (st.outcome === 'FAILED_TOKEN_LIMIT_REACHED') {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (${st.stealthDefenders} jetons) → ÉCHEC FURTIVITÉ (Réserve de ${p.numPlayers} jetons Furtivité atteinte)`
          );
        } else {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (${st.stealthDefenders} jetons) → ÉCHEC FURTIVITÉ (machine partie en 3.1 ou explosée en 3.2)`
          );
        }
      }
    }

    lines.push(`  [Phase 3.4 — Réparation des Machines HS (Cartes Face Cachée)]`);
    const actualRepairs = t.repairs.filter(
      (r) => r.harvesterRepaired || r.bulldozerRepaired
    );
    if (actualRepairs.length === 0) {
      lines.push(`    • Aucune machine réparée en 3.4 ce tour-ci.`);
    } else {
      for (const rp of actualRepairs) {
        const repList: string[] = [];
        if (rp.harvesterRepaired) {
          repList.push(
            `Abatteuse A${rp.harvesterSabotageCleared ? ' (Sabotage purgé)' : ''}`
          );
        }
        if (rp.bulldozerRepaired) {
          repList.push(
            `Bulldozer B${rp.bulldozerSabotageCleared ? ' (Sabotage purgé)' : ''}`
          );
        }
        lines.push(
          `    • Piste J${rp.playerIndex + 1}, Case ${rp.cellIndex} (Cartes cachées: [${rp.faceDownCards.join(', ')}]) → Réparation : ${repList.join(', ')} revient en ÉTAT NORMAL`
        );
      }
    }

    lines.push(
      `  [Bilan Fin de Tour ${t.turn}] Potentiel écologique perdu ce tour : ${t.totalTreesLostThisTurn} (${t.treesLostThisTurnPerPlayer.map((v, i) => `J${i + 1}:${v}`).join(', ')})`
    );
  }

  lines.push(
    `\n================================================================================`
  );
  lines.push(`BILAN FINAL DE LA PARTIE (GRAINE #${game.seed})`);
  lines.push(
    `================================================================================`
  );
  lines.push(
    `• Régénération Écologique de fin de partie : +${game.regeneratedTreesCount} arbre(s) debout régénéré(s)`
  );
  lines.push(
    `• Arbres perdus au total : ${game.totalTreesLost} / Horizon réf. ${game.referenceHorizonTrees} (Taux de survie : ${(game.survivalRateHorizon * 100).toFixed(1)} % — ${game.victoryBracket})`
  );
  lines.push(
    `• Pertes par joueur : ${game.treesLostPerPlayer.map((v, i) => `J${i + 1}: ${v}`).join(' | ')}`
  );
  lines.push(
    `• Pertes par tour   : ${game.treesLostPerTurn.map((v, i) => `T${i + 1}: ${v}`).join(' | ')}`
  );
  lines.push(
    `• Statistiques Combat : ${game.cutsCount} abattages | ${game.bulldozerDestroyedTreesCount} arbres détruits Bull0 | ${game.clearingsCount} terrassements (${game.stumpsClearedCount} souches) | ${game.overheatTriggersCount} surchauffes | ${game.assaultTriggersCount} assauts | ${game.explosionsCount} explosions`
  );
  lines.push(
    `• Statistiques Défense & Coordination v3.3 : ${game.simpleParriesCount} parades simples | ${game.parryAndHSCount} mises HS | ${game.trapsPlacedCount} pièges | ${game.sabotagesPlacedCount} sabotages | ${game.orphanStealthTokensCount} furtivité(s) orpheline(s) | ${game.tacticalOverkillTokensCount} overkill(s) tactique(s)`
  );
  lines.push(
    `• Télémétrie Cognitive 2.2 : ${game.step2RevisionsCount} révision(s) du 2e jeton | ${game.successfulSignalCompletionsCount} signal/signaux complété(s) | Pertinence des poses = ${(game.placementRelevanceScore * 100).toFixed(1)}%`
  );

  return lines.join('\n');
}

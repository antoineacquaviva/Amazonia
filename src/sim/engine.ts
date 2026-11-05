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
import { BOT_PROFILE_META, resolveTargetPlayerRank1Based, TACTIC_META } from './i18n';
import { executePhase2Bots } from './bots';

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

export function runSingleGame(
  params: SimulationConfig,
  botProfilesInput: BotProfileId[],
  seed: number,
  tableConfigId: string = 'CUSTOM',
  recordTraces: boolean = false
): SingleGameResult {
  const rng = new SeededRNG(seed);
  const N = params.numPlayers;
  const X = params.numTurns;
  const a = params.initialTreesPerCell;

  // Normalisation de la liste des bots (taille N)
  const botProfiles: BotProfileId[] = [];
  for (let i = 0; i < N; i++) {
    botProfiles.push(botProfilesInput[i % botProfilesInput.length] ?? 'COMBAT_PURE');
  }

  // Configuration de la Piste des Tactiques (6 emplacements)
  const tacticsTrack: TacticType[] =
    params.tacticsTrackSetup && params.tacticsTrackSetup.length === 6
      ? [...params.tacticsTrackSetup]
      : ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];

  if (params.shuffleTacticsTrack) {
    rng.shuffleInPlace(tacticsTrack);
  }

  // Calcul du nombre de cases allouées dynamiquement par piste joueur
  let maxInitialMachinePos = 1;
  for (let i = 0; i < N; i++) {
    const mCfg = params.initialMachinesState?.[i];
    if (mCfg) {
      maxInitialMachinePos = Math.max(
        maxInitialMachinePos,
        mCfg.harvesterPos || 1,
        mCfg.bulldozerPos || 1
      );
    }
  }
  const allocatedCellsPerTrack = Math.max(X + maxInitialMachinePos + 4, 15);

  // Initialisation des N groupes de forêt
  const players: PlayerForestGroup[] = [];
  for (let i = 0; i < N; i++) {
    const mCfg = params.initialMachinesState?.[i] ?? {
      harvesterPos: 1,
      harvesterStatus: 'NORMAL',
      bulldozerPos: 1,
      bulldozerStatus: 'NORMAL',
      initialStumpsCell1: 0,
    };

    const cells: ForestCellState[] = [];
    for (let c = 1; c <= allocatedCellsPerTrack; c++) {
      const initStumps = c === 1 ? Math.max(0, mCfg.initialStumpsCell1 || 0) : 0;
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

    const hPos = Math.max(1, Math.min(allocatedCellsPerTrack - 1, mCfg.harvesterPos || 1));
    const bPos = Math.max(1, Math.min(allocatedCellsPerTrack - 1, mCfg.bulldozerPos || 1));

    players.push({
      playerIndex: i,
      rankOnEvilEye: i + 1,
      cells,
      harvester: {
        type: 'A',
        status: mCfg.harvesterStatus || 'NORMAL',
        position: hPos,
        startOfTurnPosition: hPos,
        hasSabotage: false,
      },
      bulldozer: {
        type: 'B',
        status: mCfg.bulldozerStatus || 'NORMAL',
        position: bPos,
        startOfTurnPosition: bPos,
        hasSabotage: false,
      },
    });
  }

  const initialStandingTreesPerPlayer = players.map((p) => countStandingTreesForPlayer(p));
  const initialTotalTreesAllocated = initialStandingTreesPerPlayer.reduce((acc, v) => acc + v, 0);
  const referenceHorizonTrees = Math.max(1, N * X * a);

  const violations: InvariantViolationReport[] = [];
  const traces: TurnTrace[] = [];

  const treesLostPerTurn: number[] = [];
  let cutsCount = 0;
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
  let repairsCount = 0;
  let respiteDrawsOnDestroyedCount = 0;
  let tacticalDefendersPlaced = 0;
  let stealthDefendersPlaced = 0;

  let maxCellIndexVisited = maxInitialMachinePos;

  // Boucle principale des X tours
  for (let turn = 1; turn <= X; turn++) {
    const standingBeforeTurnPerPlayer = players.map((p) => countStandingTreesForPlayer(p));

    // Enregistrement des positions initiales du tour (pour Étape 3.3 Furtivité)
    for (const p of players) {
      p.harvester.startOfTurnPosition = p.harvester.status !== 'DESTROYED' ? p.harvester.position : null;
      p.bulldozer.startOfTurnPosition = p.bulldozer.status !== 'DESTROYED' ? p.bulldozer.position : null;
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
    const placements = executePhase2Bots(params, players, draws, botProfiles, rng);

    // Vérification Invariant I3 : chaque joueur pose exactement 2 jetons (1 sur sa piste, 1 sur une autre)
    if (placements.length !== 2 * N) {
      violations.push({
        code: 'I3_DEFENDER_COUNT_MISMATCH',
        turn,
        phase: 'PHASE_2',
        message: `Attendu ${2 * N} placements de Défenseurs, obtenu ${placements.length}.`,
        seed,
      });
    }

    for (const pl of placements) {
      if (pl.track === 'TACTICAL') tacticalDefendersPlaced++;
      else stealthDefendersPlaced++;
    }

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.1 : RÉVÉLATION, POSE DES CARTES & AVANCÉE DES MACHINES
    // =========================================================================
    // On capture l'état initial des machines AU DÉBUT de l'Étape 3.1
    const initialStep31Status = players.map((p) => ({
      harvesterStatus: p.harvester.status,
      harvesterPos: p.harvester.position,
      bulldozerStatus: p.bulldozer.status,
      bulldozerPos: p.bulldozer.position,
    }));

    const cardPlacements: TurnTrace['cardPlacements'] = [];

    for (const draw of draws) {
      const targetPlayer = players[draw.targetPlayerIndex];
      const mType: MachineType = isHarvesterCard(draw.tactic) ? 'A' : 'B';
      const stBefore =
        mType === 'A'
          ? initialStep31Status[draw.targetPlayerIndex].harvesterStatus
          : initialStep31Status[draw.targetPlayerIndex].bulldozerStatus;
      const posBefore =
        mType === 'A'
          ? initialStep31Status[draw.targetPlayerIndex].harvesterPos
          : initialStep31Status[draw.targetPlayerIndex].bulldozerPos;

      if (stBefore === 'DESTROYED' || posBefore === null) {
        // Cas 1 : Machine DÉTRUITE -> aucun effet (Répit écologique, Arbitrage C1)
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
        // Cas 2 : Machine HS en case p -> posée FACE CACHÉE sur la case actuelle p
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
        });
      } else {
        // Cas 3 : Machine EN ÉTAT NORMAL en case p -> posée FACE VISIBLE sur la case suivante p + 1
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

    // Avancée des machines en ÉTAT NORMAL ayant au moins 1 carte de leur type en p + 1
    const machineMoves: TurnTrace['machineMoves'] = [];
    for (const p of players) {
      // Abatteuse A
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
      // Bulldozer B
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

    // Track machines knocked HS during Step 3.2 to verify Invariant I1 in Step 3.4
    const knockedHSInCombatThisTurn = new Set<string>();

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.2 : RÉSOLUTION DES COMBATS (CARTES FACE VISIBLE)
    // =========================================================================
    const combats: CombatCellLog[] = [];

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.faceUpCards.length === 0) continue;

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

        const assaultCountK = cell.faceUpCards.filter((t) => t === 'A3' || t === 'B3').length;
        assaultTriggersCount += assaultCountK;

        let outcome: CombatCellLog['outcome'];
        let harvesterExploded = false;
        let bulldozerExploded = false;
        let treesCutToStumps = 0;
        let stumpsCleared = 0;
        let treesRemovedByOverheat = 0;
        let treesDestroyedByExplosion = 0;
        let harvesterBecameHS = false;
        let bulldozerBecameHS = false;

        if (defenseScoreS <= 1 + assaultCountK) {
          // CAS 1 : L'ATTAQUE RÉUSSIT
          outcome = 'ATTACK_SUCCESS';

          // -------------------------------------------------------------------
          // 4a. Résolution de l'Abatteuse ('A') si engagée sur c
          // -------------------------------------------------------------------
          if (engagedA) {
            const nA1 = cell.faceUpCards.filter((t) => t === 'A1').length;
            const nA2 = cell.faceUpCards.filter((t) => t === 'A2').length;
            const nA3 = cell.faceUpCards.filter((t) => t === 'A3').length;

            if (nA2 >= 1 && nA3 >= 1) {
              // EXPLOSION ABATTEUSE (Surchauffe A2 + Assaut A3)
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
              // Pas d'explosion -> Calcul du nombre d'actions d'Abattage
              const nAbattages =
                nA1 +
                (params.overheatIncludesBaseAction ? nA2 : 0) +
                (params.assaultIncludesBaseAction ? nA3 : 0);

              const cut = Math.min(cell.standingTrees, nAbattages);
              cell.standingTrees -= cut;
              cell.stumps += cut;
              treesCutToStumps += cut;
              cutsCount += cut;

              // Effet spécial Surchauffe A2 (si nA2 >= 1)
              if (nA2 >= 1) {
                overheatTriggersCount += nA2;
                const repeats = params.overheatStacksTreeRemoval ? nA2 : 1;
                for (let r = 0; r < repeats; r++) {
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

              // Effet spécial Assaut A3 (si nA3 >= 1)
              if (nA3 >= 1) {
                p.harvester.status = 'HS';
                harvesterBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-A`);
              }
            }
          }

          // -------------------------------------------------------------------
          // 4b. Résolution du Bulldozer ('B') si engagé sur c (APRÈS l'Abatteuse)
          // -------------------------------------------------------------------
          if (engagedB) {
            const nB1 = cell.faceUpCards.filter((t) => t === 'B1').length;
            const nB2 = cell.faceUpCards.filter((t) => t === 'B2').length;
            const nB3 = cell.faceUpCards.filter((t) => t === 'B3').length;

            if (nB2 >= 1 && nB3 >= 1) {
              // EXPLOSION BULLDOZER (Surchauffe B2 + Assaut B3)
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
              const nActionsB =
                nB1 +
                (params.overheatIncludesBaseAction ? nB2 : 0) +
                (params.assaultIncludesBaseAction ? nB3 : 0);

              if (nActionsB >= 1) {
                clearingsCount += 1;
                // 1) La première action rase TOUTES les souches présentes sur la case c
                if (cell.stumps > 0) {
                  stumpsCleared += cell.stumps;
                  stumpsClearedCount += cell.stumps;
                  cell.stumps = 0;
                }
                // 2) Chaque action supplémentaire (nActionsB - 1) coupe 1 arbre debout en souche
                if (nActionsB > 1) {
                  const extraCut = Math.min(cell.standingTrees, nActionsB - 1);
                  cell.standingTrees -= extraCut;
                  cell.stumps += extraCut;
                  treesCutToStumps += extraCut;
                  cutsCount += extraCut;
                }
              }

              // Effet spécial Surchauffe B2 (si nB2 >= 1)
              if (nB2 >= 1) {
                overheatTriggersCount += nB2;
                const repeats = params.overheatStacksTreeRemoval ? nB2 : 1;
                for (let r = 0; r < repeats; r++) {
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

              // Effet spécial Assaut B3 (si nB3 >= 1)
              if (nB3 >= 1) {
                p.bulldozer.status = 'HS';
                bulldozerBecameHS = true;
                knockedHSInCombatThisTurn.add(`${p.playerIndex}-B`);
              }
            }
          }
        } else if (defenseScoreS === 2 + assaultCountK) {
          // CAS 2 : PARADE SIMPLE (S == 2 + k_assault)
          outcome = 'SIMPLE_PARRY';
          simpleParriesCount++;
        } else {
          // CAS 3 : PARADE + MISE HORS SERVICE (S >= 3 + k_assault)
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
        }

        // Nettoyage post-combat de la case c : retrait du Piège et des Sabotages des machines engagées
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
          outcome,
          harvesterExploded,
          bulldozerExploded,
          treesCutToStumps,
          stumpsCleared,
          treesRemovedByOverheat,
          treesDestroyedByExplosion,
          harvesterBecameHS,
          bulldozerBecameHS,
        });
      }
    }

    // =========================================================================
    // PHASE 3 — ÉTAPE 3.3 : RÉSOLUTION DE LA PISTE FURTIVITÉ
    // =========================================================================
    const stealthActions: StealthCellLog[] = [];

    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.stealthDefenders < 2) continue;
        const c = cell.cellIndex;

        const machinesPresentAfter: MachineState[] = [];
        if (p.harvester.status !== 'DESTROYED' && p.harvester.position === c) {
          machinesPresentAfter.push(p.harvester);
        }
        if (p.bulldozer.status !== 'DESTROYED' && p.bulldozer.position === c) {
          machinesPresentAfter.push(p.bulldozer);
        }

        const wasOccupiedBefore =
          p.harvester.startOfTurnPosition === c || p.bulldozer.startOfTurnPosition === c;

        if (machinesPresentAfter.length >= 1) {
          // Cas A : Sabotage (au moins une machine présente sur c après les mouvements)
          const sabotagedTypes: MachineType[] = [];
          for (const m of machinesPresentAfter) {
            if (!m.hasSabotage) {
              m.hasSabotage = true;
              sabotagesPlacedCount++;
            }
            sabotagedTypes.push(m.type);
          }
          stealthActions.push({
            playerIndex: p.playerIndex,
            cellIndex: c,
            stealthDefenders: cell.stealthDefenders,
            outcome: 'SABOTAGE_PLACED',
            sabotagedMachines: sabotagedTypes,
          });
        } else if (
          machinesPresentAfter.length === 0 &&
          !wasOccupiedBefore &&
          !cell.explodedHereThisTurn
        ) {
          // Cas B : Piège (case inoccupée tout au long du tour et sans explosion)
          if (!cell.hasTrap) {
            cell.hasTrap = true;
            trapsPlacedCount++;
          }
          stealthActions.push({
            playerIndex: p.playerIndex,
            cellIndex: c,
            stealthDefenders: cell.stealthDefenders,
            outcome: 'TRAP_PLACED',
            sabotagedMachines: [],
          });
        } else {
          // Cas C : Échec de la Furtivité (machine partie en 3.1 ou explosée en 3.2)
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
        }

        repairs.push({
          playerIndex: p.playerIndex,
          cellIndex: c,
          faceDownCards: [...cell.faceDownCards],
          harvesterRepaired,
          bulldozerRepaired,
        });
      }
    }

    // Vérification des invariants I2 et I4 avant le nettoyage de fin de tour
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

    // Nettoyage de fin de tour (cartes et jetons Défenseurs retirés, Pièges et Sabotages conservés)
    for (const p of players) {
      for (const cell of p.cells) {
        cell.faceUpCards = [];
        cell.faceDownCards = [];
        cell.tacticalDefenders = 0;
        cell.stealthDefenders = 0;
        cell.explodedHereThisTurn = false;
      }
    }

    // Calcul des arbres debout perdus ce tour-ci par joueur
    const treesLostThisTurnPerPlayer = players.map((p, idx) =>
      Math.max(0, standingBeforeTurnPerPlayer[idx] - countStandingTreesForPlayer(p))
    );
    const totalTreesLostThisTurn = treesLostThisTurnPerPlayer.reduce((acc, v) => acc + v, 0);
    treesLostPerTurn.push(totalTreesLostThisTurn);

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
  // FIN DE PARTIE : RÉGÉNÉRATION ÉCOLOGIQUE OPTIONNELLE & BILAN
  // ===========================================================================
  let regeneratedTreesCount = 0;
  if (params.endOfGameRegeneration) {
    for (const p of players) {
      for (const cell of p.cells) {
        if (cell.stumps >= 1) {
          cell.stumps -= 1;
          cell.standingTrees += 1;
          regeneratedTreesCount += 1;
        }
      }
    }
  }

  const finalStandingTreesPerPlayer = players.map((p) => countStandingTreesForPlayer(p));
  const finalStandingTreesTotal = finalStandingTreesPerPlayer.reduce((acc, v) => acc + v, 0);

  const treesLostPerPlayer = players.map((p, idx) =>
    Math.max(0, initialStandingTreesPerPlayer[idx] - finalStandingTreesPerPlayer[idx])
  );
  const totalTreesLost = treesLostPerPlayer.reduce((acc, v) => acc + v, 0);

  // Ratio de survie sur l'horizon de référence N * X * a
  const survivalRateHorizon = Math.max(
    0,
    Math.min(1, (referenceHorizonTrees - totalTreesLost) / referenceHorizonTrees)
  );

  // Ratio de survie sur les cases visitées (1 .. maxCellIndexVisited + 1)
  const visitedCellHorizonPerTrack = Math.min(allocatedCellsPerTrack, maxCellIndexVisited + 1);
  const visitedInitialTrees = Math.max(1, N * visitedCellHorizonPerTrack * a);
  const survivalRateVisited = Math.max(
    0,
    Math.min(1, (visitedInitialTrees - totalTreesLost) / visitedInitialTrees)
  );

  const survivingTreesPerPlayerOnHorizon = treesLostPerPlayer.map((lost) =>
    Math.max(0, X * a - lost)
  );

  const victoryBracket = computeVictoryBracket(survivalRateHorizon);

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
    repairsCount,
    respiteDrawsOnDestroyedCount,
    tacticalDefendersPlaced,
    stealthDefendersPlaced,
    violations,
    traces: recordTraces ? traces : undefined,
  };

  if (recordTraces) {
    result.textualJournal = formatGameCombatLog(result);
  }

  return result;
}

/**
 * Génère le Journal de Combat textuel détaillé ("Combat Log") d'une partie
 */
export function formatGameCombatLog(game: SingleGameResult): string {
  const lines: string[] = [];
  const p = game.params;

  lines.push(`================================================================================`);
  lines.push(`JOURNAL DE COMBAT (COMBAT LOG) — GRAINE #${game.seed}`);
  lines.push(`================================================================================`);
  lines.push(
    `Paramètres : N=${p.numPlayers} joueurs | X=${p.numTurns} tours | a=${p.initialTreesPerCell} arbres/case | Horizon réf.=${game.referenceHorizonTrees} arbres`
  );
  lines.push(
    `Piste des Tactiques : [${p.tacticsTrackSetup.join(', ')}] (Mélangée: ${p.shuffleTacticsTrack ? 'Oui' : 'Non'})`
  );
  lines.push(
    `Arbitrages D : Surchauffe inclut base = ${p.overheatIncludesBaseAction ? 'D2 (OUI)' : 'D1 (NON)'} | Assaut inclut base = ${p.assaultIncludesBaseAction ? 'D2 (OUI)' : 'D1 (NON)'}`
  );
  lines.push(
    `Cumul Surchauffe = ${p.overheatStacksTreeRemoval ? 'OUI' : 'NON'} | Régénération fin de partie = ${p.endOfGameRegeneration ? 'OUI' : 'NON'}`
  );
  lines.push(
    `Profils de Bots : ${game.botProfiles.map((b, i) => `J${i + 1}:${BOT_PROFILE_META[b]?.shortLabel ?? b}`).join(' | ')}`
  );
  lines.push(`--------------------------------------------------------------------------------`);

  if (!game.traces || game.traces.length === 0) {
    lines.push(`(Traces détaillées non enregistrées pour cette partie)`);
    return lines.join('\n');
  }

  for (const t of game.traces) {
    lines.push(`\n▶ TOUR ${t.turn} / ${p.numTurns}`);
    lines.push(`  [Phase 1 — Tirages Secrets 2D6 sous Gobelets]`);
    for (const d of t.draws) {
      lines.push(
        `    • J${d.rollerPlayerIndex + 1} lance (${d.d1}, ${d.d2}) → M=min(${d.d1},${d.d2})=${d.mIndex} [${d.tactic} - ${TACTIC_META[d.tactic].name}] | Cible : Piste J${d.targetPlayerIndex + 1}`
      );
    }

    lines.push(`  [Phase 2 — Placement des Jetons Défenseurs]`);
    for (const pl of t.placements) {
      const stepLabel = pl.step === 1 ? 'Étape 2.1 (Sa forêt)' : 'Étape 2.2 (Soutien allié)';
      const trackLabel = pl.track === 'TACTICAL' ? 'Piste Tactique' : 'Piste Furtivité';
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
      } else if (cp.faceUp) {
        lines.push(
          `    • Carte [${cp.tactic}] de J${cp.fromPlayerIndex + 1} → Piste J${cp.targetPlayerIndex + 1}, Case ${cp.placedCell} (FACE VISIBLE — Machine ${cp.machineType} Normale)`
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

    lines.push(`  [Phase 3.2 — Résolution des Combats]`);
    if (t.combats.length === 0) {
      lines.push(`    • Aucun combat ce tour-ci.`);
    } else {
      for (const cb of t.combats) {
        const outcomeFr =
          cb.outcome === 'ATTACK_SUCCESS'
            ? 'ATTAQUE RÉUSSIE (S <= 1 + k)'
            : cb.outcome === 'SIMPLE_PARRY'
            ? 'PARADE SIMPLE (S == 2 + k)'
            : 'PARADE + MISE HS (S >= 3 + k)';
        lines.push(
          `    • Piste J${cb.playerIndex + 1}, Case ${cb.cellIndex} | Cartes: [${cb.faceUpCards.join(', ')}] | S=${cb.defenseScoreS} (Déf:${cb.tacticalDefenders} + Piège:${cb.trapBonus} + Sab:${cb.sabotageBonus}) vs k_assault=${cb.assaultCountK} ⇒ ${outcomeFr}`
        );
        if (cb.outcome === 'ATTACK_SUCCESS') {
          const details: string[] = [];
          if (cb.harvesterExploded) details.push(`EXPLOSION Abatteuse A !`);
          if (cb.bulldozerExploded) details.push(`EXPLOSION Bulldozer B !`);
          if (cb.treesCutToStumps > 0) details.push(`${cb.treesCutToStumps} arbre(s) abattu(s) en souche(s)`);
          if (cb.stumpsCleared > 0) details.push(`${cb.stumpsCleared} souche(s) rasée(s)`);
          if (cb.treesRemovedByOverheat > 0) details.push(`${cb.treesRemovedByOverheat} pion(s) retiré(s) par Surchauffe`);
          if (cb.treesDestroyedByExplosion > 0) details.push(`${cb.treesDestroyedByExplosion} arbre(s) détruit(s) par Explosion`);
          if (cb.harvesterBecameHS) details.push(`Abatteuse A passe HS`);
          if (cb.bulldozerBecameHS) details.push(`Bulldozer B passe HS`);
          if (details.length > 0) {
            lines.push(`      ↳ Effets : ${details.join(' | ')}`);
          }
        } else if (cb.outcome === 'PARRY_AND_HS') {
          const hsList: string[] = [];
          if (cb.harvesterBecameHS) hsList.push('Abatteuse A');
          if (cb.bulldozerBecameHS) hsList.push('Bulldozer B');
          lines.push(`      ↳ Mise HS : ${hsList.join(', ') || 'Machines engagées'}`);
        }
      }
    }

    lines.push(`  [Phase 3.3 — Résolution de la Piste Furtivité (>= 2 jetons)]`);
    if (t.stealthActions.length === 0) {
      lines.push(`    • Aucune action furtive déclenchée.`);
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
        } else {
          lines.push(
            `    • Piste J${st.playerIndex + 1}, Case ${st.cellIndex} (${st.stealthDefenders} jetons) → ÉCHEC FURTIVITÉ (machine partie en 3.1 ou explosée en 3.2)`
          );
        }
      }
    }

    lines.push(`  [Phase 3.4 — Réparation des Machines HS (Cartes Face Cachée)]`);
    const actualRepairs = t.repairs.filter((r) => r.harvesterRepaired || r.bulldozerRepaired);
    if (actualRepairs.length === 0) {
      lines.push(`    • Aucune machine réparée ce tour-ci.`);
    } else {
      for (const rp of actualRepairs) {
        const repList: string[] = [];
        if (rp.harvesterRepaired) repList.push('Abatteuse A');
        if (rp.bulldozerRepaired) repList.push('Bulldozer B');
        lines.push(
          `    • Piste J${rp.playerIndex + 1}, Case ${rp.cellIndex} (Cartes cachées: [${rp.faceDownCards.join(', ')}]) → Réparation : ${repList.join(', ')} revient en ÉTAT NORMAL`
        );
      }
    }

    lines.push(
      `  [Bilan Fin de Tour ${t.turn}] Arbres debout perdus ce tour : ${t.totalTreesLostThisTurn} (${t.treesLostThisTurnPerPlayer.map((v, i) => `J${i + 1}:${v}`).join(', ')})`
    );
  }

  lines.push(`\n================================================================================`);
  lines.push(`BILAN FINAL DE LA PARTIE (GRAINE #${game.seed})`);
  lines.push(`================================================================================`);
  if (p.endOfGameRegeneration) {
    lines.push(`• Régénération Écologique de fin de partie : +${game.regeneratedTreesCount} arbre(s) debout régénéré(s)`);
  }
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
    `• Statistiques Combat : ${game.cutsCount} abattages | ${game.clearingsCount} terrassements (${game.stumpsClearedCount} souches) | ${game.overheatTriggersCount} surchauffes | ${game.assaultTriggersCount} assauts | ${game.explosionsCount} explosions`
  );
  lines.push(
    `• Statistiques Défense : ${game.simpleParriesCount} parades simples | ${game.parryAndHSCount} mises HS | ${game.trapsPlacedCount} pièges | ${game.sabotagesPlacedCount} sabotages | ${game.repairsCount} réparations`
  );

  return lines.join('\n');
}

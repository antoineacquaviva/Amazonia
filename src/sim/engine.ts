import {
  BotProfileId,
  CardResolutionStatus,
  CellResolutionLog,
  EdgeCaseCounts,
  ForemanBrainState,
  GameParameters,
  InvariantViolation,
  SectorState,
  SingleGameResult,
  TacticId,
  ThemeVocabularyMode,
  TurnTrace,
  VictoryBracket,
} from './types';
import { formatCellName, formatFactionName } from './i18n';
import { SeededRNG } from './rng';
import { computeTacticTarget, getEyeRank, sumArray } from './targeting';
import { runPhase2Mobilization } from './bots';

const ALL_TACTICS: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

export function createEmptyEdgeCases(): EdgeCaseCounts {
  return {
    H1_noTargetEligible: 0,
    H2_multipleHarvesterCardsSingleTree: 0,
    H3_multipleBulldozerCardsSameCell: 0,
    H4_repairedBulldozerImmunityInCell1: 0,
    H5_degradedBulldozerNoGrudge: 0,
    H6_multiEventSameCellSingleGrudge: 0,
    H7_preventiveDestructionNoCard: 0,
    H7_emptyCellOverDefense: 0,
  };
}

/**
 * Vérifie les 4 invariants structurels fondamentaux du jeu à tout point de contrôle.
 */
function checkInvariants(
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters,
  turn: number,
  phase: string,
  seed: number,
  violations: InvariantViolation[]
): void {
  const n = params.n;
  const q = params.q;

  // I1 : Conservation des arbres & souches
  for (let i = 0; i < n; i++) {
    const s = sectors[i];
    if (s.standingTrees[0] !== 0 || s.stumps[0] !== 0) {
      violations.push({
        code: 'I1_TREE_CONSERVATION',
        turn,
        phase,
        message: `Secteur ${i + 1}: La Casse (p=0) contient des arbres (${s.standingTrees[0]}) ou souches (${s.stumps[0]}).`,
        seed,
      });
    }
    for (let p = 1; p <= q; p++) {
      const t = s.standingTrees[p];
      const st = s.stumps[p];
      const cap = s.initialCapacity[p];
      if (t < 0 || st < 0 || t + st > cap) {
        violations.push({
          code: 'I1_TREE_CONSERVATION',
          turn,
          phase,
          message: `Secteur ${i + 1} Parcelle ${p}: T=${t}, S=${st}, capacité=${cap} invalide.`,
          seed,
        });
      }
    }
  }

  // I2 : Bornes des machines & stock d'Abatteuses
  let totalHarvesters = 0;
  for (let i = 0; i < n; i++) {
    const s = sectors[i];
    if (s.harvesters[0] !== 0) {
      violations.push({
        code: 'I2_MACHINE_BOUNDS',
        turn,
        phase,
        message: `Secteur ${i + 1}: Abatteuse présente à la Casse (p=0).`,
        seed,
      });
    }
    if (s.bulldozerPos < 0 || s.bulldozerPos > q) {
      violations.push({
        code: 'I2_MACHINE_BOUNDS',
        turn,
        phase,
        message: `Secteur ${i + 1}: Position Bulldozer hors bornes (${s.bulldozerPos}).`,
        seed,
      });
    }
    for (let p = 1; p <= q; p++) {
      if (s.harvesters[p] < 0) {
        violations.push({
          code: 'I2_MACHINE_BOUNDS',
          turn,
          phase,
          message: `Secteur ${i + 1} Parcelle ${p}: Nombre d'Abatteuses négatif (${s.harvesters[p]}).`,
          seed,
        });
      }
      totalHarvesters += s.harvesters[p];
    }
  }
  if (params.stockAbatteuses !== null && totalHarvesters > params.stockAbatteuses) {
    violations.push({
      code: 'I2_MACHINE_BOUNDS',
      turn,
      phase,
      message: `Stock d'Abatteuses dépassé (${totalHarvesters} > ${params.stockAbatteuses}).`,
      seed,
    });
  }

  // I3 : Bijection du Cerveau du Contremaître
  const tacSet = new Set(brain.tacticsTrack);
  if (brain.tacticsTrack.length !== 6 || tacSet.size !== 6) {
    violations.push({
      code: 'I3_BRAIN_PERMUTATION',
      turn,
      phase,
      message: `Piste des Tactiques corrompue : [${brain.tacticsTrack.join(', ')}]`,
      seed,
    });
  }
  const eyeSet = new Set(brain.eyeTrack);
  if (brain.eyeTrack.length !== n || eyeSet.size !== n) {
    violations.push({
      code: 'I3_BRAIN_PERMUTATION',
      turn,
      phase,
      message: `Piste de l'Œil corrompue : [${brain.eyeTrack.join(', ')}]`,
      seed,
    });
  }
}

/**
 * Mise en place initiale (Section 4 de la spécification)
 */
export function initializeGame(
  params: GameParameters,
  rng: SeededRNG
): { sectors: SectorState[]; brain: ForemanBrainState } {
  const n = params.n;
  const q = params.q;

  const tacticsTrack = rng.shuffle([...ALL_TACTICS]);
  const eyeTrack = rng.shuffle(Array.from({ length: n }, (_, idx) => idx));
  const brain: ForemanBrainState = { tacticsTrack, eyeTrack };

  const sectors: SectorState[] = [];
  for (let i = 0; i < n; i++) {
    const initialEyeRank = getEyeRank(brain, i); // 1..n
    const standingTrees = new Array(q + 1).fill(0);
    const stumps = new Array(q + 1).fill(0);
    const initialCapacity = new Array(q + 1).fill(0);
    const harvesters = new Array(q + 1).fill(0);

    for (let p = 1; p <= q; p++) {
      const cap =
        params.asymmetricTrees && params.asymmetricTrees[p - 1] !== undefined
          ? params.asymmetricTrees[p - 1]
          : params.a;
      initialCapacity[p] = cap;
      standingTrees[p] = cap;
    }

    let bulldozerPos = 0;

    if (initialEyeRank === 1) {
      // Peuple au Rang 1 : Parcelle 1 a 1 souche, 1 Abatteuse en p=1, Bulldozer en p=1
      if (standingTrees[1] >= 1) {
        standingTrees[1] -= 1;
        stumps[1] = 1;
      }
      harvesters[1] = 1;
      bulldozerPos = 1;
    } else if (initialEyeRank === 2) {
      // Peuple au Rang 2 : 1 Abatteuse en Parcelle 2, Bulldozer à la Casse (0)
      const targetCell = Math.min(2, q);
      harvesters[targetCell] = 1;
      bulldozerPos = 0;
    } else if (initialEyeRank === 3) {
      // Peuple au Rang 3 : Aucune Abatteuse, Bulldozer à la Casse (0)
      bulldozerPos = 0;
    } else {
      // Peuples aux Rangs 4..n : 1 Abatteuse en Parcelle 1, Bulldozer à la Casse (0)
      harvesters[1] = 1;
      bulldozerPos = 0;
    }

    // Si StockAbatteuses est très bas dès le setup, plafonner proprement
    sectors.push({
      sectorIndex: i,
      initialEyeRank,
      standingTrees,
      stumps,
      initialCapacity,
      harvesters,
      bulldozerPos,
    });
  }

  return { sectors, brain };
}

/**
 * Simule une partie complète d'Amazonia : Dernier Rempart
 */
export function runSingleGame(
  seed: number,
  params: GameParameters,
  tableConfigId: string,
  rawBotProfiles: BotProfileId[],
  options: { recordTraces?: boolean; vocabulary?: ThemeVocabularyMode } = {}
): SingleGameResult {
  const rng = new SeededRNG(seed);
  const n = params.n;
  const q = params.q;
  const x = params.x;

  // Normaliser la liste des profils de bots pour les n joueurs
  const botProfiles: BotProfileId[] = Array.from(
    { length: n },
    (_, i) => rawBotProfiles[i % rawBotProfiles.length] || 'COOPERATIVE'
  );

  const { sectors, brain } = initializeGame(params, rng);
  const edgeCases = createEmptyEdgeCases();
  const violations: InvariantViolation[] = [];
  const traces: TurnTrace[] = [];

  checkInvariants(sectors, brain, params, 0, 'SETUP', seed, violations);

  let totalHarvestersSpawned = sectors.reduce((acc, s) => acc + sumArray(s.harvesters, 1), 0);
  let totalHarvestersDestroyed = 0;
  let totalBulldozersDestroyed = 0;
  let totalBulldozersRepaired = 0;
  let sumActiveHarvestersPerTurn = 0;

  let totalCardsPlaced = 0;
  let totalCardsSucceeded = 0;
  let totalCardsParried = 0;
  let totalCardsNoTarget = 0;

  const defenderThresholdCounts = { d1: 0, d2: 0, d3Plus: 0 };
  let wastedDefendersCount = 0;
  let overkillAvoidedInStep2 = 0;
  let coordinatedDestructionsCount = 0;
  let totalLockCyclesSum = 0;
  let totalBrainPermutations = 0;
  let totalRepositionings = 0;
  let totalDilemmaEvents = 0;
  let totalDecisions = 0;
  let sumThreatToDefenseRatio = 0;
  let stagnantTurns = 0;
  let earlyWipeoutTurn: number | null = null;

  const tacticSlot1Turns: Record<TacticId, number> = {
    A1: 0,
    A2: 0,
    A3: 0,
    B1: 0,
    B2: 0,
    B3: 0,
  };

  for (let turn = 1; turn <= x; turn++) {
    const tacticsTrackStart = [...brain.tacticsTrack];
    const eyeTrackStart = [...brain.eyeTrack];

    // ========================================================================
    // PHASE 1 : Programmation secrète (Lancer de dés sous gobelet)
    // ========================================================================
    const diceRolls: TurnTrace['diceRolls'] = [];
    const drawnTactics: TacticId[] = [];
    for (let j = 0; j < n; j++) {
      const roll = rng.rollTacticDice(params.modeTirageDes);
      const tactic = brain.tacticsTrack[roll.chosenSlot - 1];
      diceRolls.push({
        playerIndex: j,
        d1: roll.d1,
        d2: roll.d2,
        chosenSlot: roll.chosenSlot,
        tactic,
      });
      drawnTactics.push(tactic);
    }

    // ========================================================================
    // PHASE 2 : Mobilisation des Défenseurs (Étape 1 + Étape 2 micro-cycles)
    // ========================================================================
    const phase2 = runPhase2Mobilization(
      botProfiles,
      drawnTactics,
      sectors,
      brain,
      params,
      turn,
      rng
    );

    totalDilemmaEvents += phase2.dilemmaEventsCount;
    totalDecisions += phase2.totalDecisionsCount;
    overkillAvoidedInStep2 += phase2.overkillAvoidedInStep2;
    for (const fd of phase2.finalDefenders) {
      totalLockCyclesSum += fd.lockCycle;
    }

    // Vérification Invariant I4 (Légalité des Défenseurs)
    let totalDefendersOnBoard = 0;
    for (let i = 0; i < n; i++) {
      for (let p = 0; p <= q; p++) {
        totalDefendersOnBoard += phase2.defendersGrid[i][p];
      }
    }
    if (totalDefendersOnBoard !== 2 * n) {
      violations.push({
        code: 'I4_DEFENDER_LEGALITY',
        turn,
        phase: 'PHASE_2_END',
        message: `Nombre total de jetons Défenseur invalide (${totalDefendersOnBoard} != ${2 * n}).`,
        seed,
      });
    }

    // ========================================================================
    // PHASE 3 - ÉTAPE 1 : Révélation et Pose des Cartes sur l'image figée
    // ========================================================================
    const harvesterCardsGrid: TacticId[][][] = Array.from({ length: n }, () =>
      Array.from({ length: q + 1 }, () => [])
    );
    const bulldozerCardsGrid: TacticId[][][] = Array.from({ length: n }, () =>
      Array.from({ length: q + 1 }, () => [])
    );

    const targetedActions: TurnTrace['targetedActions'] = [];
    const sectorsTargetedByA1 = new Set<number>();
    const a3ReinforcementsByCell: number[][] = Array.from({ length: n }, () =>
      new Array(q + 1).fill(0)
    );

    for (let j = 0; j < n; j++) {
      const tac = drawnTactics[j];
      const preview = computeTacticTarget(tac, sectors, brain, params);
      if (preview.targetSector === null || preview.cardsPlaced.length === 0) {
        edgeCases.H1_noTargetEligible += 1;
      } else {
        if (tac === 'A1') {
          sectorsTargetedByA1.add(preview.targetSector);
        }
        for (const c of preview.cardsPlaced) {
          for (let countIdx = 0; countIdx < c.count; countIdx++) {
            if (c.isHarvester) {
              harvesterCardsGrid[preview.targetSector][c.cell].push(tac);
              if (tac === 'A3') {
                a3ReinforcementsByCell[preview.targetSector][c.cell] += 1;
              }
            } else {
              bulldozerCardsGrid[preview.targetSector][c.cell].push(tac);
            }
            totalCardsPlaced += 1;
          }
        }
      }
      targetedActions.push({
        playerIndex: j,
        tactic: tac,
        targetSector: preview.targetSector,
        cardsPlaced: preview.cardsPlaced.map((c) => ({ cell: c.cell, count: c.count })),
      });
    }

    // ========================================================================
    // PHASE 3 - ÉTAPE 2 : Mouvement (A1) et Entrée en Jeu (A3) des Abatteuses
    // ========================================================================
    const harvesterMovesA1: TurnTrace['harvesterMovesA1'] = [];
    for (const secIdx of sectorsTargetedByA1) {
      const sec = sectors[secIdx];
      for (let p = q - 1; p >= 1; p--) {
        if (sec.harvesters[p] > 0) {
          const movedCount = sec.harvesters[p];
          sec.harvesters[p + 1] += movedCount;
          sec.harvesters[p] = 0;
          harvesterMovesA1.push({
            sectorIndex: secIdx,
            fromCell: p,
            toCell: p + 1,
            count: movedCount,
          });
        }
      }
    }

    const harvesterReinforcementsA3: TurnTrace['harvesterReinforcementsA3'] = [];
    let currentTotalHarvesters = sectors.reduce((acc, s) => acc + sumArray(s.harvesters, 1), 0);
    for (let i = 0; i < n; i++) {
      for (let p = 1; p <= q; p++) {
        const req = a3ReinforcementsByCell[i][p];
        if (req > 0) {
          let allowed = req;
          let capped = false;
          if (params.stockAbatteuses !== null) {
            const remainingStock = Math.max(0, params.stockAbatteuses - currentTotalHarvesters);
            if (allowed > remainingStock) {
              allowed = remainingStock;
              capped = true;
            }
          }
          sectors[i].harvesters[p] += allowed;
          currentTotalHarvesters += allowed;
          totalHarvestersSpawned += allowed;
          harvesterReinforcementsA3.push({
            sectorIndex: i,
            cell: p,
            count: allowed,
            cappedByStock: capped,
          });
        }
      }
    }

    checkInvariants(sectors, brain, params, turn, 'PHASE_3_STEP_2', seed, violations);

    // ========================================================================
    // PHASE 3 - ÉTAPE 3 & 4 : Résolution sur Image Figée + Évolution Cerveau
    // ========================================================================
    // Photographie figée (T^(0), S^(0), H^(0), posB^(0)) au début de l'Étape 3
    const snapshot = sectors.map((s) => ({
      standingTrees: [...s.standingTrees],
      stumps: [...s.stumps],
      harvesters: [...s.harvesters],
      bulldozerPos: s.bulldozerPos,
    }));

    // Calcul du nombre de cellules menacées (ayant carte ou machine) pour la métrique de Tension
    let threatenedCellsThisTurn = 0;
    for (let i = 0; i < n; i++) {
      for (let p = 0; p <= q; p++) {
        const hasCards =
          harvesterCardsGrid[i][p].length > 0 || bulldozerCardsGrid[i][p].length > 0;
        const hasMachines =
          (p >= 1 && snapshot[i].harvesters[p] > 0) ||
          (p >= 1 && snapshot[i].bulldozerPos === p);
        if (hasCards || hasMachines) {
          threatenedCellsThisTurn++;
        }
      }
    }
    sumThreatToDefenseRatio += threatenedCellsThisTurn / (2 * n);

    const resolutions: CellResolutionLog[] = [];
    const cellOrder: number[] =
      params.ordreCasse === 'AVANT_PARCELLE_1'
        ? Array.from({ length: q + 1 }, (_, idx) => idx) // 0, 1, ..., q
        : [...Array.from({ length: q }, (_, idx) => idx + 1), 0]; // 1, ..., q, 0

    for (let i = 0; i < n; i++) {
      const sec = sectors[i];
      const snap = snapshot[i];
      let repairedThisTurnInSector = false;

      for (const p of cellOrder) {
        const dCount = phase2.defendersGrid[i][p];
        const mACards = harvesterCardsGrid[i][p];
        const mBCards = bulldozerCardsGrid[i][p];
        const mA = mACards.length;
        const mB = mBCards.length;

        if (dCount === 1) defenderThresholdCounts.d1++;
        else if (dCount === 2) defenderThresholdCounts.d2++;
        else if (dCount >= 3) defenderThresholdCounts.d3Plus++;

        const treesRef =
          params.modeResolutionParcelle === 'TRANSACTION_FIGEE'
            ? snap.standingTrees[p]
            : sec.standingTrees[p];
        const stumpsRef =
          params.modeResolutionParcelle === 'TRANSACTION_FIGEE'
            ? snap.stumps[p]
            : sec.stumps[p];
        const harvRef =
          params.modeResolutionParcelle === 'TRANSACTION_FIGEE'
            ? snap.harvesters[p]
            : sec.harvesters[p];
        const bullPosRef =
          params.modeResolutionParcelle === 'TRANSACTION_FIGEE' && params.immobiliteReparation
            ? snap.bulldozerPos
            : sec.bulldozerPos;

        // Détection des cas limites H2, H3, H4, H7
        if (p >= 1 && mA >= 2 && treesRef === 1 && dCount === 0) {
          edgeCases.H2_multipleHarvesterCardsSingleTree++;
        }
        if (mB >= 2) {
          edgeCases.H3_multipleBulldozerCardsSameCell++;
        }
        if (p === 1 && dCount >= 3 && repairedThisTurnInSector && snap.bulldozerPos === 0) {
          edgeCases.H4_repairedBulldozerImmunityInCell1++;
        }

        const hasAnyMachine = (p >= 1 && harvRef > 0) || (p >= 1 && bullPosRef === p);
        if (dCount > 0 && mA === 0 && mB === 0 && !hasAnyMachine) {
          wastedDefendersCount += dCount;
          edgeCases.H7_emptyCellOverDefense += 1;
        } else if (dCount > 0 && mA === 0 && mB === 0 && hasAnyMachine) {
          // Si on met seulement 1 Défenseur sur une case avec machine mais sans carte, il ne détruit rien
          if (dCount === 1) {
            wastedDefendersCount += 1;
          } else if (dCount === 2 && harvRef === 0 && bullPosRef === p) {
            // 2 défenseurs sur un Bulldozer sans carte ne suffisent pas à le détruire
            wastedDefendersCount += 2;
          }
        }

        const harvesterStatuses: CardResolutionStatus[] = [];
        const bulldozerStatuses: CardResolutionStatus[] = [];
        let treesCut = 0;
        let stumpsCleared = 0;
        let harvestersDestroyed = 0;
        let bulldozerDestroyed = false;
        let bulldozerRepaired = false;
        let degradedBulldozer = false;

        // --- 1. RÉSOLUTION DES ABATTEUSES (si p >= 1) ---
        if (p >= 1) {
          if (dCount === 0) {
            if (mA >= 1) {
              if (params.modeResolutionParcelle === 'TRANSACTION_FIGEE') {
                if (treesRef >= 1) {
                  for (let k = 0; k < mA; k++) harvesterStatuses.push('SUCCESS');
                  treesCut = Math.min(mA, sec.standingTrees[p]);
                  sec.standingTrees[p] -= treesCut;
                  sec.stumps[p] += treesCut;
                } else {
                  for (let k = 0; k < mA; k++) harvesterStatuses.push('FAIL_NO_TARGET');
                }
              } else {
                // Mode SEQUENTIEL : chaque carte coupe 1 arbre si disponible
                for (let k = 0; k < mA; k++) {
                  if (sec.standingTrees[p] >= 1) {
                    sec.standingTrees[p] -= 1;
                    sec.stumps[p] += 1;
                    treesCut += 1;
                    harvesterStatuses.push('SUCCESS');
                  } else {
                    harvesterStatuses.push('FAIL_NO_TARGET');
                  }
                }
              }
            }
          } else {
            // dCount >= 1 : Toutes les cartes Abattage sont parées
            for (let k = 0; k < mA; k++) {
              harvesterStatuses.push('FAIL_PARRIED');
            }
            // Si dCount >= 2 : Toutes les Abatteuses présentes sont détruites
            if (dCount >= 2 && harvRef > 0) {
              harvestersDestroyed = sec.harvesters[p];
              sec.harvesters[p] = 0;
              totalHarvestersDestroyed += harvestersDestroyed;
              if (mA === 0) {
                edgeCases.H7_preventiveDestructionNoCard += 1;
              }
              // Comme un joueur ne peut poser qu'un seul jeton sur sa propre piste, D>=2 implique au moins 1 allié
              coordinatedDestructionsCount += 1;
            }
          }
        }

        // --- 2. RÉSOLUTION DU BULLDOZER ---
        if (p === 0) {
          // La Casse (Réparation)
          if (dCount === 0) {
            if (mB >= 1) {
              if (bullPosRef === 0) {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('SUCCESS');
                sec.bulldozerPos = 1;
                bulldozerRepaired = true;
                repairedThisTurnInSector = true;
                totalBulldozersRepaired += 1;
              } else {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('FAIL_NO_TARGET');
              }
            }
          } else {
            // dCount >= 1 à la Casse : Parade de la réparation
            for (let k = 0; k < mB; k++) {
              bulldozerStatuses.push('FAIL_PARRIED');
            }
          }
        } else {
          // Parcelle p >= 1 (Terrassement)
          const currentStumpsForEval =
            params.modeResolutionParcelle === 'TRANSACTION_FIGEE' ? stumpsRef : sec.stumps[p];

          if (dCount === 0) {
            if (mB >= 1) {
              if (currentStumpsForEval >= 1) {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('SUCCESS');
                stumpsCleared = sec.stumps[p];
                sec.stumps[p] = 0;
              } else {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('FAIL_NO_TARGET');
              }
            }
          } else if (dCount === 1) {
            // Terrassement dégradé (1 souche par carte Bulldozer)
            if (mB >= 1) {
              if (currentStumpsForEval >= 1) {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('SUCCESS');
                stumpsCleared = Math.min(mB, sec.stumps[p]);
                sec.stumps[p] -= stumpsCleared;
                degradedBulldozer = true;
                edgeCases.H5_degradedBulldozerNoGrudge += 1;
              } else {
                for (let k = 0; k < mB; k++) bulldozerStatuses.push('FAIL_NO_TARGET');
              }
            }
          } else if (dCount === 2) {
            // Parade complète du Bulldozer (sans destruction)
            for (let k = 0; k < mB; k++) {
              bulldozerStatuses.push('FAIL_PARRIED');
            }
          } else if (dCount >= 3) {
            // Parade complète + Destruction du Bulldozer (envoyé à la Casse)
            for (let k = 0; k < mB; k++) {
              bulldozerStatuses.push('FAIL_PARRIED');
            }
            if (bullPosRef === p) {
              sec.bulldozerPos = 0;
              bulldozerDestroyed = true;
              totalBulldozersDestroyed += 1;
              coordinatedDestructionsCount += 1;
              if (mB === 0) {
                edgeCases.H7_preventiveDestructionNoCard += 1;
              }
            }
          }
        }

        // Comptabilisation des statuts de cartes
        for (const st of [...harvesterStatuses, ...bulldozerStatuses]) {
          if (st === 'SUCCESS') totalCardsSucceeded++;
          else if (st === 'FAIL_PARRIED') totalCardsParried++;
          else totalCardsNoTarget++;
        }

        // --- ÉTAPE 4.1 : L'Apprentissage (Mise à jour de la Piste des Tactiques) ---
        const resolvedCards: Array<{ tactic: TacticId; status: CardResolutionStatus }> = [];
        for (let k = 0; k < mA; k++) {
          resolvedCards.push({ tactic: mACards[k], status: harvesterStatuses[k] });
        }
        for (let k = 0; k < mB; k++) {
          resolvedCards.push({ tactic: mBCards[k], status: bulldozerStatuses[k] });
        }

        if (resolvedCards.length > 1) {
          if (params.ordreMajTactiques === 'ORDRE_PISTE_TAC') {
            const trackSnapshot = [...brain.tacticsTrack];
            resolvedCards.sort(
              (a, b) => trackSnapshot.indexOf(a.tactic) - trackSnapshot.indexOf(b.tactic)
            );
          } else {
            resolvedCards.sort(
              (a, b) => ALL_TACTICS.indexOf(a.tactic) - ALL_TACTICS.indexOf(b.tactic)
            );
          }
        }

        const tacticsMoved: CellResolutionLog['tacticsMoved'] = [];
        for (const rc of resolvedCards) {
          const curIdx = brain.tacticsTrack.indexOf(rc.tactic);
          if (rc.status === 'SUCCESS' && curIdx > 0) {
            const targetIdx = curIdx - 1;
            const other = brain.tacticsTrack[targetIdx];
            brain.tacticsTrack[targetIdx] = rc.tactic;
            brain.tacticsTrack[curIdx] = other;
            totalBrainPermutations += 1;
            tacticsMoved.push({
              tactic: rc.tactic,
              fromSlot: curIdx + 1,
              toSlot: targetIdx + 1,
              status: rc.status,
            });
          } else if (rc.status !== 'SUCCESS' && curIdx < 5) {
            const targetIdx = curIdx + 1;
            const other = brain.tacticsTrack[targetIdx];
            brain.tacticsTrack[targetIdx] = rc.tactic;
            brain.tacticsTrack[curIdx] = other;
            totalBrainPermutations += 1;
            tacticsMoved.push({
              tactic: rc.tactic,
              fromSlot: curIdx + 1,
              toSlot: targetIdx + 1,
              status: rc.status,
            });
          }
        }

        // --- ÉTAPE 4.2 : La Rancune (Mise à jour de L'Œil du Contremaître) ---
        const parriedCount =
          harvesterStatuses.filter((s) => s === 'FAIL_PARRIED').length +
          bulldozerStatuses.filter((s) => s === 'FAIL_PARRIED').length +
          (params.rancuneTerrassementDegrade && degradedBulldozer ? mB : 0);

        const destroyedMachinesCount =
          harvestersDestroyed + (bulldozerDestroyed ? 1 : 0);

        if (parriedCount + destroyedMachinesCount >= 2) {
          edgeCases.H6_multiEventSameCellSingleGrudge += 1;
        }

        let grudgeSteps = 0;
        if (params.granulariteRancune === 'PAR_CASE') {
          if (parriedCount >= 1 || destroyedMachinesCount >= 1) {
            grudgeSteps = 1;
          }
        } else if (params.granulariteRancune === 'PAR_EVENEMENT') {
          grudgeSteps = parriedCount + destroyedMachinesCount;
        } else {
          // CARTE_ET_DESTRUCTION
          grudgeSteps = parriedCount + (destroyedMachinesCount >= 1 ? 1 : 0);
        }

        let actualGrudgeMoved = 0;
        for (let g = 0; g < grudgeSteps; g++) {
          const eyeIdx = brain.eyeTrack.indexOf(i);
          if (eyeIdx > 0) {
            const prevSector = brain.eyeTrack[eyeIdx - 1];
            brain.eyeTrack[eyeIdx - 1] = i;
            brain.eyeTrack[eyeIdx] = prevSector;
            actualGrudgeMoved += 1;
            totalBrainPermutations += 1;
          }
        }

        if (
          dCount > 0 ||
          mA > 0 ||
          mB > 0 ||
          harvestersDestroyed > 0 ||
          bulldozerDestroyed ||
          bulldozerRepaired
        ) {
          resolutions.push({
            sectorIndex: i,
            cellIndex: p,
            defendersCount: dCount,
            harvesterCards: [...mACards],
            bulldozerCards: [...mBCards],
            harvesterStatuses,
            bulldozerStatuses,
            treesCut,
            stumpsCleared,
            harvestersDestroyed,
            bulldozerDestroyed,
            bulldozerRepaired,
            degradedBulldozer,
            grudgeIncrement: actualGrudgeMoved,
            tacticsMoved,
          });
        }
      }
    }

    // ========================================================================
    // FIN DE TOUR : Repositionnement automatique des Machines désœuvrées
    // ========================================================================
    const repositionings: TurnTrace['repositionings'] = [];

    for (let i = 0; i < n; i++) {
      const sec = sectors[i];

      // 1. Abatteuses désœuvrées (H_{i,p} >= 1 et T_{i,p} == 0, pour p in 1..q-1)
      // On parcourt de q-1 vers 1 afin qu'une machine qui vient d'arriver sur une parcelle avec T>=1 ne soit pas retraitée
      for (let p = q - 1; p >= 1; p--) {
        if (sec.harvesters[p] >= 1 && sec.standingTrees[p] === 0) {
          let targetCell = -1;
          for (let pNext = p + 1; pNext <= q; pNext++) {
            if (sec.standingTrees[pNext] >= 1) {
              targetCell = pNext;
              break;
            }
          }
          if (targetCell !== -1) {
            const count = sec.harvesters[p];
            sec.harvesters[targetCell] += count;
            sec.harvesters[p] = 0;
            totalRepositionings += 1;
            repositionings.push({
              sectorIndex: i,
              machineType: 'HARVESTER',
              fromCell: p,
              toCell: targetCell,
              count,
            });
          }
        }
      }

      // 2. Bulldozer désœuvré (posB_i = p >= 1 et S_{i,p} == 0)
      const bPos = sec.bulldozerPos;
      if (bPos >= 1 && sec.stumps[bPos] === 0) {
        let bestCell = -1;
        let bestDist = 999;
        for (let p = 1; p <= q; p++) {
          if (sec.stumps[p] >= 1) {
            const dist = Math.abs(p - bPos);
            if (dist < bestDist || (dist === bestDist && p > bPos)) {
              // Priorité vers l'avant (vers la droite : p > bPos) en cas d'égalité de distance
              bestDist = dist;
              bestCell = p;
            }
          }
        }
        if (bestCell !== -1 && bestCell !== bPos) {
          sec.bulldozerPos = bestCell;
          totalRepositionings += 1;
          repositionings.push({
            sectorIndex: i,
            machineType: 'BULLDOZER',
            fromCell: bPos,
            toCell: bestCell,
            count: 1,
          });
        }
      }
    }

    checkInvariants(sectors, brain, params, turn, 'TURN_END', seed, violations);

    // Statistiques de fin de tour
    const slot1Tac = brain.tacticsTrack[0];
    tacticSlot1Turns[slot1Tac] += 1;

    let standingTreesEnd = 0;
    let stumpsEnd = 0;
    let clearedEnd = 0;
    let activeHarvestersEnd = 0;
    let activeBulldozersEnd = 0;

    for (let i = 0; i < n; i++) {
      const s = sectors[i];
      if (s.bulldozerPos >= 1) activeBulldozersEnd += 1;
      for (let p = 1; p <= q; p++) {
        standingTreesEnd += s.standingTrees[p];
        stumpsEnd += s.stumps[p];
        clearedEnd += s.initialCapacity[p] - s.standingTrees[p] - s.stumps[p];
        activeHarvestersEnd += s.harvesters[p];
      }
    }

    sumActiveHarvestersPerTurn += activeHarvestersEnd;

    // Détection de tour stagnant (aucun arbre coupé, aucune souche rasée, aucune machine bougée/détruite alors qu'il reste des arbres)
    const anyActionResolved = resolutions.some(
      (r) =>
        r.treesCut > 0 ||
        r.stumpsCleared > 0 ||
        r.harvestersDestroyed > 0 ||
        r.bulldozerDestroyed ||
        r.bulldozerRepaired ||
        r.harvesterStatuses.includes('FAIL_PARRIED') ||
        r.bulldozerStatuses.includes('FAIL_PARRIED')
    );
    if (
      !anyActionResolved &&
      harvesterMovesA1.length === 0 &&
      harvesterReinforcementsA3.length === 0 &&
      repositionings.length === 0 &&
      standingTreesEnd > 0
    ) {
      stagnantTurns += 1;
    }

    if (standingTreesEnd === 0 && stumpsEnd === 0 && earlyWipeoutTurn === null && turn < x) {
      earlyWipeoutTurn = turn;
    }

    if (options.recordTraces) {
      traces.push({
        turn,
        tacticsTrackStart,
        eyeTrackStart,
        diceRolls,
        step1Defenders: phase2.step1Defenders,
        microCycles: phase2.microCycles,
        finalDefenders: phase2.finalDefenders,
        defendersGrid: phase2.defendersGrid,
        targetedActions,
        harvesterMovesA1,
        harvesterReinforcementsA3,
        resolutions,
        repositionings,
        tacticsTrackEnd: [...brain.tacticsTrack],
        eyeTrackEnd: [...brain.eyeTrack],
        standingTreesEnd,
        stumpsEnd,
        clearedEnd,
        activeHarvestersEnd,
        activeBulldozersEnd,
        dilemmaEventsCount: phase2.dilemmaEventsCount,
        totalDecisionsCount: phase2.totalDecisionsCount,
      });
    }
  }

  // ==========================================================================
  // FIN DE PARTIE : Régénération de la Forêt & Décompte du Score (Section 6)
  // ==========================================================================
  let standingBeforeRegen = 0;
  let regeneratedTreesTotal = 0;
  let rawScore = 0;
  let maxPossibleTrees = 0;

  const perSectorFinalTrees = new Array(n).fill(0);
  const perInitialRankFinalTrees = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const s = sectors[i];
    for (let p = 1; p <= q; p++) {
      standingBeforeRegen += s.standingTrees[p];
      maxPossibleTrees += s.initialCapacity[p];
      if (s.stumps[p] >= 1 && params.nbRegeneration > 0) {
        const delta = Math.min(s.stumps[p], params.nbRegeneration);
        s.standingTrees[p] += delta;
        s.stumps[p] -= delta;
        regeneratedTreesTotal += delta;
      }
      perSectorFinalTrees[i] += s.standingTrees[p];
    }
    rawScore += perSectorFinalTrees[i];
    perInitialRankFinalTrees[s.initialEyeRank - 1] = perSectorFinalTrees[i];
  }

  checkInvariants(sectors, brain, params, x + 1, 'GAME_END_REGEN', seed, violations);

  const meanScorePerPlayer = rawScore / n;
  const normalizedScore = maxPossibleTrees > 0 ? rawScore / maxPossibleTrees : 0;

  // Barème de victoire d'Amazonia (proportionnel à la capacité par joueur q*a, référence 12)
  let victoryBracket: VictoryBracket = 'DEFEAT';
  if (normalizedScore >= 0.999) {
    victoryBracket = 'MIRACLE'; // 100% (12/12)
  } else if (normalizedScore >= 0.75) {
    victoryBracket = 'MAJOR_VICTORY'; // [9/12, 12/12[
  } else if (normalizedScore >= 0.5) {
    victoryBracket = 'COSTLY_VICTORY'; // [6/12, 9/12[
  } else {
    victoryBracket = 'DEFEAT'; // < 6/12
  }

  const result: SingleGameResult = {
    seed,
    params,
    tableConfigId,
    botProfiles,
    rawScore,
    meanScorePerPlayer,
    normalizedScore,
    victoryBracket,
    regeneratedTreesTotal,
    standingBeforeRegen,
    perSectorFinalTrees,
    perInitialRankFinalTrees,
    totalHarvestersSpawned,
    totalHarvestersDestroyed,
    totalBulldozersDestroyed,
    totalBulldozersRepaired,
    meanActiveHarvestersPerTurn: sumActiveHarvestersPerTurn / x,
    totalCardsPlaced,
    totalCardsSucceeded,
    totalCardsParried,
    totalCardsNoTarget,
    defenderThresholdCounts,
    wastedDefendersCount,
    overkillAvoidedInStep2,
    coordinatedDestructionsCount,
    meanStep2LockCycle: totalLockCyclesSum / (n * x),
    meanBrainPermutationsPerTurn: totalBrainPermutations / x,
    meanRepositioningsPerTurn: totalRepositionings / x,
    dilemmaRate: totalDecisions > 0 ? totalDilemmaEvents / totalDecisions : 0,
    threatToDefenseRatio: sumThreatToDefenseRatio / x,
    tacticSlot1Turns,
    edgeCases,
    violations,
    stagnantTurns,
    earlyWipeoutTurn,
    traces: options.recordTraces ? traces : undefined,
  };

  if (options.recordTraces) {
    result.textualJournal = formatGameTextualJournal(result, options.vocabulary || 'AMAZONIA');
  }

  return result;
}

/**
 * Génère un journal textuel complet, structuré et conçu spécifiquement pour être interprété par une IA
 */
export function formatGameTextualJournal(
  game: SingleGameResult,
  mode: ThemeVocabularyMode = 'AMAZONIA'
): string {
  const lines: string[] = [];
  const p = game.params;
  lines.push(`=== JOURNAL D'EXÉCUTION DE PARTIE [SEED: ${game.seed}] ===`);
  lines.push(
    `Paramètres : n=${p.n} secteurs, q=${p.q} parcelles, a=${p.a} arbres/parcelle, x=${p.x} tours | Tirage=${p.modeTirageDes} | Résolution=${p.modeResolutionParcelle} | Rancune=${p.granulariteRancune}`
  );
  lines.push(
    `Table (${game.tableConfigId}) : [${game.botProfiles
      .map((b, idx) => `J${idx + 1}:${b}`)
      .join(', ')}]`
  );
  lines.push(
    `Résultat Final : Score Brut = ${game.rawScore}/${p.n * p.q * p.a} (${(
      game.normalizedScore * 100
    ).toFixed(1)}%) | Moyenne/Joueur = ${game.meanScorePerPlayer.toFixed(
      2
    )} | Palier = ${game.victoryBracket} (dont +${game.regeneratedTreesTotal} arbres régénérés)`
  );
  lines.push(
    `Cas limites déclenchés : H1=${game.edgeCases.H1_noTargetEligible}, H2=${game.edgeCases.H2_multipleHarvesterCardsSingleTree}, H3=${game.edgeCases.H3_multipleBulldozerCardsSameCell}, H4=${game.edgeCases.H4_repairedBulldozerImmunityInCell1}, H5=${game.edgeCases.H5_degradedBulldozerNoGrudge}, H6=${game.edgeCases.H6_multiEventSameCellSingleGrudge}, H7_Prev=${game.edgeCases.H7_preventiveDestructionNoCard}`
  );
  lines.push('');

  if (!game.traces || game.traces.length === 0) {
    lines.push('(Traces tour par tour non activées pour cette exécution)');
    return lines.join('\n');
  }

  for (const t of game.traces) {
    lines.push(`--- TOUR ${t.turn} / ${p.x} ---`);
    lines.push(
      `  [Cerveau Début] Tactiques=[${t.tacticsTrackStart.join(' > ')}] | Œil=[${t.eyeTrackStart
        .map((s) => formatFactionName(s, mode))
        .join(' > ')}]`
    );
    lines.push(
      `  [Phase 1 - Tirages secrets] ${t.diceRolls
        .map(
          (r) => `J${r.playerIndex + 1}:(${r.d1},${r.d2})->Case ${r.chosenSlot}[${r.tactic}]`
        )
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 2 - Étape 1 (1er Défenseur)] ${t.step1Defenders
        .map((cell, idx) => `J${idx + 1}->${formatCellName(cell, mode)}`)
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 2 - Étape 2 (${t.microCycles.length} micro-cycles)] ${t.finalDefenders
        .map(
          (fd) =>
            `J${fd.playerIndex + 1}->S${fd.supportSector + 1}:${formatCellName(
              fd.supportCell,
              mode
            )} (verrouillé r=${fd.lockCycle})`
        )
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 3 - Étape 1 (Ciblage)] ${t.targetedActions
        .map((ta) =>
          ta.targetSector === null || ta.cardsPlaced.length === 0
            ? `J${ta.playerIndex + 1}(${ta.tactic}):Sans cible(H1)`
            : `J${ta.playerIndex + 1}(${ta.tactic})->S${ta.targetSector + 1}[${ta.cardsPlaced
                .map((c) => `p=${c.cell}x${c.count}`)
                .join(',')}]`
        )
        .join(' | ')}`
    );

    if (t.harvesterMovesA1.length > 0 || t.harvesterReinforcementsA3.length > 0) {
      const mStr = t.harvesterMovesA1
        .map((m) => `S${m.sectorIndex + 1}:p${m.fromCell}->p${m.toCell}(x${m.count})`)
        .join(', ');
      const rStr = t.harvesterReinforcementsA3
        .map((r) => `S${r.sectorIndex + 1}:p${r.cell}(+${r.count} A3)`)
        .join(', ');
      lines.push(
        `  [Phase 3 - Étape 2 (Mouvements Abatteuses)] Avancées A1=[${mStr || 'Aucune'}] | Renforts A3=[${rStr || 'Aucun'}]`
      );
    }

    lines.push('  [Phase 3 - Étape 3 & 4 (Résolutions sur image figée)]');
    for (const res of t.resolutions) {
      const details: string[] = [];
      if (res.harvesterCards.length > 0) {
        details.push(
          `CartesA=[${res.harvesterCards.join(',')} -> ${res.harvesterStatuses.join(',')}]`
        );
      }
      if (res.bulldozerCards.length > 0) {
        details.push(
          `CartesB=[${res.bulldozerCards.join(',')} -> ${res.bulldozerStatuses.join(',')}]`
        );
      }
      if (res.treesCut > 0) details.push(`-${res.treesCut} Arbre(s)`);
      if (res.stumpsCleared > 0) details.push(`-${res.stumpsCleared} Souche(s)${res.degradedBulldozer ? ' (Terrassement dégradé H5)' : ''}`);
      if (res.harvestersDestroyed > 0) details.push(`${res.harvestersDestroyed} Abatteuse(s) détruite(s)`);
      if (res.bulldozerDestroyed) details.push(`Bulldozer détruit -> Casse`);
      if (res.bulldozerRepaired) details.push(`Bulldozer réparé -> p=1`);
      if (res.grudgeIncrement > 0) details.push(`Rancune +${res.grudgeIncrement}`);

      lines.push(
        `    • S${res.sectorIndex + 1} ${formatCellName(res.cellIndex, mode)} (D=${
          res.defendersCount
        }) : ${details.join(' | ') || 'Présence défensive sans événement'}`
      );
    }

    if (t.repositionings.length > 0) {
      lines.push(
        `  [Fin de Tour - Repositionnements] ${t.repositionings
          .map(
            (rep) =>
              `S${rep.sectorIndex + 1} ${rep.machineType}(x${rep.count}): p${rep.fromCell}->p${rep.toCell}`
          )
          .join(' | ')}`
      );
    }
    lines.push(
      `  [Bilan Fin Tour ${t.turn}] Arbres debout=${t.standingTreesEnd} | Souches=${t.stumpsEnd} | Terres rasées=${t.clearedEnd} | Abatteuses actives=${t.activeHarvestersEnd} | Bulldozers actifs=${t.activeBulldozersEnd}`
    );
    lines.push('');
  }

  lines.push(
    `=== FIN DE PARTIE [SEED: ${game.seed}] : Score Final = ${game.rawScore} (${(
      game.normalizedScore * 100
    ).toFixed(1)}%) — ${game.victoryBracket} ===`
  );
  return lines.join('\n');
}

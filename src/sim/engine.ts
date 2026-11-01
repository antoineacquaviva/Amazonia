import {
  BotProfileId,
  CardResolutionStatus,
  CellResolutionLog,
  EdgeCaseCounts,
  ForemanBrainState,
  GameParameters,
  InvariantViolationReport,
  SectorState,
  SideBySideComparisonResult,
  SingleGameResult,
  TacticGameStats,
  TacticId,
  ThemeVocabularyMode,
  TurnTrace,
  VictoryBracket,
} from './types';
import { formatCellName, formatFactionName, generateHumanRuleDiff } from './i18n';
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

function createEmptyTacticStats(): Record<TacticId, TacticGameStats> {
  const res = {} as Record<TacticId, TacticGameStats>;
  for (const t of ALL_TACTICS) {
    res[t] = {
      draws: 0,
      sumSlotWhenDrawn: 0,
      turnsInSlot1: 0,
      turnsInSlot1Or2: 0,
      cardsPlaced: 0,
      cardsSucceeded: 0,
      cardsParried: 0,
      cardsNoTarget: 0,
      noTargetAtPlacementH1: 0,
      treesCutAttributed: 0,
      harvestersDeployedAttributed: 0,
      stumpsClearedAttributed: 0,
      repairsSucceededAttributed: 0,
      defendersAttractedSum: 0,
      targetedCellsCount: 0,
    };
  }
  return res;
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
  violations: InvariantViolationReport[]
): void {
  const n = params.n;
  const q = params.q;

  for (let i = 0; i < n; i++) {
    const s = sectors[i];
    if (s.standingTrees[0] !== 0 || s.stumps[0] !== 0) {
      violations.push({
        code: 'I1_TREE_CONSERVATION',
        turn,
        phase,
        message: `Secteur ${i + 1}: La Casse (p=0) contient des arbres (${s.standingTrees[0]}) ou souches (${s.stumps[0]}).`,
        seed,
        offendingStateSnapshot: JSON.stringify(s),
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
          offendingStateSnapshot: JSON.stringify(s),
        });
      }
    }
  }

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
        offendingStateSnapshot: JSON.stringify(s),
      });
    }
    if (s.bulldozerPos < 0 || s.bulldozerPos > q) {
      violations.push({
        code: 'I2_MACHINE_BOUNDS',
        turn,
        phase,
        message: `Secteur ${i + 1}: Position Bulldozer hors bornes (${s.bulldozerPos}).`,
        seed,
        offendingStateSnapshot: JSON.stringify(s),
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
          offendingStateSnapshot: JSON.stringify(s),
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

  const tacSet = new Set(brain.tacticsTrack);
  if (brain.tacticsTrack.length !== 6 || tacSet.size !== 6) {
    violations.push({
      code: 'I3_BRAIN_PERMUTATION',
      turn,
      phase,
      message: `Piste des Tactiques corrompue : [${brain.tacticsTrack.join(', ')}]`,
      seed,
      offendingStateSnapshot: JSON.stringify(brain),
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
      offendingStateSnapshot: JSON.stringify(brain),
    });
  }
}

/**
 * Mise en place initiale (Section 4 + Interrupteur 6 `ruleInitialSetup`)
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

    if (params.ruleInitialSetup === 'V2_SMOOTH_DENSE') {
      // Édition 2.0 : Mise en place lissée et dense (aucune piste à 0 Abatteuse)
      if (initialEyeRank === 1) {
        // Rang 1 : En P1, 1 Souche + Bulldozer actif en P1 ; en P2, 1 Abatteuse
        if (standingTrees[1] >= 1) {
          standingTrees[1] -= 1;
          stumps[1] = 1;
        }
        harvesters[Math.min(2, q)] = 1;
        bulldozerPos = 1;
      } else if (initialEyeRank === 2) {
        // Rang 2 : En P1, 1 Souche + 1 Abatteuse en P1 (Bulldozer à la Casse)
        if (standingTrees[1] >= 1) {
          standingTrees[1] -= 1;
          stumps[1] = 1;
        }
        harvesters[1] = 1;
        bulldozerPos = 0;
      } else {
        // Rangs 3..n : En P1, 1 Abatteuse (Bulldozer à la Casse)
        harvesters[1] = 1;
        bulldozerPos = 0;
      }
    } else {
      // Édition 1.0 : V1_SPARSE_RANK3_EMPTY
      if (initialEyeRank === 1) {
        if (standingTrees[1] >= 1) {
          standingTrees[1] -= 1;
          stumps[1] = 1;
        }
        harvesters[1] = 1;
        bulldozerPos = 1;
      } else if (initialEyeRank === 2) {
        harvesters[Math.min(2, q)] = 1;
        bulldozerPos = 0;
      } else if (initialEyeRank === 3) {
        bulldozerPos = 0;
      } else {
        harvesters[1] = 1;
        bulldozerPos = 0;
      }
    }

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
 * Simule une partie complète d'Amazonia : Dernier Rempart (V1, V2 ou Hybride)
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

  const botProfiles: BotProfileId[] = Array.from(
    { length: n },
    (_, i) => rawBotProfiles[i % rawBotProfiles.length] || 'COOPERATIVE'
  );

  const { sectors, brain } = initializeGame(params, rng);
  const edgeCases = createEmptyEdgeCases();
  const violations: InvariantViolationReport[] = [];
  const traces: TurnTrace[] = [];
  const perTacticStats = createEmptyTacticStats();

  checkInvariants(sectors, brain, params, 0, 'SETUP', seed, violations);

  let totalHarvestersSpawned = sectors.reduce(
    (acc, s) => acc + sumArray(s.harvesters, 1),
    0
  );
  let totalHarvestersDestroyed = 0;
  let totalBulldozersDestroyed = 0;
  let totalBulldozersRepaired = 0;
  let sumActiveHarvestersPerTurn = 0;
  let sumSecondHalfActiveMachines = 0;
  let secondHalfTurnsCount = 0;

  let totalCardsPlaced = 0;
  let totalCardsSucceeded = 0;
  let totalCardsParried = 0;
  let totalCardsNoTarget = 0;

  const defenderThresholdCounts = { d1: 0, d2: 0, d3Plus: 0 };
  let wastedDefendersCount = 0;
  let overkillAvoidedInStep2 = 0;
  let step2CellsSavedCount = 0;
  let coordinatedDestructionsCount = 0;
  let totalLockCyclesSum = 0;
  let totalBrainPermutations = 0;
  let totalRepositionings = 0;
  let totalMachineMovesAndDestructions = 0;
  let totalDilemmaEvents = 0;
  let totalDecisions = 0;
  let sumThreatToDefenseRatio = 0;
  let stagnantTurns = 0;
  let earlyWipeoutTurn: number | null = null;

  // Métriques Axe B (Apprentissage) & Axe D (Secret sous gobelet)
  let learningAdvancesCount = 0;
  let learningRetreatsCount = 0;
  let snowballOpportunities = 0;
  let snowballSuccesses = 0;
  let previousTurnSucceededTactics = new Set<TacticId>();
  const tacticsEverInTop2 = new Set<TacticId>();

  let cupRedirectionCount = 0;
  const totalDefenderTokensPlaced = 2 * n * x;
  let surpriseDrawsSlots3To6Count = 0;
  let surpriseDrawsParriedCount = 0;
  let externalDrawTargetedAllyCount = 0;
  let externalDrawProperlyDefendedCount = 0;

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

    tacticsEverInTop2.add(tacticsTrackStart[0]);
    tacticsEverInTop2.add(tacticsTrackStart[1]);

    // ========================================================================
    // PHASE 1 : Programmation secrète (Lancer de dés sous gobelet)
    // ========================================================================
    const diceRolls: TurnTrace['diceRolls'] = [];
    const drawnTactics: TacticId[] = [];
    const drawnSlots: number[] = [];

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
      drawnSlots.push(roll.chosenSlot);

      perTacticStats[tactic].draws += 1;
      perTacticStats[tactic].sumSlotWhenDrawn += roll.chosenSlot;
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
    cupRedirectionCount += phase2.cupRedirectionCount;
    for (const fd of phase2.finalDefenders) {
      totalLockCyclesSum += fd.lockCycle;
    }

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
    const v2FallbackDeploymentsBySector: number[] = new Array(n).fill(0);

    for (let j = 0; j < n; j++) {
      const tac = drawnTactics[j];
      const slot = drawnSlots[j];
      const preview = computeTacticTarget(tac, sectors, brain, params);
      let v2FallbackApplied = false;

      if (preview.targetSector === null || preview.cardsPlaced.length === 0) {
        edgeCases.H1_noTargetEligible += 1;
        perTacticStats[tac].noTargetAtPlacementH1 += 1;

        // Interrupteur 1 : V2_FALLBACK_DEPLOY_AND_RETREAT
        if (
          params.ruleNoTargetH1 === 'V2_FALLBACK_DEPLOY_AND_RETREAT' &&
          (tac === 'A1' || tac === 'A2')
        ) {
          v2FallbackApplied = true;
          // 1. La tuile A1 ou A2 recule immédiatement d'un cran vers la Case 6
          const curIdx = brain.tacticsTrack.indexOf(tac);
          if (curIdx >= 0 && curIdx < 5) {
            const other = brain.tacticsTrack[curIdx + 1];
            brain.tacticsTrack[curIdx + 1] = tac;
            brain.tacticsTrack[curIdx] = other;
            totalBrainPermutations += 1;
            learningRetreatsCount += 1;
          }
          // 2. Déploiement en repli d'1 Abatteuse en Parcelle 1 sur la piste la plus boisée
          if (
            preview.v2FallbackDeploySector !== null &&
            preview.v2FallbackDeploySector !== undefined
          ) {
            v2FallbackDeploymentsBySector[preview.v2FallbackDeploySector] += 1;
          }
        }
      } else {
        if (tac === 'A1') {
          sectorsTargetedByA1.add(preview.targetSector);
        }
        for (const c of preview.cardsPlaced) {
          const defOnTarget = phase2.defendersGrid[preview.targetSector][c.cell];
          perTacticStats[tac].defendersAttractedSum += defOnTarget;
          perTacticStats[tac].targetedCellsCount += 1;

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
            perTacticStats[tac].cardsPlaced += 1;
          }
        }

        // Mesure Axe D : si ce tirage de j ciblait un allié i != j, a-t-il reçu la défense requise ?
        if (preview.targetSector !== j) {
          externalDrawTargetedAllyCount += 1;
          const mainTargetCell = preview.cardsPlaced[0].cell;
          const dAtTarget =
            phase2.defendersGrid[preview.targetSector][mainTargetCell];
          const requiredD = preview.cardsPlaced[0].isHarvester
            ? 1
            : mainTargetCell === 0 && params.ruleScrapyardExit === 'V1_PASSIVE_D1'
            ? 1
            : 2;
          if (dAtTarget >= requiredD) {
            externalDrawProperlyDefendedCount += 1;
          }
        }

        // Mesure Axe D : si tirage surprise sur Cases 3 à 6, est-il paré ?
        if (slot >= 3) {
          surpriseDrawsSlots3To6Count += 1;
          const mainCell = preview.cardsPlaced[0].cell;
          const dAtCell = phase2.defendersGrid[preview.targetSector][mainCell];
          const isParried = preview.cardsPlaced[0].isHarvester
            ? dAtCell >= 1
            : mainCell === 0 && params.ruleScrapyardExit === 'V1_PASSIVE_D1'
            ? dAtCell >= 1
            : dAtCell >= 2;
          if (isParried) {
            surpriseDrawsParriedCount += 1;
          }
        }
      }

      targetedActions.push({
        playerIndex: j,
        tactic: tac,
        drawnSlot: slot,
        targetSector: preview.targetSector,
        cardsPlaced: preview.cardsPlaced.map((c) => ({
          cell: c.cell,
          count: c.count,
        })),
        v2FallbackApplied,
      });
    }

    // ========================================================================
    // PHASE 3 - ÉTAPE 2 : Mouvement (A1) et Entrée en Jeu (A3 + Repli H1 V2)
    // ========================================================================
    const harvesterMovesA1: TurnTrace['harvesterMovesA1'] = [];
    for (const secIdx of sectorsTargetedByA1) {
      const sec = sectors[secIdx];
      for (let p = q - 1; p >= 1; p--) {
        if (sec.harvesters[p] > 0) {
          const movedCount = sec.harvesters[p];
          sec.harvesters[p + 1] += movedCount;
          sec.harvesters[p] = 0;
          totalMachineMovesAndDestructions += 1;
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
    let currentTotalHarvesters = sectors.reduce(
      (acc, s) => acc + sumArray(s.harvesters, 1),
      0
    );

    // Déploiements A3 standards
    for (let i = 0; i < n; i++) {
      for (let p = 1; p <= q; p++) {
        const req = a3ReinforcementsByCell[i][p];
        if (req > 0) {
          let allowed = req;
          let capped = false;
          if (params.stockAbatteuses !== null) {
            const remainingStock = Math.max(
              0,
              params.stockAbatteuses - currentTotalHarvesters
            );
            if (allowed > remainingStock) {
              allowed = remainingStock;
              capped = true;
            }
          }
          sectors[i].harvesters[p] += allowed;
          currentTotalHarvesters += allowed;
          totalHarvestersSpawned += allowed;
          totalMachineMovesAndDestructions += allowed;
          perTacticStats['A3'].harvestersDeployedAttributed += allowed;
          harvesterReinforcementsA3.push({
            sectorIndex: i,
            cell: p,
            count: allowed,
            cappedByStock: capped,
            isFallbackH1: false,
          });
        }
      }
    }

    // Déploiements de repli V2 (Interrupteur 1 : V2_FALLBACK_DEPLOY_AND_RETREAT)
    for (let i = 0; i < n; i++) {
      const fbReq = v2FallbackDeploymentsBySector[i];
      if (fbReq > 0) {
        let allowed = fbReq;
        let capped = false;
        if (params.stockAbatteuses !== null) {
          const remainingStock = Math.max(
            0,
            params.stockAbatteuses - currentTotalHarvesters
          );
          if (allowed > remainingStock) {
            allowed = remainingStock;
            capped = true;
          }
        }
        if (allowed > 0) {
          sectors[i].harvesters[1] += allowed;
          currentTotalHarvesters += allowed;
          totalHarvestersSpawned += allowed;
          totalMachineMovesAndDestructions += allowed;
          harvesterReinforcementsA3.push({
            sectorIndex: i,
            cell: 1,
            count: allowed,
            cappedByStock: capped,
            isFallbackH1: true,
          });
        }
      }
    }

    checkInvariants(sectors, brain, params, turn, 'PHASE_3_STEP_2', seed, violations);

    // ========================================================================
    // PHASE 3 - ÉTAPE 3 & 4 : Résolution sur Image Figée + Évolution Cerveau
    // ========================================================================
    const snapshot = sectors.map((s) => ({
      standingTrees: [...s.standingTrees],
      stumps: [...s.stumps],
      harvesters: [...s.harvesters],
      bulldozerPos: s.bulldozerPos,
    }));

    let threatenedCellsThisTurn = 0;
    let turnStep2SavedCells = 0;

    for (let i = 0; i < n; i++) {
      for (let p = 0; p <= q; p++) {
        const mACount = harvesterCardsGrid[i][p].length;
        const mBCount = bulldozerCardsGrid[i][p].length;
        const hasCards = mACount > 0 || mBCount > 0;
        const hasMachines =
          (p >= 1 && snapshot[i].harvesters[p] > 0) ||
          (p >= 1 && snapshot[i].bulldozerPos === p);
        if (hasCards || hasMachines) {
          threatenedCellsThisTurn++;
        }

        // Mesure Critère 4B : Est-ce que le réajustement entre r=1 et r_final a sauvé cette case ?
        const dCycle1 = phase2.cycle1DefendersGrid[i][p];
        const dFinal = phase2.defendersGrid[i][p];
        if (dFinal > dCycle1 && hasCards) {
          const neededD =
            mBCount > 0
              ? p === 0 && params.ruleScrapyardExit === 'V1_PASSIVE_D1'
                ? 1
                : mBCount + 1
              : params.ruleParryMode === 'V2_UNITARY_PER_CARD'
              ? mACount
              : 1;
          if (dCycle1 < neededD && dFinal >= neededD) {
            turnStep2SavedCells += 1;
            step2CellsSavedCount += 1;
          }
        }
      }
    }
    sumThreatToDefenseRatio += threatenedCellsThisTurn / (2 * n);

    const resolutions: CellResolutionLog[] = [];
    const cellOrder: number[] =
      params.ordreCasse === 'AVANT_PARCELLE_1'
        ? Array.from({ length: q + 1 }, (_, idx) => idx)
        : [...Array.from({ length: q }, (_, idx) => idx + 1), 0];

    const currentTurnSucceededTactics = new Set<TacticId>();

    for (let i = 0; i < n; i++) {
      const sec = sectors[i];
      const snap = snapshot[i];
      let repairedThisTurnInSector = false;

      for (const p of cellOrder) {
        const dCount = phase2.defendersGrid[i][p];
        const mACards = [...harvesterCardsGrid[i][p]];
        const mBCards = [...bulldozerCardsGrid[i][p]];
        const mA = mACards.length;
        const mB = mBCards.length;

        // En mode V2_CARD_REQUIRED, si un emplacement n'a aucune carte Manœuvre, on ne résout pas de destruction préventive
        const isV2CardRequired =
          params.rulePreventiveDestruction === 'V2_CARD_REQUIRED';
        const isV2UnitaryParry =
          params.ruleParryMode === 'V2_UNITARY_PER_CARD';

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
          params.modeResolutionParcelle === 'TRANSACTION_FIGEE' &&
          params.immobiliteReparation
            ? snap.bulldozerPos
            : sec.bulldozerPos;

        if (p >= 1 && mA >= 2 && treesRef === 1 && dCount === 0) {
          edgeCases.H2_multipleHarvesterCardsSingleTree++;
        }
        if (mB >= 2) {
          edgeCases.H3_multipleBulldozerCardsSameCell++;
        }
        if (
          !isV2CardRequired &&
          p === 1 &&
          dCount >= 3 &&
          repairedThisTurnInSector &&
          snap.bulldozerPos === 0
        ) {
          edgeCases.H4_repairedBulldozerImmunityInCell1++;
        }

        const hasAnyMachine =
          (p >= 1 && harvRef > 0) || (p >= 1 && bullPosRef === p);
        if (dCount > 0 && mA === 0 && mB === 0 && !hasAnyMachine) {
          wastedDefendersCount += dCount;
          edgeCases.H7_emptyCellOverDefense += 1;
        } else if (dCount > 0 && mA === 0 && mB === 0 && hasAnyMachine) {
          if (isV2CardRequired) {
            // En V2_CARD_REQUIRED, poser des défenseurs sur une machine sans carte est 100% gaspillé
            wastedDefendersCount += dCount;
            edgeCases.H7_emptyCellOverDefense += 1;
          } else if (dCount === 1) {
            wastedDefendersCount += 1;
          } else if (dCount === 2 && harvRef === 0 && bullPosRef === p) {
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
        let bulldozerOffensiveExitCell: number | undefined;
        let degradedBulldozer = false;

        // Trier les cartes présentes selon l'ordre de la Piste des Tactiques pour l'allocation unitaire V2
        if (mA > 1) {
          const trackSnap = [...brain.tacticsTrack];
          mACards.sort((a, b) => trackSnap.indexOf(a) - trackSnap.indexOf(b));
        }
        if (mB > 1) {
          const trackSnap = [...brain.tacticsTrack];
          mBCards.sort((a, b) => trackSnap.indexOf(a) - trackSnap.indexOf(b));
        }

        // --- 1. RÉSOLUTION DES ABATTEUSES (si p >= 1) ---
        if (p >= 1) {
          if (!isV2UnitaryParry) {
            // MODE V1 : Parade illimitée par case (D >= 1 pare tout)
            if (dCount === 0) {
              if (mA >= 1) {
                if (params.modeResolutionParcelle === 'TRANSACTION_FIGEE') {
                  if (treesRef >= 1) {
                    for (let k = 0; k < mA; k++)
                      harvesterStatuses.push('SUCCESS');
                    treesCut = Math.min(mA, sec.standingTrees[p]);
                    sec.standingTrees[p] -= treesCut;
                    sec.stumps[p] += treesCut;
                  } else {
                    for (let k = 0; k < mA; k++)
                      harvesterStatuses.push('FAIL_NO_TARGET');
                  }
                } else {
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
              for (let k = 0; k < mA; k++) {
                harvesterStatuses.push('FAIL_PARRIED');
              }
              const canDestroyHarv = !isV2CardRequired || mA >= 1;
              if (dCount >= 2 && harvRef > 0 && canDestroyHarv) {
                harvestersDestroyed = sec.harvesters[p];
                sec.harvesters[p] = 0;
                totalHarvestersDestroyed += harvestersDestroyed;
                totalMachineMovesAndDestructions += harvestersDestroyed;
                if (mA === 0) {
                  edgeCases.H7_preventiveDestructionNoCard += 1;
                }
                coordinatedDestructionsCount += 1;
              }
            }
          } else {
            // MODE V2 : Parade unitaire (Parades_A = min(D, m_A))
            const paradesA = Math.min(dCount, mA);
            const mARest = mA - paradesA;
            for (let k = 0; k < paradesA; k++) {
              harvesterStatuses.push('FAIL_PARRIED');
            }
            if (mARest > 0) {
              if (treesRef >= 1) {
                for (let k = 0; k < mARest; k++) {
                  harvesterStatuses.push('SUCCESS');
                }
                treesCut = Math.min(mARest, sec.standingTrees[p]);
                sec.standingTrees[p] -= treesCut;
                sec.stumps[p] += treesCut;
              } else {
                for (let k = 0; k < mARest; k++) {
                  harvesterStatuses.push('FAIL_NO_TARGET');
                }
              }
            }
            // Destruction des Abatteuses en V2 : D >= m_A + 1 et D >= 2
            const canDestroyHarv = !isV2CardRequired || mA >= 1;
            if (
              canDestroyHarv &&
              harvRef > 0 &&
              dCount >= mA + 1 &&
              dCount >= 2
            ) {
              harvestersDestroyed = sec.harvesters[p];
              sec.harvesters[p] = 0;
              totalHarvestersDestroyed += harvestersDestroyed;
              totalMachineMovesAndDestructions += harvestersDestroyed;
              if (mA === 0) {
                edgeCases.H7_preventiveDestructionNoCard += 1;
              }
              coordinatedDestructionsCount += 1;
            }
          }
        }

        // Attribution des arbres coupés aux tactiques A ayant réussi
        if (treesCut > 0) {
          const succeededACards = mACards.filter(
            (_, idx) => harvesterStatuses[idx] === 'SUCCESS'
          );
          if (succeededACards.length > 0) {
            const share = treesCut / succeededACards.length;
            for (const tac of succeededACards) {
              perTacticStats[tac].treesCutAttributed += share;
            }
          }
        }

        // --- 2. RÉSOLUTION DU BULLDOZER ---
        if (p === 0) {
          // LA CASSE (p = 0)
          if (params.ruleScrapyardExit === 'V1_PASSIVE_D1') {
            // V1 : D=0 répare vers P1 sans raser, D>=1 bloque
            if (dCount === 0) {
              if (mB >= 1) {
                if (bullPosRef === 0) {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('SUCCESS');
                  sec.bulldozerPos = 1;
                  bulldozerRepaired = true;
                  repairedThisTurnInSector = true;
                  totalBulldozersRepaired += 1;
                  totalMachineMovesAndDestructions += 1;
                } else {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('FAIL_NO_TARGET');
                }
              }
            } else {
              for (let k = 0; k < mB; k++) {
                bulldozerStatuses.push('FAIL_PARRIED');
              }
            }
          } else {
            // V2_OFFENSIVE_D2 :
            // - D >= m_B + 1 : bloque la sortie de la Casse (FAIL_PARRIED)
            // - 1 <= D <= m_B : sortie dégradée en P1 sans raser de souche (SUCCESS)
            // - D == 0 : sortie offensive sur la 1re Parcelle ayant >=1 Souche (ou P1) et rase 1 Souche !
            if (mB >= 1) {
              if (bullPosRef !== 0) {
                for (let k = 0; k < mB; k++)
                  bulldozerStatuses.push('FAIL_NO_TARGET');
              } else if (dCount >= mB + 1) {
                for (let k = 0; k < mB; k++)
                  bulldozerStatuses.push('FAIL_PARRIED');
              } else if (dCount >= 1) {
                // Sortie en mode dégradé (1 <= D <= m_B) : rejoint P1 sans raser de souche
                for (let k = 0; k < mB; k++)
                  bulldozerStatuses.push('SUCCESS');
                sec.bulldozerPos = 1;
                bulldozerRepaired = true;
                degradedBulldozer = true;
                repairedThisTurnInSector = true;
                totalBulldozersRepaired += 1;
                totalMachineMovesAndDestructions += 1;
                edgeCases.H5_degradedBulldozerNoGrudge += 1;
              } else {
                // Sortie offensive (D = 0) : rejoint la 1re Parcelle contenant >= 1 Souche (ou P1) et rase 1 Souche
                for (let k = 0; k < mB; k++)
                  bulldozerStatuses.push('SUCCESS');
                let targetExitCell = 1;
                for (let cellP = 1; cellP <= q; cellP++) {
                  if (sec.stumps[cellP] >= 1) {
                    targetExitCell = cellP;
                    break;
                  }
                }
                sec.bulldozerPos = targetExitCell;
                bulldozerRepaired = true;
                bulldozerOffensiveExitCell = targetExitCell;
                repairedThisTurnInSector = true;
                totalBulldozersRepaired += 1;
                totalMachineMovesAndDestructions += 1;
                if (sec.stumps[targetExitCell] >= 1) {
                  sec.stumps[targetExitCell] -= 1;
                  stumpsCleared = 1;
                }
              }
            }
          }
        } else {
          // PARCELLE p >= 1 (Terrassement)
          const currentStumpsForEval =
            params.modeResolutionParcelle === 'TRANSACTION_FIGEE'
              ? stumpsRef
              : sec.stumps[p];

          if (!isV2UnitaryParry) {
            // MODE V1 : D=0 rase tout, D=1 rase min(m_B, S), D=2 pare, D>=3 pare + détruit
            if (dCount === 0) {
              if (mB >= 1) {
                if (currentStumpsForEval >= 1) {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('SUCCESS');
                  stumpsCleared = sec.stumps[p];
                  sec.stumps[p] = 0;
                } else {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('FAIL_NO_TARGET');
                }
              }
            } else if (dCount === 1) {
              if (mB >= 1) {
                if (currentStumpsForEval >= 1) {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('SUCCESS');
                  stumpsCleared = Math.min(mB, sec.stumps[p]);
                  sec.stumps[p] -= stumpsCleared;
                  degradedBulldozer = true;
                  edgeCases.H5_degradedBulldozerNoGrudge += 1;
                } else {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('FAIL_NO_TARGET');
                }
              }
            } else if (dCount === 2) {
              for (let k = 0; k < mB; k++) {
                bulldozerStatuses.push('FAIL_PARRIED');
              }
            } else if (dCount >= 3) {
              for (let k = 0; k < mB; k++) {
                bulldozerStatuses.push('FAIL_PARRIED');
              }
              const canDestroyBull = !isV2CardRequired || mB >= 1;
              if (bullPosRef === p && canDestroyBull) {
                sec.bulldozerPos = 0;
                bulldozerDestroyed = true;
                totalBulldozersDestroyed += 1;
                totalMachineMovesAndDestructions += 1;
                coordinatedDestructionsCount += 1;
                if (mB === 0) {
                  edgeCases.H7_preventiveDestructionNoCard += 1;
                }
              }
            }
          } else {
            // MODE V2 : Capacité unitaire face au Bulldozer
            // - Parer totalement m_B cartes requiert D >= m_B + 1
            // - Si 1 <= D <= m_B : terrassement dégradé (m_B - D + 1 souches retirées)
            // - Détruire le Bulldozer requiert D >= m_B + 2 (et D >= 3)
            if (mB >= 1) {
              if (dCount === 0) {
                if (currentStumpsForEval >= 1) {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('SUCCESS');
                  stumpsCleared = sec.stumps[p];
                  sec.stumps[p] = 0;
                } else {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('FAIL_NO_TARGET');
                }
              } else if (dCount <= mB) {
                // 1 <= D <= m_B : Terrassement dégradé proportionnel au déficit
                const deficitStumps = mB - dCount + 1;
                if (currentStumpsForEval >= 1) {
                  const parriedB = Math.min(dCount - 1, mB);
                  for (let k = 0; k < parriedB; k++) {
                    bulldozerStatuses.push('FAIL_PARRIED');
                  }
                  for (let k = parriedB; k < mB; k++) {
                    bulldozerStatuses.push('SUCCESS');
                  }
                  stumpsCleared = Math.min(deficitStumps, sec.stumps[p]);
                  sec.stumps[p] -= stumpsCleared;
                  degradedBulldozer = true;
                  edgeCases.H5_degradedBulldozerNoGrudge += 1;
                } else {
                  for (let k = 0; k < mB; k++)
                    bulldozerStatuses.push('FAIL_NO_TARGET');
                }
              } else {
                // D >= m_B + 1 : Parade totale
                for (let k = 0; k < mB; k++) {
                  bulldozerStatuses.push('FAIL_PARRIED');
                }
              }
            }

            // Destruction du Bulldozer en V2 : requiert D >= m_B + 2 et D >= 3
            const canDestroyBull = !isV2CardRequired || mB >= 1;
            if (
              canDestroyBull &&
              bullPosRef === p &&
              dCount >= mB + 2 &&
              dCount >= 3
            ) {
              sec.bulldozerPos = 0;
              bulldozerDestroyed = true;
              totalBulldozersDestroyed += 1;
              totalMachineMovesAndDestructions += 1;
              coordinatedDestructionsCount += 1;
              if (mB === 0) {
                edgeCases.H7_preventiveDestructionNoCard += 1;
              }
            }
          }
        }

        // Attribution des souches rasées et réparations aux tactiques B
        if (stumpsCleared > 0 || bulldozerRepaired) {
          const succeededBCards = mBCards.filter(
            (_, idx) => bulldozerStatuses[idx] === 'SUCCESS'
          );
          if (succeededBCards.length > 0) {
            const stumpShare = stumpsCleared / succeededBCards.length;
            const repShare = bulldozerRepaired ? 1 / succeededBCards.length : 0;
            for (const tac of succeededBCards) {
              perTacticStats[tac].stumpsClearedAttributed += stumpShare;
              perTacticStats[tac].repairsSucceededAttributed += repShare;
            }
          }
        }

        // Comptabilisation globale et par tactique des statuts de cartes
        for (let k = 0; k < mA; k++) {
          const tac = mACards[k];
          const st = harvesterStatuses[k];
          if (st === 'SUCCESS') {
            totalCardsSucceeded++;
            perTacticStats[tac].cardsSucceeded++;
            currentTurnSucceededTactics.add(tac);
          } else if (st === 'FAIL_PARRIED') {
            totalCardsParried++;
            perTacticStats[tac].cardsParried++;
          } else {
            totalCardsNoTarget++;
            perTacticStats[tac].cardsNoTarget++;
          }
        }
        for (let k = 0; k < mB; k++) {
          const tac = mBCards[k];
          const st = bulldozerStatuses[k];
          if (st === 'SUCCESS') {
            totalCardsSucceeded++;
            perTacticStats[tac].cardsSucceeded++;
            currentTurnSucceededTactics.add(tac);
          } else if (st === 'FAIL_PARRIED') {
            totalCardsParried++;
            perTacticStats[tac].cardsParried++;
          } else {
            totalCardsNoTarget++;
            perTacticStats[tac].cardsNoTarget++;
          }
        }

        // --- ÉTAPE 4.1 : L'Apprentissage (Mise à jour de la Piste des Tactiques) ---
        const resolvedCards: Array<{
          tactic: TacticId;
          status: CardResolutionStatus;
        }> = [];
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
              (a, b) =>
                trackSnapshot.indexOf(a.tactic) - trackSnapshot.indexOf(b.tactic)
            );
          } else {
            resolvedCards.sort(
              (a, b) =>
                ALL_TACTICS.indexOf(a.tactic) - ALL_TACTICS.indexOf(b.tactic)
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
            learningAdvancesCount += 1;
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
            learningRetreatsCount += 1;
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
            bulldozerOffensiveExitCell,
            degradedBulldozer,
            grudgeIncrement: actualGrudgeMoved,
            tacticsMoved,
          });
        }
      }
    }

    // Calcul de l'effet Boule de Neige (Snowball Rate — Axe B)
    if (turn >= 2 && previousTurnSucceededTactics.size > 0) {
      for (const prevTac of previousTurnSucceededTactics) {
        snowballOpportunities += 1;
        if (currentTurnSucceededTactics.has(prevTac)) {
          snowballSuccesses += 1;
        }
      }
    }
    previousTurnSucceededTactics = currentTurnSucceededTactics;

    // ========================================================================
    // FIN DE TOUR : Repositionnement automatique des Machines désœuvrées
    // ========================================================================
    const repositionings: TurnTrace['repositionings'] = [];

    for (let i = 0; i < n; i++) {
      const sec = sectors[i];

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

      const bPos = sec.bulldozerPos;
      if (bPos >= 1 && sec.stumps[bPos] === 0) {
        let bestCell = -1;
        let bestDist = 999;
        for (let p = 1; p <= q; p++) {
          if (sec.stumps[p] >= 1) {
            const dist = Math.abs(p - bPos);
            if (dist < bestDist || (dist === bestDist && p > bPos)) {
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

    const slot1Tac = brain.tacticsTrack[0];
    const slot2Tac = brain.tacticsTrack[1];
    tacticSlot1Turns[slot1Tac] += 1;
    perTacticStats[slot1Tac].turnsInSlot1 += 1;
    perTacticStats[slot1Tac].turnsInSlot1Or2 += 1;
    perTacticStats[slot2Tac].turnsInSlot1Or2 += 1;
    tacticsEverInTop2.add(slot1Tac);
    tacticsEverInTop2.add(slot2Tac);

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
    if (turn > Math.floor(x / 2)) {
      sumSecondHalfActiveMachines += activeHarvestersEnd + activeBulldozersEnd;
      secondHalfTurnsCount += 1;
    }

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

    if (
      standingTreesEnd === 0 &&
      stumpsEnd === 0 &&
      earlyWipeoutTurn === null &&
      turn < x
    ) {
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
        step2SavedCellsCount: turnStep2SavedCells,
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
  const attritionRateBeforeRegen =
    maxPossibleTrees > 0
      ? Math.max(0, (maxPossibleTrees - standingBeforeRegen) / maxPossibleTrees)
      : 0;

  let victoryBracket: VictoryBracket = 'DEFEAT';
  if (normalizedScore >= 0.999) {
    victoryBracket = 'MIRACLE';
  } else if (normalizedScore >= 0.75) {
    victoryBracket = 'MAJOR_VICTORY';
  } else if (normalizedScore >= 0.5) {
    victoryBracket = 'COSTLY_VICTORY';
  } else {
    victoryBracket = 'DEFEAT';
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
    attritionRateBeforeRegen,
    perSectorFinalTrees,
    perInitialRankFinalTrees,
    totalHarvestersSpawned,
    totalHarvestersDestroyed,
    totalBulldozersDestroyed,
    totalBulldozersRepaired,
    meanActiveHarvestersPerTurn: sumActiveHarvestersPerTurn / x,
    meanSecondHalfActiveMachines:
      secondHalfTurnsCount > 0
        ? sumSecondHalfActiveMachines / secondHalfTurnsCount
        : 0,
    totalCardsPlaced,
    totalCardsSucceeded,
    totalCardsParried,
    totalCardsNoTarget,
    defenderThresholdCounts,
    wastedDefendersCount,
    overkillAvoidedInStep2,
    step2CellsSavedCount,
    coordinatedDestructionsCount,
    meanStep2LockCycle: totalLockCyclesSum / (n * x),
    meanBrainPermutationsPerTurn: totalBrainPermutations / x,
    meanRepositioningsPerTurn: totalRepositionings / x,
    meanMachineMovesAndDestructionsPerTurn:
      totalMachineMovesAndDestructions / x,
    dilemmaRate: totalDecisions > 0 ? totalDilemmaEvents / totalDecisions : 0,
    threatToDefenseRatio: sumThreatToDefenseRatio / x,
    tacticSlot1Turns,
    perTacticStats,
    learningAdvancesCount,
    learningRetreatsCount,
    snowballOpportunities,
    snowballSuccesses,
    distinctTacticsInTop2: tacticsEverInTop2.size,
    cupRedirectionCount,
    totalDefenderTokensPlaced,
    surpriseDrawsSlots3To6Count,
    surpriseDrawsParriedCount,
    externalDrawTargetedAllyCount,
    externalDrawProperlyDefendedCount,
    edgeCases,
    violations,
    stagnantTurns,
    earlyWipeoutTurn,
    traces: options.recordTraces ? traces : undefined,
  };

  if (options.recordTraces) {
    result.textualJournal = formatGameTextualJournal(
      result,
      options.vocabulary || 'AMAZONIA'
    );
  }

  return result;
}

/**
 * Exécute une comparaison directe côte-à-côte sur la même graine aléatoire (Seed)
 */
export function runSideBySideComparison(
  seed: number,
  paramsA: GameParameters,
  paramsB: GameParameters,
  editionAName: string,
  editionBName: string,
  botProfile: BotProfileId,
  vocabulary: ThemeVocabularyMode = 'AMAZONIA'
): SideBySideComparisonResult {
  const gameA = runSingleGame(seed, paramsA, 'side_A', [botProfile], {
    recordTraces: true,
    vocabulary,
  });
  const gameB = runSingleGame(seed, paramsB, 'side_B', [botProfile], {
    recordTraces: true,
    vocabulary,
  });

  const diffObj = generateHumanRuleDiff(paramsA, paramsB, editionAName, editionBName);
  const tracesA = gameA.traces || [];
  const tracesB = gameB.traces || [];
  const maxTurns = Math.max(tracesA.length, tracesB.length);

  const turnComparisons: SideBySideComparisonResult['turnComparisons'] = [];
  for (let idx = 0; idx < maxTurns; idx++) {
    const tA = tracesA[idx];
    const tB = tracesB[idx];
    if (!tA || !tB) continue;

    const divergenceSummary: string[] = [];
    if (tA.tacticsTrackStart.join(',') !== tB.tacticsTrackStart.join(',')) {
      divergenceSummary.push(
        `Piste des Tactiques différente en début de tour (${tA.tacticsTrackStart.join('>')} vs ${tB.tacticsTrackStart.join('>')})`
      );
    }
    if (tA.standingTreesEnd !== tB.standingTreesEnd) {
      divergenceSummary.push(
        `Écart d'Arbres debout en fin de tour : ${tA.standingTreesEnd} (${editionAName}) vs ${tB.standingTreesEnd} (${editionBName})`
      );
    }
    if (tA.stumpsEnd !== tB.stumpsEnd) {
      divergenceSummary.push(
        `Écart de Souches : ${tA.stumpsEnd} vs ${tB.stumpsEnd}`
      );
    }
    if (tA.activeHarvestersEnd !== tB.activeHarvestersEnd) {
      divergenceSummary.push(
        `Écart d'Abatteuses actives : ${tA.activeHarvestersEnd} vs ${tB.activeHarvestersEnd}`
      );
    }
    if (tA.activeBulldozersEnd !== tB.activeBulldozersEnd) {
      divergenceSummary.push(
        `Écart de Bulldozers actifs : ${tA.activeBulldozersEnd} vs ${tB.activeBulldozersEnd}`
      );
    }

    turnComparisons.push({
      turn: tA.turn,
      traceA: tA,
      traceB: tB,
      hasDivergence: divergenceSummary.length > 0,
      divergenceSummary,
    });
  }

  return {
    seed,
    botProfile,
    editionAName,
    editionBName,
    humanDiffLines: diffObj.summaryText,
    gameA,
    gameB,
    turnComparisons,
  };
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
    `Interrupteurs V1/V2 : H1=${p.ruleNoTargetH1} | Parade=${p.ruleParryMode} | Préventif=${p.rulePreventiveDestruction} | CiblageB=${p.ruleBulldozerTargeting} | Casse=${p.ruleScrapyardExit} | Setup=${p.ruleInitialSetup}`
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
    )} | Palier = ${game.victoryBracket} (dont +${
      game.regeneratedTreesTotal
    } arbres régénérés, attrition avant régén = ${(
      game.attritionRateBeforeRegen * 100
    ).toFixed(1)}%)`
  );
  lines.push(
    `Cas limites déclenchés : H1=${game.edgeCases.H1_noTargetEligible}, H2=${game.edgeCases.H2_multipleHarvesterCardsSingleTree}, H3=${game.edgeCases.H3_multipleBulldozerCardsSameCell}, H4=${game.edgeCases.H4_repairedBulldozerImmunityInCell1}, H5=${game.edgeCases.H5_degradedBulldozerNoGrudge}, H6=${game.edgeCases.H6_multiEventSameCellSingleGrudge}, H7a=${game.edgeCases.H7_preventiveDestructionNoCard}, H7b=${game.edgeCases.H7_emptyCellOverDefense}`
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
          (r) =>
            `J${r.playerIndex + 1}:(${r.d1},${r.d2})->Case ${r.chosenSlot}[${r.tactic}]`
        )
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 2 - Étape 1 (1er Défenseur)] ${t.step1Defenders
        .map((cell, idx) => `J${idx + 1}->${formatCellName(cell, mode)}`)
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 2 - Étape 2 (${t.microCycles.length} micro-cycles, ${
        t.step2SavedCellsCount
      } sauvetage(s) r>=2)] ${t.finalDefenders
        .map(
          (fd) =>
            `J${fd.playerIndex + 1}->S${fd.supportSector + 1}:${formatCellName(
              fd.supportCell,
              mode
            )} (r=${fd.lockCycle}${fd.redirectedByCupSupport ? ', redirigé par gobelet' : ''})`
        )
        .join(' | ')}`
    );
    lines.push(
      `  [Phase 3 - Étape 1 (Ciblage)] ${t.targetedActions
        .map((ta) =>
          ta.targetSector === null || ta.cardsPlaced.length === 0
            ? `J${ta.playerIndex + 1}(${ta.tactic}):Sans cible(H1${
                ta.v2FallbackApplied ? ' -> Repli V2 Recul+Abatteuse P1' : ''
              })`
            : `J${ta.playerIndex + 1}(${ta.tactic})->S${ta.targetSector + 1}[${ta.cardsPlaced
                .map((c) => `p=${c.cell}x${c.count}`)
                .join(',')}]`
        )
        .join(' | ')}`
    );

    if (
      t.harvesterMovesA1.length > 0 ||
      t.harvesterReinforcementsA3.length > 0
    ) {
      const mStr = t.harvesterMovesA1
        .map(
          (m) => `S${m.sectorIndex + 1}:p${m.fromCell}->p${m.toCell}(x${m.count})`
        )
        .join(', ');
      const rStr = t.harvesterReinforcementsA3
        .map(
          (r) =>
            `S${r.sectorIndex + 1}:p${r.cell}(+${r.count} ${
              r.isFallbackH1 ? 'Repli H1 V2' : 'A3'
            })`
        )
        .join(', ');
      lines.push(
        `  [Phase 3 - Étape 2 (Mouvements Abatteuses)] Avancées A1=[${
          mStr || 'Aucune'
        }] | Renforts=[${rStr || 'Aucun'}]`
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
      if (res.stumpsCleared > 0)
        details.push(
          `-${res.stumpsCleared} Souche(s)${
            res.degradedBulldozer ? ' (Mode dégradé H5)' : ''
          }`
        );
      if (res.harvestersDestroyed > 0)
        details.push(`${res.harvestersDestroyed} Abatteuse(s) détruite(s)`);
      if (res.bulldozerDestroyed) details.push(`Bulldozer détruit -> Casse`);
      if (res.bulldozerRepaired)
        details.push(
          `Bulldozer réparé -> p=${res.bulldozerOffensiveExitCell || 1}${
            res.bulldozerOffensiveExitCell ? ' (Sortie offensive V2)' : ''
          }`
        );
      if (res.grudgeIncrement > 0)
        details.push(`Rancune +${res.grudgeIncrement}`);

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

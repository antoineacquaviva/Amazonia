import {
  BotProfileId,
  DefenderTokenPlacement,
  ForemanBrainState,
  GameParameters,
  MicroCycleStepLog,
  SectorState,
  TacticId,
} from './types';
import { getPriorProbabilities, SeededRNG } from './rng';
import { computeTacticTarget, getEyeRank, sumArray, TacticTargetPreview } from './targeting';

export interface CellThreatEstimate {
  expectedHarvesterCards: number;
  expectedBulldozerCards: number;
  certainHarvesterCards: number;
  certainBulldozerCards: number;
  harvestersPresentAfterStep2: number;
  bulldozerPresent: boolean;
  topContributingTacticSlot: number;
}

export interface Phase2DecisionOutput {
  step1Defenders: number[];
  microCycles: MicroCycleStepLog[];
  finalDefenders: DefenderTokenPlacement[];
  defendersGrid: number[][];
  cycle1DefendersGrid: number[][];
  dilemmaEventsCount: number;
  totalDecisionsCount: number;
  overkillAvoidedInStep2: number;
  cupRedirectionCount: number;
}

function buildThreatGrid(
  knownTacticsByPlayer: Array<TacticId | null>,
  beliefsByOtherPlayer: number[][],
  tacticPreviews: Record<TacticId, TacticTargetPreview>,
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters
): CellThreatEstimate[][] {
  const n = params.n;
  const q = params.q;

  let probNotA1 = 1;
  const slotA1 = brain.tacticsTrack.indexOf('A1');
  for (let pIdx = 0; pIdx < n; pIdx++) {
    if (knownTacticsByPlayer[pIdx] !== null) {
      if (knownTacticsByPlayer[pIdx] === 'A1') {
        probNotA1 = 0;
        break;
      }
    } else if (slotA1 >= 0) {
      probNotA1 *= 1 - beliefsByOtherPlayer[pIdx][slotA1];
    }
  }
  const probAnyA1 = 1 - probNotA1;
  const a1TargetSector = tacticPreviews['A1'].targetSector;

  const grid: CellThreatEstimate[][] = [];
  for (let i = 0; i < n; i++) {
    const row: CellThreatEstimate[] = [];
    for (let p = 0; p <= q; p++) {
      let harvAfter = p >= 1 ? sectors[i].harvesters[p] : 0;
      if (
        i === a1TargetSector &&
        tacticPreviews['A1'].cardsPlaced.length > 0 &&
        p >= 1 &&
        probAnyA1 > 0.45
      ) {
        const fromPrev = p >= 2 ? sectors[i].harvesters[p - 1] : 0;
        const stayAtQ = p === q ? sectors[i].harvesters[q] : 0;
        harvAfter =
          probAnyA1 * (fromPrev + stayAtQ) +
          (1 - probAnyA1) * sectors[i].harvesters[p];
      }
      row.push({
        expectedHarvesterCards: 0,
        expectedBulldozerCards: 0,
        certainHarvesterCards: 0,
        certainBulldozerCards: 0,
        harvestersPresentAfterStep2: harvAfter,
        bulldozerPresent: sectors[i].bulldozerPos === p && p >= 1,
        topContributingTacticSlot: 0,
      });
    }
    grid.push(row);
  }

  for (let pIdx = 0; pIdx < n; pIdx++) {
    const knownTactic = knownTacticsByPlayer[pIdx];
    if (knownTactic !== null) {
      const prev = tacticPreviews[knownTactic];
      const slot = brain.tacticsTrack.indexOf(knownTactic) + 1;
      if (prev.targetSector !== null && prev.cardsPlaced.length > 0) {
        for (const c of prev.cardsPlaced) {
          const cellEst = grid[prev.targetSector][c.cell];
          if (c.isHarvester) {
            cellEst.certainHarvesterCards += c.count;
            cellEst.expectedHarvesterCards += c.count;
            if (knownTactic === 'A3') {
              cellEst.harvestersPresentAfterStep2 += c.count;
            }
          } else {
            cellEst.certainBulldozerCards += c.count;
            cellEst.expectedBulldozerCards += c.count;
          }
          if (
            cellEst.topContributingTacticSlot === 0 ||
            slot < cellEst.topContributingTacticSlot
          ) {
            cellEst.topContributingTacticSlot = slot;
          }
        }
      } else if (
        prev.v2FallbackDeploySector !== null &&
        prev.v2FallbackDeploySector !== undefined
      ) {
        grid[prev.v2FallbackDeploySector][1].harvestersPresentAfterStep2 += 1;
      }
    } else {
      const dist = beliefsByOtherPlayer[pIdx];
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const prob = dist[sIdx];
        if (prob <= 0) continue;
        const tac = brain.tacticsTrack[sIdx];
        const prev = tacticPreviews[tac];
        if (prev.targetSector !== null && prev.cardsPlaced.length > 0) {
          for (const c of prev.cardsPlaced) {
            const cellEst = grid[prev.targetSector][c.cell];
            if (c.isHarvester) {
              cellEst.expectedHarvesterCards += prob * c.count;
              if (tac === 'A3') {
                cellEst.harvestersPresentAfterStep2 += prob * c.count;
              }
            } else {
              cellEst.expectedBulldozerCards += prob * c.count;
            }
            if (
              prob >= 0.15 &&
              (cellEst.topContributingTacticSlot === 0 ||
                sIdx + 1 < cellEst.topContributingTacticSlot)
            ) {
              cellEst.topContributingTacticSlot = sIdx + 1;
            }
          }
        } else if (
          prev.v2FallbackDeploySector !== null &&
          prev.v2FallbackDeploySector !== undefined
        ) {
          grid[prev.v2FallbackDeploySector][1].harvestersPresentAfterStep2 += prob;
        }
      }
    }
  }

  return grid;
}

/**
 * Calcule le gain marginal d'ajouter un Défenseur supplémentaire (passer de currentD à currentD + 1)
 * en tenant compte des 6 interrupteurs mécaniques V1 <-> V2.
 */
function evaluateMarginalUtility(
  profile: BotProfileId,
  sectorIdx: number,
  cellIdx: number,
  currentD: number,
  threat: CellThreatEstimate,
  sector: SectorState,
  brain: ForemanBrainState,
  params: GameParameters,
  turn: number
): number {
  const nextD = currentD + 1;
  const remainingTurns = Math.max(1, params.x - turn + 1);
  const trees = cellIdx >= 1 ? sector.standingTrees[cellIdx] : 0;
  const stumps = cellIdx >= 1 ? sector.stumps[cellIdx] : 0;

  const isUnitaryParry = params.ruleParryMode === 'V2_UNITARY_PER_CARD';
  const isCardRequiredForDestruction =
    params.rulePreventiveDestruction === 'V2_CARD_REQUIRED';
  const isOffensiveScrapExit = params.ruleScrapyardExit === 'V2_OFFENSIVE_D2';

  let utility = 0;

  // ==========================================================================
  // CAS A : LA CASSE (cellIdx === 0)
  // ==========================================================================
  if (cellIdx === 0) {
    if (sector.bulldozerPos === 0 && threat.expectedBulldozerCards > 0.02) {
      const totalSectorStumps = sumArray(sector.stumps, 1);
      const dangerMultiplier = 1 + 0.35 * totalSectorStumps;

      if (!isOffensiveScrapExit) {
        // V1_PASSIVE_D1 : D=1 pare intégralement toutes les cartes Réparation
        if (nextD === 1) {
          utility +=
            Math.min(1.4, threat.expectedBulldozerCards) * 9.5 * dangerMultiplier;
          if (threat.certainBulldozerCards > 0) utility += 4.0;
        }
      } else {
        // V2_OFFENSIVE_D2 :
        // - D=0 : sortie offensive (rejoint la 1re souche et la rase immédiatement !)
        // - D=1 : sortie dégradée en P1 (empêche le rasage immédiat de la souche !)
        // - D=2 (D >= m_B + 1) : bloque intégralement la réparation et maintient le Bulldozer en Casse !
        if (nextD === 1) {
          const immediateStumpSave = totalSectorStumps >= 1 ? 10.5 : 4.5;
          utility +=
            Math.min(1.3, threat.expectedBulldozerCards) *
            immediateStumpSave *
            (1 + 0.2 * totalSectorStumps);
          if (threat.certainBulldozerCards > 0) utility += 3.5;
        } else if (nextD === 2 && profile !== 'SELFISH') {
          utility +=
            Math.min(1.3, threat.expectedBulldozerCards) *
            8.5 *
            dangerMultiplier;
          if (threat.certainBulldozerCards > 0) utility += 3.0;
        } else if (
          nextD === 3 &&
          profile !== 'SELFISH' &&
          threat.expectedBulldozerCards >= 1.5
        ) {
          utility += (threat.expectedBulldozerCards - 1) * 7.5;
        }
      }
    }
    return Math.max(0, utility);
  }

  // ==========================================================================
  // CAS B : PARCELLE FORESTIÈRE (cellIdx >= 1)
  // ==========================================================================
  if (!isUnitaryParry) {
    // ------------------------------------------------------------------------
    // MODE V1 : PARADE ILLIMITÉE PAR CASE
    // ------------------------------------------------------------------------
    if (nextD === 1) {
      if (trees > 0 && threat.expectedHarvesterCards > 0) {
        const savedTrees = Math.min(trees, threat.expectedHarvesterCards);
        utility += savedTrees * 10.0;
        if (threat.certainHarvesterCards > 0) utility += 3.5;
      }
      if (stumps >= 2 && threat.expectedBulldozerCards > 0) {
        const savedStumps = Math.max(0, stumps - threat.expectedBulldozerCards);
        utility +=
          savedStumps * 8.5 * Math.min(1, threat.expectedBulldozerCards);
      }
    } else if (nextD === 2) {
      if (profile === 'SELFISH') {
        if (stumps >= 1 && threat.expectedBulldozerCards > 0) {
          utility += Math.min(stumps, threat.expectedBulldozerCards) * 6.0;
        }
        return utility * 0.35;
      }
      if (stumps >= 1 && threat.expectedBulldozerCards > 0) {
        const extraSavedStumps = Math.min(
          stumps,
          Math.ceil(threat.expectedBulldozerCards)
        );
        const regenBonus = stumps === 1 && params.nbRegeneration >= 1 ? 6.5 : 3.5;
        utility +=
          extraSavedStumps *
          (9.0 + regenBonus) *
          Math.min(1.2, threat.expectedBulldozerCards);
      }
      // Destruction des Abatteuses en D=2
      const canDestroyHarvester =
        !isCardRequiredForDestruction || threat.expectedHarvesterCards > 0.1;
      if (canDestroyHarvester && threat.harvestersPresentAfterStep2 > 0) {
        const treesRemainingInSector = sumArray(sector.standingTrees, cellIdx);
        const futureDamageValue =
          Math.min(treesRemainingInSector, remainingTurns * 0.75) * 3.8;
        const cardActivationProb = isCardRequiredForDestruction
          ? Math.min(1, threat.expectedHarvesterCards)
          : 1.0;
        utility +=
          threat.harvestersPresentAfterStep2 *
          (5.5 + futureDamageValue) *
          cardActivationProb;
      }
    } else if (nextD === 3) {
      if (profile === 'SELFISH') return 0.01;
      const canDestroyBulldozer =
        !isCardRequiredForDestruction || threat.expectedBulldozerCards > 0.1;
      if (canDestroyBulldozer && threat.bulldozerPresent) {
        const totalSectorStumps = sumArray(sector.stumps, 1);
        const futureThreat = Math.min(remainingTurns, totalSectorStumps + 2) * 3.2;
        const cardActivationProb = isCardRequiredForDestruction
          ? Math.min(1, threat.expectedBulldozerCards)
          : 1.0;
        utility += (6.5 + futureThreat) * cardActivationProb;
      }
    } else {
      return 0.001;
    }
  } else {
    // ------------------------------------------------------------------------
    // MODE V2 : PARADE UNITAIRE PAR CARTE (V2_UNITARY_PER_CARD)
    // ------------------------------------------------------------------------
    // 1. Ligne Abatteuses : le k-ième défenseur (nextD) pare la k-ième carte Abattage !
    if (trees > 0 && threat.expectedHarvesterCards > currentD) {
      const marginalCardProb = Math.min(
        1,
        Math.max(0, threat.expectedHarvesterCards - currentD)
      );
      if (trees > currentD || currentD === 0) {
        utility += marginalCardProb * 10.5;
        if (threat.certainHarvesterCards >= nextD) {
          utility += 3.8;
        }
      }
    }

    // Destruction des Abatteuses en V2 : requiert D >= m_A + 1 et D >= 2
    if (nextD >= 2 && profile !== 'SELFISH') {
      const canDestroyHarvester =
        !isCardRequiredForDestruction || threat.expectedHarvesterCards > 0.1;
      if (canDestroyHarvester && threat.harvestersPresentAfterStep2 > 0) {
        const estimatedCardsToClear = Math.max(
          1,
          Math.round(threat.expectedHarvesterCards)
        );
        const requiredDForDestruction = isCardRequiredForDestruction
          ? Math.max(2, estimatedCardsToClear + 1)
          : Math.max(2, Math.round(threat.expectedHarvesterCards) + 1);

        if (nextD === requiredDForDestruction) {
          const treesRemainingInSector = sumArray(sector.standingTrees, cellIdx);
          const futureDamageValue =
            Math.min(treesRemainingInSector, remainingTurns * 0.75) * 4.0;
          const activationFactor = isCardRequiredForDestruction
            ? Math.min(1, threat.expectedHarvesterCards)
            : 1.0;
          utility +=
            threat.harvestersPresentAfterStep2 *
            (6.0 + futureDamageValue) *
            activationFactor;
        }
      }
    }

    // 2. Ligne Bulldozer en V2 :
    // - Parer totalement m_B cartes requiert D >= m_B + 1
    // - Si 1 <= D <= m_B : terrassement dégradé (m_B - D + 1 souches retirées)
    // - Détruire le Bulldozer requiert D >= m_B + 2 (soit D=3 pour m_B=1)
    if (stumps > 0 && threat.expectedBulldozerCards > 0) {
      const estMB = Math.max(1, Math.round(threat.expectedBulldozerCards));
      const probB = Math.min(1, threat.expectedBulldozerCards);
      if (nextD === 1 && stumps >= 2) {
        // Passe de "toutes les souches rasées" à "estMB souches rasées"
        const savedStumps = Math.max(0, stumps - estMB);
        utility += savedStumps * 8.5 * probB;
      } else if (nextD >= 2 && nextD <= estMB + 1) {
        // Chaque défenseur supplémentaire jusqu'à m_B + 1 sauve 1 souche du terrassement dégradé !
        const regenBonus = stumps === 1 && params.nbRegeneration >= 1 ? 6.5 : 3.8;
        const mult = profile === 'SELFISH' ? 0.35 : 1.0;
        utility += (9.5 + regenBonus) * probB * mult;
      }
    }

    if (nextD >= 3 && profile !== 'SELFISH' && threat.bulldozerPresent) {
      const canDestroyBull =
        !isCardRequiredForDestruction || threat.expectedBulldozerCards > 0.1;
      const estMB = Math.max(1, Math.round(threat.expectedBulldozerCards));
      if (canDestroyBull && nextD === estMB + 2) {
        const totalSectorStumps = sumArray(sector.stumps, 1);
        const futureThreat = Math.min(remainingTurns, totalSectorStumps + 2) * 3.4;
        const activationFactor = isCardRequiredForDestruction
          ? Math.min(1, threat.expectedBulldozerCards)
          : 1.0;
        utility += (7.0 + futureThreat) * activationFactor;
      }
    }
  }

  // --- Bonus spécifique au Bot Stratège « Méta-Contremaître » (Niveau 3) ---
  if (profile === 'STRATEGIST' || profile === 'OMNISCIENT') {
    const slot = threat.topContributingTacticSlot;
    const parriesCard =
      (nextD === 1 && threat.expectedHarvesterCards > 0) ||
      (nextD >= 2 && threat.expectedBulldozerCards > 0);

    if (parriesCard && slot >= 1 && slot <= 3) {
      const learningWeight = (4 - slot) * 2.6 * (remainingTurns / params.x);
      utility += learningWeight;
    }

    const currentRank = getEyeRank(brain, sectorIdx);
    const sectorStumps = sumArray(sector.stumps, 1);
    const sectorTrees = sumArray(sector.standingTrees, 1);
    if (utility > 0 && currentRank > 1) {
      if (
        params.ruleBulldozerTargeting === 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE'
      ) {
        if (sectorStumps >= 2 && sector.bulldozerPos >= 1) {
          utility += 1.8;
        } else if (
          sectorTrees >= params.q * params.a - 1 &&
          sumArray(sector.harvesters, 1) >= 1
        ) {
          utility -= 1.1;
        }
      } else {
        // En V2, le Rang 1 attire TOUTES les égalités (A et B) :
        // Le Stratège évite de déclencher une Rancune mineure si son secteur est déjà fragile
        if (sectorStumps >= 2 || sectorTrees <= 4) {
          utility -= 0.9;
        }
      }
    }
  }

  return Math.max(0, utility);
}

function chooseBestStep1Cell(
  profile: BotProfileId,
  j: number,
  knownTactics: Array<TacticId | null>,
  priors: number[],
  tacticPreviews: Record<TacticId, TacticTargetPreview>,
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters,
  turn: number
): { chosenCell: number; isDilemma: boolean } {
  const q = params.q;
  const n = params.n;
  const initialBeliefs: number[][] = Array.from({ length: n }, () => [...priors]);
  const threatGrid = buildThreatGrid(
    knownTactics,
    initialBeliefs,
    tacticPreviews,
    sectors,
    brain,
    params
  );

  const utilities: Array<{ cell: number; util: number }> = [];
  for (let p = 0; p <= q; p++) {
    const u = evaluateMarginalUtility(
      profile === 'BLIND_PROB' ? 'COOPERATIVE' : profile,
      j,
      p,
      0,
      threatGrid[j][p],
      sectors[j],
      brain,
      params,
      turn
    );
    utilities.push({ cell: p, util: u });
  }

  utilities.sort((a, b) => b.util - a.util);
  const isDilemma =
    utilities.length >= 2 &&
    utilities[0].util > 1.0 &&
    utilities[1].util >= utilities[0].util * 0.85;

  if (utilities[0].util > 0.05) {
    return { chosenCell: utilities[0].cell, isDilemma };
  }

  let fallbackCell = 1;
  for (let p = q; p >= 1; p--) {
    if (sectors[j].harvesters[p] > 0 || sectors[j].bulldozerPos === p) {
      fallbackCell = p;
      break;
    }
  }
  return { chosenCell: fallbackCell, isDilemma: false };
}

/**
 * Exécute l'intégralité de la Phase 2 (Étape 1 + Inférence Bayésienne + Étape 2 en micro-cycles)
 */
export function runPhase2Mobilization(
  botProfiles: BotProfileId[],
  drawnTactics: TacticId[],
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters,
  turn: number,
  rng: SeededRNG
): Phase2DecisionOutput {
  const n = params.n;
  const q = params.q;
  const priors = getPriorProbabilities(params.modeTirageDes);

  const tacticPreviews: Record<TacticId, TacticTargetPreview> = {
    A1: computeTacticTarget('A1', sectors, brain, params),
    A2: computeTacticTarget('A2', sectors, brain, params),
    A3: computeTacticTarget('A3', sectors, brain, params),
    B1: computeTacticTarget('B1', sectors, brain, params),
    B2: computeTacticTarget('B2', sectors, brain, params),
    B3: computeTacticTarget('B3', sectors, brain, params),
  };

  let dilemmaEventsCount = 0;
  let totalDecisionsCount = 0;
  let cupRedirectionCount = 0;

  // ============================================================================
  // ÉTAPE 1 : Placement simultané du 1er Défenseur (sur sa propre piste j)
  // ============================================================================
  const step1Defenders: number[] = new Array(n).fill(0);
  const blindStep1Defenders: number[] = new Array(n).fill(0);
  const redirectedMain: boolean[] = new Array(n).fill(false);

  const allNullTactics: Array<TacticId | null> = new Array(n).fill(null);

  for (let j = 0; j < n; j++) {
    const profile = botProfiles[j];
    if (profile === 'RANDOM') {
      step1Defenders[j] = rng.nextInt(0, q);
      blindStep1Defenders[j] = step1Defenders[j];
      continue;
    }

    // Calcul du choix témoin "sans regarder le gobelet" (pour mesurer l'Axe D)
    const blindChoice = chooseBestStep1Cell(
      'BLIND_PROB',
      j,
      allNullTactics,
      priors,
      tacticPreviews,
      sectors,
      brain,
      params,
      turn
    );
    blindStep1Defenders[j] = blindChoice.chosenCell;

    if (profile === 'BLIND_PROB') {
      step1Defenders[j] = blindChoice.chosenCell;
      totalDecisionsCount++;
      if (blindChoice.isDilemma) dilemmaEventsCount++;
      continue;
    }

    const knownTactics: Array<TacticId | null> = new Array(n).fill(null);
    if (profile === 'OMNISCIENT') {
      for (let i = 0; i < n; i++) knownTactics[i] = drawnTactics[i];
    } else {
      knownTactics[j] = drawnTactics[j];
    }

    const actualChoice = chooseBestStep1Cell(
      profile,
      j,
      knownTactics,
      priors,
      tacticPreviews,
      sectors,
      brain,
      params,
      turn
    );
    step1Defenders[j] = actualChoice.chosenCell;
    totalDecisionsCount++;
    if (actualChoice.isDilemma) dilemmaEventsCount++;

    if (step1Defenders[j] !== blindStep1Defenders[j]) {
      redirectedMain[j] = true;
      cupRedirectionCount++;
    }
  }

  // ============================================================================
  // INFÉRENCE BAYÉSIENNE APRÈS RÉVÉLATION DE L'ÉTAPE 1
  // ============================================================================
  const updatedBeliefsPerPlayer: number[][] = Array.from({ length: n }, () => [
    ...priors,
  ]);
  for (let i = 0; i < n; i++) {
    const chosenCell = step1Defenders[i];
    const matchingSlots: number[] = [];
    for (let sIdx = 0; sIdx < 6; sIdx++) {
      const tac = brain.tacticsTrack[sIdx];
      const prev = tacticPreviews[tac];
      if (
        prev.targetSector === i &&
        prev.cardsPlaced.some((c) => c.cell === chosenCell)
      ) {
        matchingSlots.push(sIdx);
      }
    }
    if (matchingSlots.length > 0) {
      const posterior = [...priors];
      for (const sIdx of matchingSlots) {
        const likelihoodBoost = sIdx >= 2 ? 3.2 : 1.7;
        posterior[sIdx] *= likelihoodBoost;
      }
      const norm = posterior.reduce((acc, v) => acc + v, 0);
      if (norm > 0) {
        updatedBeliefsPerPlayer[i] = posterior.map((v) => v / norm);
      }
    }
  }

  // ============================================================================
  // ÉTAPE 2 : Le Soutien & la Coordination (Boucle de R_max micro-cycles)
  // ============================================================================
  const rMax = Math.max(1, params.rMaxCycles || 5);
  const microCycles: MicroCycleStepLog[] = [];

  const currentSupportSector: number[] = new Array(n).fill(0);
  const currentSupportCell: number[] = new Array(n).fill(0);
  const isLocked: boolean[] = new Array(n).fill(false);
  const lockCycle: number[] = new Array(n).fill(rMax);
  const redirectedSupport: boolean[] = new Array(n).fill(false);

  const cycle1DefendersGrid: number[][] = Array.from({ length: n }, () =>
    new Array(q + 1).fill(0)
  );

  const fastLockDecodedTactic: Array<TacticId | null> = new Array(n).fill(null);
  let overkillAvoidedInStep2 = 0;

  for (let cycle = 1; cycle <= rMax; cycle++) {
    const cycleLog: MicroCycleStepLog = {
      cycle,
      proposals: [],
    };

    const nextSector = [...currentSupportSector];
    const nextCell = [...currentSupportCell];
    const nextLocked = [...isLocked];
    const reasons: string[] = new Array(n).fill('');

    for (let j = 0; j < n; j++) {
      if (isLocked[j]) {
        reasons[j] = 'Déjà verrouillé sur Définitif';
        continue;
      }

      const profile = botProfiles[j];
      const evalProfile: BotProfileId =
        profile === 'BLIND_PROB' ? 'COOPERATIVE' : profile;

      if (profile === 'RANDOM') {
        const alliedSectors = [];
        for (let i = 0; i < n; i++) if (i !== j) alliedSectors.push(i);
        nextSector[j] = alliedSectors[rng.nextInt(0, alliedSectors.length - 1)];
        nextCell[j] = rng.nextInt(0, q);
        nextLocked[j] = true;
        lockCycle[j] = cycle;
        reasons[j] = 'Placement aléatoire uniforme';
        continue;
      }

      const knownTactics: Array<TacticId | null> = new Array(n).fill(null);
      if (profile === 'OMNISCIENT') {
        for (let i = 0; i < n; i++) knownTactics[i] = drawnTactics[i];
      } else if (profile !== 'BLIND_PROB') {
        knownTactics[j] = drawnTactics[j];
        if (profile === 'COOPERATIVE' || profile === 'STRATEGIST') {
          for (let i = 0; i < n; i++) {
            if (i !== j && fastLockDecodedTactic[i] !== null) {
              knownTactics[i] = fastLockDecodedTactic[i];
            }
          }
        }
      }

      const beliefs =
        profile === 'SELFISH' || profile === 'BLIND_PROB'
          ? Array.from({ length: n }, () => [...priors])
          : updatedBeliefsPerPlayer;

      const threatGrid = buildThreatGrid(
        knownTactics,
        beliefs,
        tacticPreviews,
        sectors,
        brain,
        params
      );

      // Au cycle 1, calculer aussi ce que le bot aurait choisi sans regarder son gobelet
      let blindBestSector = -1;
      let blindBestCell = -1;
      if (cycle === 1 && profile !== 'BLIND_PROB') {
        const blindGrid = buildThreatGrid(
          allNullTactics,
          Array.from({ length: n }, () => [...priors]),
          tacticPreviews,
          sectors,
          brain,
          params
        );
        let bestU = -1;
        for (let sec = 0; sec < n; sec++) {
          if (sec === j) continue;
          for (let cell = 0; cell <= q; cell++) {
            const baseD = step1Defenders[sec] === cell ? 1 : 0;
            const u = evaluateMarginalUtility(
              evalProfile,
              sec,
              cell,
              baseD,
              blindGrid[sec][cell],
              sectors[sec],
              brain,
              params,
              turn
            );
            if (u > bestU) {
              bestU = u;
              blindBestSector = sec;
              blindBestCell = cell;
            }
          }
        }
      }

      // Signal Fast Lock au cycle 1 (uniquement si le bot connaît son dé et qu'il cible un allié)
      const myTacticPreview = tacticPreviews[drawnTactics[j]];
      if (
        cycle === 1 &&
        (profile === 'COOPERATIVE' || profile === 'STRATEGIST') &&
        myTacticPreview.targetSector !== null &&
        myTacticPreview.targetSector !== j &&
        myTacticPreview.cardsPlaced.length > 0
      ) {
        const targetSec = myTacticPreview.targetSector;
        let bestCell = myTacticPreview.cardsPlaced[0].cell;
        let bestScore = -1;
        for (const c of myTacticPreview.cardsPlaced) {
          const baseD = step1Defenders[targetSec] === c.cell ? 1 : 0;
          const u = evaluateMarginalUtility(
            evalProfile,
            targetSec,
            c.cell,
            baseD,
            threatGrid[targetSec][c.cell],
            sectors[targetSec],
            brain,
            params,
            turn
          );
          if (u > bestScore) {
            bestScore = u;
            bestCell = c.cell;
          }
        }
        nextSector[j] = targetSec;
        nextCell[j] = bestCell;
        nextLocked[j] = true;
        lockCycle[j] = 1;
        reasons[j] = `Signal Fast Lock (r=1) : certitude sur ${drawnTactics[j]} ciblant Secteur ${targetSec + 1}`;
        if (targetSec !== blindBestSector || bestCell !== blindBestCell) {
          redirectedSupport[j] = true;
          cupRedirectionCount++;
        }
        continue;
      }

      const countOtherDefenders = (sec: number, cell: number): number => {
        let d = step1Defenders[sec] === cell ? 1 : 0;
        if (cycle >= 2 && profile !== 'SELFISH') {
          for (let other = 0; other < n; other++) {
            if (other === j) continue;
            if (
              currentSupportSector[other] === sec &&
              currentSupportCell[other] === cell
            ) {
              if (isLocked[other] || other < j) {
                d += 1;
              }
            }
          }
        }
        return d;
      };

      const candidates: Array<{ sector: number; cell: number; util: number }> = [];
      for (let sec = 0; sec < n; sec++) {
        if (sec === j) continue;
        for (let cell = 0; cell <= q; cell++) {
          const dBefore = countOtherDefenders(sec, cell);
          const u = evaluateMarginalUtility(
            evalProfile,
            sec,
            cell,
            dBefore,
            threatGrid[sec][cell],
            sectors[sec],
            brain,
            params,
            turn
          );
          candidates.push({ sector: sec, cell, util: u });
        }
      }

      candidates.sort((a, b) => b.util - a.util);
      totalDecisionsCount++;
      if (
        candidates.length >= 2 &&
        candidates[0].util > 1.0 &&
        candidates[1].util >= candidates[0].util * 0.85
      ) {
        dilemmaEventsCount++;
      }

      const best = candidates[0];
      if (
        cycle >= 2 &&
        (best.sector !== currentSupportSector[j] ||
          best.cell !== currentSupportCell[j])
      ) {
        overkillAvoidedInStep2++;
      }

      nextSector[j] = best.sector;
      nextCell[j] = best.cell;

      if (
        cycle === 1 &&
        profile !== 'BLIND_PROB' &&
        (best.sector !== blindBestSector || best.cell !== blindBestCell)
      ) {
        redirectedSupport[j] = true;
        cupRedirectionCount++;
      }

      if (profile === 'SELFISH') {
        nextLocked[j] = true;
        lockCycle[j] = cycle;
        reasons[j] = 'Verrouillage immédiat sans concertation (Égoïste N1)';
      } else if (cycle === rMax) {
        nextLocked[j] = true;
        lockCycle[j] = cycle;
        reasons[j] = 'Verrouillage final (fin des micro-cycles)';
      } else if (
        cycle >= 2 &&
        best.sector === currentSupportSector[j] &&
        best.cell === currentSupportCell[j]
      ) {
        nextLocked[j] = true;
        lockCycle[j] = cycle;
        reasons[j] = 'Convergence atteinte avec les propositions alliées';
      } else {
        nextLocked[j] = false;
        reasons[j] =
          cycle === 1
            ? 'Proposition En réflexion (attente des signaux alliés / appel au soutien)'
            : 'Réallocation vers une seconde menace pour éviter le sur-investissement';
      }
    }

    for (let j = 0; j < n; j++) {
      currentSupportSector[j] = nextSector[j];
      currentSupportCell[j] = nextCell[j];
      isLocked[j] = nextLocked[j];

      cycleLog.proposals.push({
        playerIndex: j,
        targetSector: currentSupportSector[j],
        targetCell: currentSupportCell[j],
        status: isLocked[j] ? 'LOCKED' : 'THINKING',
        reason: reasons[j],
      });

      if (
        cycle === 1 &&
        isLocked[j] &&
        (botProfiles[j] === 'COOPERATIVE' || botProfiles[j] === 'STRATEGIST')
      ) {
        for (let sIdx = 0; sIdx < 6; sIdx++) {
          const tac = brain.tacticsTrack[sIdx];
          const prev = tacticPreviews[tac];
          if (
            prev.targetSector === currentSupportSector[j] &&
            prev.cardsPlaced.some((c) => c.cell === currentSupportCell[j])
          ) {
            fastLockDecodedTactic[j] = tac;
            break;
          }
        }
      }
    }

    if (cycle === 1) {
      for (let j = 0; j < n; j++) {
        cycle1DefendersGrid[j][step1Defenders[j]] += 1;
        cycle1DefendersGrid[currentSupportSector[j]][currentSupportCell[j]] += 1;
      }
    }

    microCycles.push(cycleLog);

    if (isLocked.every((locked) => locked)) {
      break;
    }
  }

  const defendersGrid: number[][] = Array.from({ length: n }, () =>
    new Array(q + 1).fill(0)
  );
  const finalDefenders: DefenderTokenPlacement[] = [];

  for (let j = 0; j < n; j++) {
    defendersGrid[j][step1Defenders[j]] += 1;
    defendersGrid[currentSupportSector[j]][currentSupportCell[j]] += 1;
    finalDefenders.push({
      playerIndex: j,
      mainCell: step1Defenders[j],
      supportSector: currentSupportSector[j],
      supportCell: currentSupportCell[j],
      lockCycle: lockCycle[j],
      redirectedByCupMain: redirectedMain[j],
      redirectedByCupSupport: redirectedSupport[j],
    });
  }

  return {
    step1Defenders,
    microCycles,
    finalDefenders,
    defendersGrid,
    cycle1DefendersGrid,
    dilemmaEventsCount,
    totalDecisionsCount,
    overkillAvoidedInStep2,
    cupRedirectionCount,
  };
}

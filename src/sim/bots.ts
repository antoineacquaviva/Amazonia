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
  topContributingTacticSlot: number; // 1..6 (0 si aucune)
}

export interface Phase2DecisionOutput {
  step1Defenders: number[];
  microCycles: MicroCycleStepLog[];
  finalDefenders: DefenderTokenPlacement[];
  defendersGrid: number[][]; // [sector][cell] -> D_{i,p}
  dilemmaEventsCount: number;
  totalDecisionsCount: number;
  overkillAvoidedInStep2: number;
}

/**
 * Calcule pour un bot j la grille des menaces attendues sur chaque emplacement (i, p)
 * en fonction des cartes connues avec certitude et des distributions de croyances sur les autres joueurs.
 */
function buildThreatGrid(
  botIndex: number,
  knownTacticsByPlayer: Array<TacticId | null>,
  beliefsByOtherPlayer: number[][], // [playerIndex][slotIndex 0..5]
  tacticPreviews: Record<TacticId, TacticTargetPreview>,
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters
): CellThreatEstimate[][] {
  const n = params.n;
  const q = params.q;

  // Probabilité qu'au moins un joueur ait tiré A1 (pour estimer l'avancée des Abatteuses à l'Étape 2)
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
      if (i === a1TargetSector && p >= 1 && probAnyA1 > 0.45) {
        // Si A1 est probable sur ce secteur, les abatteuses glissent de p-1 vers p
        const fromPrev = p >= 2 ? sectors[i].harvesters[p - 1] : 0;
        const stayAtQ = p === q ? sectors[i].harvesters[q] : 0;
        harvAfter =
          probAnyA1 * (fromPrev + stayAtQ) + (1 - probAnyA1) * sectors[i].harvesters[p];
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
      if (prev.targetSector !== null) {
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
          if (cellEst.topContributingTacticSlot === 0 || slot < cellEst.topContributingTacticSlot) {
            cellEst.topContributingTacticSlot = slot;
          }
        }
      }
    } else {
      const dist = beliefsByOtherPlayer[pIdx];
      for (let sIdx = 0; sIdx < 6; sIdx++) {
        const prob = dist[sIdx];
        if (prob <= 0) continue;
        const tac = brain.tacticsTrack[sIdx];
        const prev = tacticPreviews[tac];
        if (prev.targetSector !== null) {
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
              (cellEst.topContributingTacticSlot === 0 || sIdx + 1 < cellEst.topContributingTacticSlot)
            ) {
              cellEst.topContributingTacticSlot = sIdx + 1;
            }
          }
        }
      }
    }
  }

  return grid;
}

/**
 * Calcule le gain marginal d'ajouter un Défenseur supplémentaire (passer de currentD à currentD + 1)
 * sur l'emplacement (sectorIdx, cellIdx) selon le profil du Bot.
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

  let utility = 0;

  // --- Passage de D=0 à D=1 (Parade simple / Terrassement dégradé) ---
  if (nextD === 1) {
    if (cellIdx >= 1) {
      // Parer les cartes Abattage sauve min(trees, expectedHarvesterCards) arbres
      if (trees > 0 && threat.expectedHarvesterCards > 0) {
        const savedTrees = Math.min(trees, threat.expectedHarvesterCards);
        // Une souche a encore une chance de régénérer en fin de partie, mais un arbre coupé perd sa sécurité
        utility += savedTrees * 10.0;
        if (threat.certainHarvesterCards > 0) {
          utility += 3.5; // Prime de certitude
        }
      }
      // Face au Bulldozer sur une Parcelle : D=1 réduit le terrassement à 1 souche par carte au lieu de toutes
      if (stumps >= 2 && threat.expectedBulldozerCards > 0) {
        const savedStumps = Math.max(0, stumps - threat.expectedBulldozerCards);
        utility += savedStumps * 8.5 * Math.min(1, threat.expectedBulldozerCards);
      }
    } else {
      // Casse (cellIdx === 0) : D=1 pare intégralement la Réparation du Bulldozer !
      if (sector.bulldozerPos === 0 && threat.expectedBulldozerCards > 0) {
        const totalSectorStumps = sumArray(sector.stumps, 1);
        const dangerMultiplier = 1 + 0.35 * totalSectorStumps;
        utility += Math.min(1.3, threat.expectedBulldozerCards) * 9.5 * dangerMultiplier;
        if (threat.certainBulldozerCards > 0) {
          utility += 4.0;
        }
      }
    }
  }

  // --- Passage de D=1 à D=2 (Embuscade : destruction des Abatteuses + Parade totale Bulldozer) ---
  if (nextD === 2) {
    if (profile === 'SELFISH') {
      // Le bot Égoïste / Myope sous-évalue fortement la destruction coordonnée et ne cherche que la parade immédiate
      if (cellIdx >= 1 && stumps >= 1 && threat.expectedBulldozerCards > 0) {
        utility += Math.min(stumps, threat.expectedBulldozerCards) * 6.0;
      }
      return utility * 0.35;
    }

    if (cellIdx >= 1) {
      // 1. Parade complète du Bulldozer (sauve la souche qui aurait été détruite par le terrassement dégradé en D=1)
      if (stumps >= 1 && threat.expectedBulldozerCards > 0) {
        const extraSavedStumps = Math.min(stumps, Math.ceil(threat.expectedBulldozerCards));
        // Très critique si c'est la dernière souche de la parcelle (perte de la régénération finale !)
        const regenBonus = stumps === 1 && params.nbRegeneration >= 1 ? 6.5 : 3.5;
        utility += extraSavedStumps * (9.0 + regenBonus) * Math.min(1.2, threat.expectedBulldozerCards);
      }
      // 2. Destruction de toutes les Abatteuses présentes sur la Parcelle (même sans carte Manœuvre !)
      if (threat.harvestersPresentAfterStep2 > 0) {
        // Détruire une abatteuse évite des coupes futures sur les tours restants
        const treesRemainingInSector = sumArray(sector.standingTrees, cellIdx);
        const futureDamageValue =
          Math.min(treesRemainingInSector, remainingTurns * 0.75) * 3.8;
        utility += threat.harvestersPresentAfterStep2 * (5.5 + futureDamageValue);
      }
    }
  }

  // --- Passage de D=2 à D=3 (Assaut massif : destruction du Bulldozer) ---
  if (nextD === 3) {
    if (profile === 'SELFISH') {
      return 0.01;
    }
    if (cellIdx >= 1 && threat.bulldozerPresent) {
      const totalSectorStumps = sumArray(sector.stumps, 1);
      const futureThreat = Math.min(remainingTurns, totalSectorStumps + 2) * 3.2;
      utility += 6.5 + futureThreat;
    }
  }

  // Au-delà de D=3, l'utilité marginale est quasi nulle (gaspillage / overkill)
  if (nextD >= 4) {
    return 0.001;
  }

  // --- Bonus spécifique au Bot Stratège « Méta-Contremaître » (Niveau 3) ---
  if (profile === 'STRATEGIST' || profile === 'OMNISCIENT') {
    // 1. Contrôle de l'Apprentissage : faire échouer une tactique située en Case 1 ou Case 2
    // la fait reculer vers la droite (où sa probabilité de tirage baisse drastiquement en min(2d6))
    const slot = threat.topContributingTacticSlot;
    const parriesCard =
      (nextD === 1 && (threat.expectedHarvesterCards > 0 || (cellIdx === 0 && threat.expectedBulldozerCards > 0))) ||
      (nextD === 2 && cellIdx >= 1 && threat.expectedBulldozerCards > 0);

    if (parriesCard && slot >= 1 && slot <= 3) {
      const learningWeight = (4 - slot) * 2.4 * (remainingTurns / params.x);
      utility += learningWeight;
    }

    // 2. Gestion de la Rancune sur l'Œil du Contremaître :
    // Si ce secteur a beaucoup de souches et un Bulldozer actif, monter vers le Rang 1 l'expose MOINS
    // aux égalités Bulldozer (qui ciblent le Rang n) ! Inversement, s'il craint les Abatteuses (Rang 1),
    // déclencher une Rancune pour rien sur une menace mineure est pénalisé.
    const currentRank = getEyeRank(brain, sectorIdx);
    const sectorStumps = sumArray(sector.stumps, 1);
    const sectorTrees = sumArray(sector.standingTrees, 1);
    if (utility > 0 && currentRank > 1) {
      if (sectorStumps >= 2 && sector.bulldozerPos >= 1) {
        // Avancer vers le Rang 1 protège des égalités Bulldozer (qui frappent le Rang n)
        utility += 1.8;
      } else if (sectorTrees >= params.q * params.a - 1 && sumArray(sector.harvesters, 1) >= 1) {
        // Éviter d'attirer l'Œil en Rang 1 si on est la cible idéale de A1
        utility -= 1.1;
      }
    }
  }

  return Math.max(0, utility);
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

  // Pré-calcul déterministe de la cible de chacune des 6 tactiques sur l'image figée
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

  // ============================================================================
  // ÉTAPE 1 : Placement simultané du 1er Défenseur (sur sa propre piste j)
  // ============================================================================
  const step1Defenders: number[] = new Array(n).fill(0);

  for (let j = 0; j < n; j++) {
    const profile = botProfiles[j];
    if (profile === 'RANDOM') {
      step1Defenders[j] = rng.nextInt(0, q);
      continue;
    }

    const knownTactics: Array<TacticId | null> = new Array(n).fill(null);
    if (profile === 'OMNISCIENT') {
      for (let i = 0; i < n; i++) knownTactics[i] = drawnTactics[i];
    } else {
      knownTactics[j] = drawnTactics[j];
    }

    const initialBeliefs: number[][] = Array.from({ length: n }, () => [...priors]);
    const threatGrid = buildThreatGrid(
      j,
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
        profile,
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
    totalDecisionsCount++;
    if (
      utilities.length >= 2 &&
      utilities[0].util > 1.0 &&
      utilities[1].util >= utilities[0].util * 0.85
    ) {
      dilemmaEventsCount++;
    }

    if (utilities[0].util > 0.05) {
      step1Defenders[j] = utilities[0].cell;
    } else {
      // S'il n'y a aucune menace directe de carte, chercher une abatteuse ou un bulldozer sur sa piste
      let fallbackCell = 1;
      for (let p = q; p >= 1; p--) {
        if (sectors[j].harvesters[p] > 0 || sectors[j].bulldozerPos === p) {
          fallbackCell = p;
          break;
        }
      }
      step1Defenders[j] = fallbackCell;
    }
  }

  // ============================================================================
  // INFÉRENCE BAYÉSIENNE APRÈS RÉVÉLATION DE L'ÉTAPE 1
  // ============================================================================
  // Chaque bot Coopératif / Stratège met à jour ses croyances sur le dé tiré par chaque allié i
  // en observant où i a posé son 1er Défenseur c_{i,1}.
  const updatedBeliefsPerPlayer: number[][] = Array.from({ length: n }, () => [...priors]);
  for (let i = 0; i < n; i++) {
    const chosenCell = step1Defenders[i];
    // Quelles tactiques ciblent exactement (i, chosenCell) ?
    const matchingSlots: number[] = [];
    for (let sIdx = 0; sIdx < 6; sIdx++) {
      const tac = brain.tacticsTrack[sIdx];
      const prev = tacticPreviews[tac];
      if (prev.targetSector === i && prev.cardsPlaced.some((c) => c.cell === chosenCell)) {
        matchingSlots.push(sIdx);
      }
    }
    // Si le joueur i a défendu une case menacée par une tactique de probabilité plus faible (ex. cases 3..6),
    // il est très probable qu'il l'ait lui-même tirée sous son gobelet !
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

  // Suivi des signaux Fast Lock (Cycle 1) décodés par les alliés
  const fastLockDecodedTactic: Array<TacticId | null> = new Array(n).fill(null);
  let overkillAvoidedInStep2 = 0;

  for (let cycle = 1; cycle <= rMax; cycle++) {
    const cycleLog: MicroCycleStepLog = {
      cycle,
      proposals: [],
    };

    // Tableau temporaire des nouveaux choix pour ce micro-cycle synchrone
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

      // 1. Cas Bot Aléatoire (Baseline)
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

      // 2. Construction de l'état de connaissance du bot j au début du cycle
      const knownTactics: Array<TacticId | null> = new Array(n).fill(null);
      if (profile === 'OMNISCIENT') {
        for (let i = 0; i < n; i++) knownTactics[i] = drawnTactics[i];
      } else {
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
        profile === 'SELFISH'
          ? Array.from({ length: n }, () => [...priors])
          : updatedBeliefsPerPlayer;

      const threatGrid = buildThreatGrid(
        j,
        knownTactics,
        beliefs,
        tacticPreviews,
        sectors,
        brain,
        params
      );

      // Convention de signalisation Cycle 1 (Fast Lock) pour Coopératif / Stratège :
      // Si la tactique tirée par j cible une piste alliée i* != j, j verrouille immédiatement en r=1 !
      const myTacticPreview = tacticPreviews[drawnTactics[j]];
      if (
        cycle === 1 &&
        (profile === 'COOPERATIVE' || profile === 'STRATEGIST') &&
        myTacticPreview.targetSector !== null &&
        myTacticPreview.targetSector !== j &&
        myTacticPreview.cardsPlaced.length > 0
      ) {
        const targetSec = myTacticPreview.targetSector;
        // Choisir la parcelle ayant le plus d'impact parmi celles ciblées par sa propre tactique
        let bestCell = myTacticPreview.cardsPlaced[0].cell;
        let bestScore = -1;
        for (const c of myTacticPreview.cardsPlaced) {
          const baseD = step1Defenders[targetSec] === c.cell ? 1 : 0;
          const u = evaluateMarginalUtility(
            profile,
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
        continue;
      }

      // Calcul du nombre de défenseurs actuellement positionnés sur chaque case alliée
      // Au cycle 1, seuls les 1ers Défenseurs sont connus.
      // Aux cycles >= 2, on observe les jetons (En réflexion et Définitif) des autres joueurs.
      const countOtherDefenders = (sec: number, cell: number): number => {
        let d = step1Defenders[sec] === cell ? 1 : 0;
        if (cycle >= 2 && profile !== 'SELFISH') {
          for (let other = 0; other < n; other++) {
            if (other === j) continue;
            if (currentSupportSector[other] === sec && currentSupportCell[other] === cell) {
              // Pour éviter que 2 bots en réflexion ne se désengagent exactement en même temps,
              // le bot d'indice supérieur considère le jeton de l'indice inférieur comme prioritaire
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
        if (sec === j) continue; // Interdit de poser le 2e Défenseur sur sa propre piste
        for (let cell = 0; cell <= q; cell++) {
          const dBefore = countOtherDefenders(sec, cell);
          const u = evaluateMarginalUtility(
            profile,
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
        (best.sector !== currentSupportSector[j] || best.cell !== currentSupportCell[j])
      ) {
        overkillAvoidedInStep2++;
      }

      nextSector[j] = best.sector;
      nextCell[j] = best.cell;

      if (profile === 'SELFISH') {
        // Le bot Égoïste verrouille dès le cycle 1 sans négocier
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
        // Sa proposition est stable après observation des alliés -> il verrouille
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

    // Appliquer les mouvements du cycle et enregistrer le journal
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

      // Décodage du signal Fast Lock à la fin du cycle 1
      if (cycle === 1 && isLocked[j] && (botProfiles[j] === 'COOPERATIVE' || botProfiles[j] === 'STRATEGIST')) {
        // Chercher quelle tactique sur la piste cible exactement (currentSupportSector[j], currentSupportCell[j])
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

    microCycles.push(cycleLog);

    if (isLocked.every((locked) => locked)) {
      break;
    }
  }

  // Construction de la grille finale D_{i,p} et des placements finaux
  const defendersGrid: number[][] = Array.from({ length: n }, () => new Array(q + 1).fill(0));
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
    });
  }

  return {
    step1Defenders,
    microCycles,
    finalDefenders,
    defendersGrid,
    dilemmaEventsCount,
    totalDecisionsCount,
    overkillAvoidedInStep2,
  };
}

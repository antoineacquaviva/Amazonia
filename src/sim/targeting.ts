import { ForemanBrainState, GameParameters, SectorState, TacticId } from './types';

export interface TacticTargetPreview {
  tactic: TacticId;
  targetSector: number | null;
  cardsPlaced: Array<{ cell: number; count: number; isHarvester: boolean }>;
  noTargetReason?: string;
  v2FallbackDeploySector?: number | null; // En mode V2_FALLBACK_DEPLOY_AND_RETREAT si A1/A2 est sans cible
}

export function getEyeRank(brain: ForemanBrainState, sectorIndex: number): number {
  const idx = brain.eyeTrack.indexOf(sectorIndex);
  return idx === -1 ? 999 : idx + 1;
}

export function sumArray(arr: number[], startIdx = 1): number {
  let s = 0;
  for (let i = startIdx; i < arr.length; i++) {
    s += arr[i];
  }
  return s;
}

function findMostWoodedSectorRank1Tie(
  sectors: SectorState[],
  brain: ForemanBrainState
): number | null {
  const withTrees = sectors.filter((s) => sumArray(s.standingTrees, 1) >= 1);
  const pool = withTrees.length > 0 ? withTrees : [...sectors];
  if (pool.length === 0) return null;
  pool.sort((a, b) => {
    const tA = sumArray(a.standingTrees, 1);
    const tB = sumArray(b.standingTrees, 1);
    if (tB !== tA) return tB - tA;
    return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex);
  });
  return pool[0].sectorIndex;
}

/**
 * Calcule avec exactitude la piste et les emplacements ciblés par une tactique donnée
 * sur l'image figée actuelle du plateau (Phase 3 - Étape 1), en tenant compte de
 * `ruleBulldozerTargeting` et `ruleNoTargetH1`.
 */
export function computeTacticTarget(
  tactic: TacticId,
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters
): TacticTargetPreview {
  const q = params.q;
  const unifiedBulldozerTie =
    params.ruleBulldozerTargeting === 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE';

  const compareBulldozerTie = (a: SectorState, b: SectorState): number => {
    if (unifiedBulldozerTie) {
      // V2 : égalités départagées vers le Rang 1 (minimiser getEyeRank)
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex);
    }
    // V1 : égalités départagées vers le Rang n (maximiser getEyeRank)
    return getEyeRank(brain, b.sectorIndex) - getEyeRank(brain, a.sectorIndex);
  };

  if (tactic === 'A1') {
    const eligible = sectors.filter((s) => sumArray(s.harvesters, 1) >= 1);
    if (eligible.length === 0) {
      const fbSec =
        params.ruleNoTargetH1 === 'V2_FALLBACK_DEPLOY_AND_RETREAT'
          ? findMostWoodedSectorRank1Tie(sectors, brain)
          : null;
      return {
        tactic,
        targetSector: null,
        cardsPlaced: [],
        noTargetReason: 'Aucune Abatteuse en jeu sur le plateau (H1)',
        v2FallbackDeploySector: fbSec,
      };
    }
    eligible.sort((a, b) => {
      const treesA = sumArray(a.standingTrees, 1);
      const treesB = sumArray(b.standingTrees, 1);
      if (treesB !== treesA) return treesB - treesA;
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex);
    });
    const chosen = eligible[0];
    const cardsPlaced: Array<{ cell: number; count: number; isHarvester: boolean }> = [];
    for (let p = 1; p <= q - 1; p++) {
      const hCount = chosen.harvesters[p];
      if (hCount > 0) {
        cardsPlaced.push({ cell: p + 1, count: hCount, isHarvester: true });
      }
    }
    const fbSec =
      cardsPlaced.length === 0 &&
      params.ruleNoTargetH1 === 'V2_FALLBACK_DEPLOY_AND_RETREAT'
        ? findMostWoodedSectorRank1Tie(sectors, brain)
        : null;
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced,
      noTargetReason:
        cardsPlaced.length === 0
          ? 'Abatteuse(s) déjà en dernière Parcelle q : impossible d’avancer (H1)'
          : undefined,
      v2FallbackDeploySector: fbSec,
    };
  }

  if (tactic === 'A2') {
    const eligible = sectors.filter((s) => sumArray(s.harvesters, 1) >= 1);
    if (eligible.length === 0) {
      const fbSec =
        params.ruleNoTargetH1 === 'V2_FALLBACK_DEPLOY_AND_RETREAT'
          ? findMostWoodedSectorRank1Tie(sectors, brain)
          : null;
      return {
        tactic,
        targetSector: null,
        cardsPlaced: [],
        noTargetReason: 'Aucune Abatteuse en jeu sur le plateau (H1)',
        v2FallbackDeploySector: fbSec,
      };
    }
    const maxHarvesterPos = (s: SectorState): number => {
      for (let p = q; p >= 1; p--) {
        if (s.harvesters[p] >= 1) return p;
      }
      return 0;
    };
    eligible.sort((a, b) => {
      const posA = maxHarvesterPos(a);
      const posB = maxHarvesterPos(b);
      if (posB !== posA) return posB - posA;
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex);
    });
    const chosen = eligible[0];
    const cardsPlaced: Array<{ cell: number; count: number; isHarvester: boolean }> = [];
    for (let p = 1; p <= q; p++) {
      const hCount = chosen.harvesters[p];
      if (hCount > 0) {
        cardsPlaced.push({ cell: p, count: hCount, isHarvester: true });
      }
    }
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced,
    };
  }

  if (tactic === 'A3') {
    const eligible = sectors.filter((s) => sumArray(s.standingTrees, 1) >= 1);
    if (eligible.length === 0) {
      return {
        tactic,
        targetSector: null,
        cardsPlaced: [],
        noTargetReason: 'Aucun Arbre debout sur le plateau (H1)',
      };
    }
    eligible.sort((a, b) => {
      const hA = sumArray(a.harvesters, 1);
      const hB = sumArray(b.harvesters, 1);
      if (hA !== hB) return hA - hB;
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex);
    });
    const chosen = eligible[0];
    let firstTreeCell = 1;
    for (let p = 1; p <= q; p++) {
      if (chosen.standingTrees[p] >= 1) {
        firstTreeCell = p;
        break;
      }
    }
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced: [{ cell: firstTreeCell, count: 1, isHarvester: true }],
    };
  }

  if (tactic === 'B1') {
    const candidates = [...sectors];
    candidates.sort((a, b) => {
      const stumpsA = sumArray(a.stumps, 1);
      const stumpsB = sumArray(b.stumps, 1);
      if (stumpsB !== stumpsA) return stumpsB - stumpsA;
      return compareBulldozerTie(a, b);
    });
    const chosen = candidates[0];
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
    };
  }

  if (tactic === 'B2') {
    const candidates = [...sectors];
    candidates.sort((a, b) => {
      if (a.bulldozerPos !== b.bulldozerPos)
        return a.bulldozerPos - b.bulldozerPos;
      return compareBulldozerTie(a, b);
    });
    const chosen = candidates[0];
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
    };
  }

  // B3 : Terrain dégagé
  if (params.ruleBulldozerTargeting === 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE') {
    // V2 : priorité aux Bulldozers actifs en forêt (posB >= 1)
    const activeInForest = sectors.filter((s) => s.bulldozerPos >= 1);
    if (activeInForest.length > 0) {
      activeInForest.sort((a, b) => {
        const tA = a.standingTrees[a.bulldozerPos];
        const tB = b.standingTrees[b.bulldozerPos];
        if (tA !== tB) return tA - tB;
        return compareBulldozerTie(a, b);
      });
      const chosen = activeInForest[0];
      return {
        tactic,
        targetSector: chosen.sectorIndex,
        cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
      };
    }
    // Si tous les Bulldozers sont à la Casse (posB == 0), sélectionner la piste ayant le moins d'Arbres debout en Parcelle 1
    const allInScrap = [...sectors];
    allInScrap.sort((a, b) => {
      const tA1 = a.standingTrees[1] || 0;
      const tB1 = b.standingTrees[1] || 0;
      if (tA1 !== tB1) return tA1 - tB1;
      return compareBulldozerTie(a, b);
    });
    const chosen = allInScrap[0];
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
    };
  }

  // V1 : B3 inclut la Casse (0 arbre debout)
  const candidates = [...sectors];
  candidates.sort((a, b) => {
    const treesAtPosA =
      a.bulldozerPos === 0 ? 0 : a.standingTrees[a.bulldozerPos];
    const treesAtPosB =
      b.bulldozerPos === 0 ? 0 : b.standingTrees[b.bulldozerPos];
    if (treesAtPosA !== treesAtPosB) return treesAtPosA - treesAtPosB;
    return compareBulldozerTie(a, b);
  });
  const chosen = candidates[0];
  return {
    tactic,
    targetSector: chosen.sectorIndex,
    cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
  };
}

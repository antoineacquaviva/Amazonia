import { ForemanBrainState, GameParameters, SectorState, TacticId } from './types';

export interface TacticTargetPreview {
  tactic: TacticId;
  targetSector: number | null;
  cardsPlaced: Array<{ cell: number; count: number; isHarvester: boolean }>;
  noTargetReason?: string;
}

export function getEyeRank(brain: ForemanBrainState, sectorIndex: number): number {
  // Retourne 1..n (index + 1)
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

/**
 * Calcule avec exactitude la piste et les emplacements ciblés par une tactique donnée
 * sur l'image figée actuelle du plateau (Phase 3 - Étape 1).
 */
export function computeTacticTarget(
  tactic: TacticId,
  sectors: SectorState[],
  brain: ForemanBrainState,
  params: GameParameters
): TacticTargetPreview {
  const n = params.n;
  const q = params.q;

  if (tactic === 'A1') {
    const eligible = sectors.filter((s) => sumArray(s.harvesters, 1) >= 1);
    if (eligible.length === 0) {
      return {
        tactic,
        targetSector: null,
        cardsPlaced: [],
        noTargetReason: 'Aucune Abatteuse en jeu sur le plateau (H1)',
      };
    }
    eligible.sort((a, b) => {
      const treesA = sumArray(a.standingTrees, 1);
      const treesB = sumArray(b.standingTrees, 1);
      if (treesB !== treesA) return treesB - treesA; // Maximiser T
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex); // Minimiser RangOeil
    });
    const chosen = eligible[0];
    const cardsPlaced: Array<{ cell: number; count: number; isHarvester: boolean }> = [];
    for (let p = 1; p <= q - 1; p++) {
      const hCount = chosen.harvesters[p];
      if (hCount > 0) {
        cardsPlaced.push({ cell: p + 1, count: hCount, isHarvester: true });
      }
    }
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced,
      noTargetReason:
        cardsPlaced.length === 0
          ? 'Abatteuse(s) déjà en dernière Parcelle q : impossible d’avancer (H1)'
          : undefined,
    };
  }

  if (tactic === 'A2') {
    const eligible = sectors.filter((s) => sumArray(s.harvesters, 1) >= 1);
    if (eligible.length === 0) {
      return {
        tactic,
        targetSector: null,
        cardsPlaced: [],
        noTargetReason: 'Aucune Abatteuse en jeu sur le plateau (H1)',
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
      if (posB !== posA) return posB - posA; // Maximiser la position la plus avancée
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex); // Minimiser RangOeil
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
      if (hA !== hB) return hA - hB; // Minimiser le nombre total d'Abatteuses
      return getEyeRank(brain, a.sectorIndex) - getEyeRank(brain, b.sectorIndex); // Minimiser RangOeil
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
      if (stumpsB !== stumpsA) return stumpsB - stumpsA; // Maximiser Souches
      return getEyeRank(brain, b.sectorIndex) - getEyeRank(brain, a.sectorIndex); // Maximiser RangOeil (Rang n)
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
      if (a.bulldozerPos !== b.bulldozerPos) return a.bulldozerPos - b.bulldozerPos; // Minimiser posB (0 = Casse)
      return getEyeRank(brain, b.sectorIndex) - getEyeRank(brain, a.sectorIndex); // Maximiser RangOeil (Rang n)
    });
    const chosen = candidates[0];
    return {
      tactic,
      targetSector: chosen.sectorIndex,
      cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
    };
  }

  // B3 : Terrain dégagé (minimiser T_{i, posB_i}, où T_{i, 0} = 0)
  const candidates = [...sectors];
  candidates.sort((a, b) => {
    const treesAtPosA = a.bulldozerPos === 0 ? 0 : a.standingTrees[a.bulldozerPos];
    const treesAtPosB = b.bulldozerPos === 0 ? 0 : b.standingTrees[b.bulldozerPos];
    if (treesAtPosA !== treesAtPosB) return treesAtPosA - treesAtPosB; // Minimiser T sur posB
    return getEyeRank(brain, b.sectorIndex) - getEyeRank(brain, a.sectorIndex); // Maximiser RangOeil (Rang n)
  });
  const chosen = candidates[0];
  return {
    tactic,
    targetSector: chosen.sectorIndex,
    cardsPlaced: [{ cell: chosen.bulldozerPos, count: 1, isHarvester: false }],
  };
}

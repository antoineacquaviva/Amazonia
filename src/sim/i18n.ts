import {
  BotProfileId,
  InitialMachineConfig,
  ParameterSweepInput,
  SimulationConfig,
  TableConfig,
  TacticType,
  VariantEvaluationResult,
  VictoryBracket,
} from './types';

export const DEFAULT_TACTICS_TRACK: TacticType[] = [
  'A1',
  'B1',
  'A2',
  'B2',
  'A3',
  'B3',
];

export function createDefaultMachinesState(
  numPlayers: number,
  harvesterStatus: 'NORMAL' | 'HS' = 'NORMAL',
  bulldozerStatus: 'NORMAL' | 'HS' = 'NORMAL',
  initialStumpsCell1 = 0
): InitialMachineConfig[] {
  return Array.from({ length: numPlayers }, () => ({
    harvesterPos: 1,
    harvesterStatus,
    bulldozerPos: 1,
    bulldozerStatus,
    initialStumpsCell1,
  }));
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  numPlayers: 4,
  numTurns: 8,
  initialTreesPerCell: 3,
  tacticsTrackSetup: [...DEFAULT_TACTICS_TRACK],
  shuffleTacticsTrack: false,
  initialMachinesState: createDefaultMachinesState(4),
  overheatIncludesBaseAction: false,
  assaultIncludesBaseAction: false,
  overheatStacksTreeRemoval: true,
  endOfGameRegeneration: true,
};

export const DEFAULT_SWEEP_INPUT: ParameterSweepInput = {
  numPlayersValues: [4],
  numTurnsValues: [8],
  initialTreesPerCellValues: [3],
  overheatIncludesBaseActionValues: [false],
  assaultIncludesBaseActionValues: [false],
  overheatStacksTreeRemovalValues: [true],
  endOfGameRegenerationValues: [true],
  shuffleTacticsTrackValues: [false],
  tacticsTrackSetup: [...DEFAULT_TACTICS_TRACK],
  initialHarvesterStatus: 'NORMAL',
  initialBulldozerStatus: 'NORMAL',
  initialStumpsCell1: 0,
};

export const OPTION_D_LABELS: Record<
  VariantEvaluationResult['optionDTag'],
  { title: string; subtitle: string }
> = {
  D1_NONE: {
    title: 'Option D1 — Surchauffe & Assaut Purs (Sans action de base)',
    subtitle: 'overheatIncludesBaseAction = false · assaultIncludesBaseAction = false',
  },
  D2_OVERHEAT_ONLY: {
    title: 'Option D2 (Surchauffe) — A2/B2 incluent l’action de base',
    subtitle: 'overheatIncludesBaseAction = true · assaultIncludesBaseAction = false',
  },
  D2_ASSAULT_ONLY: {
    title: 'Option D2 (Assaut) — A3/B3 incluent l’action de base',
    subtitle: 'overheatIncludesBaseAction = false · assaultIncludesBaseAction = true',
  },
  D2_BOTH: {
    title: 'Option D2 Complet — Surchauffe & Assaut incluent l’action de base',
    subtitle: 'overheatIncludesBaseAction = true · assaultIncludesBaseAction = true',
  },
};

export const VICTORY_BRACKET_LABELS: Record<
  VictoryBracket,
  { label: string; color: string }
> = {
  MIRACLE: {
    label: 'Miracle Écologique (≥ 85%)',
    color: 'text-emerald-700 dark:text-emerald-400',
  },
  MAJOR_VICTORY: {
    label: 'Victoire Majeure (65%–85%)',
    color: 'text-sky-700 dark:text-sky-400',
  },
  COSTLY_VICTORY: {
    label: 'Victoire Coûteuse (45%–65%)',
    color: 'text-amber-700 dark:text-amber-400',
  },
  DEFEAT: {
    label: 'Défaite Écologique (< 45%)',
    color: 'text-rose-700 dark:text-rose-400',
  },
};

export const TACTIC_META: Record<
  TacticType,
  {
    code: TacticType;
    name: string;
    machine: 'A' | 'B';
    category: 'BASE' | 'OVERHEAT' | 'ASSAULT';
    description: string;
  }
> = {
  A1: {
    code: 'A1',
    name: 'Abattage Standard',
    machine: 'A',
    category: 'BASE',
    description:
      'L’Abatteuse avance (si NORMAL) et abat 1 Arbre debout en Souche.',
  },
  A2: {
    code: 'A2',
    name: 'Surchauffe Abatteuse',
    machine: 'A',
    category: 'OVERHEAT',
    description:
      'Enlève définitivement 1 pion Arbre (debout sinon souche) et passe l’Abatteuse en état HS (Option D2 : +1 Abattage avant Surchauffe). Si combinée avec A3 : Explosion !',
  },
  A3: {
    code: 'A3',
    name: 'Assaut Abatteuse',
    machine: 'A',
    category: 'ASSAULT',
    description:
      'Décale les seuils de défense de la case de +1 (k_assault) et passe l’Abatteuse en état HS après combat (Option D2 : +1 Abattage). Si combinée avec A2 : Explosion !',
  },
  B1: {
    code: 'B1',
    name: 'Terrassement Standard',
    machine: 'B',
    category: 'BASE',
    description:
      'Le Bulldozer avance (si NORMAL) et rase toutes les Souches de la case (puis abat des arbres si actions multiples).',
  },
  B2: {
    code: 'B2',
    name: 'Surchauffe Bulldozer',
    machine: 'B',
    category: 'OVERHEAT',
    description:
      'Enlève définitivement 1 pion Arbre (debout sinon souche) et passe le Bulldozer en état HS (Option D2 : +1 action de base Bulldozer avant Surchauffe). Si combinée avec B3 : Explosion !',
  },
  B3: {
    code: 'B3',
    name: 'Assaut Bulldozer',
    machine: 'B',
    category: 'ASSAULT',
    description:
      'Décale les seuils de défense de la case de +1 (k_assault) et passe le Bulldozer en état HS après combat (Option D2 : +1 action de base Bulldozer). Si combinée avec B2 : Explosion !',
  },
};

export const BOT_PROFILE_META: Record<
  BotProfileId,
  {
    id: BotProfileId;
    name: string;
    label: string;
    shortLabel: string;
    description: string;
  }
> = {
  RANDOM: {
    id: 'RANDOM',
    name: 'Bot Naïf / Aléatoire',
    label: 'Bot Naïf / Aléatoire',
    shortLabel: 'Naïf / Aléatoire',
    description:
      'Place ses 2 Défenseurs aléatoirement sur p ou p+1 (Piste Tactique ou Piste Furtivité). Sert d’étalon de base.',
  },
  COMBAT_PURE: {
    id: 'COMBAT_PURE',
    name: 'Bot « Combat Pur » (Réactif)',
    label: 'Bot « Combat Pur » (Réactif)',
    shortLabel: 'Combat Pur (Réactif)',
    description:
      'Étape 2.1 : Défend sa machine NORMAL menacée en Piste Tactique sur p+1 (ou son Abatteuse par défaut). Étape 2.2 : Soutient en Piste Tactique la case p+1 de la machine NORMAL ciblée par son dé (ou J1 pour viser S=2 Parade / S=3 Mise HS).',
  },
  HYBRID_STEALTH_COMBAT: {
    id: 'HYBRID_STEALTH_COMBAT',
    name: 'Bot « Hybride Furtivité + Combat » (Proactif)',
    label: 'Bot « Hybride Furtivité + Combat » (Proactif)',
    shortLabel: 'Hybride Furtivité + Combat',
    description:
      'Coordonne des paires de Défenseurs en Piste Furtivité (>=2) pour poser des Pièges en p+1 et des Sabotages sur les machines, puis bascule en Piste Tactique pour déclencher des Parades (S=2+k) et Mises HS (S=3+k) amplifiées par les Pièges/Sabotages.',
  },
  OMNISCIENT: {
    id: 'OMNISCIENT',
    name: 'Bot « Omniscient » (Borne Haute)',
    label: 'Bot « Omniscient » (Borne Haute)',
    shortLabel: 'Omniscient (Max)',
    description:
      'Connaît les N tirages secrets du tour pour allouer exactement les Défenseurs requis (seuils S=2+k et S=3+k sur les cases attaquées et paires de Furtivité sans aucun gaspillage).',
  },
};

export const DEFAULT_TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'TABLE_HYBRID',
    name: 'Table Hybride Furtivité + Combat',
    description:
      'Tous les joueurs combinent Pièges/Sabotages en Furtivité et Parades/Mises HS en Piste Tactique.',
    botProfiles: ['HYBRID_STEALTH_COMBAT'],
  },
  {
    id: 'TABLE_COMBAT_PURE',
    name: 'Table Combat Pur (Réactif)',
    description:
      'Tous les joueurs jouent exclusivement sur la Piste Tactique en réaction aux menaces en p+1.',
    botProfiles: ['COMBAT_PURE'],
  },
  {
    id: 'TABLE_RANDOM',
    name: 'Table Naïve / Aléatoire (Borne Basse)',
    description:
      'Placement aléatoire sur p ou p+1 entre Piste Tactique et Piste Furtivité.',
    botProfiles: ['RANDOM'],
  },
  {
    id: 'TABLE_OMNISCIENT',
    name: 'Table Omnisciente (Borne Haute)',
    description:
      'Équipe connaissant tous les tirages 2D6 pour mesurer le plafond théorique de survie.',
    botProfiles: ['OMNISCIENT'],
  },
];

// ============================================================================
// MATRICE MAÎTRESSE 2D6 (DISPOSITIF DE ROUES — SECTION 4)
// ============================================================================
export type MatrixCellSymbol = 'J1' | 'J2' | 'J3' | '[A]' | '[B]' | '[C]' | '[D]';

export const MASTER_MATRIX_6X6: MatrixCellSymbol[][] = [
  // Ligne D1 = 1
  ['J1', 'J1', 'J1', 'J2', 'J3', '[B]'],
  // Ligne D1 = 2
  ['J1', 'J1', 'J1', 'J1', 'J2', 'J3'],
  // Ligne D1 = 3
  ['J1', 'J1', '[C]', '[A]', 'J2', 'J2'],
  // Ligne D1 = 4
  ['J1', '[A]', 'J2', 'J1', 'J1', '[B]'],
  // Ligne D1 = 5
  ['J2', 'J2', '[D]', 'J3', 'J1', 'J2'],
  // Ligne D1 = 6
  ['J3', 'J1', 'J2', 'J3', 'J3', 'J1'],
];

/**
 * Résout le rang du joueur ciblé (1 .. N) à partir du lancer (D1, D2) et du nombre de joueurs N in {3,4,5,6}
 */
export function resolveTargetPlayerRank1Based(
  d1: number,
  d2: number,
  numPlayers: number
): number {
  const row = Math.max(1, Math.min(6, d1)) - 1;
  const col = Math.max(1, Math.min(6, d2)) - 1;
  const symbol = MASTER_MATRIX_6X6[row][col];

  switch (symbol) {
    case 'J1':
      return 1;
    case 'J2':
      return 2;
    case 'J3':
      return 3;
    case '[A]':
      if (numPlayers === 3) return 1;
      if (numPlayers === 4) return 4;
      return 5; // N = 5 ou 6 -> J5
    case '[B]':
      if (numPlayers <= 4) return 1;
      return 4; // N = 5 ou 6 -> J4
    case '[D]':
      if (numPlayers <= 4) return 2;
      return 4; // N = 5 ou 6 -> J4
    case '[C]':
      if (numPlayers <= 5) return 1;
      return 6; // N = 6 -> J6
  }
}

/**
 * Calcule la distribution exacte de probabilité de ciblage sur les 36 couples (D1, D2) pour N joueurs
 */
export function computeEvilEyeProbabilities(numPlayers: number): Array<{
  rank: number;
  playerRank: number;
  casesOn36: number;
  countOutOf36: number;
  probability: number;
}> {
  const counts = new Array(numPlayers).fill(0);
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      const r = resolveTargetPlayerRank1Based(d1, d2, numPlayers);
      counts[r - 1] += 1;
    }
  }
  return counts.map((c, idx) => ({
    rank: idx + 1,
    playerRank: idx + 1,
    casesOn36: c,
    countOutOf36: c,
    probability: c / 36,
  }));
}

export const MIN_2D6_COUNTS_OUT_OF_36 = [11, 9, 7, 5, 3, 1];

import {
  BotProfileId,
  InitialMachineConfig,
  ParameterSweepInput,
  SimulationConfig,
  TableConfig,
  TacticsTrackPreset,
  TacticType,
  VictoryBracket,
} from './types';

export const TACTICS_TRACK_PRESETS: Record<
  TacticsTrackPreset,
  {
    id: TacticsTrackPreset;
    shortLabel: string;
    label: string;
    setup: TacticType[];
    description: string;
  }
> = {
  ASSAULT_HIGH: {
    id: 'ASSAULT_HIGH',
    shortLabel: 'ASSAULT_HIGH',
    label: 'ASSAULT_HIGH — Assauts fréquents sur petits dés [A3, B3, A2, B2, A1, B1]',
    setup: ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'],
    description:
      'Assauts A3/B3 placés sur M=1 et M=2 (20 chances sur 36) : forte pression sur les seuils S et risque élevé d’explosion.',
  },
  ASSAULT_LOW: {
    id: 'ASSAULT_LOW',
    shortLabel: 'ASSAULT_LOW',
    label: 'ASSAULT_LOW — Assauts rares sur gros dés [A1, B1, A2, B2, A3, B3]',
    setup: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'],
    description:
      'Actions standard A1/B1 placées sur M=1 et M=2 ; Assauts A3/B3 réservés aux gros dés M=5 et M=6 (4 chances sur 36).',
  },
};

export const DEFAULT_TACTICS_TRACK: TacticType[] = [
  ...TACTICS_TRACK_PRESETS.ASSAULT_HIGH.setup,
];

export function resolveTacticsTrackFromPreset(
  preset: TacticsTrackPreset
): TacticType[] {
  return [...(TACTICS_TRACK_PRESETS[preset]?.setup ?? TACTICS_TRACK_PRESETS.ASSAULT_HIGH.setup)];
}

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
  initialTreesPerCell: 2,
  tacticsTrackPreset: 'ASSAULT_HIGH',
  tacticsTrackSetup: resolveTacticsTrackFromPreset('ASSAULT_HIGH'),
  shuffleTacticsTrack: false,
  tacticalDefenderCap: 2,
  combatThresholdShift: 0,
  bulldozerZeroStumpAction: 'DESTROY_TREE',
  initialStumpCell2: true,
};

/**
 * Configuration par défaut la plus ambitieuse et exhaustive pour le Sweep Monte-Carlo v3.2
 * 4 (N) × 6 (X) × 2 (a) × 3 (Cap) × 2 (Shift) × 2 (Bull0) × 2 (StumpC2) × 2 (Preset) = 2 304 variantes
 */
export const DEFAULT_SWEEP_INPUT: ParameterSweepInput = {
  numPlayersValues: [3, 4, 5, 6],
  numTurnsValues: [6, 7, 8, 9, 10, 12],
  initialTreesPerCellValues: [2, 3],
  tacticalDefenderCapValues: [99, 2, 1],
  combatThresholdShiftValues: [0, 1],
  bulldozerZeroStumpActionValues: ['NONE', 'DESTROY_TREE'],
  initialStumpCell2Values: [false, true],
  tacticsTrackPresetValues: ['ASSAULT_HIGH', 'ASSAULT_LOW'],
  shuffleTacticsTrackValues: [false],
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
      'Inclut 1 Abattage de base + enlève définitivement 1 pion Arbre (debout sinon souche) et passe l’Abatteuse en état HS. Si combinée avec A3 : Explosion !',
  },
  A3: {
    code: 'A3',
    name: 'Assaut Abatteuse',
    machine: 'A',
    category: 'ASSAULT',
    description:
      'Inclut 1 Abattage de base + décale les seuils de défense de +1 (k_assault) et passe l’Abatteuse en état HS après combat. Si combinée avec A2 : Explosion !',
  },
  B1: {
    code: 'B1',
    name: 'Terrassement Standard',
    machine: 'B',
    category: 'BASE',
    description:
      'Le Bulldozer avance (si NORMAL) et rase toutes les Souches de la case (ou détruit 1 arbre debout si 0 souche avec DESTROY_TREE).',
  },
  B2: {
    code: 'B2',
    name: 'Surchauffe Bulldozer',
    machine: 'B',
    category: 'OVERHEAT',
    description:
      'Inclut 1 action de base Bulldozer + enlève définitivement 1 pion Arbre (debout sinon souche) et passe le Bulldozer en état HS. Si combinée avec B3 : Explosion !',
  },
  B3: {
    code: 'B3',
    name: 'Assaut Bulldozer',
    machine: 'B',
    category: 'ASSAULT',
    description:
      'Inclut 1 action de base Bulldozer + décale les seuils de défense de +1 (k_assault) et passe le Bulldozer en état HS après combat. Si combinée avec B2 : Explosion !',
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
  BLIND: {
    id: 'BLIND',
    name: '1. Bot Aveugle (Sans info privée, sans coordination)',
    label: 'Bot Aveugle (Sans info privée)',
    shortLabel: 'Aveugle',
    description:
      'Ignore son tirage secret (T_k, P_k). Étape 2.1 : Tactique sur p+1 de sa propre Abatteuse (ou Bulldozer si HS). Étape 2.2 : Tactique sur p+1 de J1 (ou J2 si k=1) sans regarder les alliés.',
  },
  SOLO_INFORMED: {
    id: 'SOLO_INFORMED',
    name: '2. Bot Informé Solo (Info privée, zéro coordination)',
    label: 'Bot Informé Solo (Info privée seule)',
    shortLabel: 'Informé Solo',
    description:
      'Utilise son dé (T_k, P_k) en Piste Tactique (2.1 si P_k=k, 2.2 si P_k!=k), mais ne regarde jamais les jetons alliés et n’utilise jamais la Furtivité.',
  },
  COORD_HYBRID: {
    id: 'COORD_HYBRID',
    name: '3. Bot Coordonné Hybride (Info privée + Coordination tacite)',
    label: 'Bot Coordonné Hybride (Référence Expert)',
    shortLabel: 'Coordonné Hybride',
    description:
      'Étape 2.1 : Signale sa menace en Tactique ou lance un appel Furtivité (1 jeton). Étape 2.2 : Coordonne les soutiens sans Overkill et complète prioritairement les paires Furtivité à 2.',
  },
  OMNISCIENT: {
    id: 'OMNISCIENT',
    name: '4. Bot Omniscient (Table ouverte / Plafond théorique)',
    label: 'Bot Omniscient (Table ouverte)',
    shortLabel: 'Omniscient',
    description:
      'Connaît la totalité des N tirages (T_1..T_N) dès la Phase 2 et alloue les 2N Défenseurs de manière globalement optimale (zéro jeton sur case non attaquée, calcul exact de k_assault).',
  },
};

export const DEFAULT_TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'TABLE_COORD',
    name: 'Table Coordonnée Hybride (Référence Expert)',
    description:
      'Info privée + Coordination tacite par lecture du plateau (signaux Furtivité en 2.1, complétion sans Overkill en 2.2).',
    botProfiles: ['COORD_HYBRID'],
  },
  {
    id: 'TABLE_SOLO',
    name: 'Table Informée Solo (Info privée, zéro coordination)',
    description:
      'Chaque joueur joue son dé en Piste Tactique sans regarder les jetons des alliés ni utiliser la Furtivité.',
    botProfiles: ['SOLO_INFORMED'],
  },
  {
    id: 'TABLE_BLIND',
    name: 'Table Aveugle (Sans info privée, sans coordination)',
    description:
      'Chaque joueur ignore son gobelet et défend mécaniquement sa propre piste puis J1/J2 en Piste Tactique.',
    botProfiles: ['BLIND'],
  },
  {
    id: 'TABLE_OMNI',
    name: 'Table Omnisciente (Plafond théorique)',
    description:
      'Table ouverte connaissant les N tirages secrets à l’avance pour mesurer le coût du brouillard de guerre.',
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

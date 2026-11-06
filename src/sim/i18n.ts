import {
  BotProfileId,
  InitialMachineConfig,
  ParameterSweepInput,
  ParryHsRule,
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
  ASSAULT_LOW: {
    id: 'ASSAULT_LOW',
    shortLabel: 'ASSAULT_LOW (Figé v3.3)',
    label: 'ASSAULT_LOW — Assauts rares sur gros dés [A1, B1, A2, B2, A3, B3] (Défaut v3.3)',
    setup: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'],
    description:
      'Actions standard A1/B1 placées sur M=1 et M=2 (20/36) ; Surchauffes A2/B2 en M=3,4 (12/36) ; Assauts A3/B3 sur M=5,6 (4/36).',
  },
  ASSAULT_HIGH: {
    id: 'ASSAULT_HIGH',
    shortLabel: 'ASSAULT_HIGH',
    label: 'ASSAULT_HIGH — Assauts fréquents sur petits dés [A3, B3, A2, B2, A1, B1]',
    setup: ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'],
    description:
      'Assauts A3/B3 placés sur M=1 et M=2 (20 chances sur 36) : forte pression sur les seuils S et risque élevé d’explosion.',
  },
};

export const PARRY_HS_RULE_META: Record<
  ParryHsRule,
  {
    id: ParryHsRule;
    shortLabel: string;
    label: string;
    description: string;
  }
> = {
  SYNERGY_TRAP_SAB: {
    id: 'SYNERGY_TRAP_SAB',
    shortLabel: 'Synergie Piège/Sab (S≥2)',
    label: 'SYNERGY_TRAP_SAB — Parade + Mise HS dès S ≥ 2+k+shift si Piège ou Sabotage actif',
    description:
      'Lorsque S ≥ 2+k+shift : si S ≥ 3+k+shift OU si au moins 1 Piège/Sabotage participe au combat (trapBonus+sabotageBonus ≥ 1), le résultat est immédiatement PARRY_AND_HS !',
  },
  STANDARD_S3: {
    id: 'STANDARD_S3',
    shortLabel: 'Standard (S≥3)',
    label: 'STANDARD_S3 — Parade simple à S = 2+k+shift, Mise HS uniquement à S ≥ 3+k+shift',
    description:
      'Règle classique : la Mise HS exige toujours un score total S ≥ 3+k+shift, même en présence d’un Piège ou d’un Sabotage.',
  },
};

export const DEFAULT_TACTICS_TRACK: TacticType[] = [
  ...TACTICS_TRACK_PRESETS.ASSAULT_LOW.setup,
];

export function resolveTacticsTrackFromPreset(
  preset: TacticsTrackPreset
): TacticType[] {
  return [...(TACTICS_TRACK_PRESETS[preset]?.setup ?? TACTICS_TRACK_PRESETS.ASSAULT_LOW.setup)];
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
  tacticsTrackPreset: 'ASSAULT_LOW',
  tacticsTrackSetup: resolveTacticsTrackFromPreset('ASSAULT_LOW'),
  shuffleTacticsTrack: false,
  tacticalDefenderCap: 2,
  combatThresholdShift: 0,
  bulldozerZeroStumpAction: 'DESTROY_TREE',
  initialStumpCell2: true,
  parryHsRule: 'SYNERGY_TRAP_SAB',
};

/**
 * Configuration par défaut pour le Sweep Monte-Carlo v3.3 :
 * Invariants figés issus de la v3.2 : a = 2, ASSAULT_LOW, DESTROY_TREE, initialStumpCell2 = true
 * Leviers actifs balayés : N ∈ {3..6} × X ∈ {6..12} × Cap ∈ {1, 2} × Shift ∈ {0, 1} × ParryHsRule ∈ {'SYNERGY_TRAP_SAB', 'STANDARD_S3'} = 192 variantes
 */
export const DEFAULT_SWEEP_INPUT: ParameterSweepInput = {
  numPlayersValues: [3, 4, 5, 6],
  numTurnsValues: [6, 7, 8, 9, 10, 12],
  initialTreesPerCellValues: [2],
  tacticalDefenderCapValues: [1, 2],
  combatThresholdShiftValues: [0, 1],
  bulldozerZeroStumpActionValues: ['DESTROY_TREE'],
  initialStumpCell2Values: [true],
  tacticsTrackPresetValues: ['ASSAULT_LOW'],
  parryHsRuleValues: ['SYNERGY_TRAP_SAB', 'STANDARD_S3'],
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
    infoSignature: string;
    description: string;
  }
> = {
  BLIND: {
    id: 'BLIND',
    name: '1. Bot Aveugle Naïf (Plancher 0 Info : I1=0, I2=0, I3=0)',
    label: '1. Aveugle Naïf (0 Info)',
    shortLabel: '1. Aveugle',
    infoSignature: 'Aucune info',
    description:
      'Aucune lecture de dé (I1=0), ni des probabilités de la Piste Tactique/Œil (I2=0), ni des jetons alliés (I3=0). Pose mécaniquement sur sa piste puis sur J1/J2.',
  },
  PROB_ONLY: {
    id: 'PROB_ONLY',
    name: '2. Bot Lecteur Probabiliste (I2 seule : Piste Tactique + Œil + Vulnérabilité)',
    label: '2. Lecteur Probabiliste (I2 seule)',
    shortLabel: '2. Prob. Seule (I2)',
    infoSignature: 'I2 seule',
    description:
      'Ignore son dé privé (I1=0) et les jetons alliés (I3=0), mais calcule exactement les 36 couples (D1,D2) sur tacticsTrack et l’Œil croisés avec la vulnérabilité des cases (souches devant Bulldozer, arbres debout).',
  },
  SOLO_INFORMED: {
    id: 'SOLO_INFORMED',
    name: '3. Bot Solo Bayésien (I1 + I2, zéro coordination : I3=0)',
    label: '3. Solo Bayésien (I1 + I2)',
    shortLabel: '3. Solo (I1+I2)',
    infoSignature: 'I1 + I2',
    description:
      'Combine son dé privé 2D6 (I1) et la lecture probabiliste publique (I2) pour protéger la cible de son dé et la meilleure cible probabiliste, sans regarder les jetons alliés (I3=0).',
  },
  COORD_NO_DICE: {
    id: 'COORD_NO_DICE',
    name: '4. Bot Coordonné Sans Dé (I2 + I3 avec révision 2.2, sans I1)',
    label: '4. Coordonné Sans Dé (I2 + I3)',
    shortLabel: '4. Coord Sans Dé (I2+I3)',
    infoSignature: 'I2 + I3 (Sans I1)',
    description:
      'Ignore son propre dé 2D6 (I1=0), mais utilise les probabilités publiques (I2) ET la boucle complète de coordination et révision 2.2 (I3). Isole par différence la vraie valeur marginale du dé privé en équipe !',
  },
  COORD_ONE_SHOT: {
    id: 'COORD_ONE_SHOT',
    name: '5. Bot Coordonné 1-Passe (I1 + I2 + I3 sans révision 2.2)',
    label: '5. Coordonné 1-Passe (Sans révision 2.2)',
    shortLabel: '5. Coord 1-Passe',
    infoSignature: 'I1 + I2 + I3 (R=1)',
    description:
      'Utilise I1 + I2, émet et lit les signaux de l’Étape 2.1, mais pose son 2e jeton en Étape 2.2 en une seule passe définitive (R=1, sans révision itérative).',
  },
  COORD_HYBRID: {
    id: 'COORD_HYBRID',
    name: '6. Bot Coordonné Révisable Bayésien (I1 + I2 + I3 avec boucle 2.2 — RÉFÉRENCE)',
    label: '6. Coordonné Révisable (Réf. I1+I2+I3)',
    shortLabel: '6. Coord Révisable (Réf)',
    infoSignature: 'I1 + I2 + I3 (R=4)',
    description:
      'Utilise I1 + I2 + I3, décode bayésiennement les poses 2.1 et 2.2 alliées, et exécute jusqu’à 4 rondes de révision du 2e jeton pour secourir les signaux 2.2 isolés, convertir les Furtivités orphelines et éliminer l’Overkill.',
  },
  OMNISCIENT: {
    id: 'OMNISCIENT',
    name: '7. Bot Omniscient (Plafond théorique à table ouverte)',
    label: '7. Omniscient (Table ouverte)',
    shortLabel: '7. Omniscient',
    infoSignature: 'Omniscient (N dés)',
    description:
      'Connaît les N tirages exacts dès la Phase 2 et optimise globalement l’allocation des 2N jetons (en tenant compte de parryHsRule) pour mesurer le coût résiduel du brouillard de guerre.',
  },
};

export const DEFAULT_TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'TABLE_BLIND',
    name: '1. Table Aveugle Naïve (Plancher 0 Info)',
    description:
      'I1=0, I2=0, I3=0 : Aucune lecture de dé, ni des probabilités des pistes, ni des jetons alliés.',
    botProfiles: ['BLIND'],
  },
  {
    id: 'TABLE_PROB',
    name: '2. Table Lecteur Probabiliste (I2 seule)',
    description:
      'I1=0, I2=1, I3=0 : Lecture exacte des probabilités 2D6 (Piste Tactique + Œil + Vulnérabilité Bulldozer/Abatteuse) sans regarder son dé ni les alliés.',
    botProfiles: ['PROB_ONLY'],
  },
  {
    id: 'TABLE_SOLO',
    name: '3. Table Solo Bayésienne (I1 + I2, 0 Coord)',
    description:
      'I1=1, I2=1, I3=0 : Utilise son dé privé 2D6 + lecture probabiliste I2, sans lire les jetons alliés.',
    botProfiles: ['SOLO_INFORMED'],
  },
  {
    id: 'TABLE_COORD_NO_DICE',
    name: '4. Table Coordonnée Sans Dé (I2 + I3, sans I1)',
    description:
      'I1=0, I2=1, I3=1 : Coordonne les paires Furtivité et les Parades/Mises HS avec révision 2.2 sur la base des probabilités publiques, sans regarder les dés 2D6.',
    botProfiles: ['COORD_NO_DICE'],
  },
  {
    id: 'TABLE_COORD_ONE_SHOT',
    name: '5. Table Coordonnée 1-Passe (I1 + I2 + I3 sans révision 2.2)',
    description:
      'I1=1, I2=1, I3(2.1)=1 : Lit les signaux de l’Étape 2.1 mais pose le 2e jeton en une seule passe définitive sans boucle de révision 2.2.',
    botProfiles: ['COORD_ONE_SHOT'],
  },
  {
    id: 'TABLE_COORD',
    name: '6. Table Coordonnée Révisable (Référence I1 + I2 + I3)',
    description:
      'Référence v3.3 : Décodage bayésien des signaux 2.1 et 2.2 + Boucle systémique de révision du 2e jeton (jusqu’à 4 rondes, zéro Furtivité orpheline).',
    botProfiles: ['COORD_HYBRID'],
  },
  {
    id: 'TABLE_OMNI',
    name: '7. Table Omnisciente (Plafond théorique)',
    description:
      'Table ouverte connaissant les N tirages secrets à l’avance et optimisant globalement les 2N Défenseurs selon parryHsRule.',
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

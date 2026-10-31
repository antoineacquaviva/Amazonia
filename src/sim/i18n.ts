import { GameParameters, TableConfig, TacticId, ThemeVocabularyMode, BotProfileId } from './types';

export interface VocabularyDictionary {
  'game.title': string;
  'entity.villain.name': string;
  'board.villain.main': string;
  'board.villain.tactics': string;
  'board.villain.eye': string;
  'entity.faction.name': string;
  'entity.faction.list': string[];
  'board.player.sector': string;
  'board.player.forest_track': string;
  'board.player.cell': string;
  'board.player.scrapyard': string;
  'tree.state.standing': string;
  'tree.state.stump': string;
  'tree.state.cleared': string;
  'machine.harvester': string;
  'machine.bulldozer': string;
  'token.defender': string;
  'token.defender.thinking': string;
  'token.defender.locked': string;
  'card.maneuver': string;
  'card.bulldozer.clear': string;
  'card.bulldozer.repair': string;
}

export const DICTIONARIES: Record<ThemeVocabularyMode, VocabularyDictionary> = {
  AMAZONIA: {
    'game.title': 'Amazonia : Dernier Rempart',
    'entity.villain.name': 'Le Contremaître',
    'board.villain.main': 'Le Cerveau du Contremaître',
    'board.villain.tactics': 'Piste des Tactiques',
    'board.villain.eye': "L'Œil du Contremaître",
    'entity.faction.name': 'Peuple',
    'entity.faction.list': [
      'Mammifères',
      'Insectes',
      'Reptiles',
      'Oiseaux',
      'Humains',
      'Entités magiques',
    ],
    'board.player.sector': 'Secteur Forestier',
    'board.player.forest_track': 'Piste Forêt',
    'board.player.cell': 'Parcelle',
    'board.player.scrapyard': 'La Casse',
    'tree.state.standing': 'Arbre debout (T)',
    'tree.state.stump': 'Souche (S)',
    'tree.state.cleared': 'Terre rasée (E)',
    'machine.harvester': 'Abatteuse',
    'machine.bulldozer': 'Bulldozer',
    'token.defender': 'Jeton Défenseur',
    'token.defender.thinking': 'En réflexion',
    'token.defender.locked': 'Définitif',
    'card.maneuver': 'Carte Manœuvre',
    'card.bulldozer.clear': 'Face Terrassement',
    'card.bulldozer.repair': 'Face Réparation',
  },
  ABSTRACT: {
    'game.title': 'Simulateur du Jeu de Défense de la Forêt',
    'entity.villain.name': 'Le Méchant',
    'board.villain.main': 'Plateau « Pensées du Méchant »',
    'board.villain.tactics': 'Piste des Tactiques',
    'board.villain.eye': "Piste « L'Œil du Méchant »",
    'entity.faction.name': 'Peuple / Joueur',
    'entity.faction.list': [
      'Peuple 1',
      'Peuple 2',
      'Peuple 3',
      'Peuple 4',
      'Peuple 5',
      'Peuple 6',
    ],
    'board.player.sector': 'Secteur Joueur / Plateau Forêt',
    'board.player.forest_track': 'Piste Forêt',
    'board.player.cell': 'Case Forêt',
    'board.player.scrapyard': 'La Casse',
    'tree.state.standing': 'Arbre debout (T)',
    'tree.state.stump': 'Souche (S)',
    'tree.state.cleared': 'Emplacement terrassé (E)',
    'machine.harvester': 'Abatteuse',
    'machine.bulldozer': 'Bulldozer',
    'token.defender': 'Jeton Défenseur',
    'token.defender.thinking': 'Réflexion en cours',
    'token.defender.locked': 'Choix définitif',
    'card.maneuver': 'Carte Manœuvre',
    'card.bulldozer.clear': 'Face Terrassement',
    'card.bulldozer.repair': 'Face Réparation',
  },
};

export const TACTIC_DESCRIPTIONS: Record<TacticId, { name: string; ruleSummary: string }> = {
  A1: {
    name: 'A1 — Avancer & Abattre',
    ruleSummary: "Cible la piste (avec >=1 Abatteuse) ayant le plus d'Arbres debout (égalité : Rang 1 de l'Œil). Pose des cartes en p+1 et fait avancer les Abatteuses.",
  },
  A2: {
    name: 'A2 — Abattre sur place',
    ruleSummary: "Cible la piste ayant l'Abatteuse la plus avancée (égalité : Rang 1 de l'Œil). Pose des cartes sur place.",
  },
  A3: {
    name: "A3 — Renforts d'abattage",
    ruleSummary: "Cible la piste (avec >=1 Arbre debout) ayant le moins d'Abatteuses (égalité : Rang 1 de l'Œil). Ajoute 1 Abatteuse sur son 1er Arbre debout.",
  },
  B1: {
    name: 'B1 — Nettoyage de grand chantier',
    ruleSummary: "Cible la piste ayant le plus de Souches (égalité : Rang n de l'Œil). Carte sur l'emplacement actuel du Bulldozer.",
  },
  B2: {
    name: 'B2 — Remise en route des retardataires',
    ruleSummary: "Cible la piste dont le Bulldozer est le moins avancé, Casse=0 incluse (égalité : Rang n de l'Œil).",
  },
  B3: {
    name: 'B3 — Terrain dégagé',
    ruleSummary: "Cible la piste dont l'emplacement actuel du Bulldozer contient le moins d'Arbres debout, Casse=0 ayant 0 arbre (égalité : Rang n de l'Œil).",
  },
};

export const BOT_PROFILE_META: Record<BotProfileId, { label: string; shortLabel: string; level: string; description: string }> = {
  RANDOM: {
    label: 'Bot Aléatoire (Baseline)',
    shortLabel: 'Aléatoire (N0)',
    level: 'Baseline N0',
    description: 'Pose ses jetons uniformément au hasard sur les emplacements légaux. Sert à valider le moteur et établir la borne basse.',
  },
  SELFISH: {
    label: 'Bot Égoïste / Myope (Niveau 1)',
    shortLabel: 'Égoïste (N1)',
    level: 'Niveau 1',
    description: "Protège la menace immédiate la plus probable sans chercher à détruire les machines à plusieurs ni décoder les signaux d'équipe.",
  },
  COOPERATIVE: {
    label: 'Bot Coopératif Communicant (Niveau 2)',
    shortLabel: 'Coopératif (N2)',
    level: 'Niveau 2',
    description: 'Utilise le protocole bayésien et les micro-cycles (verrouillage rapide si certitude externe, évitement des doublons, seuils D=2 et D=3).',
  },
  STRATEGIST: {
    label: 'Bot Stratège « Méta-Contremaître » (Niveau 3)',
    shortLabel: 'Stratège (N3)',
    level: 'Niveau 3',
    description: "Intègre l'Apprentissage et la Rancune dans son évaluation : pare en priorité les tactiques dangereuses en cases 1-2 et gère l'Œil.",
  },
  OMNISCIENT: {
    label: 'Bot Omniscient (Borne Haute Théorique)',
    shortLabel: 'Omniscient (Max)',
    level: 'Borne Haute',
    description: 'Connaît les dés tirés par tous les joueurs (triche contrôlée) pour mesurer la perte liée à l’information incomplète.',
  },
};

export const DEFAULT_GAME_PARAMETERS: GameParameters = {
  n: 4,
  q: 6,
  a: 2,
  x: 8,
  stockAbatteuses: null,
  modeTirageDes: 'MIN_2D6',
  modeResolutionParcelle: 'TRANSACTION_FIGEE',
  ordreCasse: 'AVANT_PARCELLE_1',
  immobiliteReparation: true,
  ordreMajTactiques: 'ORDRE_PISTE_TAC',
  rancuneTerrassementDegrade: false,
  granulariteRancune: 'PAR_CASE',
  nbRegeneration: 1,
  rMaxCycles: 5,
};

export const DEFAULT_TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'table_coop_n2',
    name: 'Équipe Coopérative Standard (N2)',
    description: 'Tous les joueurs utilisent le protocole de communication muette et visent les destructions coordonnées (D=2, D=3).',
    botProfiles: ['COOPERATIVE'],
  },
  {
    id: 'table_strategist_n3',
    name: 'Équipe Experte « Méta-Contremaître » (N3)',
    description: 'Tous les joueurs anticipent en plus la Piste des Tactiques et la Rancune sur l’Œil.',
    botProfiles: ['STRATEGIST'],
  },
  {
    id: 'table_selfish_n1',
    name: 'Équipe Égoïste / Sans Coordination (N1)',
    description: 'Joueurs myopes jouant chacun selon leur probabilité locale sans décoder les signaux des alliés.',
    botProfiles: ['SELFISH'],
  },
  {
    id: 'table_mixed_heterogeneous',
    name: 'Table Mixte Hétérogène (1 Stratège, 2 Coopératifs, 1 Égoïste)',
    description: 'Simule une table réaliste avec un joueur expert, deux joueurs communicants et un joueur novice/myope.',
    botProfiles: ['STRATEGIST', 'COOPERATIVE', 'COOPERATIVE', 'SELFISH'],
  },
  {
    id: 'table_omniscient',
    name: 'Borne Haute Omnisciente (Information Parfaite)',
    description: 'Équipe connaissant tous les tirages secrets (mesure le plafond théorique de la variante).',
    botProfiles: ['OMNISCIENT'],
  },
  {
    id: 'table_random',
    name: 'Baseline Aléatoire (Borne Basse)',
    description: 'Placements uniformes au hasard pour mesurer le plancher de survie naturelle de la forêt.',
    botProfiles: ['RANDOM'],
  },
];

export function formatFactionName(sectorIndex: number, mode: ThemeVocabularyMode = 'AMAZONIA'): string {
  const list = DICTIONARIES[mode]['entity.faction.list'];
  const name = list[sectorIndex % list.length] || `Secteur ${sectorIndex + 1}`;
  return `S${sectorIndex + 1} (${name})`;
}

export function formatCellName(cellIndex: number, mode: ThemeVocabularyMode = 'AMAZONIA'): string {
  if (cellIndex === 0) {
    return `${DICTIONARIES[mode]['board.player.scrapyard']} (p=0)`;
  }
  return `${DICTIONARIES[mode]['board.player.cell']} ${cellIndex}`;
}

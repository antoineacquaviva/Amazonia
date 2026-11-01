import {
  BotProfileId,
  EditionPreset,
  GameParameters,
  MechanicalSwitches,
  TableConfig,
  TacticId,
  ThemeVocabularyMode,
} from './types';

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

export const TACTIC_DESCRIPTIONS: Record<
  TacticId,
  { name: string; ruleSummary: string }
> = {
  A1: {
    name: 'A1 — Avancer & Abattre',
    ruleSummary:
      "Cible la piste (avec >=1 Abatteuse) ayant le plus d'Arbres debout (égalité : Rang 1 de l'Œil). Pose des cartes en p+1 et fait avancer les Abatteuses.",
  },
  A2: {
    name: 'A2 — Abattre sur place',
    ruleSummary:
      "Cible la piste ayant l'Abatteuse la plus avancée (égalité : Rang 1 de l'Œil). Pose des cartes sur place.",
  },
  A3: {
    name: "A3 — Renforts d'abattage",
    ruleSummary:
      "Cible la piste (avec >=1 Arbre debout) ayant le moins d'Abatteuses (égalité : Rang 1 de l'Œil). Ajoute 1 Abatteuse sur son 1er Arbre debout.",
  },
  B1: {
    name: 'B1 — Nettoyage de grand chantier',
    ruleSummary:
      "Cible la piste ayant le plus de Souches (égalité : Rang n en V1, Rang 1 en V2). Carte sur l'emplacement actuel du Bulldozer.",
  },
  B2: {
    name: 'B2 — Remise en route des retardataires',
    ruleSummary:
      "Cible la piste dont le Bulldozer est le moins avancé, Casse=0 incluse (égalité : Rang n en V1, Rang 1 en V2).",
  },
  B3: {
    name: 'B3 — Terrain dégagé',
    ruleSummary:
      "Cible la piste dont le Bulldozer a le moins d'Arbres debout sur sa case (en V2 : priorité aux Bulldozers actifs en forêt p>=1).",
  },
};

export const BOT_PROFILE_META: Record<
  BotProfileId,
  { label: string; shortLabel: string; level: string; description: string }
> = {
  RANDOM: {
    label: 'Bot Aléatoire (Baseline)',
    shortLabel: 'Aléatoire (N0)',
    level: 'Baseline N0',
    description:
      'Pose ses jetons uniformément au hasard sur les emplacements légaux. Sert à valider le moteur et établir la borne basse.',
  },
  BLIND_PROB: {
    label: 'Bot Aveugle Probabiliste (Témoin Gobelet)',
    shortLabel: 'Aveugle Prob. (Témoin)',
    level: 'Témoin Sans Gobelet',
    description:
      'Utilise la même intelligence coopérative que N2 mais SANS regarder son dé sous son gobelet (joue uniquement sur les probabilités publiques P(k) de la Piste des Tactiques).',
  },
  SELFISH: {
    label: 'Bot Égoïste / Myope (Niveau 1)',
    shortLabel: 'Égoïste (N1)',
    level: 'Niveau 1',
    description:
      "Protège la menace immédiate la plus probable sans chercher à détruire les machines à plusieurs ni décoder les signaux d'équipe.",
  },
  COOPERATIVE: {
    label: 'Bot Coopératif Communicant (Niveau 2)',
    shortLabel: 'Coopératif (N2)',
    level: 'Niveau 2',
    description:
      'Utilise le protocole bayésien et les micro-cycles (verrouillage rapide si certitude externe, évitement des doublons, seuils D=2 et D=3).',
  },
  STRATEGIST: {
    label: 'Bot Stratège « Méta-Contremaître » (Niveau 3)',
    shortLabel: 'Stratège (N3)',
    level: 'Niveau 3',
    description:
      "Intègre l'Apprentissage et la Rancune dans son évaluation : pare en priorité les tactiques dangereuses en cases 1-2 et gère l'Œil.",
  },
  OMNISCIENT: {
    label: 'Bot Omniscient (Borne Haute Théorique)',
    shortLabel: 'Omniscient (Max)',
    level: 'Borne Haute',
    description:
      'Connaît les dés tirés par tous les joueurs (triche contrôlée) pour mesurer la perte liée à l’information incomplète.',
  },
};

export const V1_SWITCHES: MechanicalSwitches = {
  ruleNoTargetH1: 'V1_NO_EFFECT',
  ruleParryMode: 'V1_UNLIMITED_PER_CELL',
  rulePreventiveDestruction: 'V1_ALLOWED',
  ruleBulldozerTargeting: 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE',
  ruleScrapyardExit: 'V1_PASSIVE_D1',
  ruleInitialSetup: 'V1_SPARSE_RANK3_EMPTY',
};

export const V2_SWITCHES: MechanicalSwitches = {
  ruleNoTargetH1: 'V2_FALLBACK_DEPLOY_AND_RETREAT',
  ruleParryMode: 'V2_UNITARY_PER_CARD',
  rulePreventiveDestruction: 'V2_CARD_REQUIRED',
  ruleBulldozerTargeting: 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE',
  ruleScrapyardExit: 'V2_OFFENSIVE_D2',
  ruleInitialSetup: 'V2_SMOOTH_DENSE',
};

export const SWITCH_META: Record<
  keyof MechanicalSwitches,
  {
    index: number;
    shortCode: string;
    title: string;
    v1Value: string;
    v2Value: string;
    v1Label: string;
    v2Label: string;
    v1HumanDesc: string;
    v2HumanDesc: string;
  }
> = {
  ruleNoTargetH1: {
    index: 1,
    shortCode: 'SW1_H1',
    title: '1. Tactique Abatteuse sans cible (Cas H1)',
    v1Value: 'V1_NO_EFFECT',
    v2Value: 'V2_FALLBACK_DEPLOY_AND_RETREAT',
    v1Label: 'V1 : Aucun effet ni mouvement',
    v2Label: 'V2 : Recul Tuile + Renfort Repli en P1',
    v1HumanDesc:
      'Si A1/A2/A3 n’a aucune cible valide, aucune carte n’est posée et la tuile ne bouge pas sur la Piste des Tactiques.',
    v2HumanDesc:
      'Si A1 ou A2 ne peut poser aucune carte, sa tuile recule d’un cran vers la Case 6 (Échec) ET le Contremaître déploie en repli 1 Abatteuse en Parcelle 1 sur la piste la plus boisée.',
  },
  ruleParryMode: {
    index: 2,
    shortCode: 'SW2_PARRY',
    title: '2. Capacité de parade face aux cartes empilées (H2/H3)',
    v1Value: 'V1_UNLIMITED_PER_CELL',
    v2Value: 'V2_UNITARY_PER_CARD',
    v1Label: 'V1 : Parade illimitée par case (D=1 pare tout)',
    v2Label: 'V2 : Parade unitaire (1 Défenseur = 1 carte)',
    v1HumanDesc:
      'Un seul Défenseur (D=1) pare toutes les cartes Abattage de la case ; D=2 pare toutes les cartes Bulldozer et détruit les Abatteuses.',
    v2HumanDesc:
      'Capacité unitaire : chaque Défenseur pare exactement 1 carte Abattage. La destruction des Abatteuses exige D ≥ m_A + 1 (et D ≥ 2) ; parer totalement un Bulldozer exige D ≥ m_B + 1 et le détruire D ≥ m_B + 2.',
  },
  rulePreventiveDestruction: {
    index: 3,
    shortCode: 'SW3_PREVENTIVE',
    title: '3. Destruction préventive sans carte Manœuvre (H4/H7a)',
    v1Value: 'V1_ALLOWED',
    v2Value: 'V2_CARD_REQUIRED',
    v1Label: 'V1 : Autorisée même sans carte (avec exception H4)',
    v2Label: 'V2 : Carte Manœuvre requise sur la case',
    v1HumanDesc:
      'Les Défenseurs peuvent détruire préventivement une machine sur une case sans carte Manœuvre (nécessitant la règle d’exception H4 pour le Bulldozer réparé).',
    v2HumanDesc:
      'On ne résout que les emplacements contenant au moins une carte Manœuvre (m_A ≥ 1 ou m_B ≥ 1) : une machine inactive ce tour-ci ne peut être détruite (supprime les exceptions H4 et H7a).',
  },
  ruleBulldozerTargeting: {
    index: 4,
    shortCode: 'SW4_BULL_TARGET',
    title: "4. Ciblage de B3 & Sens de départage sur L'Œil (H3)",
    v1Value: 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE',
    v2Value: 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE',
    v1Label: 'V1 : B3 inclut Casse (0 arbre) & égalités Rang n',
    v2Label: 'V2 : B3 cible Forêt en priorité & égalités unifiées Rang 1',
    v1HumanDesc:
      'B3 considère la Casse comme ayant 0 arbre (doublon fréquent avec B2) et les égalités Bulldozer sont départagées à l’envers (Rang n).',
    v2HumanDesc:
      'B3 cible en priorité les Bulldozers actifs en forêt (ou la Parcelle 1 si tous sont en Casse), et TOUTES les égalités (A et B) sont départagées de manière unifiée vers le Rang 1 sur l’Œil.',
  },
  ruleScrapyardExit: {
    index: 5,
    shortCode: 'SW5_SCRAP_EXIT',
    title: '5. Résistance du Bulldozer à la Casse & Sortie (H5)',
    v1Value: 'V1_PASSIVE_D1',
    v2Value: 'V2_OFFENSIVE_D2',
    v1Label: 'V1 : D=1 bloque la Casse, sortie passive en P1',
    v2Label: 'V2 : D=2 bloque la Casse, sortie offensive (rase 1 souche)',
    v1HumanDesc:
      'À la Casse, 1 seul Défenseur bloque la réparation ; si réparé (D=0), le Bulldozer rejoint simplement la Parcelle 1 sans raser de souche.',
    v2HumanDesc:
      'Harmonisation Casse/Forêt : il faut D ≥ m_B + 1 (2 Défenseurs) pour bloquer la réparation, D=1 donne une sortie simple en P1, et D=0 déclenche une sortie offensive qui rejoint et rase immédiatement 1 Souche.',
  },
  ruleInitialSetup: {
    index: 6,
    shortCode: 'SW6_SETUP',
    title: "6. Mise en place initiale selon L'Œil",
    v1Value: 'V1_SPARSE_RANK3_EMPTY',
    v2Value: 'V2_SMOOTH_DENSE',
    v1Label: 'V1 : Rang 3 démarre à 0 Abatteuse (creux asymétrique)',
    v2Label: 'V2 : Départ lissé et dense (1 Abatteuse partout + Souches R1/R2)',
    v1HumanDesc:
      'Le Peuple au Rang 3 démarre sans aucune Abatteuse tandis que le Rang 1 subit d’emblée Souche + Abatteuse + Bulldozer actif.',
    v2HumanDesc:
      'Mise en place lissée : Rang 1 (1 Souche + Bulldozer en P1, 1 Abatteuse en P2), Rang 2 (1 Souche + 1 Abatteuse en P1), Rangs 3..n (1 Abatteuse en P1). Aucun secteur ne démarre vide.',
  },
};

export const SWITCH_KEYS: Array<keyof MechanicalSwitches> = [
  'ruleNoTargetH1',
  'ruleParryMode',
  'rulePreventiveDestruction',
  'ruleBulldozerTargeting',
  'ruleScrapyardExit',
  'ruleInitialSetup',
];

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
  ...V1_SWITCHES,
};

export const BUILTIN_EDITIONS: EditionPreset[] = [
  {
    id: 'ed-v1-original',
    name: 'Édition 1.0 — Règles Originales',
    version: '1.0.0',
    description:
      'Spécification initiale d’Amazonia : parade illimitée par case, destruction préventive sans carte (exception H4), départage inversé des Bulldozers sur l’Œil et Rang 3 démarrant sans Abatteuse.',
    createdAt: '2026-10-01T00:00:00.000Z',
    isBuiltIn: true,
    switches: { ...V1_SWITCHES },
    defaultParams: { ...DEFAULT_GAME_PARAMETERS, ...V1_SWITCHES },
  },
  {
    id: 'ed-v2-refonte',
    name: 'Édition 2.0 — Refonte Coopérative & Simplifiée',
    version: '2.0.0',
    description:
      'Édition améliorée issue des campagnes Monte-Carlo : parade unitaire (1 Défenseur = 1 carte), repli actif en H1, carte requise pour détruire une machine (suppression de H4/H7a), départage unifié au Rang 1 et sortie offensive de la Casse.',
    createdAt: '2026-11-01T00:00:00.000Z',
    isBuiltIn: true,
    switches: { ...V2_SWITCHES },
    defaultParams: { ...DEFAULT_GAME_PARAMETERS, ...V2_SWITCHES },
  },
];

export const DEFAULT_TABLE_CONFIGS: TableConfig[] = [
  {
    id: 'table_coop_n2',
    name: 'Équipe Coopérative Standard (N2)',
    description:
      'Tous les joueurs utilisent le protocole de communication muette et visent les destructions coordonnées.',
    botProfiles: ['COOPERATIVE'],
  },
  {
    id: 'table_strategist_n3',
    name: 'Équipe Experte « Méta-Contremaître » (N3)',
    description:
      'Tous les joueurs anticipent en plus la Piste des Tactiques et la Rancune sur l’Œil.',
    botProfiles: ['STRATEGIST'],
  },
  {
    id: 'table_selfish_n1',
    name: 'Équipe Égoïste / Sans Coordination (N1)',
    description:
      'Joueurs myopes jouant chacun selon leur probabilité locale sans décoder les signaux des alliés.',
    botProfiles: ['SELFISH'],
  },
  {
    id: 'table_blind_prob',
    name: 'Équipe Aveugle Probabiliste (Témoin Sans Gobelet)',
    description:
      'Joueurs coopératifs ne regardant PAS leur dé sous le gobelet (défense basée uniquement sur les probabilités publiques).',
    botProfiles: ['BLIND_PROB'],
  },
  {
    id: 'table_mixed_heterogeneous',
    name: 'Table Mixte Hétérogène (1 Stratège, 2 Coopératifs, 1 Égoïste)',
    description:
      'Simule une table réaliste avec un joueur expert, deux joueurs communicants et un joueur novice/myope.',
    botProfiles: ['STRATEGIST', 'COOPERATIVE', 'COOPERATIVE', 'SELFISH'],
  },
  {
    id: 'table_omniscient',
    name: 'Borne Haute Omnisciente (Information Parfaite)',
    description:
      'Équipe connaissant tous les tirages secrets (mesure le plafond théorique de la variante).',
    botProfiles: ['OMNISCIENT'],
  },
  {
    id: 'table_random',
    name: 'Baseline Aléatoire (Borne Basse)',
    description:
      'Placements uniformes au hasard pour mesurer le plancher de survie naturelle de la forêt.',
    botProfiles: ['RANDOM'],
  },
];

/**
 * Compte combien d'interrupteurs diffèrent de l'Édition 1.0 de référence
 */
export function countSwitchesChangedFromV1(switches: MechanicalSwitches): number {
  let count = 0;
  for (const key of SWITCH_KEYS) {
    if (switches[key] !== V1_SWITCHES[key]) count++;
  }
  return count;
}

/**
 * Génère automatiquement un résumé comparatif en français naturel (« Diff Humain »)
 * entre deux ensembles d'interrupteurs (ex: Édition A vs Édition B).
 */
export function generateHumanRuleDiff(
  switchesA: MechanicalSwitches,
  switchesB: MechanicalSwitches,
  nameA = 'Édition A',
  nameB = 'Édition B'
): {
  changedCount: number;
  unchangedCount: number;
  diffItems: Array<{
    key: keyof MechanicalSwitches;
    title: string;
    changed: boolean;
    labelA: string;
    labelB: string;
    explanation: string;
  }>;
  summaryText: string[];
} {
  const diffItems: Array<{
    key: keyof MechanicalSwitches;
    title: string;
    changed: boolean;
    labelA: string;
    labelB: string;
    explanation: string;
  }> = [];
  const summaryText: string[] = [];
  let changedCount = 0;

  for (const key of SWITCH_KEYS) {
    const meta = SWITCH_META[key];
    const valA = switchesA[key];
    const valB = switchesB[key];
    const isChanged = valA !== valB;
    if (isChanged) changedCount++;

    const labelA = valA === meta.v1Value ? meta.v1Label : meta.v2Label;
    const labelB = valB === meta.v1Value ? meta.v1Label : meta.v2Label;
    const descB = valB === meta.v1Value ? meta.v1HumanDesc : meta.v2HumanDesc;

    diffItems.push({
      key,
      title: meta.title,
      changed: isChanged,
      labelA,
      labelB,
      explanation: descB,
    });

    if (isChanged) {
      summaryText.push(
        `[MODIFIÉ] ${meta.title} : passe de « ${labelA} » (${nameA}) à « ${labelB} » (${nameB}). → ${descB}`
      );
    } else {
      summaryText.push(
        `[IDENTIQUE] ${meta.title} : conserve « ${labelA} ».`
      );
    }
  }

  return {
    changedCount,
    unchangedCount: SWITCH_KEYS.length - changedCount,
    diffItems,
    summaryText,
  };
}

export function formatFactionName(
  sectorIndex: number,
  mode: ThemeVocabularyMode = 'AMAZONIA'
): string {
  const list = DICTIONARIES[mode]['entity.faction.list'];
  const name = list[sectorIndex % list.length] || `Secteur ${sectorIndex + 1}`;
  return `S${sectorIndex + 1} (${name})`;
}

export function formatCellName(
  cellIndex: number,
  mode: ThemeVocabularyMode = 'AMAZONIA'
): string {
  if (cellIndex === 0) {
    return `${DICTIONARIES[mode]['board.player.scrapyard']} (p=0)`;
  }
  return `${DICTIONARIES[mode]['board.player.cell']} ${cellIndex}`;
}

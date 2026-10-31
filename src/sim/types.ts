export type TacticId = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';

export type DiceDrawMode = 'MIN_2D6' | '1D6' | 'MAX_2D6';
export type CellResolutionMode = 'TRANSACTION_FIGEE' | 'SEQUENTIEL';
export type ScrapyardOrderMode = 'AVANT_PARCELLE_1' | 'APRES_PARCELLE_Q';
export type TacticUpdateOrderMode = 'ORDRE_PISTE_TAC' | 'FIXE';
export type GrudgeGranularityMode = 'PAR_CASE' | 'PAR_EVENEMENT' | 'CARTE_ET_DESTRUCTION';

export type BotProfileId =
  | 'RANDOM'       // Baseline: Aléatoire uniforme
  | 'SELFISH'      // Niveau 1: Égoïste / Myope
  | 'COOPERATIVE'  // Niveau 2: Coopératif Communicant (Bayésien + Micro-cycles)
  | 'STRATEGIST'   // Niveau 3: Stratège « Méta-Contremaître » (Apprentissage + Rancune)
  | 'OMNISCIENT';  // Borne Haute Théorique: Omniscient

export type ThemeVocabularyMode = 'AMAZONIA' | 'ABSTRACT';

export interface GameParameters {
  n: number;                                      // Nombre de joueurs / Secteurs Forestiers [3..6], défaut 4
  q: number;                                      // Nombre de Parcelles par piste (>= 3), défaut 6
  a: number;                                      // Nombre initial d'arbres par Parcelle (>= 1), défaut 2
  asymmetricTrees?: number[];                     // Optionnel: vecteur [a_1, ..., a_q] si asymétrique
  x: number;                                      // Nombre total de tours (>= 1), défaut 8
  stockAbatteuses: number | null;                 // null = infini, sinon entier >= 1
  modeTirageDes: DiceDrawMode;                    // défaut 'MIN_2D6'
  modeResolutionParcelle: CellResolutionMode;     // défaut 'TRANSACTION_FIGEE'
  ordreCasse: ScrapyardOrderMode;                 // défaut 'AVANT_PARCELLE_1'
  immobiliteReparation: boolean;                  // défaut true
  ordreMajTactiques: TacticUpdateOrderMode;       // défaut 'ORDRE_PISTE_TAC'
  rancuneTerrassementDegrade: boolean;            // défaut false
  granulariteRancune: GrudgeGranularityMode;      // défaut 'PAR_CASE'
  nbRegeneration: number;                         // défaut 1
  rMaxCycles: number;                             // Nombre max de micro-cycles Étape 2, défaut 5
}

export interface TableConfig {
  id: string;
  name: string;
  description: string;
  botProfiles: BotProfileId[]; // Si longueur < n, répété cycliquement pour couvrir n joueurs
}

export interface SectorState {
  sectorIndex: number; // 0-indexed en interne (affiché 1..n)
  initialEyeRank: number; // Rang initial (1..n) lors du setup
  standingTrees: number[]; // Taille q+1 (index 0 = Casse toujours 0, index 1..q = Parcelles)
  stumps: number[];        // Taille q+1 (index 0 = Casse toujours 0, index 1..q = Parcelles)
  initialCapacity: number[]; // Taille q+1 (index 0 = 0, index 1..q = a_p)
  harvesters: number[];    // Taille q+1 (index 0 = 0, index 1..q = H_{i,p})
  bulldozerPos: number;    // 0 = Casse, 1..q = Parcelle
}

export interface ForemanBrainState {
  tacticsTrack: TacticId[]; // Longueur 6 (index 0 = Case 1 .. index 5 = Case 6)
  eyeTrack: number[];       // Longueur n (index 0 = Rang 1 .. index n-1 = Rang n), valeurs = sectorIndex (0..n-1)
}

export interface DefenderTokenPlacement {
  playerIndex: number;
  mainCell: number;         // Emplacement 0..q sur sa propre piste (playerIndex)
  supportSector: number;    // Piste alliée != playerIndex
  supportCell: number;      // Emplacement 0..q sur la piste alliée
  lockCycle: number;        // Micro-cycle (1..rMax) auquel le jeton 2 a été verrouillé
}

export interface MicroCycleStepLog {
  cycle: number;
  proposals: Array<{
    playerIndex: number;
    targetSector: number;
    targetCell: number;
    status: 'THINKING' | 'LOCKED';
    reason: string;
  }>;
}

export type CardResolutionStatus = 'SUCCESS' | 'FAIL_PARRIED' | 'FAIL_NO_TARGET';

export interface CellResolutionLog {
  sectorIndex: number;
  cellIndex: number; // 0 = Casse, 1..q = Parcelle
  defendersCount: number;
  harvesterCards: TacticId[];
  bulldozerCards: TacticId[];
  harvesterStatuses: CardResolutionStatus[];
  bulldozerStatuses: CardResolutionStatus[];
  treesCut: number;
  stumpsCleared: number;
  harvestersDestroyed: number;
  bulldozerDestroyed: boolean;
  bulldozerRepaired: boolean;
  degradedBulldozer: boolean;
  grudgeIncrement: number;
  tacticsMoved: Array<{ tactic: TacticId; fromSlot: number; toSlot: number; status: CardResolutionStatus }>;
}

export interface EdgeCaseCounts {
  H1_noTargetEligible: number;          // Tactique A1/A2/A3 sans piste éligible ou abatteuse en q pour A1
  H2_multipleHarvesterCardsSingleTree: number; // Superposition >=2 cartes A sur 1 seul arbre debout
  H3_multipleBulldozerCardsSameCell: number;   // Superposition >=2 cartes B sur même emplacement
  H4_repairedBulldozerImmunityInCell1: number; // Bulldozer réparé en p=0 rejoignant p=1 où D >= 3
  H5_degradedBulldozerNoGrudge: number;        // D=1 face à un Bulldozer en p>=1 avec souche
  H6_multiEventSameCellSingleGrudge: number;   // Plusieurs parades/destructions sur la même case
  H7_preventiveDestructionNoCard: number;      // Machine détruite par D>=2 ou D>=3 sans carte Manœuvre
  H7_emptyCellOverDefense: number;             // Défenseurs posés sur une case sans carte ni machine
}

export interface InvariantViolation {
  code: 'I1_TREE_CONSERVATION' | 'I2_MACHINE_BOUNDS' | 'I3_BRAIN_PERMUTATION' | 'I4_DEFENDER_LEGALITY' | 'DEADLOCK_CYCLE' | 'UNWINNABLE_EARLY_WIPEOUT';
  turn: number;
  phase: string;
  message: string;
  seed: number;
}

export interface TurnTrace {
  turn: number;
  tacticsTrackStart: TacticId[];
  eyeTrackStart: number[];
  diceRolls: Array<{
    playerIndex: number;
    d1: number;
    d2: number;
    chosenSlot: number; // 1..6
    tactic: TacticId;
  }>;
  step1Defenders: number[]; // Pour chaque joueur j, emplacement c_{j,1}
  microCycles: MicroCycleStepLog[];
  finalDefenders: DefenderTokenPlacement[];
  defendersGrid: number[][]; // [sector][cell] -> D_{i,p}
  targetedActions: Array<{
    playerIndex: number;
    tactic: TacticId;
    targetSector: number | null;
    cardsPlaced: Array<{ cell: number; count: number }>;
  }>;
  harvesterMovesA1: Array<{ sectorIndex: number; fromCell: number; toCell: number; count: number }>;
  harvesterReinforcementsA3: Array<{ sectorIndex: number; cell: number; count: number; cappedByStock: boolean }>;
  resolutions: CellResolutionLog[];
  repositionings: Array<{
    sectorIndex: number;
    machineType: 'HARVESTER' | 'BULLDOZER';
    fromCell: number;
    toCell: number;
    count: number;
  }>;
  tacticsTrackEnd: TacticId[];
  eyeTrackEnd: number[];
  standingTreesEnd: number;
  stumpsEnd: number;
  clearedEnd: number;
  activeHarvestersEnd: number;
  activeBulldozersEnd: number;
  dilemmaEventsCount: number; // Nombre de décisions où l'écart entre le 1er et 2e choix < 15%
  totalDecisionsCount: number;
}

export type VictoryBracket = 'MIRACLE' | 'MAJOR_VICTORY' | 'COSTLY_VICTORY' | 'DEFEAT';

export interface SingleGameResult {
  seed: number;
  params: GameParameters;
  tableConfigId: string;
  botProfiles: BotProfileId[];
  rawScore: number;            // Score_brut
  meanScorePerPlayer: number;  // Score_moy = Score_brut / n
  normalizedScore: number;     // Score_norm in [0, 1]
  victoryBracket: VictoryBracket;
  regeneratedTreesTotal: number;
  standingBeforeRegen: number;
  perSectorFinalTrees: number[]; // Indexé par sectorIndex (0..n-1)
  perInitialRankFinalTrees: number[]; // Indexé par Rang initial sur l'Œil (0 = Rang 1 .. n-1 = Rang n)
  totalHarvestersSpawned: number;
  totalHarvestersDestroyed: number;
  totalBulldozersDestroyed: number;
  totalBulldozersRepaired: number;
  meanActiveHarvestersPerTurn: number;
  totalCardsPlaced: number;
  totalCardsSucceeded: number;
  totalCardsParried: number;
  totalCardsNoTarget: number;
  defenderThresholdCounts: {
    d1: number;
    d2: number;
    d3Plus: number;
  };
  wastedDefendersCount: number;
  overkillAvoidedInStep2: number;
  coordinatedDestructionsCount: number; // Destructions ayant requis le jeton de soutien d'un allié
  meanStep2LockCycle: number;
  meanBrainPermutationsPerTurn: number;
  meanRepositioningsPerTurn: number;
  dilemmaRate: number; // Proportion de choix tendus (< 15% d'écart d'utilité)
  threatToDefenseRatio: number; // Ratio cellules menacées / jetons disponibles
  tacticSlot1Turns: Record<TacticId, number>; // Nombre de fins de tour où chaque tactique est en Case 1
  edgeCases: EdgeCaseCounts;
  violations: InvariantViolation[];
  stagnantTurns: number;
  earlyWipeoutTurn: number | null;
  traces?: TurnTrace[]; // Présent si l'enregistrement détaillé est activé (échantillon ou anomalie)
  textualJournal?: string;
}

export interface FourCriteriaEvaluation {
  simplicityErgonomics: {
    score: number; // 0..100
    directResolutionRate: number; // % de cartes à effet direct (non 'sans objet')
    meanManipulationsPerTurn: number; // Permutations Cerveau + repositionnements fin de tour
    meanNegotiationCycles: number; // Micro-cycles moyens avant verrouillage
    edgeCaseFrequencyPerGame: number;
    interpretation: string;
  };
  strategicInterest: {
    score: number; // 0..100
    skillGapStrategistVsSelfish: number; // Gain normalisé N3 vs N1
    skillGapSelfishVsRandom: number;     // Gain normalisé N1 vs Aléatoire
    tacticSlot1Entropy: number;          // Entropie de Shannon normalisée [0..1] des tactiques en Case 1
    initialRankFairnessIndex: number;    // [0..1] 1 - dispersion entre les Rangs initiaux sur l'Œil
    interpretation: string;
  };
  tensionToughChoices: {
    score: number; // 0..100
    dilemmaFrequency: number;            // % de décisions avec utilités proches (<15%)
    pressureToDefenseRatio: number;      // Ratio moyen menaces / défenseurs
    closeGameRate: number;               // % de parties proches des seuils de bascule ou gagnées grâce à la régénération
    survivalSweetSpotProximity: number;  // Proximité de la zone de tension optimale (55% - 78% de préservation)
    interpretation: string;
  };
  collaborationInterest: {
    score: number; // 0..100
    communicationGainCoopVsSelfish: number; // Gain normalisé N2 (Communicant) vs N1 (Myope)
    coordinatedDestructionRate: number;     // Fréquence des destructions collectives (D=2 et D>=3)
    overkillReductionEfficiency: number;    // Réduction du gaspillage grâce aux micro-cycles
    informationEfficiencyVsOmniscient: number; // Ratio (Coop - Selfish) / (Omniscient - Selfish)
    interpretation: string;
  };
  overallDesignScore: number; // Moyenne pondérée sur 100
}

export interface TableConfigSummary {
  tableConfigId: string;
  tableConfigName: string;
  botProfiles: BotProfileId[];
  gamesCount: number;
  meanRawScore: number;
  meanScorePerPlayer: number;
  meanNormalizedScore: number;
  stdDevNormalizedScore: number;
  medianNormalizedScore: number;
  decilesNormalizedScore: number[]; // D1..D9
  victoryBracketsRate: Record<VictoryBracket, number>;
  perInitialRankMeanTrees: number[]; // En arbres sauvés sur a*q
  meanHarvestersActive: number;
  meanHarvestersSpawned: number;
  meanHarvestersDestroyed: number;
  meanBulldozerTripsToScrap: number;
  cardParriedRate: number;
  cardNoTargetRate: number;
  cardSuccessRate: number;
  wastedDefenderRate: number;
  d1Rate: number;
  d2Rate: number;
  d3PlusRate: number;
  tacticSlot1Distribution: Record<TacticId, number>;
}

export interface VariantEvaluationResult {
  variantId: string;
  variantLabel: string;
  params: GameParameters;
  tableSummaries: TableConfigSummary[];
  criteria: FourCriteriaEvaluation;
  edgeCaseTotals: EdgeCaseCounts;
  sampleTraces: Array<{
    seed: number;
    tableConfigName: string;
    rawScore: number;
    normalizedScore: number;
    victoryBracket: VictoryBracket;
    tag: 'TYPICAL' | 'HIGH_TENSION' | 'ANOMALY' | 'EDGE_CASE_HEAVY';
    textualJournal: string;
  }>;
}

export interface ParameterSweepInput {
  nValues: number[];
  qValues: number[];
  aValues: number[];
  xValues: number[];
  stockAbatteusesValues: Array<number | null>;
  modeTirageDesValues: DiceDrawMode[];
  modeResolutionParcelleValues: CellResolutionMode[];
  ordreCasseValues: ScrapyardOrderMode[];
  immobiliteReparationValues: boolean[];
  ordreMajTactiquesValues: TacticUpdateOrderMode[];
  rancuneTerrassementDegradeValues: boolean[];
  granulariteRancuneValues: GrudgeGranularityMode[];
  nbRegenerationValues: number[];
}

export interface CampaignConfig {
  id: string;
  name: string;
  type: 'EVALUATION_SWEEP' | 'ORACLE_STRESS_TEST';
  createdAt: string;
  gamesPerVariantAndTable: number;
  sweep: ParameterSweepInput;
  selectedTableConfigs: TableConfig[];
  includeCalibrationTables: boolean; // Exécute auto Aléatoire, N1, N2, N3, Omniscient pour la précision des 4 critères
  // Spécifique à ORACLE_STRESS_TEST:
  targetDurationSeconds?: number | null; // ex: 3600 (1h), 14400 (4h), ou null (Basé sur maxTotalGames)
  maxTotalGames?: number;                // ex: 100000, 1000000
  randomizeParametersInStress?: boolean;
  baseSeed: number;
}

export interface StressTestTelemetry {
  totalGamesSimulated: number;
  totalTurnsSimulated: number;
  elapsedSeconds: number;
  gamesPerSecond: number;
  invariantsVerifiedCount: number;
  violationsCount: number;
  violationsLog: InvariantViolation[];
  stagnantGamesCount: number;
  earlyWipeoutGamesCount: number;
  tacticMonopolyGamesCount: number; // Parties où 1 tactique est restée en Case 1 100% du temps
  omniscientUnwinnableSeedsCount: number; // Graines où même le Bot Omniscient échoue (< 50% arbres)
  edgeCaseOccurrences: EdgeCaseCounts;
  scoreDistributionByBotLevel: Record<BotProfileId, {
    games: number;
    meanNormalized: number;
    minNormalized: number;
    maxNormalized: number;
    defeatRate: number;
    miracleRate: number;
  }>;
  capturedExtremeLogs: Array<{
    seed: number;
    category: 'INVARIANT_VIOLATION' | 'EARLY_WIPEOUT' | 'STAGNATION' | 'TACTIC_MONOPOLY' | 'OMNISCIENT_DEFEAT' | 'RECORD_EDGE_CASES';
    summary: string;
    params: GameParameters;
    textualJournal: string;
  }>;
}

export interface CampaignRecord {
  id: string;
  config: CampaignConfig;
  status: 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'STOPPED' | 'ERROR';
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  progress: {
    completedGames: number;
    totalTargetGames: number;
    completedVariants: number;
    totalVariants: number;
    elapsedSeconds: number;
    gamesPerSecond: number;
    currentPhaseLabel: string;
  };
  variantResults: VariantEvaluationResult[];
  stressTelemetry?: StressTestTelemetry;
  errorMessage?: string;
}

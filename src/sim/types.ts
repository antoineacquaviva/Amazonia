export type TacticType = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';
export type MachineType = 'A' | 'B';
export type MachineStatus = 'NORMAL' | 'HS' | 'DESTROYED';
export type DefenderTrackType = 'TACTICAL' | 'STEALTH';

export type BotProfileId =
  | 'RANDOM'                 // Bot Naïf / Aléatoire
  | 'COMBAT_PURE'            // Bot « Combat Pur » (Réactif)
  | 'HYBRID_STEALTH_COMBAT'  // Bot « Hybride Furtivité + Combat » (Proactif)
  | 'OMNISCIENT';            // Bot « Omniscient » (Borne Haute Théorique)

export interface InitialMachineConfig {
  harvesterPos: number;           // Case initiale Abatteuse (>= 1), défaut 1
  harvesterStatus: 'NORMAL' | 'HS';
  bulldozerPos: number;           // Case initiale Bulldozer (>= 1), défaut 1
  bulldozerStatus: 'NORMAL' | 'HS';
  initialStumpsCell1: number;     // Souches initiales en case 1 (>= 0), défaut 0
}

export interface SimulationConfig {
  numPlayers: number;                    // N in {3, 4, 5, 6}, défaut 4
  numTurns: number;                      // X >= 1, défaut 8
  initialTreesPerCell: number;           // a >= 1, défaut 3
  tacticsTrackSetup: TacticType[];       // Longueur 6, défaut ['A1','B1','A2','B2','A3','B3']
  shuffleTacticsTrack: boolean;          // Si true, mélange tacticsTrackSetup en début de partie
  initialMachinesState: InitialMachineConfig[]; // Taille N
  overheatIncludesBaseAction: boolean;   // Variable D (Surchauffe A2/B2) : false = D1, true = D2
  assaultIncludesBaseAction: boolean;    // Variable D (Assaut A3/B3) : false = D1, true = D2
  overheatStacksTreeRemoval: boolean;    // Si k>=2 Surchauffes sans Assaut : true = enlève k arbres, false = 1
  endOfGameRegeneration: boolean;        // Fin de partie : 1 souche -> 1 arbre debout sur chaque case ayant >= 1 souche
}

export type GameParameters = SimulationConfig;

export interface ForestCellState {
  cellIndex: number;              // c >= 1 (1-based)
  standingTrees: number;          // Arbres debout
  stumps: number;                 // Souches
  hasTrap: boolean;               // Jeton Piège (max 1 par case)
  tacticalDefenders: number;      // Jetons Défenseurs posés sur la Piste Tactique ce tour-ci
  stealthDefenders: number;       // Jetons Défenseurs posés sur la Piste Furtivité ce tour-ci
  faceUpCards: TacticType[];      // Cartes posées face visible ce tour-ci (génèrent un combat)
  faceDownCards: TacticType[];    // Cartes posées face cachée ce tour-ci (génèrent une réparation)
  explodedHereThisTurn: boolean;  // Machine entrée et explosée sur cette case ce tour-ci
}

export interface MachineState {
  type: MachineType;              // 'A' (Abatteuse) ou 'B' (Bulldozer)
  status: MachineStatus;          // 'NORMAL' | 'HS' | 'DESTROYED'
  position: number | null;        // c >= 1 ou null si 'DESTROYED'
  startOfTurnPosition: number | null; // Position au tout début du tour avant Étape 3.1
  hasSabotage: boolean;           // Jeton Sabotage (max 1 par machine)
}

export interface PlayerForestGroup {
  playerIndex: number;            // 0 .. N-1 (correspond à J_1 .. J_N)
  rankOnEvilEye: number;          // 1 .. N
  cells: ForestCellState[];       // Cases allouées (1 .. maxCells)
  harvester: MachineState;
  bulldozer: MachineState;
}

export interface SecretVillainDraw {
  rollerPlayerIndex: number;      // Joueur k (0..N-1) qui a lancé les dés
  d1: number;                     // Dé Majeur (1..6, ligne de la matrice)
  d2: number;                     // Dé Mineur (1..6, colonne de la matrice)
  mIndex: number;                 // M = min(d1, d2) in 1..6
  tactic: TacticType;             // T_k = tacticsTrack[M - 1]
  targetPlayerIndex: number;      // P_k (0..N-1) déterminé par la Matrice Maîtresse 2D6
}

export interface DefenderPlacementDecision {
  playerIndex: number;            // Joueur k qui place son jeton
  step: 1 | 2;                    // 1 = Défense principale (P=k), 2 = Soutien (P!=k)
  targetPlayerIndex: number;      // Piste choisie
  cellIndex: number;              // Case c >= 1
  track: DefenderTrackType;       // 'TACTICAL' ou 'STEALTH'
  reason: string;
}

export interface CombatCellLog {
  playerIndex: number;
  cellIndex: number;
  faceUpCards: TacticType[];
  engagedHarvester: boolean;
  engagedBulldozer: boolean;
  tacticalDefenders: number;
  trapBonus: number;
  sabotageBonus: number;
  defenseScoreS: number;
  assaultCountK: number;
  outcome: 'ATTACK_SUCCESS' | 'SIMPLE_PARRY' | 'PARRY_AND_HS';
  harvesterExploded: boolean;
  bulldozerExploded: boolean;
  treesCutToStumps: number;       // Abattages (Arbre debout -> Souche)
  stumpsCleared: number;          // Terrassements (Souches retirées)
  treesRemovedByOverheat: number; // Pions retirés directement par Surchauffe A2/B2
  treesDestroyedByExplosion: number; // Pions détruits par Explosion
  harvesterBecameHS: boolean;
  bulldozerBecameHS: boolean;
}

export interface StealthCellLog {
  playerIndex: number;
  cellIndex: number;
  stealthDefenders: number;
  outcome: 'SABOTAGE_PLACED' | 'TRAP_PLACED' | 'FAILED_VACATED_OR_EXPLODED';
  sabotagedMachines: MachineType[];
}

export interface RepairCellLog {
  playerIndex: number;
  cellIndex: number;
  faceDownCards: TacticType[];
  harvesterRepaired: boolean;
  bulldozerRepaired: boolean;
}

export interface TurnTrace {
  turn: number;
  draws: SecretVillainDraw[];
  placements: DefenderPlacementDecision[];
  cardPlacements: Array<{
    fromPlayerIndex: number;
    targetPlayerIndex: number;
    tactic: TacticType;
    machineType: MachineType;
    machineStatusBefore: MachineStatus;
    placedCell: number | null;
    faceUp: boolean;
    ignoredBecauseDestroyed: boolean;
  }>;
  machineMoves: Array<{
    playerIndex: number;
    machineType: MachineType;
    fromCell: number;
    toCell: number;
  }>;
  combats: CombatCellLog[];
  stealthActions: StealthCellLog[];
  repairs: RepairCellLog[];
  treesLostThisTurnPerPlayer: number[]; // Arbres debout ou détruits perdus ce tour par joueur J1..JN
  totalTreesLostThisTurn: number;
  endOfTurnSnapshot: Array<{
    playerIndex: number;
    harvesterPos: number | null;
    harvesterStatus: MachineStatus;
    harvesterSabotaged: boolean;
    bulldozerPos: number | null;
    bulldozerStatus: MachineStatus;
    bulldozerSabotaged: boolean;
    trappedCells: number[];
  }>;
}

export interface InvariantViolationReport {
  code:
    | 'I1_SAME_TURN_COMBAT_HS_REPAIRED'
    | 'I2_NEGATIVE_TREES_OR_STUMPS'
    | 'I3_DEFENDER_COUNT_MISMATCH'
    | 'I4_INVALID_TRAP_OR_SABOTAGE';
  turn: number;
  phase: string;
  message: string;
  seed: number;
}

export type VictoryBracket =
  | 'MIRACLE'         // >= 85% survie sur l'horizon de référence
  | 'MAJOR_VICTORY'   // 65% .. 85%
  | 'COSTLY_VICTORY'  // 45% .. 65%
  | 'DEFEAT';         // < 45%

export interface SingleGameResult {
  seed: number;
  params: SimulationConfig;
  tableConfigId: string;
  botProfiles: BotProfileId[];
  allocatedCellsPerTrack: number;
  initialTotalTreesAllocated: number;
  referenceHorizonTrees: number;        // N * X * a (horizon de référence de la spécification)
  finalStandingTreesTotal: number;
  totalTreesLost: number;               // Arbres perdus sur toute la partie (après régénération éventuelle)
  survivalRateHorizon: number;          // Ratio de survie sur l'horizon N * X * a (borné dans [0, 1])
  survivalRateVisited: number;          // Ratio de survie sur les cases visitées (1 .. maxPos+1)
  regeneratedTreesCount: number;
  victoryBracket: VictoryBracket;

  // Pertes par tour (taille X) et par joueur (taille N)
  treesLostPerTurn: number[];
  treesLostPerPlayer: number[];
  survivingTreesPerPlayerOnHorizon: number[];

  // Compteurs d'événements de la partie (Section 7.3)
  cutsCount: number;                    // Nombre d'arbres abattus (Arbre -> Souche)
  clearingsCount: number;               // Nombre d'actions de Terrassement exécutées
  stumpsClearedCount: number;           // Nombre total de souches rasées
  overheatTriggersCount: number;        // Nombre de Surchauffes (A2/B2) subies en combat
  overheatTreesRemovedCount: number;    // Nombre de pions retirés par Surchauffe
  assaultTriggersCount: number;         // Nombre de cartes Assaut (A3/B3) résolues en combat
  simpleParriesCount: number;           // Nombre de Parades simples (S == 2 + k_assault)
  parryAndHSCount: number;              // Nombre de Parades + Mise HS (S >= 3 + k_assault)
  explosionsCount: number;              // Nombre d'Explosions (A2+A3 ou B2+B3)
  trapsPlacedCount: number;             // Nombre de Pièges posés en Furtivité
  sabotagesPlacedCount: number;         // Nombre de Sabotages posés en Furtivité
  stealthFailuresCount: number;         // Nombre d'échecs de Furtivité (>=2 jetons sur case quittée/explosée)
  repairsCount: number;                 // Nombre de réparations réussies en Étape 3.4
  respiteDrawsOnDestroyedCount: number; // Nombre de tirages sans effet sur machine détruite (Arbitrage C1)
  tacticalDefendersPlaced: number;
  stealthDefendersPlaced: number;

  violations: InvariantViolationReport[];
  traces?: TurnTrace[];
  textualJournal?: string;
}

export interface TableConfig {
  id: string;
  name: string;
  description: string;
  botProfiles: BotProfileId[];
}

export interface TableConfigSummary {
  tableConfigId: string;
  tableConfigName: string;
  botProfiles: BotProfileId[];
  gamesCount: number;
  meanSurvivalRateHorizon: number;
  stdDevSurvivalRateHorizon: number;
  meanSurvivalRateVisited: number;
  meanTreesLostTotal: number;
  stdDevTreesLostTotal: number;
  meanTreesLostPerTurn: number[];       // Moyenne par tour (t = 1..X)
  stdDevTreesLostPerTurn: number[];     // Écart-type par tour (t = 1..X)
  meanTreesLostPerPlayer: number[];     // Moyenne par joueur (J1..JN)
  stdDevTreesLostPerPlayer: number[];   // Écart-type par joueur (J1..JN)
  victoryBracketsRate: Record<VictoryBracket, number>;

  // Moyennes par partie des événements (Section 7.3)
  meanCuts: number;
  meanClearings: number;
  meanStumpsCleared: number;
  meanOverheats: number;
  meanOverheatTreesRemoved: number;
  meanAssaults: number;
  meanSimpleParries: number;
  meanParryAndHS: number;
  meanExplosions: number;
  meanTrapsPlaced: number;
  meanSabotagesPlaced: number;
  meanRepairs: number;
  meanRespiteDraws: number;
}

export interface FourCriteriaEvaluation {
  // 1. Intérêt Stratégique & Synergie Furtivité (/100)
  strategicAndStealthSynergy: {
    score: number;
    combatVsRandomGainScore: number;    // /50
    hybridVsCombatGainScore: number;    // /50
    deltaCombatVsRandom: number;
    deltaHybridVsCombat: number;
    interpretation: string;
  };
  // 2. Tension & Courbe d'Attrition (/100)
  tensionAndAttrition: {
    score: number;
    survivalTargetProximityScore: number; // /50
    hsAndExplosionDynamicsScore: number;  // /50
    meanSurvivalHorizon: number;
    meanExplosionsPerGame: number;
    meanParryAndHSPerGame: number;
    interpretation: string;
  };
  // 3. Efficacité de la Coordination & des Seuils S (/100)
  coordinationEfficiency: {
    score: number;
    parryAndKnockoutRateScore: number;  // /60
    stealthConversionRateScore: number; // /40
    combatSuccessDefenseRate: number;
    trapsAndSabotagesPerGame: number;
    interpretation: string;
  };
  // 4. Équité d'Exposition sur l'Œil (J1 .. JN) (/100)
  evilEyeFairness: {
    score: number;
    j1VsOthersRatio: number;
    playerLossSpread: number;
    interpretation: string;
  };
  overallDesignScore: number; // Moyenne sur 100
}

export interface VariantEvaluationResult {
  variantId: string;
  variantLabel: string;
  optionDTag: 'D1_NONE' | 'D2_OVERHEAT_ONLY' | 'D2_ASSAULT_ONLY' | 'D2_BOTH';
  params: SimulationConfig;
  tableSummaries: TableConfigSummary[];
  criteria: FourCriteriaEvaluation;
  invariantViolationsCount: number;
  sampleTraces: Array<{
    seed: number;
    tableConfigName: string;
    survivalRateHorizon: number;
    totalTreesLost: number;
    explosionsCount: number;
    victoryBracket: VictoryBracket;
    textualJournal: string;
  }>;
}

export interface ParameterSweepInput {
  numPlayersValues: number[];
  numTurnsValues: number[];
  initialTreesPerCellValues: number[];
  overheatIncludesBaseActionValues: boolean[];
  assaultIncludesBaseActionValues: boolean[];
  overheatStacksTreeRemovalValues: boolean[];
  endOfGameRegenerationValues: boolean[];
  shuffleTacticsTrackValues: boolean[];
  tacticsTrackSetup: TacticType[];
  initialHarvesterStatus: 'NORMAL' | 'HS';
  initialBulldozerStatus: 'NORMAL' | 'HS';
  initialStumpsCell1: number;
}

export interface CampaignConfig {
  id: string;
  name: string;
  type: 'MONTE_CARLO_SWEEP' | 'D1_D2_COMPARISON' | 'ORACLE_STRESS_TEST';
  createdAt: string;
  gamesPerVariantAndTable: number;
  sweep: ParameterSweepInput;
  selectedTableConfigs: TableConfig[];
  includeCalibrationTables: boolean;
  targetDurationSeconds?: number | null;
  maxTotalGames?: number;
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
  violationsLog: InvariantViolationReport[];
  totalExplosionsObserved: number;
  totalParryAndHSObserved: number;
  totalTrapsAndSabotagesObserved: number;
  scoreDistributionByBotLevel: Record<
    BotProfileId,
    {
      games: number;
      meanSurvivalHorizon: number;
      meanTreesLost: number;
      meanExplosions: number;
      defeatRate: number;
      miracleRate: number;
    }
  >;
  capturedExtremeLogs: Array<{
    seed: number;
    category:
      | 'INVARIANT_VIOLATION'
      | 'MULTI_EXPLOSION'
      | 'HIGH_DAMAGE_WIPEOUT'
      | 'STEALTH_MASTERCLASS'
      | 'OMNISCIENT_DEFEAT';
    summary: string;
    params: SimulationConfig;
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

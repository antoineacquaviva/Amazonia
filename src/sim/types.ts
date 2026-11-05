export type TacticType = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';
export type MachineType = 'A' | 'B';
export type MachineStatus = 'NORMAL' | 'HS' | 'DESTROYED';
export type DefenderTrackType = 'TACTICAL' | 'STEALTH';

export type TacticalDefenderCap = 99 | 2 | 1;
export type CombatThresholdShift = 0 | 1;
export type BulldozerZeroStumpAction = 'NONE' | 'DESTROY_TREE';
export type TacticsTrackPreset = 'ASSAULT_HIGH' | 'ASSAULT_LOW';

export type BotProfileId =
  | 'BLIND'         // 1. Bot Aveugle (Sans info privée, sans coordination)
  | 'SOLO_INFORMED' // 2. Bot Informé Solo (Avec info privée, zéro coordination)
  | 'COORD_HYBRID'  // 3. Bot Coordonné Hybride (Info privée + Coordination tacite — Référence)
  | 'OMNISCIENT';   // 4. Bot Omniscient (Table ouverte / Plafond théorique)

export interface InitialMachineConfig {
  harvesterPos: number;           // Case initiale Abatteuse (toujours 1 en v3.2)
  harvesterStatus: 'NORMAL' | 'HS';
  bulldozerPos: number;           // Case initiale Bulldozer (toujours 1 en v3.2)
  bulldozerStatus: 'NORMAL' | 'HS';
  initialStumpsCell1: number;     // Souches initiales en case 1 (>= 0)
}

export interface SimulationConfig {
  numPlayers: number;                            // N in {3, 4, 5, 6}
  numTurns: number;                              // X in {6, 7, 8, 9, 10, 12}
  initialTreesPerCell: number;                   // a in {2, 3}
  tacticsTrackPreset: TacticsTrackPreset;        // 'ASSAULT_HIGH' | 'ASSAULT_LOW'
  tacticsTrackSetup: TacticType[];               // Déduit du preset (ou personnalisé)
  shuffleTacticsTrack: boolean;                  // Si true, mélange tacticsTrackSetup en début de partie
  initialMachinesState?: InitialMachineConfig[]; // Optionnel

  // 4 Nouveaux Leviers d'Équilibrage v3.2 (+ tacticsTrackPreset ci-dessus)
  tacticalDefenderCap: TacticalDefenderCap;           // 1. Plafond Défenseurs Tactiques par case : 99 (Sans limite), 2 (Max 2), 1 (Max 1)
  combatThresholdShift: CombatThresholdShift;         // 2. Décalage des seuils S : 0 ou +1
  bulldozerZeroStumpAction: BulldozerZeroStumpAction; // 3. Action Bulldozer si 0 souche : 'NONE' ou 'DESTROY_TREE'
  initialStumpCell2: boolean;                         // 4. Si true : case 2 de J1 et J2 démarre avec 1 souche et a-1 arbres debout
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
  faceDownCards: TacticType[];    // Cartes posées face cachée ce tour-ci (génèrent une réparation en 3.4)
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
  thresholdShift: number;
  outcome: 'ATTACK_SUCCESS' | 'SIMPLE_PARRY' | 'PARRY_AND_HS';
  harvesterExploded: boolean;
  bulldozerExploded: boolean;
  treesCutToStumps: number;               // Abattages (Arbre debout -> Souche)
  bulldozerDestroyedTreeOnZeroStump: number; // Arbre debout détruit définitivement par Bulldozer sur 0 souche
  stumpsCleared: number;                  // Terrassements (Souches retirées)
  treesRemovedByOverheat: number;         // Pions retirés directement par Surchauffe A2/B2
  treesDestroyedByExplosion: number;      // Pions détruits par Explosion
  harvesterBecameHS: boolean;
  bulldozerBecameHS: boolean;
  tacticalOverkillOnCell: number;
}

export interface StealthCellLog {
  playerIndex: number;
  cellIndex: number;
  stealthDefenders: number;
  outcome:
    | 'SABOTAGE_PLACED'
    | 'TRAP_PLACED'
    | 'FAILED_VACATED_OR_EXPLODED'
    | 'FAILED_TOKEN_LIMIT_REACHED'
    | 'ORPHAN_SINGLE_TOKEN';
  sabotagedMachines: MachineType[];
}

export interface RepairCellLog {
  playerIndex: number;
  cellIndex: number;
  faceDownCards: TacticType[];
  harvesterRepaired: boolean;
  bulldozerRepaired: boolean;
  harvesterSabotageCleared?: boolean;
  bulldozerSabotageCleared?: boolean;
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
    repairedImmediatelyInStep31?: boolean;
    sabotageClearedInStep31?: boolean;
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
  treesLostThisTurnPerPlayer: number[]; // Arbres perdus ce tour par joueur J1..JN
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
  initialTotalTreesAllocated: number;   // Potentiel écologique initial (arbres debout + souches régénérables)
  referenceHorizonTrees: number;        // N * X * a (horizon de référence de la spécification)
  finalStandingTreesTotal: number;
  totalTreesLost: number;               // Arbres perdus par rapport au stock initial réel (arbres + souches régénérables)
  survivalRateHorizon: number;          // Ratio de survie sur l'horizon N * X * a (borné dans [0, 1])
  survivalRateVisited: number;          // Ratio de survie sur les cases visitées (1 .. maxPos+1)
  regeneratedTreesCount: number;
  victoryBracket: VictoryBracket;

  // Pertes par tour (taille X) et par joueur (taille N)
  treesLostPerTurn: number[];
  treesLostPerPlayer: number[];
  survivingTreesPerPlayerOnHorizon: number[];

  // Compteurs d'événements de la partie
  cutsCount: number;                         // Nombre d'arbres abattus (Arbre -> Souche)
  bulldozerDestroyedTreesCount: number;      // Arbres debout détruits définitivement par Bulldozer sur 0 souche
  clearingsCount: number;                    // Nombre d'actions de Terrassement exécutées
  stumpsClearedCount: number;                // Nombre total de souches rasées
  overheatTriggersCount: number;             // Nombre de Surchauffes (A2/B2) subies en combat
  overheatTreesRemovedCount: number;         // Nombre de pions retirés par Surchauffe
  assaultTriggersCount: number;              // Nombre de cartes Assaut (A3/B3) résolues en combat
  simpleParriesCount: number;                // Nombre de Parades simples (S == 2 + k + shift)
  parryAndHSCount: number;                   // Nombre de Parades + Mise HS (S >= 3 + k + shift)
  explosionsCount: number;                   // Nombre d'Explosions (A2+A3 ou B2+B3)
  trapsPlacedCount: number;                  // Nombre de Pièges posés en Furtivité
  sabotagesPlacedCount: number;              // Nombre de Sabotages posés en Furtivité
  stealthBlockedByLimitCount: number;        // Furtivités bloquées par la limite de N jetons
  stealthFailuresCount: number;              // Nombre d'échecs de Furtivité (>=2 jetons sur case quittée/explosée)
  orphanStealthTokensCount: number;          // Furtivité Orpheline (jetons posés seuls stealthDefenders == 1 et perdus)
  tacticalOverkillTokensCount: number;       // Overkill Tactique (jetons au-delà du seuil Mise HS ou sur case non attaquée)
  repairsCount: number;                      // Nombre total de réparations (Étape 3.1 + Étape 3.4)
  activeRepairsStep31Count: number;          // Dont réparations actives immédiates à l'Étape 3.1 (m >= 2)
  sabotageClearedByRepairCount: number;      // Sabotages purgés lors d'une réparation
  respiteDrawsOnDestroyedCount: number;      // Nombre de tirages sans effet sur machine détruite
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

  // Moyennes par partie des événements
  meanCuts: number;
  meanBulldozerDestroyedTrees: number;
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
  meanStealthBlockedByLimit: number;
  meanOrphanStealthTokens: number;
  meanTacticalOverkillTokens: number;
  meanRepairs: number;
  meanActiveRepairsStep31: number;
  meanSabotageClearedByRepair: number;
  meanRespiteDraws: number;
}

export interface InformationAndCoordinationMetrics {
  survBlind: number;               // Taux de survie Bot Aveugle (0..1)
  survSolo: number;                // Taux de survie Bot Informé Solo (0..1)
  survCoord: number;               // Taux de survie Bot Coordonné Hybride (0..1) — Référence
  survOmni: number;                // Taux de survie Bot Omniscient (0..1)
  treesLostBlind: number;
  treesLostSolo: number;
  treesLostCoord: number;
  treesLostOmni: number;
  privateInfoGainPct: number;      // Survie Solo - Survie Aveugle (en ratio 0..1)
  privateInfoGainTrees: number;    // Arbres sauvés grâce à l'info privée (lostBlind - lostSolo)
  coordinationGainPct: number;     // Survie Coord - Survie Solo (en ratio 0..1)
  coordinationGainTrees: number;   // Arbres sauvés grâce à la coordination & furtivité (lostSolo - lostCoord)
  fogOfWarCostPct: number;         // Survie Omni - Survie Coord (en ratio 0..1)
  fogOfWarCostTrees: number;       // Arbres perdus à cause du brouillard (lostCoord - lostOmni)
  meanOrphanStealthCoord: number;  // Furtivité Orpheline moyenne (Bot Coordonné)
  meanTacticalOverkillCoord: number; // Overkill Tactique moyen (Bot Coordonné)
  meanTacticalOverkillSolo: number;  // Overkill Tactique moyen (Bot Solo)
}

export interface FourCriteriaEvaluation {
  // 1. Cible de Difficulté & Tension (Survie Coord dans [70% .. 82%]) (/100)
  tensionAndAttrition: {
    score: number;
    survivalTargetProximityScore: number; // /70
    hsAndExplosionDynamicsScore: number;  // /30
    meanSurvivalHorizon: number;
    meanExplosionsPerGame: number;
    meanParryAndHSPerGame: number;
    interpretation: string;
  };
  // 2. Valeur de la Connaissance Privée (Survie Solo - Survie Aveugle >= +5%) (/100)
  privateInfoValue: {
    score: number;
    deltaSoloVsBlind: number;
    treesSavedByPrivateInfo: number;
    interpretation: string;
  };
  // 3. Valeur de la Coordination & Furtivité (Survie Coord - Survie Solo >= +5%) (/100)
  coordinationEfficiency: {
    score: number;
    deltaCoordVsSolo: number;
    treesSavedByCoordination: number;
    trapsAndSabotagesPerGame: number;
    orphanStealthPerGame: number;
    tacticalOverkillPerGame: number;
    interpretation: string;
  };
  // 4. Équité d'Exposition sur l'Œil (J1 .. JN) (/100)
  evilEyeFairness: {
    score: number;
    j1VsOthersRatio: number;
    playerLossSpread: number;
    interpretation: string;
  };
  infoAndCoordMetrics: InformationAndCoordinationMetrics;
  overallDesignScore: number; // Note Design sur 100
}

export interface VariantEvaluationResult {
  variantId: string;
  variantLabel: string;
  leversCode: string; // ex: "Cap:2 · Shift:+0 · Bull0:DESTROY_TREE · StumpC2:Oui · Piste:ASSAULT_HIGH"
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
  numPlayersValues: number[];                         // défaut [3, 4, 5, 6]
  numTurnsValues: number[];                           // défaut [6, 7, 8, 9, 10, 12]
  initialTreesPerCellValues: number[];                // défaut [2, 3]
  tacticalDefenderCapValues: TacticalDefenderCap[];   // défaut [99, 2, 1]
  combatThresholdShiftValues: CombatThresholdShift[]; // défaut [0, 1]
  bulldozerZeroStumpActionValues: BulldozerZeroStumpAction[]; // défaut ['NONE', 'DESTROY_TREE']
  initialStumpCell2Values: boolean[];                 // défaut [false, true]
  tacticsTrackPresetValues: TacticsTrackPreset[];     // défaut ['ASSAULT_HIGH', 'ASSAULT_LOW']
  shuffleTacticsTrackValues: boolean[];               // défaut [false]
}

export interface CampaignConfig {
  id: string;
  name: string;
  type: 'MONTE_CARLO_SWEEP' | 'FIVE_LEVERS_ABLATION' | 'ORACLE_STRESS_TEST';
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

export type TacticId = 'A1' | 'A2' | 'A3' | 'B1' | 'B2' | 'B3';

export type DiceDrawMode = 'MIN_2D6' | '1D6' | 'MAX_2D6';
export type CellResolutionMode = 'TRANSACTION_FIGEE' | 'SEQUENTIEL';
export type ScrapyardOrderMode = 'AVANT_PARCELLE_1' | 'APRES_PARCELLE_Q';
export type TacticUpdateOrderMode = 'ORDRE_PISTE_TAC' | 'FIXE';
export type GrudgeGranularityMode = 'PAR_CASE' | 'PAR_EVENEMENT' | 'CARTE_ET_DESTRUCTION';

// ============================================================================
// LES 6 INTERRUPTEURS MÉCANIQUES V1 <-> V2 (Section 1)
// ============================================================================
export type RuleNoTargetH1 = 'V1_NO_EFFECT' | 'V2_FALLBACK_DEPLOY_AND_RETREAT';
export type RuleParryMode = 'V1_UNLIMITED_PER_CELL' | 'V2_UNITARY_PER_CARD';
export type RulePreventiveDestruction = 'V1_ALLOWED' | 'V2_CARD_REQUIRED';
export type RuleBulldozerTargeting =
  | 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE'
  | 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE';
export type RuleScrapyardExit = 'V1_PASSIVE_D1' | 'V2_OFFENSIVE_D2';
export type RuleInitialSetup = 'V1_SPARSE_RANK3_EMPTY' | 'V2_SMOOTH_DENSE';

export interface MechanicalSwitches {
  ruleNoTargetH1: RuleNoTargetH1;
  ruleParryMode: RuleParryMode;
  rulePreventiveDestruction: RulePreventiveDestruction;
  ruleBulldozerTargeting: RuleBulldozerTargeting;
  ruleScrapyardExit: RuleScrapyardExit;
  ruleInitialSetup: RuleInitialSetup;
}

export type BotProfileId =
  | 'RANDOM'       // Baseline N0: Aléatoire uniforme
  | 'BLIND_PROB'   // Témoin Aveugle Probabiliste: Coopératif sans regarder sous son gobelet
  | 'SELFISH'      // Niveau 1: Égoïste / Myope
  | 'COOPERATIVE'  // Niveau 2: Coopératif Communicant (Bayésien + Micro-cycles)
  | 'STRATEGIST'   // Niveau 3: Stratège « Méta-Contremaître » (Apprentissage + Rancune)
  | 'OMNISCIENT';  // Borne Haute Théorique: Omniscient

export type ThemeVocabularyMode = 'AMAZONIA' | 'ABSTRACT';

export interface GameParameters extends MechanicalSwitches {
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

// ============================================================================
// CONSERVATOIRE NIVEAU 1 : LES ÉDITIONS (EditionPreset)
// ============================================================================
export interface EditionPreset {
  id: string;
  name: string;
  version: string;
  description: string;
  createdAt: string;
  isBuiltIn?: boolean;
  switches: MechanicalSwitches;
  defaultParams: Partial<GameParameters>;
}

export interface TableConfig {
  id: string;
  name: string;
  description: string;
  botProfiles: BotProfileId[];
}

export interface SectorState {
  sectorIndex: number;
  initialEyeRank: number;
  standingTrees: number[];
  stumps: number[];
  initialCapacity: number[];
  harvesters: number[];
  bulldozerPos: number;
}

export interface ForemanBrainState {
  tacticsTrack: TacticId[];
  eyeTrack: number[];
}

export interface DefenderTokenPlacement {
  playerIndex: number;
  mainCell: number;
  supportSector: number;
  supportCell: number;
  lockCycle: number;
  redirectedByCupMain: boolean;    // True si le choix diffère de ce qu'il aurait fait sans regarder son gobelet
  redirectedByCupSupport: boolean;
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
  cellIndex: number;
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
  bulldozerOffensiveExitCell?: number;
  degradedBulldozer: boolean;
  grudgeIncrement: number;
  tacticsMoved: Array<{
    tactic: TacticId;
    fromSlot: number;
    toSlot: number;
    status: CardResolutionStatus;
  }>;
}

export interface EdgeCaseCounts {
  H1_noTargetEligible: number;
  H2_multipleHarvesterCardsSingleTree: number;
  H3_multipleBulldozerCardsSameCell: number;
  H4_repairedBulldozerImmunityInCell1: number;
  H5_degradedBulldozerNoGrudge: number;
  H6_multiEventSameCellSingleGrudge: number;
  H7_preventiveDestructionNoCard: number;
  H7_emptyCellOverDefense: number;
}

export interface InvariantViolationReport {
  code:
    | 'I1_TREE_CONSERVATION'
    | 'I2_MACHINE_BOUNDS'
    | 'I3_BRAIN_PERMUTATION'
    | 'I4_DEFENDER_LEGALITY'
    | 'DEADLOCK_CYCLE'
    | 'UNWINNABLE_EARLY_WIPEOUT';
  turn: number;
  phase: string;
  message: string;
  seed: number;
  offendingStateSnapshot?: string;
}

export type InvariantViolation = InvariantViolationReport;

export interface TurnTrace {
  turn: number;
  tacticsTrackStart: TacticId[];
  eyeTrackStart: number[];
  diceRolls: Array<{
    playerIndex: number;
    d1: number;
    d2: number;
    chosenSlot: number;
    tactic: TacticId;
  }>;
  step1Defenders: number[];
  microCycles: MicroCycleStepLog[];
  finalDefenders: DefenderTokenPlacement[];
  defendersGrid: number[][];
  targetedActions: Array<{
    playerIndex: number;
    tactic: TacticId;
    drawnSlot: number;
    targetSector: number | null;
    cardsPlaced: Array<{ cell: number; count: number }>;
    v2FallbackApplied?: boolean;
  }>;
  harvesterMovesA1: Array<{
    sectorIndex: number;
    fromCell: number;
    toCell: number;
    count: number;
  }>;
  harvesterReinforcementsA3: Array<{
    sectorIndex: number;
    cell: number;
    count: number;
    cappedByStock: boolean;
    isFallbackH1?: boolean;
  }>;
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
  dilemmaEventsCount: number;
  totalDecisionsCount: number;
  step2SavedCellsCount: number; // Cellules sauvées par le réajustement entre r=1 et r_final
}

export type VictoryBracket =
  | 'MIRACLE'
  | 'MAJOR_VICTORY'
  | 'COSTLY_VICTORY'
  | 'DEFEAT';

export interface TacticGameStats {
  draws: number;
  sumSlotWhenDrawn: number;
  turnsInSlot1: number;
  turnsInSlot1Or2: number;
  cardsPlaced: number;
  cardsSucceeded: number;
  cardsParried: number;
  cardsNoTarget: number;
  noTargetAtPlacementH1: number;
  treesCutAttributed: number;
  harvestersDeployedAttributed: number;
  stumpsClearedAttributed: number;
  repairsSucceededAttributed: number;
  defendersAttractedSum: number;
  targetedCellsCount: number;
}

export interface SingleGameResult {
  seed: number;
  params: GameParameters;
  editionId?: string;
  tableConfigId: string;
  botProfiles: BotProfileId[];
  rawScore: number;
  meanScorePerPlayer: number;
  normalizedScore: number;
  victoryBracket: VictoryBracket;
  regeneratedTreesTotal: number;
  standingBeforeRegen: number;
  attritionRateBeforeRegen: number; // % d'arbres coupés ou rasés avant régénération
  perSectorFinalTrees: number[];
  perInitialRankFinalTrees: number[];
  totalHarvestersSpawned: number;
  totalHarvestersDestroyed: number;
  totalBulldozersDestroyed: number;
  totalBulldozersRepaired: number;
  meanActiveHarvestersPerTurn: number;
  meanSecondHalfActiveMachines: number;
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
  step2CellsSavedCount: number; // Cases sauvées grâce aux micro-cycles r>=2 par rapport à r=1
  coordinatedDestructionsCount: number;
  meanStep2LockCycle: number;
  meanBrainPermutationsPerTurn: number;
  meanRepositioningsPerTurn: number;
  meanMachineMovesAndDestructionsPerTurn: number;
  dilemmaRate: number;
  threatToDefenseRatio: number;
  tacticSlot1Turns: Record<TacticId, number>;
  perTacticStats: Record<TacticId, TacticGameStats>;
  // Apprentissage du Contremaître (Axe B)
  learningAdvancesCount: number;
  learningRetreatsCount: number;
  snowballOpportunities: number;
  snowballSuccesses: number;
  distinctTacticsInTop2: number;
  // Connaissance secrète sous le gobelet (Axe D)
  cupRedirectionCount: number;
  totalDefenderTokensPlaced: number;
  surpriseDrawsSlots3To6Count: number;
  surpriseDrawsParriedCount: number;
  externalDrawTargetedAllyCount: number;
  externalDrawProperlyDefendedCount: number;
  // Capteurs Stress-Test & Invariants
  edgeCases: EdgeCaseCounts;
  violations: InvariantViolationReport[];
  stagnantTurns: number;
  earlyWipeoutTurn: number | null;
  traces?: TurnTrace[];
  textualJournal?: string;
}

// ============================================================================
// LES 5 CRITÈRES PRINCIPAUX D'ÉVALUATION (Section 5)
// ============================================================================
export interface FiveCriteriaEvaluation {
  // 1. Simplicité, Fluidité & Sobriété des Règles (/100)
  simplicitySobriety: {
    score: number;
    effectiveActionRateScore: number;      // /40
    activeTurnManipulationScore: number;   // /30
    rulebookConceptualSobrietyScore: number; // /30
    effectiveActionRate: number;
    manipulationsPerActiveTurn: number;
    activeSwitchesBonus: string[];
    interpretation: string;
  };
  // 2. Profondeur Stratégique (/100)
  strategicDepth: {
    score: number;
    coherenceN1VsRandomScore: number;      // /15
    tacticalMasteryN2VsN1Score: number;    // /40
    metaMasteryN3VsN2Score: number;        // /45
    cappedByInversion: boolean;
    deltaN1VsRandom: number;
    deltaN2VsN1: number;
    deltaN3VsN2: number;
    interpretation: string;
  };
  // 3. Tension & Courbe Dramatique (/100)
  tensionDrama: {
    score: number;
    bracketDistributionProximityScore: number; // /50
    activeAttritionScore: number;              // /30
    dilemmaFrequencyScore: number;             // /20
    observedBrackets: Record<VictoryBracket, number>;
    meanAttritionBeforeRegen: number;
    dilemmaFrequency: number;
    pressureToDefenseRatio: number;
    interpretation: string;
  };
  // 4. Nécessité de Collaborer (/100)
  collaborationNecessity: {
    score: number;
    netCommunicationGainScore: number;         // /50
    microCycleRescueImpactScore: number;       // /30
    omniscientConvergenceScore: number;        // /20
    cappedByLowSynergy: boolean;
    deltaCoopVsSelfish: number;
    step2RescueRatePerTurn: number;
    omniscientConvergenceRatio: number;
    interpretation: string;
  };
  // 5. Vitalité du Contremaître & Équité des Rangs (/100)
  foremanVitalityFairness: {
    score: number;
    continuousActivityScore: number;           // /35
    tacticsRenewalScore: number;               // /35
    initialEyeFairnessScore: number;           // /30
    nonStagnantTurnRate: number;
    secondHalfActiveMachines: number;
    tacticSlot1Entropy: number;
    slot1MonopolyRate: number;
    rank1VsOthersGap: number;
    interpretation: string;
  };
  overallDesignScore: number; // Moyenne pondérée sur 100
}

// ============================================================================
// LES 4 AXES DIAGNOSTIQUES COMPLÉMENTAIRES (Hors Note Globale — Section 6)
// ============================================================================
export interface TacticDiagnosticRow {
  tactic: TacticId;
  drawFrequencyRate: number;       // % des dés lancés
  meanTrackPosition: number;       // 1.0 à 6.0
  slot1ResidencyRate: number;      // % du temps en Case 1
  successRate: number;             // % Réussite
  parriedRate: number;             // % Parée
  noTargetCardRate: number;        // % Sans objet à la résolution
  noTargetH1Rate: number;          // % Sans cible à la pose (H1)
  netTreesCutPerDraw: number;      // Delta T par tirage (pour A1..A3)
  netHarvestersDeployedPerDraw: number; // Abatteuses déployées par tirage
  netStumpsClearedPerDraw: number; // Delta S par tirage (pour B1..B3)
  netRepairsPerDraw: number;       // Réparations réussies par tirage
  defensiveMobilizationMean: number; // Défenseurs moyens attirés
  diagnosticLabel:
    | 'Équilibrée'
    | 'Sur-dominante'
    | 'Sous-exploitée / Souvent sans cible'
    | 'Redondante avec une autre tactique';
  diagnosticDetail: string;
}

export interface FourDiagnosticAxes {
  // Axe A : Estimation de la Durée de Jeu Physique & Ratio Réflexion / Manipulation
  axisA_PhysicalDuration: {
    totalEstimatedMinutes: number;
    minutesPerPlayer: number;
    meanSecondsPerTurn: number;
    turn1EstimatedSeconds: number;
    turnXEstimatedSeconds: number;
    phase1SecondsTotal: number;
    phase2CognitiveSecondsTotal: number;
    phase3ManipulationSecondsTotal: number;
    cognitiveShareRate: number;     // % Phase 2
    manipulationShareRate: number;  // % Phase 3
    manipulationWarningAlert: boolean; // True si manipulation > 45%
    diagnosticSummary: string;
  };
  // Axe B : Intérêt & Impact de l'Apprentissage du Contremaître
  axisB_ForemanLearning: {
    meanAdvancesPerTurn: number;
    meanRetreatsPerTurn: number;
    snowballRate: number; // P(Réussite t+1 | Réussite t)
    n3VsN2Slot1ControlDelta: number; // Réduction du temps passé par la tactique dominante en Case 1 grâce à N3
    n3VsN2SurvivalGain: number;
    meanDistinctTacticsInTop2: number; // sur 6
    diagnosticSummary: string;
  };
  // Axe C : Bilan Analytique Individuel des 6 Tactiques (A1..B3)
  axisC_TacticsIndividualBalance: {
    rows: TacticDiagnosticRow[];
    diagnosticSummary: string;
  };
  // Axe D : Utilité de la Connaissance Privée d'une Attaque (Secret sous le Gobelet)
  axisD_PrivateCupUtility: {
    survivalGainFromSecret: number; // Score_N2 - Score_BLIND_PROB
    cupRedirectionRate: number;     // % de jetons redirigés grâce à la lecture du dé sous le gobelet
    surpriseAttackParryRateN2: number; // % de parade des tirages Cases 3..6 par N2
    surpriseAttackParryRateBlind: number; // % de parade des tirages Cases 3..6 par BLIND_PROB
    secretTransmissionFidelityRate: number; // % de cibles alliées correctement défendues à l'Étape 2
    diagnosticSummary: string;
  };
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
  decilesNormalizedScore: number[];
  victoryBracketsRate: Record<VictoryBracket, number>;
  perInitialRankMeanTrees: number[];
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

export type AblationCategory =
  | 'BASE_EDITION_A'
  | 'TARGET_EDITION_B'
  | 'ADD_SINGLE_SWITCH_TO_A'
  | 'REMOVE_SINGLE_SWITCH_FROM_B'
  | 'FACTORIAL_COCKTAIL'
  | 'STANDARD_VARIANT';

export interface VariantEvaluationResult {
  variantId: string;
  variantLabel: string;
  ablationCategory?: AblationCategory;
  modifiedSwitchesFromA?: Array<keyof MechanicalSwitches>;
  switchesChangedCountFromV1: number;
  params: GameParameters;
  tableSummaries: TableConfigSummary[];
  criteria: FiveCriteriaEvaluation;
  diagnosticAxes: FourDiagnosticAxes;
  edgeCaseTotals: EdgeCaseCounts;
  stagnantTurnsRate: number;
  slot1MonopolyGamesRate: number;
  invariantViolationsCount: number;
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
  // Les 6 interrupteurs mécaniques
  ruleNoTargetH1Values?: RuleNoTargetH1[];
  ruleParryModeValues?: RuleParryMode[];
  rulePreventiveDestructionValues?: RulePreventiveDestruction[];
  ruleBulldozerTargetingValues?: RuleBulldozerTargeting[];
  ruleScrapyardExitValues?: RuleScrapyardExit[];
  ruleInitialSetupValues?: RuleInitialSetup[];
}

export interface AblationConfig {
  editionAId: string;
  editionBId: string;
  editionASwitches: MechanicalSwitches;
  editionBSwitches: MechanicalSwitches;
  editionAName: string;
  editionBName: string;
  includeLayer2SingleAdditions: boolean;
  includeLayer3SingleAblations: boolean;
  includeLayer4FullFactorial: boolean;
}

export interface CampaignConfig {
  id: string;
  name: string;
  type: 'EVALUATION_SWEEP' | 'AB_ABLATION' | 'ORACLE_STRESS_TEST';
  createdAt: string;
  gamesPerVariantAndTable: number;
  sweep: ParameterSweepInput;
  selectedTableConfigs: TableConfig[];
  includeCalibrationTables: boolean;
  ablationConfig?: AblationConfig;
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
  stagnantGamesCount: number;
  earlyWipeoutGamesCount: number;
  tacticMonopolyGamesCount: number;
  omniscientUnwinnableSeedsCount: number;
  edgeCaseOccurrences: EdgeCaseCounts;
  scoreDistributionByBotLevel: Record<
    BotProfileId,
    {
      games: number;
      meanNormalized: number;
      minNormalized: number;
      maxNormalized: number;
      defeatRate: number;
      miracleRate: number;
    }
  >;
  capturedExtremeLogs: Array<{
    seed: number;
    category:
      | 'INVARIANT_VIOLATION'
      | 'EARLY_WIPEOUT'
      | 'STAGNATION'
      | 'TACTIC_MONOPOLY'
      | 'OMNISCIENT_DEFEAT'
      | 'RECORD_EDGE_CASES';
    summary: string;
    params: GameParameters;
    textualJournal: string;
  }>;
}

// ============================================================================
// CONSERVATOIRE NIVEAU 3 : GRAINES ÉPINGLÉES (PinnedSeed)
// ============================================================================
export interface PinnedSeed {
  id: string;
  seed: number;
  title: string;
  reasonCategory:
    | 'MAX_DELTA_V1_V2'
    | 'MAX_SECRET_CUP_IMPACT'
    | 'CRITICAL_DEFEAT'
    | 'ANOMALY_OR_EDGE_CASE'
    | 'USER_PINNED';
  description: string;
  createdAt: string;
  campaignId?: string;
  defaultParamsA: GameParameters;
  defaultParamsB: GameParameters;
  editionAName: string;
  editionBName: string;
  botProfile: BotProfileId;
  scoreANormalized: number;
  scoreBNormalized: number;
}

export interface SideBySideComparisonResult {
  seed: number;
  botProfile: BotProfileId;
  editionAName: string;
  editionBName: string;
  humanDiffLines: string[];
  gameA: SingleGameResult;
  gameB: SingleGameResult;
  turnComparisons: Array<{
    turn: number;
    traceA: TurnTrace;
    traceB: TurnTrace;
    hasDivergence: boolean;
    divergenceSummary: string[];
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
  pinnedSeeds?: PinnedSeed[];
  errorMessage?: string;
}

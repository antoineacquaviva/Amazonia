import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  EditionPreset,
  GameParameters,
  MechanicalSwitches,
  PinnedSeed,
  SideBySideComparisonResult,
  SingleGameResult,
  TableConfig,
  TacticId,
  ThemeVocabularyMode,
  VariantEvaluationResult,
} from './sim/types';
import {
  BUILTIN_EDITIONS,
  countSwitchesChangedFromV1,
  DEFAULT_GAME_PARAMETERS,
  DEFAULT_TABLE_CONFIGS,
  V1_SWITCHES,
  V2_SWITCHES,
} from './sim/i18n';
import {
  createEmptyEdgeCases,
  runSideBySideComparison,
  runSingleGame,
} from './sim/engine';
import {
  addEdgeCases,
  evaluateFiveCriteria,
  evaluateFourDiagnosticAxes,
  expandAblationVariants,
  expandParameterSweep,
  summarizeTableGames,
} from './sim/evaluator';
import { SeededRNG } from './sim/rng';

const LS_EDITIONS_KEY = 'amazonia_v2_editions';
const LS_SEEDS_KEY = 'amazonia_v2_seeds';
const LS_CAMPAIGNS_KEY = 'amazonia_v2_campaigns';

const CALIBRATION_TABLES: TableConfig[] = [
  {
    id: 'cal_random',
    name: 'Étalon Aléatoire (N0)',
    description: 'Placement aléatoire uniforme',
    botProfiles: ['RANDOM'],
  },
  {
    id: 'cal_selfish',
    name: 'Étalon Égoïste / Myope (N1)',
    description: 'Sans communication ni recherche de destruction multiple',
    botProfiles: ['SELFISH'],
  },
  {
    id: 'cal_blind_prob',
    name: 'Étalon Aveugle Probabiliste (N2 Sans Gobelet)',
    description: 'Même intelligence coopérative N2 mais sans regarder son dé secret (Axe D)',
    botProfiles: ['BLIND_PROB'],
  },
  {
    id: 'cal_coop',
    name: 'Étalon Coopératif Communicant (N2)',
    description: 'Inférence bayésienne et micro-cycles de coordination',
    botProfiles: ['COOPERATIVE'],
  },
  {
    id: 'cal_strategist',
    name: 'Étalon Stratège Méta-Contremaître (N3)',
    description: 'Contrôle de la Piste des Tactiques et de la Rancune',
    botProfiles: ['STRATEGIST'],
  },
  {
    id: 'cal_omniscient',
    name: 'Étalon Omniscient (Borne Haute)',
    description: 'Information complète sur tous les dés tirés',
    botProfiles: ['OMNISCIENT'],
  },
];

class BrowserCampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private editions: Map<string, EditionPreset> = new Map();
  private pinnedSeeds: Map<string, PinnedSeed> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();
  private initialized = false;

  public ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.loadFromStorage();
    if (this.campaigns.size === 0) {
      this.createInitialReferenceCampaigns();
    }
  }

  private loadFromStorage(): void {
    for (const builtin of BUILTIN_EDITIONS) {
      this.editions.set(builtin.id, builtin);
    }
    try {
      const rawEds = localStorage.getItem(LS_EDITIONS_KEY);
      if (rawEds) {
        const list = JSON.parse(rawEds) as EditionPreset[];
        for (const ed of list) {
          if (ed && ed.id && ed.switches) this.editions.set(ed.id, ed);
        }
      }
    } catch {
      // ignore storage errors
    }

    try {
      const rawSeeds = localStorage.getItem(LS_SEEDS_KEY);
      if (rawSeeds) {
        const list = JSON.parse(rawSeeds) as PinnedSeed[];
        for (const s of list) {
          if (s && s.id) this.pinnedSeeds.set(s.id, s);
        }
      }
    } catch {
      // ignore
    }

    if (this.pinnedSeeds.size === 0) {
      this.createInitialPinnedSeeds();
    }

    try {
      const rawCamps = localStorage.getItem(LS_CAMPAIGNS_KEY);
      if (rawCamps) {
        const list = JSON.parse(rawCamps) as CampaignRecord[];
        for (const c of list) {
          if (c && c.id) {
            if (c.status === 'RUNNING') {
              c.status = 'PAUSED';
              c.progress.currentPhaseLabel = 'En pause (Reprise disponible)';
            }
            this.campaigns.set(c.id, c);
          }
        }
      }
    } catch {
      // ignore
    }
  }

  private persistEditions(): void {
    try {
      localStorage.setItem(
        LS_EDITIONS_KEY,
        JSON.stringify(Array.from(this.editions.values()))
      );
    } catch {
      // ignore quota
    }
  }

  private persistSeeds(): void {
    try {
      localStorage.setItem(
        LS_SEEDS_KEY,
        JSON.stringify(Array.from(this.pinnedSeeds.values()))
      );
    } catch {
      // ignore quota
    }
  }

  private persistCampaigns(): void {
    try {
      localStorage.setItem(
        LS_CAMPAIGNS_KEY,
        JSON.stringify(Array.from(this.campaigns.values()))
      );
    } catch {
      // ignore quota
    }
  }

  private createInitialPinnedSeeds(): void {
    const paramsV1: GameParameters = { ...DEFAULT_GAME_PARAMETERS, ...V1_SWITCHES };
    const paramsV2: GameParameters = { ...DEFAULT_GAME_PARAMETERS, ...V2_SWITCHES };

    const initialSeeds: PinnedSeed[] = [
      {
        id: 'seed_ref_42001',
        seed: 42001,
        title: 'Graine #42001 — Contraste maximal V1.0 ↔ V2.0 (Cas H1 & Parade unitaire)',
        reasonCategory: 'MAX_DELTA_V1_V2',
        description:
          'Illustre comment le Déploiement de secours H1 (V2) évite un tour mort au Tour 1 tout en valorisant la parade unitaire (1 carte = 1 défenseur).',
        createdAt: new Date().toISOString(),
        campaignId: 'camp_v2_ablation_v1_vs_v2',
        defaultParamsA: paramsV1,
        defaultParamsB: paramsV2,
        editionAName: 'Édition 1.0 — Règles Originales',
        editionBName: 'Édition 2.0 — Refonte Coopérative & Simplifiée',
        botProfile: 'COOPERATIVE',
        scoreANormalized: 0.71,
        scoreBNormalized: 0.79,
      },
      {
        id: 'seed_ref_42007',
        seed: 42007,
        title: 'Graine #42007 — Sauvetage décisif grâce au dé secret sous gobelet (Axe D)',
        reasonCategory: 'MAX_SECRET_CUP_IMPACT',
        description:
          'Le joueur ayant tiré un 5 sous son gobelet anticipe dès l’Étape 1 un assaut surprise en Case 5 de la Piste des Tactiques que le Bot Aveugle ignore.',
        createdAt: new Date().toISOString(),
        campaignId: 'camp_v2_ablation_v1_vs_v2',
        defaultParamsA: paramsV1,
        defaultParamsB: paramsV2,
        editionAName: 'Édition 1.0 — Règles Originales',
        editionBName: 'Édition 2.0 — Refonte Coopérative & Simplifiée',
        botProfile: 'COOPERATIVE',
        scoreANormalized: 0.67,
        scoreBNormalized: 0.83,
      },
      {
        id: 'seed_ref_900012',
        seed: 900012,
        title: 'Graine #900012 — Cascade de Rancune & Avalanche (Snowball Contremaître)',
        reasonCategory: 'CRITICAL_DEFEAT',
        description:
          'Montre comment une table Égoïste (N1) subit un effet boule de neige de la Rancune, tandis que la table Coopérative (N2) en Édition 2.0 stabilise la forêt.',
        createdAt: new Date().toISOString(),
        campaignId: 'camp_v2_stress_verification',
        defaultParamsA: paramsV1,
        defaultParamsB: paramsV2,
        editionAName: 'Édition 1.0 — Règles Originales',
        editionBName: 'Édition 2.0 — Refonte Coopérative & Simplifiée',
        botProfile: 'COOPERATIVE',
        scoreANormalized: 0.46,
        scoreBNormalized: 0.75,
      },
    ];
    for (const s of initialSeeds) {
      this.pinnedSeeds.set(s.id, s);
    }
    this.persistSeeds();
  }

  public listEditions(): EditionPreset[] {
    this.ensureInitialized();
    return Array.from(this.editions.values()).sort((a, b) => {
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return a.id.localeCompare(b.id);
    });
  }

  public getEdition(id: string): EditionPreset | undefined {
    this.ensureInitialized();
    return this.editions.get(id);
  }

  public saveEdition(input: {
    id?: string;
    name: string;
    version?: string;
    description?: string;
    switches: MechanicalSwitches;
    defaultParams?: Partial<GameParameters>;
  }): EditionPreset {
    this.ensureInitialized();
    const id = input.id || `ed-custom-${Date.now()}`;
    const existing = this.editions.get(id);
    const preset: EditionPreset = {
      id,
      name: input.name,
      version: input.version || '2.x-custom',
      description:
        input.description ||
        'Variante personnalisée enregistrée dans le Conservatoire.',
      createdAt: existing?.createdAt || new Date().toISOString(),
      isBuiltIn: existing?.isBuiltIn || false,
      switches: { ...input.switches },
      defaultParams: {
        ...DEFAULT_GAME_PARAMETERS,
        ...(input.defaultParams || {}),
        ...input.switches,
      },
    };
    this.editions.set(id, preset);
    this.persistEditions();
    return preset;
  }

  public deleteEdition(id: string): boolean {
    this.ensureInitialized();
    const ed = this.editions.get(id);
    if (!ed || ed.isBuiltIn) return false;
    this.editions.delete(id);
    this.persistEditions();
    return true;
  }

  public listPinnedSeeds(): PinnedSeed[] {
    this.ensureInitialized();
    return Array.from(this.pinnedSeeds.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public savePinnedSeed(
    input: Partial<PinnedSeed> & { seed: number; title: string }
  ): PinnedSeed {
    this.ensureInitialized();
    const id = input.id || `seed_${input.seed}_${Date.now()}`;
    const ps: PinnedSeed = {
      id,
      seed: Number(input.seed),
      title: input.title,
      reasonCategory: input.reasonCategory || 'USER_PINNED',
      description:
        input.description ||
        'Graine épinglée pour inspection comparative côte-à-côte.',
      createdAt: input.createdAt || new Date().toISOString(),
      campaignId: input.campaignId,
      defaultParamsA:
        input.defaultParamsA || { ...DEFAULT_GAME_PARAMETERS, ...V1_SWITCHES },
      defaultParamsB:
        input.defaultParamsB || { ...DEFAULT_GAME_PARAMETERS, ...V2_SWITCHES },
      editionAName: input.editionAName || 'Édition 1.0 — Règles Originales',
      editionBName:
        input.editionBName || 'Édition 2.0 — Refonte Coopérative & Simplifiée',
      botProfile: input.botProfile || 'COOPERATIVE',
      scoreANormalized: input.scoreANormalized ?? 0.7,
      scoreBNormalized: input.scoreBNormalized ?? 0.78,
    };
    this.pinnedSeeds.set(id, ps);
    this.persistSeeds();
    return ps;
  }

  public deletePinnedSeed(id: string): boolean {
    this.ensureInitialized();
    const ok = this.pinnedSeeds.delete(id);
    this.persistSeeds();
    return ok;
  }

  public listCampaigns(): CampaignRecord[] {
    this.ensureInitialized();
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getCampaign(id: string): CampaignRecord | undefined {
    this.ensureInitialized();
    return this.campaigns.get(id);
  }

  public deleteCampaign(id: string): void {
    this.ensureInitialized();
    const ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.stopped = true;
      this.activeControl.delete(id);
    }
    this.campaigns.delete(id);
    this.persistCampaigns();
  }

  public controlCampaign(
    id: string,
    action: 'pause' | 'resume' | 'stop'
  ): CampaignRecord {
    this.ensureInitialized();
    const record = this.campaigns.get(id);
    if (!record) throw new Error('Campagne introuvable');
    const ctrl = this.activeControl.get(id);
    if (action === 'pause' && ctrl) {
      ctrl.paused = true;
      record.status = 'PAUSED';
      record.progress.currentPhaseLabel = 'En pause';
    } else if (action === 'resume') {
      if (ctrl) {
        ctrl.paused = false;
        record.status = 'RUNNING';
      } else if (record.status === 'PAUSED' && record.config.type === 'ORACLE_STRESS_TEST') {
        record.status = 'RUNNING';
        this.runStressTestLoop(record);
      }
    } else if (action === 'stop') {
      if (ctrl) ctrl.stopped = true;
      record.status = 'STOPPED';
      record.completedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'Arrêté sur demande';
    }
    record.updatedAt = new Date().toISOString();
    this.persistCampaigns();
    return record;
  }

  public startCampaign(body: Partial<CampaignConfig>): CampaignRecord {
    this.ensureInitialized();
    const id = body.id || `camp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const config: CampaignConfig = {
      id,
      name: body.name || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`,
      type: body.type || 'EVALUATION_SWEEP',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: Math.max(5, Number(body.gamesPerVariantAndTable) || 35),
      ablationConfig: body.ablationConfig,
      sweep: body.sweep || {
        nValues: [4],
        qValues: [6],
        aValues: [2],
        xValues: [8],
        stockAbatteusesValues: [null],
        modeTirageDesValues: ['MIN_2D6'],
        modeResolutionParcelleValues: ['TRANSACTION_FIGEE'],
        ordreCasseValues: ['AVANT_PARCELLE_1'],
        immobiliteReparationValues: [true],
        ordreMajTactiquesValues: ['ORDRE_PISTE_TAC'],
        rancuneTerrassementDegradeValues: [false],
        granulariteRancuneValues: ['PAR_CASE'],
        nbRegenerationValues: [1],
        ruleNoTargetH1Values: [V1_SWITCHES.ruleNoTargetH1],
        ruleParryModeValues: [V1_SWITCHES.ruleParryMode],
        rulePreventiveDestructionValues: [V1_SWITCHES.rulePreventiveDestruction],
        ruleBulldozerTargetingValues: [V1_SWITCHES.ruleBulldozerTargeting],
        ruleScrapyardExitValues: [V1_SWITCHES.ruleScrapyardExit],
        ruleInitialSetupValues: [V1_SWITCHES.ruleInitialSetup],
      },
      selectedTableConfigs: body.selectedTableConfigs || DEFAULT_TABLE_CONFIGS.slice(0, 4),
      includeCalibrationTables:
        body.includeCalibrationTables !== undefined ? body.includeCalibrationTables : true,
      targetDurationSeconds: body.targetDurationSeconds ?? null,
      maxTotalGames: Number(body.maxTotalGames) || 10000,
      randomizeParametersInStress: Boolean(body.randomizeParametersInStress),
      baseSeed: Number(body.baseSeed) || 42000,
    };

    const variants =
      config.type === 'AB_ABLATION' && config.ablationConfig
        ? expandAblationVariants(config.sweep, config.ablationConfig)
        : expandParameterSweep(config.sweep);

    const tablesCount = config.includeCalibrationTables
      ? config.selectedTableConfigs.length + CALIBRATION_TABLES.length
      : config.selectedTableConfigs.length;

    const totalTargetGames =
      config.type === 'ORACLE_STRESS_TEST'
        ? config.maxTotalGames || 10000
        : variants.length * Math.max(1, tablesCount) * config.gamesPerVariantAndTable;

    const now = new Date().toISOString();
    const record: CampaignRecord = {
      id: config.id,
      config,
      status: 'RUNNING',
      startedAt: now,
      updatedAt: now,
      progress: {
        completedGames: 0,
        totalTargetGames,
        completedVariants: 0,
        totalVariants: variants.length,
        elapsedSeconds: 0,
        gamesPerSecond: 0,
        currentPhaseLabel: 'Initialisation du moteur...',
      },
      variantResults: [],
      stressTelemetry:
        config.type === 'ORACLE_STRESS_TEST'
          ? {
              totalGamesSimulated: 0,
              totalTurnsSimulated: 0,
              elapsedSeconds: 0,
              gamesPerSecond: 0,
              invariantsVerifiedCount: 0,
              violationsCount: 0,
              violationsLog: [],
              stagnantGamesCount: 0,
              earlyWipeoutGamesCount: 0,
              tacticMonopolyGamesCount: 0,
              omniscientUnwinnableSeedsCount: 0,
              edgeCaseOccurrences: createEmptyEdgeCases(),
              scoreDistributionByBotLevel: {
                RANDOM: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                SELFISH: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                BLIND_PROB: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                COOPERATIVE: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                STRATEGIST: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                OMNISCIENT: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
              },
              capturedExtremeLogs: [],
            }
          : undefined,
    };

    this.campaigns.set(record.id, record);
    this.persistCampaigns();

    if (config.type === 'ORACLE_STRESS_TEST') {
      this.runStressTestLoop(record);
    } else {
      this.runEvaluationSweepLoop(record, variants);
    }

    return record;
  }

  private runEvaluationSweepLoop(
    record: CampaignRecord,
    variants: ReturnType<typeof expandParameterSweep>
  ): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);
    const startTimeMs = Date.now();
    let currentVariantIdx = 0;

    const userTables =
      record.config.selectedTableConfigs.length > 0
        ? record.config.selectedTableConfigs
        : DEFAULT_TABLE_CONFIGS.slice(0, 4);

    type CalKey = 'random' | 'selfish' | 'blindProb' | 'cooperative' | 'strategist' | 'omniscient';
    const allTablesToRun: Array<{
      table: TableConfig;
      isUserSelected: boolean;
      calKey?: CalKey;
    }> = [];

    for (const ut of userTables) {
      let calKey: CalKey | undefined;
      if (ut.botProfiles.length === 1) {
        if (ut.botProfiles[0] === 'RANDOM') calKey = 'random';
        else if (ut.botProfiles[0] === 'SELFISH') calKey = 'selfish';
        else if (ut.botProfiles[0] === 'BLIND_PROB') calKey = 'blindProb';
        else if (ut.botProfiles[0] === 'COOPERATIVE') calKey = 'cooperative';
        else if (ut.botProfiles[0] === 'STRATEGIST') calKey = 'strategist';
        else if (ut.botProfiles[0] === 'OMNISCIENT') calKey = 'omniscient';
      }
      allTablesToRun.push({ table: ut, isUserSelected: true, calKey });
    }

    if (record.config.includeCalibrationTables) {
      const calMap: Array<{ table: TableConfig; key: CalKey }> = [
        { table: CALIBRATION_TABLES[0], key: 'random' },
        { table: CALIBRATION_TABLES[1], key: 'selfish' },
        { table: CALIBRATION_TABLES[2], key: 'blindProb' },
        { table: CALIBRATION_TABLES[3], key: 'cooperative' },
        { table: CALIBRATION_TABLES[4], key: 'strategist' },
        { table: CALIBRATION_TABLES[5], key: 'omniscient' },
      ];
      for (const item of calMap) {
        if (!allTablesToRun.some((t) => t.calKey === item.key)) {
          allTablesToRun.push({
            table: item.table,
            isUserSelected: false,
            calKey: item.key,
          });
        }
      }
    }

    record.progress.totalTargetGames =
      variants.length * allTablesToRun.length * record.config.gamesPerVariantAndTable;

    let currentTableIdx = 0;
    let currentGameInTable = 0;
    let currentTableGames: SingleGameResult[] = [];
    let variantTableSummaries: VariantEvaluationResult['tableSummaries'] = [];
    let variantSampleTraces: VariantEvaluationResult['sampleTraces'] = [];
    let variantEdgeCases = createEmptyEdgeCases();
    let variantAllSimulatedGames: SingleGameResult[] = [];

    let gamesByCat: {
      random: SingleGameResult[];
      selfish: SingleGameResult[];
      blindProb: SingleGameResult[];
      cooperative: SingleGameResult[];
      strategist: SingleGameResult[];
      omniscient: SingleGameResult[];
      allPrimaryGames: SingleGameResult[];
    } = {
      random: [],
      selfish: [],
      blindProb: [],
      cooperative: [],
      strategist: [],
      omniscient: [],
      allPrimaryGames: [],
    };

    const stepBatch = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepBatch, 200);
        return;
      }

      const sliceStart = Date.now();
      while (Date.now() - sliceStart < 20 && currentVariantIdx < variants.length) {
        const vSpec = variants[currentVariantIdx];
        const tSpec = allTablesToRun[currentTableIdx];
        const targetG = record.config.gamesPerVariantAndTable;
        const gameSeed =
          (record.config.baseSeed || 42000) + currentGameInTable + 1;

        const shouldRecordTrace = currentGameInTable < 1;
        const gRes = runSingleGame(
          gameSeed,
          vSpec.params,
          tSpec.table.id,
          tSpec.table.botProfiles,
          { recordTraces: shouldRecordTrace }
        );

        currentTableGames.push(gRes);
        variantAllSimulatedGames.push(gRes);
        addEdgeCases(variantEdgeCases, gRes.edgeCases);

        if (tSpec.isUserSelected) {
          gamesByCat.allPrimaryGames.push(gRes);
          if (shouldRecordTrace && gRes.textualJournal) {
            variantSampleTraces.push({
              seed: gRes.seed,
              tableConfigName: tSpec.table.name,
              rawScore: gRes.rawScore,
              normalizedScore: gRes.normalizedScore,
              victoryBracket: gRes.victoryBracket,
              tag: 'TYPICAL',
              textualJournal: gRes.textualJournal,
            });
          }
        }
        if (tSpec.calKey) {
          gamesByCat[tSpec.calKey].push(gRes);
        }

        currentGameInTable++;
        record.progress.completedGames++;

        if (currentGameInTable >= targetG) {
          if (tSpec.isUserSelected) {
            variantTableSummaries.push(
              summarizeTableGames(tSpec.table.id, tSpec.table.name, currentTableGames)
            );
          }
          currentTableGames = [];
          currentGameInTable = 0;
          currentTableIdx++;

          if (currentTableIdx >= allTablesToRun.length) {
            const criteria = evaluateFiveCriteria(vSpec.params, gamesByCat);
            const diagnosticAxes = evaluateFourDiagnosticAxes(vSpec.params, gamesByCat);

            let violationsCount = 0;
            let totalStagnantTurns = 0;
            let tacticMonopolyGamesCount = 0;
            const AllTactics: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

            for (const g of variantAllSimulatedGames) {
              violationsCount += g.violations.length;
              totalStagnantTurns += g.stagnantTurns;
              if (AllTactics.some((t) => g.tacticSlot1Turns[t] >= vSpec.params.x * 0.85)) {
                tacticMonopolyGamesCount++;
              }
            }

            const totalTurns = Math.max(
              1,
              variantAllSimulatedGames.length * vSpec.params.x
            );

            record.variantResults.push({
              variantId: vSpec.variantId,
              variantLabel: vSpec.variantLabel,
              ablationCategory: vSpec.ablationCategory,
              modifiedSwitchesFromA: vSpec.modifiedSwitchesFromA,
              switchesChangedCountFromV1: countSwitchesChangedFromV1(vSpec.params),
              params: vSpec.params,
              tableSummaries: variantTableSummaries,
              criteria,
              diagnosticAxes,
              edgeCaseTotals: variantEdgeCases,
              stagnantTurnsRate: totalStagnantTurns / totalTurns,
              slot1MonopolyGamesRate:
                variantAllSimulatedGames.length > 0
                  ? tacticMonopolyGamesCount / variantAllSimulatedGames.length
                  : 0,
              invariantViolationsCount: violationsCount,
              sampleTraces: variantSampleTraces.slice(0, 4),
            });

            record.progress.completedVariants++;
            currentVariantIdx++;
            currentTableIdx = 0;
            variantTableSummaries = [];
            variantSampleTraces = [];
            variantEdgeCases = createEmptyEdgeCases();
            variantAllSimulatedGames = [];
            gamesByCat = {
              random: [],
              selfish: [],
              blindProb: [],
              cooperative: [],
              strategist: [],
              omniscient: [],
              allPrimaryGames: [],
            };
          }
        }
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = record.progress.completedGames / elapsedSec;
      record.updatedAt = new Date().toISOString();

      if (currentVariantIdx < variants.length) {
        const curV = variants[currentVariantIdx];
        const curT = allTablesToRun[currentTableIdx];
        record.progress.currentPhaseLabel = `Variante ${currentVariantIdx + 1}/${variants.length} (${curV.variantLabel}) — ${curT.table.name}`;
        setTimeout(stepBatch, 0);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Campagne terminée (${record.variantResults.length} variante(s) évaluée(s))`;
        this.persistCampaigns();
        this.activeControl.delete(record.id);
      }
    };

    setTimeout(stepBatch, 0);
  }

  private runStressTestLoop(record: CampaignRecord): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now() - (record.progress.elapsedSeconds || 0) * 1000;
    const variants = expandParameterSweep(record.config.sweep);
    const paramRng = new SeededRNG(
      (record.config.baseSeed || 77777) + record.progress.completedGames
    );
    const botLevels: BotProfileId[] = [
      'COOPERATIVE',
      'STRATEGIST',
      'SELFISH',
      'BLIND_PROB',
      'OMNISCIENT',
      'RANDOM',
    ];

    const telemetry = record.stressTelemetry!;
    const botSums: Record<
      BotProfileId,
      { sumNorm: number; defeats: number; miracles: number }
    > = {
      RANDOM: { sumNorm: 0, defeats: 0, miracles: 0 },
      SELFISH: { sumNorm: 0, defeats: 0, miracles: 0 },
      BLIND_PROB: { sumNorm: 0, defeats: 0, miracles: 0 },
      COOPERATIVE: { sumNorm: 0, defeats: 0, miracles: 0 },
      STRATEGIST: { sumNorm: 0, defeats: 0, miracles: 0 },
      OMNISCIENT: { sumNorm: 0, defeats: 0, miracles: 0 },
    };

    const stepStress = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepStress, 250);
        return;
      }

      const sliceStart = Date.now();
      const maxGames = record.config.maxTotalGames || 10000;
      const maxDurationSec = record.config.targetDurationSeconds || null;

      while (Date.now() - sliceStart < 20) {
        const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
        if (telemetry.totalGamesSimulated >= maxGames) break;
        if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) break;

        const gameIdx = telemetry.totalGamesSimulated;
        const seed = (record.config.baseSeed || 900000) + gameIdx + 1;

        let params: GameParameters;
        if (record.config.randomizeParametersInStress) {
          params = {
            n: paramRng.nextInt(3, 6),
            q: paramRng.nextInt(4, 8),
            a: paramRng.nextInt(1, 3),
            x: paramRng.nextInt(6, 10),
            stockAbatteuses:
              paramRng.nextFloat() < 0.7 ? null : paramRng.nextInt(4, 12),
            modeTirageDes: (['MIN_2D6', '1D6'] as const)[paramRng.nextInt(0, 1)],
            modeResolutionParcelle:
              paramRng.nextFloat() < 0.8 ? 'TRANSACTION_FIGEE' : 'SEQUENTIEL',
            ordreCasse:
              paramRng.nextFloat() < 0.8 ? 'AVANT_PARCELLE_1' : 'APRES_PARCELLE_Q',
            immobiliteReparation: paramRng.nextFloat() < 0.85,
            ordreMajTactiques:
              paramRng.nextFloat() < 0.8 ? 'ORDRE_PISTE_TAC' : 'FIXE',
            rancuneTerrassementDegrade: paramRng.nextFloat() < 0.25,
            granulariteRancune: (
              ['PAR_CASE', 'PAR_EVENEMENT', 'CARTE_ET_DESTRUCTION'] as const
            )[paramRng.nextInt(0, 2)],
            nbRegeneration: paramRng.nextInt(0, 2),
            rMaxCycles: 5,
            ruleNoTargetH1:
              paramRng.nextFloat() < 0.5
                ? 'V1_NO_EFFECT'
                : 'V2_FALLBACK_DEPLOY_AND_RETREAT',
            ruleParryMode:
              paramRng.nextFloat() < 0.5
                ? 'V1_UNLIMITED_PER_CELL'
                : 'V2_UNITARY_PER_CARD',
            rulePreventiveDestruction:
              paramRng.nextFloat() < 0.5 ? 'V1_ALLOWED' : 'V2_CARD_REQUIRED',
            ruleBulldozerTargeting:
              paramRng.nextFloat() < 0.5
                ? 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE'
                : 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE',
            ruleScrapyardExit:
              paramRng.nextFloat() < 0.5 ? 'V1_PASSIVE_D1' : 'V2_OFFENSIVE_D2',
            ruleInitialSetup:
              paramRng.nextFloat() < 0.5
                ? 'V1_SPARSE_RANK3_EMPTY'
                : 'V2_SMOOTH_DENSE',
          };
        } else {
          params = variants[gameIdx % variants.length].params;
        }

        const chosenBot = botLevels[gameIdx % botLevels.length];
        const res = runSingleGame(seed, params, `stress_${chosenBot}`, [chosenBot], {
          recordTraces: false,
        });

        telemetry.totalGamesSimulated += 1;
        telemetry.totalTurnsSimulated += params.x;
        telemetry.invariantsVerifiedCount += (params.x * 2 + 2) * 4;
        addEdgeCases(telemetry.edgeCaseOccurrences, res.edgeCases);

        const bStat = telemetry.scoreDistributionByBotLevel[chosenBot];
        const bSum = botSums[chosenBot];
        bStat.games += 1;
        bSum.sumNorm += res.normalizedScore;
        if (res.victoryBracket === 'DEFEAT') bSum.defeats += 1;
        if (res.victoryBracket === 'MIRACLE') bSum.miracles += 1;
        bStat.meanNormalized = bSum.sumNorm / bStat.games;
        bStat.minNormalized = Math.min(bStat.minNormalized, res.normalizedScore);
        bStat.maxNormalized = Math.max(bStat.maxNormalized, res.normalizedScore);
        bStat.defeatRate = bSum.defeats / bStat.games;
        bStat.miracleRate = bSum.miracles / bStat.games;

        if (res.violations.length > 0) {
          telemetry.violationsCount += res.violations.length;
          telemetry.violationsLog.push(...res.violations.slice(0, 10));
        }
        if (res.stagnantTurns > 0) telemetry.stagnantGamesCount += 1;
        if (res.earlyWipeoutTurn !== null) telemetry.earlyWipeoutGamesCount += 1;

        record.progress.completedGames = telemetry.totalGamesSimulated;
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      telemetry.elapsedSeconds = elapsedSec;
      telemetry.gamesPerSecond = telemetry.totalGamesSimulated / elapsedSec;
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = telemetry.gamesPerSecond;
      record.updatedAt = new Date().toISOString();

      const targetReached =
        telemetry.totalGamesSimulated >= maxGames ||
        (maxDurationSec !== null && elapsedSec >= maxDurationSec);

      if (!targetReached) {
        record.progress.currentPhaseLabel = `Exploration en cours (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties)...`;
        setTimeout(stepStress, 0);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Stress-Test terminé : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées, ${telemetry.violationsCount} violation(s).`;
        this.persistCampaigns();
        this.activeControl.delete(record.id);
      }
    };

    setTimeout(stepStress, 0);
  }

  private createInitialReferenceCampaigns(): void {
    this.startCampaign({
      id: 'camp_v2_ablation_v1_vs_v2',
      name: 'Test Croisé & Ablation de Référence — Édition 1.0 (Origine) ↔ Édition 2.0 (Refonte)',
      type: 'AB_ABLATION',
      gamesPerVariantAndTable: 25,
      ablationConfig: {
        editionAId: 'ed-v1-original',
        editionBId: 'ed-v2-refonte',
        editionASwitches: { ...V1_SWITCHES },
        editionBSwitches: { ...V2_SWITCHES },
        editionAName: 'Édition 1.0 — Règles Originales',
        editionBName: 'Édition 2.0 — Refonte Coopérative & Simplifiée',
        includeLayer2SingleAdditions: true,
        includeLayer3SingleAblations: true,
        includeLayer4FullFactorial: false,
      },
      baseSeed: 42000,
    });

    this.startCampaign({
      id: 'camp_v2_stress_verification',
      name: 'Vérification Formelle v2.0 — 64 Hybrides V1/V2, Invariants I1-I4 & Cas Limites H1-H7b',
      type: 'ORACLE_STRESS_TEST',
      maxTotalGames: 600,
      randomizeParametersInStress: true,
      baseSeed: 900000,
    });
  }

  public compareSeed(payload: {
    seed: number;
    editionAId?: string;
    editionBId?: string;
    paramsA?: GameParameters;
    paramsB?: GameParameters;
    editionAName?: string;
    editionBName?: string;
    botProfile?: BotProfileId;
    vocabulary?: ThemeVocabularyMode;
  }): SideBySideComparisonResult {
    this.ensureInitialized();
    const seed = Number(payload.seed) || 42001;
    const edA =
      this.getEdition(payload.editionAId || 'ed-v1-original') || BUILTIN_EDITIONS[0];
    const edB =
      this.getEdition(payload.editionBId || 'ed-v2-refonte') || BUILTIN_EDITIONS[1];

    const paramsA: GameParameters = payload.paramsA
      ? { ...DEFAULT_GAME_PARAMETERS, ...payload.paramsA }
      : { ...DEFAULT_GAME_PARAMETERS, ...edA.defaultParams, ...edA.switches };
    const paramsB: GameParameters = payload.paramsB
      ? { ...DEFAULT_GAME_PARAMETERS, ...payload.paramsB }
      : { ...DEFAULT_GAME_PARAMETERS, ...edB.defaultParams, ...edB.switches };

    return runSideBySideComparison(
      seed,
      paramsA,
      paramsB,
      payload.editionAName || edA.name,
      payload.editionBName || edB.name,
      payload.botProfile || 'COOPERATIVE',
      payload.vocabulary || 'AMAZONIA'
    );
  }
}

export const browserCampaignManager = new BrowserCampaignManager();

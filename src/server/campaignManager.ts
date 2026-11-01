import fs from 'fs';
import path from 'path';
import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  EditionPreset,
  GameParameters,
  MechanicalSwitches,
  PinnedSeed,
  SingleGameResult,
  TableConfig,
  TacticId,
  VariantEvaluationResult,
} from '../sim/types';
import {
  BUILTIN_EDITIONS,
  countSwitchesChangedFromV1,
  DEFAULT_GAME_PARAMETERS,
  DEFAULT_TABLE_CONFIGS,
  V1_SWITCHES,
  V2_SWITCHES,
} from '../sim/i18n';
import { createEmptyEdgeCases, runSingleGame } from '../sim/engine';
import {
  addEdgeCases,
  evaluateFiveCriteria,
  evaluateFourDiagnosticAxes,
  expandAblationVariants,
  expandParameterSweep,
  summarizeTableGames,
} from '../sim/evaluator';
import { SeededRNG } from '../sim/rng';

const DATA_ROOT = path.resolve(process.cwd(), 'data');
const CAMPAIGNS_DIR = path.join(DATA_ROOT, 'campaigns');
const EDITIONS_DIR = path.join(DATA_ROOT, 'editions');
const SEEDS_DIR = path.join(DATA_ROOT, 'seeds');

function ensureDataDirs(): void {
  for (const dir of [CAMPAIGNS_DIR, EDITIONS_DIR, SEEDS_DIR]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

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

export class CampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private editions: Map<string, EditionPreset> = new Map();
  private pinnedSeeds: Map<string, PinnedSeed> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();

  constructor() {
    ensureDataDirs();
    this.loadEditionsFromDisk();
    this.loadSeedsFromDisk();
    this.loadCampaignsFromDisk();
    if (this.campaigns.size === 0) {
      this.createInitialReferenceCampaigns();
    }
  }

  // ============================================================================
  // NIVEAU 1 DU CONSERVATOIRE : ÉDITIONS & VARIANTES SAUVEGARDÉES
  // ============================================================================
  private loadEditionsFromDisk(): void {
    for (const builtin of BUILTIN_EDITIONS) {
      this.editions.set(builtin.id, builtin);
      const fp = path.join(EDITIONS_DIR, `${builtin.id}.json`);
      if (!fs.existsSync(fp)) {
        fs.writeFileSync(fp, JSON.stringify(builtin, null, 2), 'utf-8');
      }
    }

    try {
      const files = fs.readdirSync(EDITIONS_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const raw = fs.readFileSync(path.join(EDITIONS_DIR, file), 'utf-8');
        const ed = JSON.parse(raw) as EditionPreset;
        if (ed && ed.id && ed.switches) {
          this.editions.set(ed.id, ed);
        }
      }
    } catch (err) {
      console.error('Erreur chargement éditions :', err);
    }
  }

  public listEditions(): EditionPreset[] {
    return Array.from(this.editions.values()).sort((a, b) => {
      if (a.isBuiltIn && !b.isBuiltIn) return -1;
      if (!a.isBuiltIn && b.isBuiltIn) return 1;
      return a.id.localeCompare(b.id);
    });
  }

  public getEdition(id: string): EditionPreset | undefined {
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
    ensureDataDirs();
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
    fs.writeFileSync(path.join(EDITIONS_DIR, `${id}.json`), JSON.stringify(preset, null, 2), 'utf-8');
    return preset;
  }

  public deleteEdition(id: string): boolean {
    const ed = this.editions.get(id);
    if (!ed || ed.isBuiltIn) return false;
    this.editions.delete(id);
    const fp = path.join(EDITIONS_DIR, `${id}.json`);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  }

  // ============================================================================
  // NIVEAU 3 DU CONSERVATOIRE : GRAINES REMARQUABLES ÉPINGLÉES
  // ============================================================================
  private loadSeedsFromDisk(): void {
    try {
      const files = fs.readdirSync(SEEDS_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const raw = fs.readFileSync(path.join(SEEDS_DIR, file), 'utf-8');
        const ps = JSON.parse(raw) as PinnedSeed;
        if (ps && ps.id && ps.title) {
          this.pinnedSeeds.set(ps.id, ps);
        }
      }
    } catch (err) {
      console.error('Erreur chargement graines épinglées :', err);
    }

    if (this.pinnedSeeds.size === 0) {
      this.createInitialPinnedSeeds();
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
      this.savePinnedSeed(s);
    }
  }

  public listPinnedSeeds(): PinnedSeed[] {
    return Array.from(this.pinnedSeeds.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  public savePinnedSeed(
    input: Partial<PinnedSeed> & { seed: number; title: string }
  ): PinnedSeed {
    ensureDataDirs();
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
    fs.writeFileSync(path.join(SEEDS_DIR, `${id}.json`), JSON.stringify(ps, null, 2), 'utf-8');
    return ps;
  }

  public deletePinnedSeed(id: string): boolean {
    const exists = this.pinnedSeeds.has(id);
    if (!exists) return false;
    this.pinnedSeeds.delete(id);
    const fp = path.join(SEEDS_DIR, `${id}.json`);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return true;
  }

  // ============================================================================
  // NIVEAU 2 DU CONSERVATOIRE : CAMPAGNES & BANCS D'ESSAI
  // ============================================================================
  private loadCampaignsFromDisk(): void {
    try {
      const files = fs.readdirSync(CAMPAIGNS_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(CAMPAIGNS_DIR, file);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const record = JSON.parse(raw) as CampaignRecord;
        const isV2Compatible =
          record.config?.type === 'ORACLE_STRESS_TEST'
            ? Boolean(record.stressTelemetry?.scoreDistributionByBotLevel?.BLIND_PROB)
            : record.variantResults.length === 0 ||
              (Boolean(record.variantResults[0]?.criteria?.simplicitySobriety) &&
                Boolean(record.variantResults[0]?.diagnosticAxes));

        if (!isV2Compatible) {
          fs.unlinkSync(fullPath);
          continue;
        }

        if (record.status === 'RUNNING') {
          record.status = 'PAUSED';
          record.progress.currentPhaseLabel =
            'Interrompu par redémarrage serveur (Prêt à reprendre)';
        }
        this.campaigns.set(record.id, record);
      }
    } catch (err) {
      console.error('Erreur chargement des campagnes depuis le disque :', err);
    }
  }

  public saveToDisk(record: CampaignRecord): void {
    try {
      ensureDataDirs();
      const filePath = path.join(CAMPAIGNS_DIR, `${record.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Erreur sauvegarde campagne ${record.id} :`, err);
    }
  }

  public listCampaigns(): CampaignRecord[] {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getCampaign(id: string): CampaignRecord | undefined {
    return this.campaigns.get(id);
  }

  public deleteCampaign(id: string): boolean {
    const ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.stopped = true;
      this.activeControl.delete(id);
    }
    this.campaigns.delete(id);
    const filePath = path.join(CAMPAIGNS_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  public pauseCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    const ctrl = this.activeControl.get(id);
    if (record && ctrl && record.status === 'RUNNING') {
      ctrl.paused = true;
      record.status = 'PAUSED';
      record.updatedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'En pause (Supervision utilisateur)';
      this.saveToDisk(record);
    }
    return record;
  }

  public resumeCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    if (!record) return undefined;
    const ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.paused = false;
      record.status = 'RUNNING';
      record.updatedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'Reprise de la simulation en arrière-plan...';
    } else if (record.status === 'PAUSED' && record.config.type === 'ORACLE_STRESS_TEST') {
      record.status = 'RUNNING';
      this.runStressTestLoop(record);
    }
    return record;
  }

  public stopCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    const ctrl = this.activeControl.get(id);
    if (record) {
      if (ctrl) {
        ctrl.stopped = true;
      }
      record.status = 'STOPPED';
      record.completedAt = new Date().toISOString();
      record.updatedAt = record.completedAt;
      record.progress.currentPhaseLabel = 'Arrêté et consolidé sur demande';
      this.saveToDisk(record);
    }
    return record;
  }

  public startCampaign(config: CampaignConfig): CampaignRecord {
    const now = new Date().toISOString();
    const variants =
      config.type === 'AB_ABLATION' && config.ablationConfig
        ? expandAblationVariants(config.sweep, config.ablationConfig)
        : expandParameterSweep(config.sweep);
    const totalVariants = variants.length;

    let totalTargetGames = 0;
    if (config.type === 'EVALUATION_SWEEP' || config.type === 'AB_ABLATION') {
      const tablesCount = config.includeCalibrationTables
        ? config.selectedTableConfigs.length + CALIBRATION_TABLES.length
        : config.selectedTableConfigs.length;
      totalTargetGames =
        totalVariants * Math.max(1, tablesCount) * config.gamesPerVariantAndTable;
    } else {
      totalTargetGames = config.maxTotalGames || 100000;
    }

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
        totalVariants,
        elapsedSeconds: 0,
        gamesPerSecond: 0,
        currentPhaseLabel: 'Initialisation du moteur asynchrone v2.0...',
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
    this.saveToDisk(record);

    if (config.type === 'EVALUATION_SWEEP' || config.type === 'AB_ABLATION') {
      this.runEvaluationSweepLoop(record, variants);
    } else {
      this.runStressTestLoop(record);
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
        : [
            DEFAULT_TABLE_CONFIGS[0],
            DEFAULT_TABLE_CONFIGS[1],
            DEFAULT_TABLE_CONFIGS[2],
            DEFAULT_TABLE_CONFIGS[3],
          ];

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
      while (Date.now() - sliceStart < 25 && currentVariantIdx < variants.length) {
        const vSpec = variants[currentVariantIdx];
        const tSpec = allTablesToRun[currentTableIdx];
        const targetG = record.config.gamesPerVariantAndTable;

        // Réduction de variance par Graines Appariées (Paired Seeds / CRN)
        const gameSeed =
          (record.config.baseSeed || 42000) + currentGameInTable + 1;

        const shouldRecordTrace = currentGameInTable < 2;
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
              tag:
                gRes.normalizedScore >= 0.48 && gRes.normalizedScore <= 0.78
                  ? 'HIGH_TENSION'
                  : 'TYPICAL',
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
            const summary = summarizeTableGames(
              tSpec.table.id,
              tSpec.table.name,
              currentTableGames
            );
            variantTableSummaries.push(summary);
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

            const vResult: VariantEvaluationResult = {
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
              sampleTraces: variantSampleTraces.slice(0, 6),
            };

            record.variantResults.push(vResult);

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

        if (Date.now() - ctrl.lastSavedAt > 3000) {
          this.saveToDisk(record);
          ctrl.lastSavedAt = Date.now();
        }
        setImmediate(stepBatch);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Campagne terminée (${record.variantResults.length} variante(s) évaluée(s))`;
        this.saveToDisk(record);
        this.activeControl.delete(record.id);
      }
    };

    setImmediate(stepBatch);
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

    for (const b of botLevels) {
      const existing = telemetry.scoreDistributionByBotLevel[b];
      if (existing && existing.games > 0) {
        botSums[b].sumNorm = existing.meanNormalized * existing.games;
        botSums[b].defeats = Math.round(existing.defeatRate * existing.games);
        botSums[b].miracles = Math.round(existing.miracleRate * existing.games);
      }
    }

    const stepStressBatch = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepStressBatch, 250);
        return;
      }

      const sliceStart = Date.now();
      const maxGames = record.config.maxTotalGames || 1000000;
      const maxDurationSec = record.config.targetDurationSeconds || null;

      while (Date.now() - sliceStart < 25) {
        const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
        if (telemetry.totalGamesSimulated >= maxGames) {
          break;
        }
        if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) {
          break;
        }

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
            // MAX_2D6 est strictement exclu des stress-tests aléatoires
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

        let captureCategory:
          | 'INVARIANT_VIOLATION'
          | 'EARLY_WIPEOUT'
          | 'STAGNATION'
          | 'TACTIC_MONOPOLY'
          | 'OMNISCIENT_DEFEAT'
          | 'RECORD_EDGE_CASES'
          | null = null;
        let captureSummary = '';

        if (res.violations.length > 0) {
          telemetry.violationsCount += res.violations.length;
          for (const v of res.violations) {
            if (telemetry.violationsLog.length < 50) {
              telemetry.violationsLog.push(v);
            }
          }
          captureCategory = 'INVARIANT_VIOLATION';
          captureSummary = res.violations[0].message;
        }

        if (res.stagnantTurns > 0) {
          telemetry.stagnantGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'STAGNATION';
            captureSummary = `${res.stagnantTurns} tour(s) stagnant(s) sans évolution d'état ni mouvement.`;
          }
        }

        if (res.earlyWipeoutTurn !== null) {
          telemetry.earlyWipeoutGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'EARLY_WIPEOUT';
            captureSummary = `Destruction totale de la forêt dès le tour ${res.earlyWipeoutTurn}/${params.x} (Bot: ${chosenBot}).`;
          }
        }

        const AllTactics: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
        const monopolyTac = AllTactics.find((t) => res.tacticSlot1Turns[t] === params.x);
        if (monopolyTac) {
          telemetry.tacticMonopolyGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'TACTIC_MONOPOLY';
            captureSummary = `La tactique ${monopolyTac} est restée verrouillée en Case 1 pendant 100% des ${params.x} tours.`;
          }
        }

        if (chosenBot === 'OMNISCIENT' && res.victoryBracket === 'DEFEAT') {
          telemetry.omniscientUnwinnableSeedsCount += 1;
          if (!captureCategory) {
            captureCategory = 'OMNISCIENT_DEFEAT';
            captureSummary = `Graine très punitive : même le Bot Omniscient subit une Défaite (${(res.normalizedScore * 100).toFixed(1)}% d'arbres sauvés).`;
          }
        }

        const totalEdgeInGame =
          res.edgeCases.H1_noTargetEligible +
          res.edgeCases.H2_multipleHarvesterCardsSingleTree +
          res.edgeCases.H3_multipleBulldozerCardsSameCell +
          res.edgeCases.H4_repairedBulldozerImmunityInCell1;
        if (!captureCategory && totalEdgeInGame >= 5) {
          captureCategory = 'RECORD_EDGE_CASES';
          captureSummary = `Forte concentration de cas limites en une seule partie (${totalEdgeInGame} occurrences H1-H4).`;
        }

        if (captureCategory && telemetry.capturedExtremeLogs.length < 12) {
          const alreadyHasCategoryCount = telemetry.capturedExtremeLogs.filter(
            (l) => l.category === captureCategory
          ).length;
          if (alreadyHasCategoryCount < 3 || captureCategory === 'INVARIANT_VIOLATION') {
            const detailed = runSingleGame(
              seed,
              params,
              `stress_${chosenBot}`,
              [chosenBot],
              { recordTraces: true }
            );
            telemetry.capturedExtremeLogs.push({
              seed,
              category: captureCategory,
              summary: captureSummary,
              params,
              textualJournal: detailed.textualJournal || '',
            });
          }
        }

        record.progress.completedGames = telemetry.totalGamesSimulated;
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      telemetry.elapsedSeconds = elapsedSec;
      telemetry.gamesPerSecond = telemetry.totalGamesSimulated / elapsedSec;
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = telemetry.gamesPerSecond;
      record.updatedAt = new Date().toISOString();

      const targetReached =
        telemetry.totalGamesSimulated >= (record.config.maxTotalGames || 1000000) ||
        (record.config.targetDurationSeconds !== null &&
          record.config.targetDurationSeconds !== undefined &&
          elapsedSec >= record.config.targetDurationSeconds);

      if (!targetReached) {
        record.progress.currentPhaseLabel = `Exploration intensive en cours (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties, ${telemetry.invariantsVerifiedCount.toLocaleString('fr-FR')} invariants vérifiés)...`;
        if (Date.now() - ctrl.lastSavedAt > 4000) {
          this.saveToDisk(record);
          ctrl.lastSavedAt = Date.now();
        }
        setImmediate(stepStressBatch);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Stress-Test terminé : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées, ${telemetry.violationsCount} violation(s) d'invariants.`;
        this.saveToDisk(record);
        this.activeControl.delete(record.id);
      }
    };

    setImmediate(stepStressBatch);
  }

  private createInitialReferenceCampaigns(): void {
    const ablationConfig: CampaignConfig = {
      id: 'camp_v2_ablation_v1_vs_v2',
      name: 'Test Croisé & Ablation de Référence — Édition 1.0 (Origine) ↔ Édition 2.0 (Refonte)',
      type: 'AB_ABLATION',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: 45,
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
      sweep: {
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
        ruleNoTargetH1Values: ['V1_NO_EFFECT'],
        ruleParryModeValues: ['V1_UNLIMITED_PER_CELL'],
        rulePreventiveDestructionValues: ['V1_ALLOWED'],
        ruleBulldozerTargetingValues: ['V1_SCRAPYARD_ZERO_AND_REVERSE_TIE'],
        ruleScrapyardExitValues: ['V1_PASSIVE_D1'],
        ruleInitialSetupValues: ['V1_SPARSE_RANK3_EMPTY'],
      },
      selectedTableConfigs: [
        DEFAULT_TABLE_CONFIGS[0], // Coopératif N2
        DEFAULT_TABLE_CONFIGS[1], // Stratège N3
        DEFAULT_TABLE_CONFIGS[2], // Égoïste N1
        DEFAULT_TABLE_CONFIGS[3], // Aveugle Probabiliste
        DEFAULT_TABLE_CONFIGS[5], // Omniscient
      ],
      includeCalibrationTables: true,
      baseSeed: 42000,
    };

    const stressConfig: CampaignConfig = {
      id: 'camp_v2_stress_verification',
      name: 'Vérification Formelle v2.0 — 64 Hybrides V1/V2, Invariants I1-I4 & Cas Limites H1-H7b',
      type: 'ORACLE_STRESS_TEST',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: 100,
      sweep: {
        nValues: [3, 4, 5, 6],
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
        ruleNoTargetH1Values: [V1_SWITCHES.ruleNoTargetH1, V2_SWITCHES.ruleNoTargetH1],
        ruleParryModeValues: [V1_SWITCHES.ruleParryMode, V2_SWITCHES.ruleParryMode],
        rulePreventiveDestructionValues: [
          V1_SWITCHES.rulePreventiveDestruction,
          V2_SWITCHES.rulePreventiveDestruction,
        ],
        ruleBulldozerTargetingValues: [
          V1_SWITCHES.ruleBulldozerTargeting,
          V2_SWITCHES.ruleBulldozerTargeting,
        ],
        ruleScrapyardExitValues: [
          V1_SWITCHES.ruleScrapyardExit,
          V2_SWITCHES.ruleScrapyardExit,
        ],
        ruleInitialSetupValues: [
          V1_SWITCHES.ruleInitialSetup,
          V2_SWITCHES.ruleInitialSetup,
        ],
      },
      selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
      includeCalibrationTables: true,
      maxTotalGames: 1200,
      targetDurationSeconds: null,
      randomizeParametersInStress: true,
      baseSeed: 900000,
    };

    this.startCampaign(ablationConfig);
    this.startCampaign(stressConfig);
  }
}

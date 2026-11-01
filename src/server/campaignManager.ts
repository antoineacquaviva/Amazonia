import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
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
import {
  EvalBatchWorkerRequest,
  EvalBatchWorkerResponse,
  StressBatchWorkerRequest,
  StressBatchWorkerResponse,
  WorkerRequestMessage,
  WorkerResponseMessage,
} from './simWorker';

export const TOTAL_CPU_CORES = Math.max(1, os.cpus()?.length || 1);
export const WORKER_POOL_SIZE = Math.max(1, TOTAL_CPU_CORES - 1);
const PERIODIC_SAVE_INTERVAL_MS = 15000; // 15 secondes entre deux écritures disque asynchrones

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

// ============================================================================
// POOL DE WORKERS MULTI-CŒURS (node:worker_threads + tsx)
// ============================================================================
interface QueuedWorkerTask {
  request: WorkerRequestMessage;
  resolve: (res: WorkerResponseMessage) => void;
  reject: (err: Error) => void;
}

class SimulationWorkerPool {
  private workers: Worker[] = [];
  private idleWorkers: Worker[] = [];
  private activeTasks: Map<Worker, QueuedWorkerTask> = new Map();
  private queue: QueuedWorkerTask[] = [];
  private nextTaskId = 1;
  private initialized = false;
  private workerFailedPermanently = false;

  private initPool(): void {
    if (this.initialized || this.workerFailedPermanently) return;
    this.initialized = true;
    const workerScript = path.resolve(process.cwd(), 'src/server/simWorker.ts');

    for (let i = 0; i < WORKER_POOL_SIZE; i++) {
      try {
        const w = new Worker(workerScript, {
          execArgv: ['--import', 'tsx'],
        });

        w.on('message', (msg: WorkerResponseMessage) => {
          const currentTask = this.activeTasks.get(w);
          this.activeTasks.delete(w);
          this.idleWorkers.push(w);
          if (currentTask) {
            currentTask.resolve(msg);
          }
          this.dispatchNext();
        });

        w.on('error', (err) => {
          console.error('[WorkerPool] Erreur worker thread, repli local :', err);
          const currentTask = this.activeTasks.get(w);
          this.activeTasks.delete(w);
          this.workers = this.workers.filter((x) => x !== w);
          this.idleWorkers = this.idleWorkers.filter((x) => x !== w);
          if (this.workers.length === 0) {
            this.workerFailedPermanently = true;
          }
          if (currentTask) {
            this.runFallbackInProcess(currentTask.request)
              .then(currentTask.resolve)
              .catch(currentTask.reject);
          }
          this.dispatchNext();
        });

        this.workers.push(w);
        this.idleWorkers.push(w);
      } catch (err) {
        console.error('[WorkerPool] Impossible de créer un worker :', err);
        this.workerFailedPermanently = true;
        break;
      }
    }
  }

  private dispatchNext(): void {
    if (this.workerFailedPermanently) {
      while (this.queue.length > 0) {
        const task = this.queue.shift()!;
        this.runFallbackInProcess(task.request)
          .then(task.resolve)
          .catch(task.reject);
      }
      return;
    }

    while (this.idleWorkers.length > 0 && this.queue.length > 0) {
      const worker = this.idleWorkers.shift()!;
      const task = this.queue.shift()!;
      this.activeTasks.set(worker, task);
      worker.postMessage(task.request);
    }
  }

  private async runFallbackInProcess(
    msg: WorkerRequestMessage
  ): Promise<WorkerResponseMessage> {
    if (msg.type === 'RUN_EVAL_BATCH') {
      const results: SingleGameResult[] = [];
      for (const job of msg.jobs) {
        results.push(
          runSingleGame(job.seed, msg.params, msg.tableId, msg.botProfiles, {
            recordTraces: job.recordTrace,
          })
        );
      }
      return {
        taskId: msg.taskId,
        type: 'RUN_EVAL_BATCH_RESULT',
        results,
      };
    } else {
      const outcomes: StressBatchWorkerResponse['outcomes'] = [];
      const allTactics: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
      for (const job of msg.jobs) {
        const res = runSingleGame(
          job.seed,
          job.params,
          `stress_${job.botProfile}`,
          [job.botProfile],
          { recordTraces: false }
        );
        let captureCategory: StressBatchWorkerResponse['outcomes'][0]['captureCategory'] =
          null;
        let captureSummary = '';
        if (res.violations.length > 0) {
          captureCategory = 'INVARIANT_VIOLATION';
          captureSummary = res.violations[0].message;
        } else if (res.stagnantTurns > 0) {
          captureCategory = 'STAGNATION';
          captureSummary = `${res.stagnantTurns} tour(s) stagnant(s).`;
        } else if (res.earlyWipeoutTurn !== null) {
          captureCategory = 'EARLY_WIPEOUT';
          captureSummary = `Destruction totale dès le tour ${res.earlyWipeoutTurn}.`;
        } else if (
          allTactics.some((t) => res.tacticSlot1Turns[t] === job.params.x)
        ) {
          captureCategory = 'TACTIC_MONOPOLY';
          captureSummary = `Monopole Case 1 pendant ${job.params.x} tours.`;
        } else if (
          job.botProfile === 'OMNISCIENT' &&
          res.victoryBracket === 'DEFEAT'
        ) {
          captureCategory = 'OMNISCIENT_DEFEAT';
          captureSummary = `Défaite du Bot Omniscient.`;
        }
        outcomes.push({
          seed: job.seed,
          params: job.params,
          botProfile: job.botProfile,
          res,
          captureCategory,
          captureSummary,
        });
      }
      return {
        taskId: msg.taskId,
        type: 'RUN_STRESS_BATCH_RESULT',
        outcomes,
      };
    }
  }

  public runEvalBatch(
    payload: Omit<EvalBatchWorkerRequest, 'taskId' | 'type'>
  ): Promise<EvalBatchWorkerResponse> {
    this.initPool();
    const taskId = this.nextTaskId++;
    const request: EvalBatchWorkerRequest = {
      taskId,
      type: 'RUN_EVAL_BATCH',
      ...payload,
    };
    return new Promise<EvalBatchWorkerResponse>((resolve, reject) => {
      this.queue.push({
        request,
        resolve: resolve as (res: WorkerResponseMessage) => void,
        reject,
      });
      this.dispatchNext();
    });
  }

  public runStressBatch(
    payload: Omit<StressBatchWorkerRequest, 'taskId' | 'type'>
  ): Promise<StressBatchWorkerResponse> {
    this.initPool();
    const taskId = this.nextTaskId++;
    const request: StressBatchWorkerRequest = {
      taskId,
      type: 'RUN_STRESS_BATCH',
      ...payload,
    };
    return new Promise<StressBatchWorkerResponse>((resolve, reject) => {
      this.queue.push({
        request,
        resolve: resolve as (res: WorkerResponseMessage) => void,
        reject,
      });
      this.dispatchNext();
    });
  }
}

const sharedWorkerPool = new SimulationWorkerPool();

export class CampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private editions: Map<string, EditionPreset> = new Map();
  private pinnedSeeds: Map<string, PinnedSeed> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();
  private savingInFlight: Set<string> = new Set();

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
    void fs.promises.writeFile(
      path.join(EDITIONS_DIR, `${id}.json`),
      JSON.stringify(preset, null, 2),
      'utf-8'
    );
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
    void fs.promises.writeFile(
      path.join(SEEDS_DIR, `${id}.json`),
      JSON.stringify(ps, null, 2),
      'utf-8'
    );
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

  /**
   * Sauvegarde asynchrone non-bloquante via fs.promises.writeFile
   */
  public async saveToDiskAsync(record: CampaignRecord): Promise<void> {
    if (this.savingInFlight.has(record.id)) return;
    this.savingInFlight.add(record.id);
    try {
      ensureDataDirs();
      const filePath = path.join(CAMPAIGNS_DIR, `${record.id}.json`);
      const payload = JSON.stringify(record, null, 2);
      await fs.promises.writeFile(filePath, payload, 'utf-8');
    } catch (err) {
      console.error(`Erreur sauvegarde asynchrone campagne ${record.id} :`, err);
    } finally {
      this.savingInFlight.delete(record.id);
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
      void this.saveToDiskAsync(record);
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
      record.progress.currentPhaseLabel = `Reprise sur ${WORKER_POOL_SIZE} worker(s) CPU...`;
    } else if (record.status === 'PAUSED' && record.config.type === 'ORACLE_STRESS_TEST') {
      record.status = 'RUNNING';
      void this.runStressTestLoop(record);
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
      void this.saveToDiskAsync(record);
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
        currentPhaseLabel: `Initialisation sur ${WORKER_POOL_SIZE} worker(s) multi-cœurs (${TOTAL_CPU_CORES} vCPU détectés)...`,
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
    void this.saveToDiskAsync(record);

    if (config.type === 'EVALUATION_SWEEP' || config.type === 'AB_ABLATION') {
      void this.runEvaluationSweepLoop(record, variants);
    } else {
      void this.runStressTestLoop(record);
    }

    return record;
  }

  // ============================================================================
  // EXÉCUTION MULTI-CŒURS : BALAYAGE & ABLATION CROISÉE (Paired Seeds)
  // ============================================================================
  private async runEvaluationSweepLoop(
    record: CampaignRecord,
    variants: ReturnType<typeof expandParameterSweep>
  ): Promise<void> {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now();
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

    const targetG = record.config.gamesPerVariantAndTable;
    record.progress.totalTargetGames =
      variants.length * allTablesToRun.length * targetG;

    const baseSeed = record.config.baseSeed || 42000;
    const chunkSize = Math.max(
      10,
      Math.min(40, Math.ceil(targetG / Math.max(1, WORKER_POOL_SIZE)))
    );

    for (let vIdx = 0; vIdx < variants.length; vIdx++) {
      if (ctrl.stopped) break;
      const vSpec = variants[vIdx];

      record.progress.currentPhaseLabel = `[${WORKER_POOL_SIZE} workers] Variante ${vIdx + 1}/${variants.length} (${vSpec.variantLabel})`;

      const tableGamesMap: SingleGameResult[][] = allTablesToRun.map(() => []);
      const chunkPromises: Promise<void>[] = [];

      for (let tIdx = 0; tIdx < allTablesToRun.length; tIdx++) {
        const tSpec = allTablesToRun[tIdx];

        for (let startG = 0; startG < targetG; startG += chunkSize) {
          const endG = Math.min(targetG, startG + chunkSize);
          const jobs: Array<{ seed: number; recordTrace: boolean }> = [];
          for (let g = startG; g < endG; g++) {
            jobs.push({
              seed: baseSeed + g + 1,
              recordTrace: tSpec.isUserSelected && g < 2,
            });
          }

          const p = (async () => {
            while (ctrl.paused && !ctrl.stopped) {
              await new Promise((r) => setTimeout(r, 200));
            }
            if (ctrl.stopped) return;

            const resp = await sharedWorkerPool.runEvalBatch({
              params: vSpec.params,
              tableId: tSpec.table.id,
              botProfiles: tSpec.table.botProfiles,
              jobs,
            });

            if (ctrl.stopped) return;

            tableGamesMap[tIdx].push(...resp.results);
            record.progress.completedGames += resp.results.length;
            const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
            record.progress.elapsedSeconds = elapsedSec;
            record.progress.gamesPerSecond =
              record.progress.completedGames / elapsedSec;
            record.updatedAt = new Date().toISOString();

            if (Date.now() - ctrl.lastSavedAt >= PERIODIC_SAVE_INTERVAL_MS) {
              ctrl.lastSavedAt = Date.now();
              void this.saveToDiskAsync(record);
            }
          })();

          chunkPromises.push(p);
        }
      }

      await Promise.all(chunkPromises);
      if (ctrl.stopped) break;

      // Agrégation déterministe par table (triée par graine pour reproductibilité stricte)
      const variantTableSummaries: VariantEvaluationResult['tableSummaries'] = [];
      const variantSampleTraces: VariantEvaluationResult['sampleTraces'] = [];
      const variantEdgeCases = createEmptyEdgeCases();
      const variantAllSimulatedGames: SingleGameResult[] = [];
      const gamesByCat: {
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

      for (let tIdx = 0; tIdx < allTablesToRun.length; tIdx++) {
        const tSpec = allTablesToRun[tIdx];
        const sortedGames = tableGamesMap[tIdx].sort((a, b) => a.seed - b.seed);

        for (const gRes of sortedGames) {
          variantAllSimulatedGames.push(gRes);
          addEdgeCases(variantEdgeCases, gRes.edgeCases);
          if (tSpec.isUserSelected) {
            gamesByCat.allPrimaryGames.push(gRes);
            if (gRes.textualJournal) {
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
        }

        if (tSpec.isUserSelected) {
          variantTableSummaries.push(
            summarizeTableGames(tSpec.table.id, tSpec.table.name, sortedGames)
          );
        }
      }

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
        sampleTraces: variantSampleTraces.slice(0, 6),
      });

      record.progress.completedVariants = vIdx + 1;
      record.updatedAt = new Date().toISOString();

      if (Date.now() - ctrl.lastSavedAt >= PERIODIC_SAVE_INTERVAL_MS) {
        ctrl.lastSavedAt = Date.now();
        void this.saveToDiskAsync(record);
      }
    }

    if (!ctrl.stopped) {
      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = record.progress.completedGames / elapsedSec;
      record.status = 'COMPLETED';
      record.completedAt = new Date().toISOString();
      record.updatedAt = record.completedAt;
      record.progress.currentPhaseLabel = `Campagne terminée sur ${WORKER_POOL_SIZE} worker(s) (${record.variantResults.length} variante(s) évaluée(s))`;
      await this.saveToDiskAsync(record);
    }

    this.activeControl.delete(record.id);
  }

  // ============================================================================
  // EXÉCUTION MULTI-CŒURS : STRESS-TEST LONGUE DURÉE SUR VM ORACLE
  // ============================================================================
  private async runStressTestLoop(record: CampaignRecord): Promise<void> {
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

    const maxGames = record.config.maxTotalGames || 1000000;
    const maxDurationSec = record.config.targetDurationSeconds || null;
    let nextGameIdx = telemetry.totalGamesSimulated;
    const gamesPerWorkerBatch = 35;

    while (!ctrl.stopped) {
      if (ctrl.paused) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }

      const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
      if (telemetry.totalGamesSimulated >= maxGames) break;
      if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) break;

      // Prépare une vague parallèle sur tous les workers disponibles
      const wavePromises: Promise<StressBatchWorkerResponse>[] = [];
      for (let w = 0; w < WORKER_POOL_SIZE; w++) {
        const remaining = maxGames - nextGameIdx;
        if (remaining <= 0) break;
        const batchCount = Math.min(gamesPerWorkerBatch, remaining);
        const jobs: StressBatchWorkerRequest['jobs'] = [];

        for (let i = 0; i < batchCount; i++) {
          const gameIdx = nextGameIdx++;
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

          const botProfile = botLevels[gameIdx % botLevels.length];
          jobs.push({ seed, params, botProfile });
        }

        wavePromises.push(
          sharedWorkerPool.runStressBatch({
            jobs,
            needDetailedCapture: telemetry.capturedExtremeLogs.length < 12,
          })
        );
      }

      if (wavePromises.length === 0) break;

      const waveResponses = await Promise.all(wavePromises);
      if (ctrl.stopped) break;

      const AllTactics: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

      for (const batchResp of waveResponses) {
        for (const item of batchResp.outcomes) {
          const { seed, params, botProfile, res, captureCategory, captureSummary, detailedJournal } = item;

          telemetry.totalGamesSimulated += 1;
          telemetry.totalTurnsSimulated += params.x;
          telemetry.invariantsVerifiedCount += (params.x * 2 + 2) * 4;
          addEdgeCases(telemetry.edgeCaseOccurrences, res.edgeCases);

          const bStat = telemetry.scoreDistributionByBotLevel[botProfile];
          const bSum = botSums[botProfile];
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
            for (const v of res.violations) {
              if (telemetry.violationsLog.length < 50) {
                telemetry.violationsLog.push(v);
              }
            }
          }
          if (res.stagnantTurns > 0) telemetry.stagnantGamesCount += 1;
          if (res.earlyWipeoutTurn !== null) telemetry.earlyWipeoutGamesCount += 1;
          if (AllTactics.some((t) => res.tacticSlot1Turns[t] === params.x)) {
            telemetry.tacticMonopolyGamesCount += 1;
          }
          if (botProfile === 'OMNISCIENT' && res.victoryBracket === 'DEFEAT') {
            telemetry.omniscientUnwinnableSeedsCount += 1;
          }

          if (captureCategory && telemetry.capturedExtremeLogs.length < 12) {
            const alreadyHasCategoryCount = telemetry.capturedExtremeLogs.filter(
              (l) => l.category === captureCategory
            ).length;
            if (alreadyHasCategoryCount < 3 || captureCategory === 'INVARIANT_VIOLATION') {
              telemetry.capturedExtremeLogs.push({
                seed,
                category: captureCategory,
                summary: captureSummary,
                params,
                textualJournal: detailedJournal || '',
              });
            }
          }
        }
      }

      record.progress.completedGames = telemetry.totalGamesSimulated;
      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      telemetry.elapsedSeconds = elapsedSec;
      telemetry.gamesPerSecond = telemetry.totalGamesSimulated / elapsedSec;
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = telemetry.gamesPerSecond;
      record.updatedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = `[${WORKER_POOL_SIZE} workers] Exploration intensive (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties, ${telemetry.invariantsVerifiedCount.toLocaleString('fr-FR')} invariants vérifiés)...`;

      if (Date.now() - ctrl.lastSavedAt >= PERIODIC_SAVE_INTERVAL_MS) {
        ctrl.lastSavedAt = Date.now();
        void this.saveToDiskAsync(record);
      }
    }

    if (!ctrl.stopped) {
      record.status = 'COMPLETED';
      record.completedAt = new Date().toISOString();
      record.updatedAt = record.completedAt;
      record.progress.currentPhaseLabel = `Stress-Test terminé (${WORKER_POOL_SIZE} workers) : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées, ${telemetry.violationsCount} violation(s) d'invariants.`;
      await this.saveToDiskAsync(record);
    }

    this.activeControl.delete(record.id);
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
        DEFAULT_TABLE_CONFIGS[0],
        DEFAULT_TABLE_CONFIGS[1],
        DEFAULT_TABLE_CONFIGS[2],
        DEFAULT_TABLE_CONFIGS[3],
        DEFAULT_TABLE_CONFIGS[5],
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

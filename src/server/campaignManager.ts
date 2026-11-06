import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { Worker } from 'node:worker_threads';
import {
  BotProfileId,
  BulldozerZeroStumpAction,
  CampaignConfig,
  CampaignRecord,
  CombatThresholdShift,
  ParryHsRule,
  SimulationConfig,
  SingleGameResult,
  TableConfig,
  TacticalDefenderCap,
  TacticsTrackPreset,
  VariantEvaluationResult,
} from '../sim/types';
import {
  DEFAULT_SWEEP_INPUT,
  DEFAULT_TABLE_CONFIGS,
  TACTICS_TRACK_PRESETS,
} from '../sim/i18n';
import { runSingleGame } from '../sim/engine';
import {
  evaluateFourCriteria,
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
const PERIODIC_SAVE_INTERVAL_MS = 15000; // 15 secondes entre deux sauvegardes disque asynchrones

const DATA_ROOT = path.resolve(process.cwd(), 'data');
const CAMPAIGNS_DIR = path.join(DATA_ROOT, 'campaigns');

function ensureDataDirs(): void {
  if (!fs.existsSync(CAMPAIGNS_DIR)) {
    fs.mkdirSync(CAMPAIGNS_DIR, { recursive: true });
  }
}

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
          runSingleGame(
            msg.params,
            msg.botProfiles,
            job.seed,
            msg.tableId,
            job.recordTrace
          )
        );
      }
      return {
        taskId: msg.taskId,
        type: 'RUN_EVAL_BATCH_RESULT',
        results,
      };
    } else {
      const outcomes: StressBatchWorkerResponse['outcomes'] = [];
      for (const job of msg.jobs) {
        const res = runSingleGame(
          job.params,
          [job.botProfile],
          job.seed,
          `stress_${job.botProfile}`,
          false
        );
        let captureCategory: StressBatchWorkerResponse['outcomes'][0]['captureCategory'] =
          null;
        let captureSummary = '';
        if (res.violations.length > 0) {
          captureCategory = 'INVARIANT_VIOLATION';
          captureSummary = res.violations[0].message;
        } else if (res.explosionsCount >= 2) {
          captureCategory = 'MULTI_EXPLOSION';
          captureSummary = `${res.explosionsCount} explosions en une partie.`;
        } else if (res.survivalRateHorizon <= 0.15) {
          captureCategory = 'HIGH_DAMAGE_WIPEOUT';
          captureSummary = `Seulement ${(res.survivalRateHorizon * 100).toFixed(1)}% de survie.`;
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

  public getPoolStats(): {
    totalWorkers: number;
    busyWorkers: number;
    idleWorkers: number;
    queuedTasks: number;
    workerFailedPermanently: boolean;
  } {
    return {
      totalWorkers: this.workers.length || WORKER_POOL_SIZE,
      busyWorkers: this.activeTasks.size,
      idleWorkers: this.idleWorkers.length,
      queuedTasks: this.queue.length,
      workerFailedPermanently: this.workerFailedPermanently,
    };
  }
}

const sharedWorkerPool = new SimulationWorkerPool();

// Mesure temps-réel du % d'utilisation CPU sur tous les cœurs de la VM
let lastCpuSnapshot = os.cpus();
let lastCpuPercent = 0;
let lastCpuCheckTime = Date.now();

function measureVmCpuPercent(): number {
  const now = Date.now();
  if (now - lastCpuCheckTime < 400) {
    return lastCpuPercent;
  }
  const currentCpus = os.cpus();
  let idleDiff = 0;
  let totalDiff = 0;

  for (let i = 0; i < currentCpus.length; i++) {
    const prev = lastCpuSnapshot[i]?.times;
    const curr = currentCpus[i]?.times;
    if (!prev || !curr) continue;

    const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
    const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;

    idleDiff += curr.idle - prev.idle;
    totalDiff += currTotal - prevTotal;
  }

  lastCpuSnapshot = currentCpus;
  lastCpuCheckTime = now;

  if (totalDiff > 0) {
    lastCpuPercent = Math.max(
      0,
      Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100))
    );
  }
  return lastCpuPercent;
}

export class CampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();
  private savingInFlight: Set<string> = new Set();

  constructor() {
    ensureDataDirs();
    this.loadCampaignsFromDisk();
    if (this.campaigns.size === 0) {
      this.createInitialReferenceCampaign();
    }
  }

  public getSystemTelemetry() {
    const pool = sharedWorkerPool.getPoolStats();
    const loadAvg = os.loadavg();
    const mem = process.memoryUsage();
    return {
      cpuCount: TOTAL_CPU_CORES,
      workersCount: WORKER_POOL_SIZE,
      busyWorkers: pool.busyWorkers,
      queuedTasks: pool.queuedTasks,
      cpuPercent: measureVmCpuPercent(),
      loadAvg1m: Number((loadAvg[0] || 0).toFixed(2)),
      rssMemoryMb: Math.round(mem.rss / (1024 * 1024)),
      activeCampaigns: this.listCampaigns().filter((c) => c.status === 'RUNNING').length,
    };
  }

  private loadCampaignsFromDisk(): void {
    try {
      const files = fs.readdirSync(CAMPAIGNS_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(CAMPAIGNS_DIR, file);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const record = JSON.parse(raw) as CampaignRecord;

        // Vérifie la compatibilité avec le modèle v3.3 (présence des 7 bots et de survProbOnly)
        const isCompatible =
          record.config?.type === 'ORACLE_STRESS_TEST'
            ? Boolean(record.stressTelemetry?.scoreDistributionByBotLevel?.PROB_ONLY) &&
              Boolean(record.stressTelemetry?.scoreDistributionByBotLevel?.COORD_NO_DICE)
            : (record.variantResults.length === 0 &&
                Boolean(record.config?.sweep?.parryHsRuleValues)) ||
              record.variantResults[0]?.criteria?.infoAndCoordMetrics?.survProbOnly !== undefined;

        if (!isCompatible) {
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
    const variants = expandParameterSweep(config.sweep);
    const totalVariants = variants.length;

    const tablesToUse = this.resolveTablesForCampaign(config);
    let totalTargetGames = 0;
    if (config.type === 'MONTE_CARLO_SWEEP' || config.type === 'FIVE_LEVERS_ABLATION') {
      totalTargetGames =
        totalVariants * Math.max(1, tablesToUse.length) * config.gamesPerVariantAndTable;
    } else {
      totalTargetGames = config.maxTotalGames || 50000;
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
              totalExplosionsObserved: 0,
              totalParryAndHSObserved: 0,
              totalTrapsAndSabotagesObserved: 0,
              scoreDistributionByBotLevel: {
                BLIND: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                PROB_ONLY: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                SOLO_INFORMED: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                COORD_NO_DICE: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                COORD_ONE_SHOT: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                COORD_HYBRID: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                OMNISCIENT: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
              },
              capturedExtremeLogs: [],
            }
          : undefined,
    };

    this.campaigns.set(record.id, record);
    void this.saveToDiskAsync(record);

    if (config.type === 'MONTE_CARLO_SWEEP' || config.type === 'FIVE_LEVERS_ABLATION') {
      void this.runEvaluationSweepLoop(record, variants, tablesToUse);
    } else {
      void this.runStressTestLoop(record);
    }

    return record;
  }

  private resolveTablesForCampaign(config: CampaignConfig): TableConfig[] {
    const selected =
      config.selectedTableConfigs && config.selectedTableConfigs.length > 0
        ? [...config.selectedTableConfigs]
        : [...DEFAULT_TABLE_CONFIGS];

    if (config.includeCalibrationTables) {
      for (const def of DEFAULT_TABLE_CONFIGS) {
        if (!selected.some((t) => t.id === def.id)) {
          selected.push(def);
        }
      }
    }
    return selected;
  }

  // ============================================================================
  // EXÉCUTION MULTI-CŒURS : BALAYAGE MONTE-CARLO & ABLATION DES LEVIERS v3.2
  // ============================================================================
  private async runEvaluationSweepLoop(
    record: CampaignRecord,
    variants: ReturnType<typeof expandParameterSweep>,
    tablesToUse: TableConfig[]
  ): Promise<void> {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now();
    const targetG = record.config.gamesPerVariantAndTable;
    const baseSeed = record.config.baseSeed || 42000;
    const chunkSize = Math.max(
      25,
      Math.min(250, Math.ceil(targetG / Math.max(1, WORKER_POOL_SIZE)))
    );

    for (let vIdx = 0; vIdx < variants.length; vIdx++) {
      if (ctrl.stopped) break;
      const vSpec = variants[vIdx];

      record.progress.currentPhaseLabel = `[${WORKER_POOL_SIZE} workers] Variante ${vIdx + 1}/${variants.length} (${vSpec.variantLabel})`;

      const tableGamesMap: SingleGameResult[][] = tablesToUse.map(() => []);
      const chunkPromises: Promise<void>[] = [];

      for (let tIdx = 0; tIdx < tablesToUse.length; tIdx++) {
        const table = tablesToUse[tIdx];

        for (let startG = 0; startG < targetG; startG += chunkSize) {
          const endG = Math.min(targetG, startG + chunkSize);
          const jobs: Array<{ seed: number; recordTrace: boolean }> = [];
          for (let g = startG; g < endG; g++) {
            jobs.push({
              seed: baseSeed + g + 1,
              recordTrace: vIdx < 12 && g < 1,
            });
          }

          const p = (async () => {
            while (ctrl.paused && !ctrl.stopped) {
              await new Promise((r) => setTimeout(r, 200));
            }
            if (ctrl.stopped) return;

            const resp = await sharedWorkerPool.runEvalBatch({
              params: vSpec.params,
              tableId: table.id,
              botProfiles: table.botProfiles,
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

      const variantTableSummaries: VariantEvaluationResult['tableSummaries'] = [];
      const variantSampleTraces: VariantEvaluationResult['sampleTraces'] = [];
      let violationsCount = 0;

      for (let tIdx = 0; tIdx < tablesToUse.length; tIdx++) {
        const table = tablesToUse[tIdx];
        const sortedGames = tableGamesMap[tIdx].sort((a, b) => a.seed - b.seed);

        for (const gRes of sortedGames) {
          violationsCount += gRes.violations.length;
          if (gRes.textualJournal && variantSampleTraces.length < 6) {
            variantSampleTraces.push({
              seed: gRes.seed,
              tableConfigName: table.name,
              survivalRateHorizon: gRes.survivalRateHorizon,
              totalTreesLost: gRes.totalTreesLost,
              explosionsCount: gRes.explosionsCount,
              victoryBracket: gRes.victoryBracket,
              textualJournal: gRes.textualJournal,
            });
          }
        }

        variantTableSummaries.push(summarizeTableGames(table, sortedGames));
      }

      const criteria = evaluateFourCriteria(vSpec.params, variantTableSummaries);

      record.variantResults.push({
        variantId: vSpec.variantId,
        variantLabel: vSpec.variantLabel,
        leversCode: vSpec.leversCode,
        params: vSpec.params,
        tableSummaries: variantTableSummaries,
        criteria,
        invariantViolationsCount: violationsCount,
        sampleTraces: variantSampleTraces,
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
  // EXÉCUTION MULTI-CŒURS : STRESS-TEST LONGUE DURÉE SUR VM ORACLE (v3.2)
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
      'BLIND',
      'PROB_ONLY',
      'SOLO_INFORMED',
      'COORD_NO_DICE',
      'COORD_ONE_SHOT',
      'COORD_HYBRID',
      'OMNISCIENT',
    ];

    const telemetry = record.stressTelemetry!;
    const botSums: Record<
      BotProfileId,
      { sumSurv: number; sumLost: number; sumExp: number; defeats: number; miracles: number }
    > = {
      BLIND: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      PROB_ONLY: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      SOLO_INFORMED: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      COORD_NO_DICE: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      COORD_ONE_SHOT: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      COORD_HYBRID: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      OMNISCIENT: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
    };

    for (const b of botLevels) {
      const existing = telemetry.scoreDistributionByBotLevel[b];
      if (existing && existing.games > 0) {
        botSums[b].sumSurv = existing.meanSurvivalHorizon * existing.games;
        botSums[b].sumLost = existing.meanTreesLost * existing.games;
        botSums[b].sumExp = existing.meanExplosions * existing.games;
        botSums[b].defeats = Math.round(existing.defeatRate * existing.games);
        botSums[b].miracles = Math.round(existing.miracleRate * existing.games);
      }
    }

    const maxGames = record.config.maxTotalGames || 100000;
    const maxDurationSec = record.config.targetDurationSeconds || null;
    let nextGameIdx = telemetry.totalGamesSimulated;
    const gamesPerWorkerBatch = 80;

    const caps: TacticalDefenderCap[] = [99, 2, 1];
    const shifts: CombatThresholdShift[] = [0, 1];
    const parryRules: ParryHsRule[] = ['SYNERGY_TRAP_SAB', 'STANDARD_S3'];
    const bullActions: BulldozerZeroStumpAction[] = ['DESTROY_TREE', 'NONE'];
    const presets: TacticsTrackPreset[] = ['ASSAULT_LOW', 'ASSAULT_HIGH'];

    while (!ctrl.stopped) {
      if (ctrl.paused) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }

      const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
      if (telemetry.totalGamesSimulated >= maxGames) break;
      if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) break;

      const wavePromises: Promise<StressBatchWorkerResponse>[] = [];
      for (let w = 0; w < WORKER_POOL_SIZE; w++) {
        const remaining = maxGames - nextGameIdx;
        if (remaining <= 0) break;
        const batchCount = Math.min(gamesPerWorkerBatch, remaining);
        const jobs: StressBatchWorkerRequest['jobs'] = [];

        for (let i = 0; i < batchCount; i++) {
          const gameIdx = nextGameIdx++;
          const seed = (record.config.baseSeed || 900000) + gameIdx + 1;
          let params: SimulationConfig;

          if (record.config.randomizeParametersInStress) {
            const n = paramRng.nextInt(3, 6);
            const preset = presets[paramRng.nextInt(0, presets.length - 1)];
            params = {
              numPlayers: n,
              numTurns: paramRng.nextInt(6, 12),
              initialTreesPerCell: paramRng.nextInt(2, 3),
              tacticsTrackPreset: preset,
              tacticsTrackSetup: [...TACTICS_TRACK_PRESETS[preset].setup],
              shuffleTacticsTrack: paramRng.nextFloat() < 0.25,
              tacticalDefenderCap: caps[paramRng.nextInt(0, caps.length - 1)],
              combatThresholdShift: shifts[paramRng.nextInt(0, shifts.length - 1)],
              parryHsRule: parryRules[paramRng.nextInt(0, parryRules.length - 1)],
              bulldozerZeroStumpAction: bullActions[paramRng.nextInt(0, bullActions.length - 1)],
              initialStumpCell2: paramRng.nextFloat() < 0.75,
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

      for (const batchResp of waveResponses) {
        for (const item of batchResp.outcomes) {
          const {
            seed,
            params,
            botProfile,
            res,
            captureCategory,
            captureSummary,
            detailedJournal,
          } = item;

          telemetry.totalGamesSimulated += 1;
          telemetry.totalTurnsSimulated += params.numTurns;
          telemetry.invariantsVerifiedCount += params.numTurns * 4;
          telemetry.totalExplosionsObserved += res.explosionsCount;
          telemetry.totalParryAndHSObserved += res.parryAndHSCount;
          telemetry.totalTrapsAndSabotagesObserved +=
            res.trapsPlacedCount + res.sabotagesPlacedCount;

          const bStat = telemetry.scoreDistributionByBotLevel[botProfile];
          const bSum = botSums[botProfile];
          bStat.games += 1;
          bSum.sumSurv += res.survivalRateHorizon;
          bSum.sumLost += res.totalTreesLost;
          bSum.sumExp += res.explosionsCount;
          if (res.victoryBracket === 'DEFEAT') bSum.defeats += 1;
          if (res.victoryBracket === 'MIRACLE') bSum.miracles += 1;
          bStat.meanSurvivalHorizon = bSum.sumSurv / bStat.games;
          bStat.meanTreesLost = bSum.sumLost / bStat.games;
          bStat.meanExplosions = bSum.sumExp / bStat.games;
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

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      telemetry.elapsedSeconds = elapsedSec;
      telemetry.gamesPerSecond = telemetry.totalGamesSimulated / elapsedSec;
      record.progress.completedGames = telemetry.totalGamesSimulated;
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = telemetry.gamesPerSecond;
      record.progress.currentPhaseLabel = `Stress-Test [${WORKER_POOL_SIZE} workers] : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties (${telemetry.gamesPerSecond.toFixed(0)} p/s)`;
      record.updatedAt = new Date().toISOString();

      if (Date.now() - ctrl.lastSavedAt >= PERIODIC_SAVE_INTERVAL_MS) {
        ctrl.lastSavedAt = Date.now();
        void this.saveToDiskAsync(record);
      }
    }

    if (!ctrl.stopped) {
      record.status = 'COMPLETED';
      record.completedAt = new Date().toISOString();
      record.updatedAt = record.completedAt;
      record.progress.currentPhaseLabel = `Stress-Test terminé (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées sur ${WORKER_POOL_SIZE} workers)`;
      await this.saveToDiskAsync(record);
    }

    this.activeControl.delete(record.id);
  }

  /**
   * Génère au premier lancement une campagne de référence v3.3 comparant
   * les leviers fins (Cap, Shift, Synergie Mise HS) sur les invariants figés v3.2
   * et mesurant les 5 Gains Décisionnels sur les 7 profils gradués orthogonaux.
   */
  private createInitialReferenceCampaign(): void {
    const config: CampaignConfig = {
      id: 'camp_ref_v33_shapley_7bots',
      name: 'Campagne de Référence v3.3 — Invariants v3.2 Figés, Synergie Mise HS & Décomposition Shapley (7 Bots)',
      type: 'FIVE_LEVERS_ABLATION',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: 50,
      sweep: {
        numPlayersValues: [4],
        numTurnsValues: [8],
        initialTreesPerCellValues: [2],
        tacticalDefenderCapValues: [2, 1],
        combatThresholdShiftValues: [0, 1],
        parryHsRuleValues: ['SYNERGY_TRAP_SAB', 'STANDARD_S3'],
        bulldozerZeroStumpActionValues: ['DESTROY_TREE'],
        initialStumpCell2Values: [true],
        tacticsTrackPresetValues: ['ASSAULT_LOW'],
        shuffleTacticsTrackValues: [false],
      },
      selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
      includeCalibrationTables: true,
      baseSeed: 42000,
    };

    const variants = expandParameterSweep(config.sweep);
    const tables = DEFAULT_TABLE_CONFIGS;
    const variantResults: VariantEvaluationResult[] = [];
    const startTime = Date.now();
    let completedGames = 0;

    for (const vSpec of variants) {
      const summaries: VariantEvaluationResult['tableSummaries'] = [];
      const sampleTraces: VariantEvaluationResult['sampleTraces'] = [];
      let violationsCount = 0;

      for (const tc of tables) {
        const games: SingleGameResult[] = [];
        for (let g = 0; g < config.gamesPerVariantAndTable; g++) {
          const seed = config.baseSeed + g + 1;
          const res = runSingleGame(vSpec.params, tc.botProfiles, seed, tc.id, g < 1);
          games.push(res);
          completedGames++;
          violationsCount += res.violations.length;
          if (res.textualJournal && sampleTraces.length < 4) {
            sampleTraces.push({
              seed: res.seed,
              tableConfigName: tc.name,
              survivalRateHorizon: res.survivalRateHorizon,
              totalTreesLost: res.totalTreesLost,
              explosionsCount: res.explosionsCount,
              victoryBracket: res.victoryBracket,
              textualJournal: res.textualJournal,
            });
          }
        }
        summaries.push(summarizeTableGames(tc, games));
      }

      const criteria = evaluateFourCriteria(vSpec.params, summaries);
      variantResults.push({
        variantId: vSpec.variantId,
        variantLabel: vSpec.variantLabel,
        leversCode: vSpec.leversCode,
        params: vSpec.params,
        tableSummaries: summaries,
        criteria,
        invariantViolationsCount: violationsCount,
        sampleTraces,
      });
    }

    const elapsedSec = Math.max(0.05, (Date.now() - startTime) / 1000);
    const nowIso = new Date().toISOString();

    const record: CampaignRecord = {
      id: config.id,
      config,
      status: 'COMPLETED',
      startedAt: nowIso,
      updatedAt: nowIso,
      completedAt: nowIso,
      progress: {
        completedGames,
        totalTargetGames: completedGames,
        completedVariants: variants.length,
        totalVariants: variants.length,
        elapsedSeconds: elapsedSec,
        gamesPerSecond: completedGames / elapsedSec,
        currentPhaseLabel: `Campagne de référence v3.3 prête (${variants.length} variantes × 7 profils gradués)`,
      },
      variantResults,
    };

    this.campaigns.set(record.id, record);
    void this.saveToDiskAsync(record);
  }
}

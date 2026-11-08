import {
  normalizeProtocol,
  protocolOf,
  manifestDigest,
  type ProtocolConfig,
} from "../scientific/protocol";
import {
  summarizeScientific,
  scientificVariant,
  scientificSample,
  type ScientificTable,
  type ScientificVariant,
} from "../scientific/reports";
import type { ScientificGame, ScientificSample } from "../scientific/runner";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { CampaignStore, validateCampaignId } from "./campaignStore";
import { validateCampaignConfig } from "./campaignValidation";
import { DurableStore } from "./durableStore";
import { WorkerPool, type PoolOptions } from "./workerPool";
import { tablesFor, stressParams, BOTS } from "./campaignPlan";
import {
  expandParameterSweep,
  summarizeTableGames,
  evaluateFourCriteria,
} from "../sim/evaluator";
import type {
  CampaignRecord,
  CampaignConfig,
  VariantEvaluationResult,
  SingleGameResult,
  TableConfigSummary,
} from "../sim/types";
import type {
  WorkerRequestMessage,
  StressBatchWorkerResponse,
} from "./simWorker";
export const TOTAL_CPU_CORES = os.availableParallelism();
function envInt(name: string, fallback: number, max: number) {
  const n = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > max)
    throw new Error(`${name} invalide`);
  return n;
}
export const WORKER_POOL_SIZE = envInt(
  "AMAZONIA_WORKERS",
  Math.max(1, TOTAL_CPU_CORES - 1),
  Math.max(1, TOTAL_CPU_CORES - 1),
);
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
      Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)),
    );
  }
  return lastCpuPercent;
}

interface Supervision {
  version: 1 | 2;
  generation: string;
  reason: string;
  lastCheckpoint: string;
  validatedBatches: number;
  pendingBatches: number;
  runningBatches: number;
  failedBatches: number;
  retries: number;
  lastError?: string;
  partial: boolean;
}
export type ManagedRecord = CampaignRecord & {
  orchestration?: Supervision;
  scientificResults?: ScientificVariant[];
  scientificPartial?: ScientificTable[];
  protocol?: "HISTORICAL_V33" | "SCIENTIFIC_V1";
  partialResults?: { variantId: string; tableSummaries: TableConfigSummary[] };
};
interface State {
  scientificManifestHash?: string;
  record: ManagedRecord;
  generation: string;
  seq: number;
  v: number;
  t: number;
  g: number;
  batchSize: number;
  rngState?: number;
  partial: TableConfigSummary[];
  scientificPartial?: ScientificTable[];
  traces: VariantEvaluationResult["sampleTraces"];
  violations: number;
  sums: Record<
    string,
    {
      surv: number;
      lost: number;
      exp: number;
      defeats: number;
      miracles: number;
    }
  >;
}
interface Options {
  campaignsDir?: string;
  createReference?: boolean;
  pool?: Partial<PoolOptions>;
  batchSize?: number;
  maxCampaigns?: number;
  beforeCheckpoint?: () => void;
}
const clone = <T>(x: T): T => structuredClone(x);
export class CampaignManager {
  private store: DurableStore;
  private pool: WorkerPool;
  private states = new Map<string, State>();
  private legacy = new Map<string, CampaignRecord>();
  private loops = new Map<string, Promise<void>>();
  private closed = false;
  private closing?: Promise<void>;
  private options: Options;
  private maxCampaigns: number;
  private batchSize: number;
  constructor(options: Options = {}) {
    this.options = options;
    this.batchSize =
      options.batchSize ?? envInt("AMAZONIA_BATCH_SIZE", 80, 250);
    this.maxCampaigns =
      options.maxCampaigns ?? envInt("AMAZONIA_CAMPAIGNS", 2, 32);
    const config: PoolOptions = {
      workers: WORKER_POOL_SIZE,
      queue: envInt("AMAZONIA_QUEUE", 4, 64),
      timeoutMs: envInt("AMAZONIA_TIMEOUT_MS", 120000, 3600000),
      retries: envInt("AMAZONIA_ATTEMPTS", 3, 10) - 1,
      ...options.pool,
    };
    if (
      !Number.isInteger(this.batchSize) ||
      this.batchSize < 1 ||
      this.batchSize > 250 ||
      config.workers < 1 ||
      config.queue < 0 ||
      config.timeoutMs < 1 ||
      config.retries < 0 ||
      this.maxCampaigns < 1 ||
      this.maxCampaigns > config.workers + config.queue
    )
      throw new Error("Ressources invalides");
    const root = options.campaignsDir ?? path.resolve("data/campaigns");
    this.store = new DurableStore(root);
    this.pool = new WorkerPool(config);
    try {
      for (const r of new CampaignStore(root).load()) {
        if (r.status === "RUNNING") {
          r.status = "PAUSED";
          r.progress.currentPhaseLabel =
            "Historique interrompu : checkpoint de lots indisponible";
        }
        this.legacy.set(r.id, r);
      }
      for (const row of this.store.db
        .prepare("SELECT * FROM campaigns")
        .all() as unknown as { id: string; body: string; deleted: number }[]) {
        this.legacy.delete(row.id);
        if (row.deleted) continue;
        const s = JSON.parse(row.body) as State;
        try {
          const config = s.record.config as ProtocolConfig;
          if (
            protocolOf(config) === "SCIENTIFIC_V1" &&
            (!config.provenance ||
              s.record.orchestration?.version !== 2 ||
              s.scientificManifestHash !== manifestDigest(config))
          )
            throw new Error("Scientific manifest/checkpoint schema mismatch");
          normalizeProtocol(config);
        } catch (error) {
          s.record.status = "ERROR";
          s.record.errorMessage = `Protocol checkpoint rejected: ${(error as Error).message}`;
          s.record.orchestration!.reason = "PROTOCOL_MISMATCH";
          s.record.orchestration!.lastError = s.record.errorMessage;
        }
        if (
          s.record.status === "RUNNING" ||
          (s.record.status === "PAUSED" &&
            s.record.orchestration!.runningBatches)
        ) {
          s.record.status = "PAUSED";
          s.record.orchestration!.reason = "INTERRUPTED";
          s.record.orchestration!.runningBatches = 0;
          s.record.progress.currentPhaseLabel =
            "Interrompue : reprise explicite disponible";
        }
        s.record.orchestration!.runningBatches = 0;
        this.states.set(row.id, s);
        this.store.transaction(() => {
          this.store.db
            .prepare(
              "UPDATE batches SET state=? WHERE id=? AND generation=? AND state='RUNNING'",
            )
            .run(
              s.record.status === "STOPPED" ? "CANCELLED" : "PENDING",
              row.id,
              s.generation,
            );
          this.persist(s);
        });
      }
    } catch (e) {
      this.store.close();
      throw e;
    }
  }
  private persist(s: State) {
    this.store.db
      .prepare(
        "INSERT INTO campaigns(id,generation,body,deleted) VALUES(?,?,?,0) ON CONFLICT(id) DO UPDATE SET generation=excluded.generation,body=excluded.body,deleted=0",
      )
      .run(s.record.id, s.generation, JSON.stringify(s));
  }
  getSystemTelemetry() {
    return {
      cpuCount: TOTAL_CPU_CORES,
      ...this.pool.stats,
      cpuPercent: measureVmCpuPercent(),
      loadAvg1m: os.loadavg()[0],
      rssMemoryMb: Math.round(process.memoryUsage().rss / 1048576),
      activeCampaigns: this.loops.size,
    };
  }
  listCampaigns() {
    return [
      ...[...this.legacy.keys()].map((id) => this.getCampaign(id)!),
      ...[...this.states.keys()].map((id) => this.getCampaign(id)!),
    ].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
  getCampaign(id: string): ManagedRecord | undefined {
    validateCampaignId(id);
    const s = this.states.get(id);
    if (!s) {
      const old = clone(this.legacy.get(id)) as ManagedRecord | undefined;
      if (old) old.protocol = protocolOf(old.config);
      return old;
    }
    const r = clone(s.record);
    r.protocol = (r.config as ProtocolConfig).protocol ?? "HISTORICAL_V33";
    r.orchestration!.pendingBatches = Math.max(
      0,
      r.orchestration!.pendingBatches - r.orchestration!.runningBatches,
    );
    const entries = (
      this.store.db
        .prepare(
          "SELECT body FROM variants WHERE id=? AND generation=? ORDER BY idx",
        )
        .all(id, s.generation) as unknown as { body: string }[]
    ).map((x) => JSON.parse(x.body));
    r.variantResults = entries.filter((x) => x.kind !== "SCIENTIFIC_V1");
    r.scientificResults = entries.filter((x) => x.kind === "SCIENTIFIC_V1");
    if (
      (s.record.config as ProtocolConfig).protocol === "SCIENTIFIC_V1" &&
      s.record.orchestration?.reason !== "PROTOCOL_MISMATCH"
    ) {
      const partial = clone(s.scientificPartial ?? []);
      const rows = this.store.db
        .prepare(
          "SELECT result FROM batches WHERE id=? AND generation=? AND result IS NOT NULL ORDER BY seq",
        )
        .all(id, s.generation) as unknown as { result: string }[];
      if (rows.length)
        partial.push(
          summarizeScientific(
            tablesFor(s.record.config)[s.t],
            rows.flatMap((x) => JSON.parse(x.result)),
            s.record.config as ProtocolConfig,
            false,
          ),
        );
      for (const table of partial)
        for (const metric of [table.survival, table.treesLost, table.defeat]) {
          metric.ci95 = null;
          metric.reason = "FIXED_SAMPLE_NOT_COMPLETE";
        }
      r.scientificPartial = partial;
    } else if (
      ((s.record.config as ProtocolConfig).protocol ?? "HISTORICAL_V33") ===
      "HISTORICAL_V33"
    ) {
      if (
        s.record.config.type !== "ORACLE_STRESS_TEST" &&
        s.v < s.record.progress.totalVariants
      ) {
        const tables = clone(s.partial);
        const rows = this.store.db
          .prepare(
            "SELECT result FROM batches WHERE id=? AND generation=? AND result IS NOT NULL ORDER BY seq",
          )
          .all(id, s.generation) as unknown as { result: string }[];
        if (rows.length)
          tables.push(
            summarizeTableGames(
              tablesFor(s.record.config)[s.t],
              rows.flatMap((x) => JSON.parse(x.result)),
            ),
          );
        if (tables.length)
          r.partialResults = {
            variantId: expandParameterSweep(s.record.config.sweep)[s.v]
              .variantId,
            tableSummaries: tables,
          };
      }
    }
    return r;
  }
  getScientificAudit(id: string, variant: number, table: string) {
    validateCampaignId(id);
    const s = this.states.get(id);
    if (!s) return undefined;
    if (
      !Number.isInteger(variant) ||
      variant < 0 ||
      variant > 20000 ||
      table.length > 128
    )
      throw new Error("Invalid audit selector");
    const row = this.store.db
      .prepare(
        "SELECT body FROM scientific_audits WHERE id=? AND generation=? AND variant=? AND table_id=?",
      )
      .get(id, s.generation, variant, table) as { body: string } | undefined;
    return row ? JSON.parse(row.body) : undefined;
  }
  private capacity() {
    if (this.loops.size >= this.maxCampaigns)
      throw new Error("Limite de campagnes simultanées atteinte");
  }
  startCampaign(config: CampaignConfig) {
    if (this.closed) throw new Error("Gestionnaire fermé");
    validateCampaignConfig(config);
    config = normalizeProtocol(config);
    this.capacity();
    if (this.states.has(config.id) || this.legacy.has(config.id))
      throw new Error("Identifiant déjà utilisé");
    const variants = expandParameterSweep(config.sweep),
      tables = tablesFor(config),
      stress = config.type === "ORACLE_STRESS_TEST";
    const total = stress
      ? config.maxTotalGames || 50000
      : variants.length * tables.length * config.gamesPerVariantAndTable;
    const now = new Date().toISOString(),
      generation = randomUUID();
    const s: State = {
      generation,
      seq: 0,
      v: 0,
      t: 0,
      g: 0,
      batchSize: this.batchSize,
      partial: [],
      traces: [],
      violations: 0,
      sums: {},
      record: {
        id: config.id,
        config: clone(config),
        status: "RUNNING",
        startedAt: now,
        updatedAt: now,
        progress: {
          completedGames: 0,
          totalTargetGames: total,
          completedVariants: 0,
          totalVariants: variants.length,
          elapsedSeconds: 0,
          gamesPerSecond: 0,
          currentPhaseLabel: "Campagne serveur acceptée",
        },
        variantResults: [],
        orchestration: {
          version: protocolOf(config) === "SCIENTIFIC_V1" ? 2 : 1,
          generation,
          reason: "RUNNING",
          lastCheckpoint: now,
          validatedBatches: 0,
          pendingBatches: stress
            ? Math.ceil(total / this.batchSize)
            : variants.length *
              tables.length *
              Math.ceil(config.gamesPerVariantAndTable / this.batchSize),
          runningBatches: 0,
          failedBatches: 0,
          retries: 0,
          partial: true,
        },
      },
    };
    if (stress)
      s.record.stressTelemetry = {
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
        scoreDistributionByBotLevel: Object.fromEntries(
          BOTS.map((b) => [
            b,
            {
              games: 0,
              meanSurvivalHorizon: 0,
              meanTreesLost: 0,
              meanExplosions: 0,
              defeatRate: 0,
              miracleRate: 0,
            },
          ]),
        ) as NonNullable<
          CampaignRecord["stressTelemetry"]
        >["scoreDistributionByBotLevel"],
        capturedExtremeLogs: [],
      };
    if (protocolOf(config) === "SCIENTIFIC_V1")
      s.scientificManifestHash = manifestDigest(config);
    this.store.transaction(() => this.persist(s));
    this.states.set(s.record.id, s);
    this.launch(s);
    return this.getCampaign(config.id)!;
  }
  private change(id: string, status: CampaignRecord["status"], reason: string) {
    validateCampaignId(id);
    const old = this.states.get(id);
    if (!old) {
      if (this.legacy.has(id))
        throw new Error(
          "Campagne historique en lecture seule : aucun checkpoint exact disponible",
        );
      return undefined;
    }
    if (["COMPLETED", "STOPPED"].includes(old.record.status))
      return this.getCampaign(id);
    if (
      status === "RUNNING" &&
      old.record.status !== "RUNNING" &&
      !this.loops.has(old.generation)
    )
      this.capacity();
    if (status === "RUNNING") {
      if (
        old.scientificManifestHash &&
        old.scientificManifestHash !==
          manifestDigest(old.record.config as ProtocolConfig)
      )
        throw new Error("Scientific manifest mismatch");
      normalizeProtocol(old.record.config);
    }
    const s = clone(old);
    s.record.status = status;
    if (status === "RUNNING") delete s.record.errorMessage;
    s.record.orchestration!.reason = reason;
    s.record.progress.currentPhaseLabel = reason;
    s.record.updatedAt = new Date().toISOString();
    if (status === "STOPPED") {
      s.record.completedAt = s.record.updatedAt;
      s.record.orchestration!.pendingBatches = 0;
    }
    this.store.transaction(() => this.persist(s));
    this.states.set(s.record.id, s);
    if (status === "RUNNING") this.launch(s);
    return this.getCampaign(id);
  }
  pauseCampaign(id: string) {
    return this.change(id, "PAUSED", "USER_PAUSED");
  }
  stopCampaign(id: string) {
    return this.change(id, "STOPPED", "USER_STOPPED");
  }
  resumeCampaign(id: string) {
    return this.change(id, "RUNNING", "RUNNING");
  }
  deleteCampaign(id: string) {
    validateCampaignId(id);
    const s = this.states.get(id);
    const r = s ?? { record: this.legacy.get(id) };
    if (!r.record) return false;
    this.store.transaction(() => {
      this.store.db
        .prepare(
          "INSERT INTO campaigns(id,generation,body,deleted) VALUES(?,?,?,1) ON CONFLICT(id) DO UPDATE SET deleted=1",
        )
        .run(id, s?.generation ?? "legacy", s ? JSON.stringify(s) : "{}");
      this.store.db
        .prepare(
          "UPDATE batches SET state='CANCELLED' WHERE id=? AND state IN ('PENDING','RUNNING')",
        )
        .run(id);
    });
    this.states.delete(id);
    this.legacy.delete(id);
    return true;
  }
  private launch(s: State) {
    const key = s.generation;
    if (this.loops.has(key)) return;
    const p = this.run(s.record.id, key).finally(() => this.loops.delete(key));
    this.loops.set(key, p);
  }
  private current(id: string, generation: string) {
    const s = this.states.get(id);
    return s?.generation === generation ? s : undefined;
  }
  private plan(s: State): { request: WorkerRequestMessage; nextRng?: number } {
    const c = s.record.config;
    if (c.type === "ORACLE_STRESS_TEST") {
      const count = Math.min(
        s.batchSize,
        s.record.progress.totalTargetGames - s.record.progress.completedGames,
      );
      const plan = stressParams(
        c,
        s.record.progress.completedGames,
        count,
        s.rngState,
      );
      return {
        nextRng: plan.state,
        request: {
          taskId: s.seq,
          type: "RUN_STRESS_BATCH",
          jobs: plan.jobs,
          needDetailedCapture:
            (s.record.stressTelemetry?.capturedExtremeLogs.length ?? 0) < 12,
        },
      };
    }
    const v = expandParameterSweep(c.sweep)[s.v],
      t = tablesFor(c)[s.t],
      end = Math.min(c.gamesPerVariantAndTable, s.g + s.batchSize);
    return {
      request: {
        taskId: s.seq,
        type: "RUN_EVAL_BATCH",
        params: v.params,
        tableId: t.id,
        experiment: s.record.config as ProtocolConfig,
        botProfiles: t.botProfiles,
        jobs: Array.from({ length: end - s.g }, (_, i) => ({
          seed: c.baseSeed + s.g + i + 1,
          recordTrace: s.v < 12 && s.g + i === 0,
        })),
      },
    };
  }
  private async run(id: string, generation: string) {
    try {
      while (!this.closed) {
        let s = this.current(id, generation);
        if (!s || s.record.status !== "RUNNING") return;
        const plan = this.plan(s),
          old = this.store.db
            .prepare(
              "SELECT request FROM batches WHERE id=? AND generation=? AND seq=?",
            )
            .get(id, generation, s.seq) as { request: string } | undefined;
        const request = old ? JSON.parse(old.request) : plan.request;
        const assigned = clone(s);
        assigned.record.orchestration!.runningBatches = 1;
        assigned.record.progress.currentPhaseLabel = `Lot ${s.seq} en cours (progression durable affichée)`;
        this.store.transaction(() => {
          this.store.db
            .prepare(
              "INSERT INTO batches(id,generation,seq,state,request) VALUES(?,?,?,'RUNNING',?) ON CONFLICT(id,generation,seq) DO UPDATE SET state='RUNNING'",
            )
            .run(id, generation, s!.seq, JSON.stringify(request));
          this.persist(assigned);
        });
        this.states.set(id, assigned);
        const began = performance.now();
        const response = await this.pool.run(
          request,
          (error) => {
            const current = this.current(id, generation);
            if (!current) return;
            const retry = clone(current);
            retry.record.orchestration!.retries++;
            retry.record.orchestration!.lastError = error;
            this.store.transaction(() => {
              this.store.db
                .prepare(
                  "UPDATE batches SET attempts=attempts+1,error=? WHERE id=? AND generation=? AND seq=?",
                )
                .run(error, id, generation, retry.seq);
              this.persist(retry);
            });
            this.states.set(id, retry);
          },
          () => {
            const c = this.current(id, generation);
            return this.closed || !c || c.record.status === "STOPPED";
          },
        );
        s = this.current(id, generation);
        if (!s || this.closed) return;
        const next = clone(s);
        let variant: VariantEvaluationResult | ScientificVariant | undefined;
        let result: SingleGameResult[] | undefined;
        if (request.type === "RUN_EVAL_BATCH") {
          if (
            response.type !== "RUN_EVAL_BATCH_RESULT" ||
            response.results.length !== request.jobs.length
          )
            throw new Error("Résultat de lot incomplet");
          result = response.results;
          next.g += result.length;
          if (next.g === next.record.config.gamesPerVariantAndTable) {
            const prior = this.store.db
              .prepare(
                "SELECT result FROM batches WHERE id=? AND generation=? AND result IS NOT NULL ORDER BY seq",
              )
              .all(id, generation) as unknown as { result: string }[];
            const games = prior
              .flatMap((x) => JSON.parse(x.result) as SingleGameResult[])
              .concat(result)
              .sort((a, b) => a.seed - b.seed);
            const table = tablesFor(next.record.config)[next.t];
            if (protocolOf(next.record.config) === "SCIENTIFIC_V1") {
              (next.scientificPartial ??= []).push(
                summarizeScientific(
                  table,
                  games as ScientificGame[],
                  next.record.config as ProtocolConfig,
                  true,
                ),
              );
            } else next.partial.push(summarizeTableGames(table, games));
            for (const g of games) {
              next.violations += g.violations.length;
              if (g.textualJournal && next.traces.length < 6)
                next.traces.push({
                  seed: g.seed,
                  tableConfigName: table.name,
                  survivalRateHorizon: g.survivalRateHorizon,
                  totalTreesLost: g.totalTreesLost,
                  explosionsCount: g.explosionsCount,
                  victoryBracket: g.victoryBracket,
                  textualJournal: g.textualJournal,
                });
            }
            next.t++;
            next.g = 0;
            if (next.t === tablesFor(next.record.config).length) {
              const spec = expandParameterSweep(next.record.config.sweep)[
                next.v
              ];
              variant =
                protocolOf(next.record.config) === "SCIENTIFIC_V1"
                  ? scientificVariant(
                      spec,
                      next.scientificPartial ?? [],
                      next.record.config as ProtocolConfig,
                      (tableId) => {
                        const saved = (
                          this.store.db
                            .prepare(
                              "SELECT body FROM scientific_samples WHERE id=? AND generation=? AND variant=? AND table_id=? ORDER BY unit",
                            )
                            .all(
                              id,
                              generation,
                              next.v,
                              tableId,
                            ) as unknown as { body: string }[]
                        ).map((x) => JSON.parse(x.body));
                        const fresh =
                          tableId === table.id
                            ? result!.map((g) =>
                                scientificSample(g as ScientificGame),
                              )
                            : [];
                        return [...saved, ...fresh];
                      },
                    )
                  : {
                      ...spec,
                      tableSummaries: next.partial,
                      criteria: evaluateFourCriteria(spec.params, next.partial),
                      invariantViolationsCount: next.violations,
                      sampleTraces: next.traces,
                    };
              next.partial = [];
              next.scientificPartial = [];
              next.traces = [];
              next.violations = 0;
              next.v++;
              next.t = 0;
              next.record.progress.completedVariants = next.v;
            }
          }
          next.record.progress.completedGames += result.length;
        } else {
          if (
            response.type !== "RUN_STRESS_BATCH_RESULT" ||
            response.outcomes.length !== request.jobs.length
          )
            throw new Error("Résultat de stress incomplet");
          this.accumulateStress(next, response);
          next.rngState = plan.nextRng;
          next.record.progress.completedGames += response.outcomes.length;
        }
        next.seq++;
        const o = next.record.orchestration!;
        o.validatedBatches = next.seq;
        o.runningBatches = 0;
        o.pendingBatches = Math.max(0, o.pendingBatches - 1);
        o.lastCheckpoint = new Date().toISOString();
        next.record.updatedAt = o.lastCheckpoint;
        const p = next.record.progress;
        p.elapsedSeconds += (performance.now() - began) / 1000;
        p.gamesPerSecond = p.completedGames / Math.max(0.05, p.elapsedSeconds);
        if (next.record.stressTelemetry) {
          next.record.stressTelemetry.elapsedSeconds = p.elapsedSeconds;
          next.record.stressTelemetry.gamesPerSecond = p.gamesPerSecond;
        }
        const complete =
          p.completedGames >= p.totalTargetGames ||
          (next.record.config.targetDurationSeconds != null &&
            p.elapsedSeconds >= next.record.config.targetDurationSeconds);
        if (complete && next.record.status !== "STOPPED") {
          next.record.status = "COMPLETED";
          o.reason =
            p.completedGames >= p.totalTargetGames ? "COMPLETED" : "TIME_LIMIT";
          o.partial = p.completedGames < p.totalTargetGames;
          o.pendingBatches = 0;
          next.record.completedAt = o.lastCheckpoint;
        }
        p.currentPhaseLabel = `${o.reason} · ${p.completedGames} parties durables · ${next.seq} lots validés`;
        this.options.beforeCheckpoint?.();
        this.store.transaction(() => {
          const row = this.store.db
            .prepare(
              "SELECT state FROM batches WHERE id=? AND generation=? AND seq=?",
            )
            .get(id, generation, s!.seq) as { state: string };
          if (row.state === "VALIDATED") throw new Error("Lot déjà validé");
          this.store.db
            .prepare(
              "UPDATE batches SET state='VALIDATED',result=? WHERE id=? AND generation=? AND seq=?",
            )
            .run(
              result ? JSON.stringify(result) : null,
              id,
              generation,
              s!.seq,
            );
          if (
            request.type === "RUN_EVAL_BATCH" &&
            protocolOf(next.record.config) === "SCIENTIFIC_V1"
          ) {
            const stmt = this.store.db.prepare(
              "INSERT INTO scientific_samples VALUES(?,?,?,?,?,?)",
            );
            for (const game of result!) {
              const sample = scientificSample(game as ScientificGame);
              if ((game as ScientificGame).scientific.observations)
                this.store.db
                  .prepare("INSERT INTO scientific_audits VALUES(?,?,?,?,?)")
                  .run(
                    id,
                    generation,
                    s!.v,
                    request.tableId,
                    JSON.stringify((game as ScientificGame).scientific),
                  );
              stmt.run(
                id,
                generation,
                s!.v,
                request.tableId,
                sample.unit,
                JSON.stringify(sample),
              );
            }
          }
          if (request.type === "RUN_EVAL_BATCH" && next.g === 0)
            this.store.db
              .prepare(
                "UPDATE batches SET result=NULL WHERE id=? AND generation=?",
              )
              .run(id, generation);
          if (variant)
            this.store.db
              .prepare("INSERT INTO variants VALUES(?,?,?,?)")
              .run(id, generation, next.v - 1, JSON.stringify(variant));
          this.persist(next);
        });
        this.states.set(id, next);
      }
    } catch (error) {
      const s = this.current(id, generation);
      if (!s || this.closed) return;
      if (s.record.status === "STOPPED") {
        const stopped = clone(s);
        stopped.record.orchestration!.runningBatches = 0;
        try {
          this.store.transaction(() => {
            this.store.db
              .prepare(
                "UPDATE batches SET state='CANCELLED' WHERE id=? AND generation=? AND seq=?",
              )
              .run(id, generation, s.seq);
            this.persist(stopped);
          });
        } catch (e) {
          stopped.record.orchestration!.lastError = (e as Error).message;
        }
        this.states.set(id, stopped);
        return;
      }
      const failed = clone(s);
      failed.record.status = "ERROR";
      failed.record.errorMessage = (error as Error).message;
      failed.record.orchestration!.lastError = failed.record.errorMessage;
      failed.record.orchestration!.failedBatches++;
      failed.record.orchestration!.runningBatches = 0;
      failed.record.orchestration!.reason = "ERROR";
      failed.record.progress.currentPhaseLabel = `Erreur : ${failed.record.errorMessage}`;
      // Never publish uncommitted progress. If storage is unavailable expose the failure in memory.
      try {
        this.store.transaction(() => {
          this.store.db
            .prepare(
              "UPDATE batches SET state='FAILED',error=? WHERE id=? AND generation=? AND seq=?",
            )
            .run(
              failed.record.errorMessage ?? "Erreur",
              id,
              generation,
              failed.seq,
            );
          this.persist(failed);
        });
      } catch (storageError) {
        failed.record.errorMessage += ` ; checkpoint impossible : ${(storageError as Error).message}`;
      }
      this.states.set(id, failed);
    }
  }
  private accumulateStress(s: State, response: StressBatchWorkerResponse) {
    const st = s.record.stressTelemetry!;
    for (const item of response.outcomes) {
      const {
        res,
        params,
        botProfile,
        seed,
        captureCategory,
        captureSummary,
        detailedJournal,
      } = item;
      st.totalGamesSimulated++;
      st.totalTurnsSimulated += params.numTurns;
      st.invariantsVerifiedCount += params.numTurns * 4;
      st.totalExplosionsObserved += res.explosionsCount;
      st.totalParryAndHSObserved += res.parryAndHSCount;
      st.totalTrapsAndSabotagesObserved +=
        res.trapsPlacedCount + res.sabotagesPlacedCount;
      const sums = (s.sums[botProfile] ??= {
          surv: 0,
          lost: 0,
          exp: 0,
          defeats: 0,
          miracles: 0,
        }),
        stat = st.scoreDistributionByBotLevel[botProfile];
      stat.games++;
      sums.surv += res.survivalRateHorizon;
      sums.lost += res.totalTreesLost;
      sums.exp += res.explosionsCount;
      sums.defeats += Number(res.victoryBracket === "DEFEAT");
      sums.miracles += Number(res.victoryBracket === "MIRACLE");
      stat.meanSurvivalHorizon = sums.surv / stat.games;
      stat.meanTreesLost = sums.lost / stat.games;
      stat.meanExplosions = sums.exp / stat.games;
      stat.defeatRate = sums.defeats / stat.games;
      stat.miracleRate = sums.miracles / stat.games;
      st.violationsCount += res.violations.length;
      for (const v of res.violations)
        if (st.violationsLog.length < 50) st.violationsLog.push(v);
      if (
        captureCategory &&
        st.capturedExtremeLogs.length < 12 &&
        (captureCategory === "INVARIANT_VIOLATION" ||
          st.capturedExtremeLogs.filter((x) => x.category === captureCategory)
            .length < 3)
      )
        st.capturedExtremeLogs.push({
          seed,
          category: captureCategory,
          summary: captureSummary,
          params,
          textualJournal: detailedJournal || "",
        });
    }
  }
  close() {
    if (this.closing) return this.closing;
    this.closed = true;
    return (this.closing = (async () => {
      await this.pool.close();
      await Promise.all([...this.loops.values()]);
      this.store.close();
    })());
  }
}

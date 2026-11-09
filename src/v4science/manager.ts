import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DurableStore } from "../server/durableStore";
import { WorkerPool, type PoolOptions } from "../server/workerPool";
import { digest } from "../scientific/random";
import {
  validatePlan,
  totalJobs,
  jobAt,
  provenance,
  documentSnapshots,
  compatible,
} from "./protocol";
import { validateSample, studyReport } from "./statistics";
import {
  PROTOCOL,
  type Plan,
  type Study,
  type Sample,
  type ScienceResponse,
} from "./types";
export interface ManagerOptions {
  root: string;
  batchSize?: number;
  maxGames?: number;
  maxActive?: number;
  pool?: Partial<PoolOptions>;
  beforeCheckpoint?: () => void;
}
export class StudyManager {
  readonly store: DurableStore;
  readonly pool: WorkerPool;
  readonly current = provenance();
  readonly limits: { maxGames: number; batchSize: number; maxActive: number };
  private loops = new Map<string, Promise<void>>();
  private closed = false;
  constructor(readonly options: ManagerOptions) {
    const maxGames =
        options.maxGames ?? Number(process.env.V4_MAX_GAMES ?? 2000),
      batchSize = options.batchSize ?? Number(process.env.V4_BATCH_SIZE ?? 2),
      maxActive = options.maxActive ?? Number(process.env.V4_MAX_ACTIVE ?? 1),
      workers = options.pool?.workers ?? Number(process.env.V4_WORKERS ?? 1);
    if (
      !Number.isSafeInteger(maxGames) ||
      maxGames < 1 ||
      maxGames > 20000 ||
      !Number.isSafeInteger(batchSize) ||
      batchSize < 1 ||
      batchSize > 8 ||
      !Number.isSafeInteger(workers) ||
      workers < 1 ||
      workers > Math.max(1, requireParallelism() - 1) ||
      !Number.isSafeInteger(maxActive) ||
      maxActive < 1 ||
      maxActive > 4 ||
      maxActive > workers + 2
    )
      throw new Error("Limites V4 invalides");
    this.limits = { maxGames, batchSize, maxActive };
    if (
      !path.isAbsolute(options.root) ||
      path.resolve(options.root) !== options.root
    )
      throw new Error("Stockage V4 absolu et canonique requis");
    fs.mkdirSync(options.root, { recursive: true, mode: 0o700 });
    if (
      fs.realpathSync(options.root) !== options.root ||
      fs.statSync(options.root).mode & 0o077
    )
      throw new Error("Stockage V4 privé 0700 requis");
    this.store = new DurableStore(options.root);
    this.pool = new WorkerPool({
      workers,
      queue: 2,
      timeoutMs: 120000,
      retries: 1,
      ...options.pool,
    });
    this.store.db
      .exec(`CREATE TABLE IF NOT EXISTS v4_studies(id TEXT PRIMARY KEY,body TEXT NOT NULL);
   CREATE TABLE IF NOT EXISTS v4_samples(study_id TEXT NOT NULL,job_index INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(study_id,job_index));
   CREATE INDEX IF NOT EXISTS v4_sample_group ON v4_samples(study_id,json_extract(body,'$.configId'),json_extract(body,'$.family'));
   CREATE TABLE IF NOT EXISTS v4_batches(study_id TEXT NOT NULL,start INTEGER NOT NULL,count INTEGER NOT NULL,state TEXT NOT NULL,request_hash TEXT NOT NULL,error TEXT,PRIMARY KEY(study_id,start));
   CREATE TABLE IF NOT EXISTS v4_cost(singleton INTEGER PRIMARY KEY,cost_ms REAL);`);
    for (const name of [
      "orchestration.sqlite",
      "orchestration.sqlite-wal",
      "orchestration.sqlite-shm",
    ]) {
      const file = path.join(options.root, name);
      if (fs.existsSync(file)) fs.chmodSync(file, 0o600);
    }
    this.store.transaction(() => {
      for (const row of this.store.db
        .prepare(
          "SELECT body FROM v4_studies WHERE json_extract(body,'$.status')='RUNNING'",
        )
        .all() as { body: string }[]) {
        const s = JSON.parse(row.body) as Study;
        if (s.status === "RUNNING") {
          s.status = "PAUSED";
          s.reason = "INTERRUPTED_EXPLICIT_RESUME_REQUIRED";
          this.save(s);
        }
      }
      this.store.db.exec(
        "UPDATE v4_batches SET state='PENDING' WHERE state='RUNNING'",
      );
    });
  }
  private save(s: Study) {
    s.updatedAt = new Date().toISOString();
    this.store.db
      .prepare(
        "INSERT INTO v4_studies VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
      )
      .run(s.id, JSON.stringify(s));
  }
  get(id: string): Study {
    const row = this.store.db
      .prepare("SELECT body FROM v4_studies WHERE id=?")
      .get(id) as { body: string } | undefined;
    if (!row) throw new Error("Campagne scientifique V4 introuvable");
    return JSON.parse(row.body);
  }
  list(offset = 0) {
    return (
      this.store.db
        .prepare(
          "SELECT body FROM v4_studies ORDER BY rowid DESC LIMIT 50 OFFSET ?",
        )
        .all(offset) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Study);
  }
  estimate(raw: unknown) {
    const p = validatePlan(raw, this.limits.maxGames),
      row = this.store.db
        .prepare("SELECT cost_ms FROM v4_cost WHERE singleton=1")
        .get() as { cost_ms: number } | undefined;
    const cost = row?.cost_ms ?? 500;
    return {
      total: totalJobs(p),
      estimatedSeconds: p.configs.reduce(
        (sum, c) =>
          sum +
          (cost * costScale(c) * p.families.length * p.seeds.length) / 1000,
        0,
      ),
      costMsPerGame: cost,
      basis: row
        ? "LAST_MEASURED_BATCH_NORMALIZED"
        : "REFERENCE_N3_X8_L16_500MS",
      limits: this.limits,
      warning:
        "Estimation indicative ; les six joueurs et longues pistes peuvent coûter davantage. Effectif fixe avant lancement.",
    };
  }
  start(raw: unknown) {
    if (this.closed) throw new Error("Gestionnaire fermé");
    if (!compatible(this.current, provenance()))
      throw new Error(
        "Sources modifiées depuis le démarrage ; relancer une instance compatible",
      );
    const plan = validatePlan(raw, this.limits.maxGames);
    this.capacity();
    const free = fs.statfsSync(this.options.root);
    if (free.bavail * free.bsize < 256 * 1024 * 1024)
      throw new Error("Moins de 256 MiB libres ; aucun nettoyage automatique");
    const docs = documentSnapshots(),
      s: Study = {
        id: randomUUID(),
        plan,
        provenance: this.current,
        manifestHash: digest({ plan, provenance: this.current, docs }),
        status: "RUNNING",
        reason: "EXPLICIT_START",
        completed: 0,
        total: totalJobs(plan),
        cursor: 0,
        batchSize: this.limits.batchSize,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        documentSnapshots: docs,
      };
    this.store.transaction(() => this.save(s));
    this.launch(s.id);
    return this.get(s.id);
  }
  private capacity() {
    if (this.loops.size >= this.limits.maxActive)
      throw new Error(
        "Capacité V4 occupée ; attendre la fin du lot ou suspendre",
      );
  }
  control(id: string, action: "pause" | "resume" | "stop") {
    const s = this.get(id);
    if (s.status === "COMPLETED") throw new Error("Campagne terminée");
    if (action === "resume") {
      if (this.closed) throw new Error("Gestionnaire fermé");
      if (this.loops.has(id))
        throw new Error(
          "Lot précédent encore en cours ; attendre son checkpoint",
        );
      this.capacity();
      if (
        !compatible(s.provenance, provenance()) ||
        s.manifestHash !==
          digest({
            plan: s.plan,
            provenance: s.provenance,
            docs: s.documentSnapshots,
          })
      ) {
        s.status = "ERROR";
        s.reason = "PROVENANCE_OR_MANIFEST_MISMATCH";
        this.store.transaction(() => this.save(s));
        throw new Error(
          "Reprise refusée : règles, politiques, runtime, sources ou manifeste incompatibles",
        );
      }
      validatePlan(s.plan, this.limits.maxGames);
      if (s.completed !== s.cursor || this.sampleCount(id) !== s.completed)
        throw new Error("Checkpoint incohérent");
      s.status = "RUNNING";
      s.reason = "EXPLICIT_RESUME";
      delete s.lastError;
      this.store.transaction(() => this.save(s));
      this.launch(id);
    } else {
      s.status = action === "pause" ? "PAUSED" : "STOPPED";
      s.reason =
        action === "pause"
          ? "PAUSE_AT_BATCH_BOUNDARY"
          : "EXPLICIT_STOP_UNCOMMITTED_BATCH_DISCARDED";
      this.store.transaction(() => this.save(s));
    }
    return this.get(id);
  }
  private launch(id: string) {
    const promise = this.work(id).finally(() => this.loops.delete(id));
    this.loops.set(id, promise);
  }
  private async work(id: string) {
    try {
      while (!this.closed) {
        const s = this.get(id);
        if (s.status !== "RUNNING") return;
        const start = s.cursor,
          count = Math.min(s.batchSize, s.total - start),
          jobs = Array.from({ length: count }, (_, i) =>
            jobAt(s.plan, start + i),
          );
        const requestHash = digest({ manifest: s.manifestHash, start, jobs });
        this.store.transaction(() =>
          this.store.db
            .prepare(
              "INSERT INTO v4_batches VALUES(?,?,?,'RUNNING',?,NULL) ON CONFLICT(study_id,start) DO UPDATE SET state='RUNNING',error=NULL",
            )
            .run(id, start, count, requestHash),
        );
        const begun = performance.now();
        const response = await this.pool.run(
          {
            taskId: start,
            type: "RUN_V4_SCIENCE",
            plan: s.plan,
            provenance: s.provenance,
            jobs,
          },
          () => {},
          () => this.closed || this.get(id).status === "STOPPED",
        );
        if (
          response.type !== "RUN_V4_SCIENCE_RESULT" ||
          response.samples.length !== count
        )
          throw new Error("Réponse de lot V4 incorrecte");
        const now = this.get(id);
        if (this.closed || now.status === "STOPPED") return;
        if (now.cursor !== start || now.manifestHash !== s.manifestHash)
          throw new Error("Génération ou curseur modifié");
        response.samples.forEach((sample, i) => {
          validateSample(sample, s.plan);
          const j = jobs[i];
          if (
            sample.family !== j.family ||
            sample.seed !== j.seed ||
            sample.configId !== digest(s.plan.configs[j.configIndex]) ||
            !compatible(sample.provenance, s.provenance)
          )
            throw new Error("Identité de résultat incorrecte");
        });
        this.options.beforeCheckpoint?.();
        this.store.transaction(() => {
          for (let i = 0; i < count; i++) {
            const sample = response.samples[i];
            // Final boards are redundant outside trace witnesses; retain all unit measures/events for comparisons/replay.
            const stored = jobs[i].trace
              ? sample
              : { ...sample, finalBoard: undefined };
            this.store.db
              .prepare("INSERT INTO v4_samples VALUES(?,?,?)")
              .run(id, start + i, JSON.stringify(stored));
          }
          now.cursor += count;
          now.completed += count;
          if (now.cursor === now.total) {
            now.status = "COMPLETED";
            now.reason = "FIXED_PLAN_COMPLETE";
          }
          this.save(now);
          this.store.db
            .prepare(
              "UPDATE v4_batches SET state='VALIDATED' WHERE study_id=? AND start=?",
            )
            .run(id, start);
          this.store.db
            .prepare(
              "INSERT INTO v4_cost VALUES(1,?) ON CONFLICT(singleton) DO UPDATE SET cost_ms=excluded.cost_ms",
            )
            .run((performance.now() - begun) / count);
        });
      }
    } catch (e) {
      if (!this.closed) {
        const s = this.get(id);
        if (s.status !== "STOPPED") {
          s.status = "ERROR";
          s.reason = "BATCH_ERROR";
          s.lastError = (e as Error).message;
          this.store.transaction(() => {
            this.save(s);
            this.store.db
              .prepare(
                "UPDATE v4_batches SET state='ERROR',error=? WHERE study_id=? AND state='RUNNING'",
              )
              .run(s.lastError!, id);
          });
        }
      }
    }
  }
  sampleCount(id: string) {
    return Number(
      this.store.db
        .prepare("SELECT count(*) AS n FROM v4_samples WHERE study_id=?")
        .get(id)!.n,
    );
  }
  samples(id: string, offset = 0, limit = 200) {
    return (
      this.store.db
        .prepare(
          "SELECT body FROM v4_samples WHERE study_id=? ORDER BY job_index LIMIT ? OFFSET ?",
        )
        .all(id, limit, offset) as { body: string }[]
    ).map((r) => JSON.parse(r.body) as Sample);
  }
  *allSamples(id: string) {
    for (const row of this.store.db
      .prepare(
        "SELECT body FROM v4_samples WHERE study_id=? ORDER BY job_index",
      )
      .iterate(id) as Iterable<{ body: string }>)
      yield JSON.parse(row.body) as Sample;
  }
  report(id: string) {
    const study = this.get(id);
    return studyReport(
      study,
      (configId, family) =>
        (
          this.store.db
            .prepare(
              "SELECT body FROM v4_samples WHERE study_id=? AND json_extract(body,'$.configId')=? AND json_extract(body,'$.family')=? ORDER BY job_index",
            )
            .all(id, configId, family) as { body: string }[]
        ).map((r) => JSON.parse(r.body)),
      this.sampleCount(id),
    );
  }
  get busy() {
    return this.loops.size;
  }
  async close() {
    this.closed = true;
    await this.pool.close();
    await Promise.all(this.loops.values());
    this.store.close();
  }
}
import { availableParallelism as requireParallelism } from "node:os";

function costScale(c: Plan["configs"][number]) {
  return (c.numTurns / 8) * (c.trackLength / 16) * (c.numPlayers / 3) ** 2;
}

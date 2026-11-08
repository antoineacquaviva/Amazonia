import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CampaignManager } from "../src/server/campaignManager";
import { WorkerPool } from "../src/server/workerPool";
import { stressParams } from "../src/server/campaignPlan";
import { createApp } from "../server";
import {
  DEFAULT_SWEEP_INPUT as S,
  DEFAULT_SIMULATION_CONFIG as D,
} from "../src/sim/i18n";
import { runSingleGame } from "../src/sim/engine";
import { summarizeTableGames } from "../src/sim/evaluator";
import type { CampaignConfig } from "../src/sim/types";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 15000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    if (Date.now() > end) throw new Error("Test timeout");
    await sleep(10);
  }
}
function config(id = "test", stress = false): CampaignConfig {
  return {
    id,
    name: "Isolated",
    type: stress ? "ORACLE_STRESS_TEST" : "MONTE_CARLO_SWEEP",
    createdAt: "2026-11-08",
    gamesPerVariantAndTable: 10,
    baseSeed: 42000,
    sweep: {
      ...S,
      numPlayersValues: [4],
      numTurnsValues: [8],
      tacticalDefenderCapValues: [2],
      combatThresholdShiftValues: [0],
      parryHsRuleValues: ["SYNERGY_TRAP_SAB"],
    },
    selectedTableConfigs: [
      {
        id: "TABLE_COORD",
        name: "Coord",
        description: "Test",
        botProfiles: ["COORD_HYBRID"],
      },
    ],
    includeCalibrationTables: false,
    maxTotalGames: 21,
    randomizeParametersInStress: true,
  };
}
async function isolated(
  fn: (dir: string, open: (extra?: object) => CampaignManager) => Promise<void>,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-runner-"));
  const managers = new Set<CampaignManager>();
  const open = (extra = {}) => {
    const m = new CampaignManager({
      campaignsDir: dir,
      createReference: false,
      batchSize: 3,
      pool: { workers: 1, queue: 2 },
      ...extra,
    });
    managers.add(m);
    return m;
  };
  try {
    await fn(dir, open);
  } finally {
    for (const m of managers) await m.close().catch(() => {});
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
async function drained(m: CampaignManager) {
  await until(() => m.getSystemTelemetry().activeCampaigns === 0);
}
function query(dir: string, sql: string) {
  const db = new DatabaseSync(path.join(dir, "orchestration.sqlite"));
  try {
    return db.prepare(sql).all();
  } finally {
    db.close();
  }
}
test("Monte-Carlo restart and replay preserve exact summaries and validated batches", () =>
  isolated(async (dir, open) => {
    let m = open();
    m.startCampaign(config());
    await until(() => m.getCampaign("test")!.progress.completedGames >= 3);
    m.pauseCampaign("test");
    await drained(m);
    const progress = m.getCampaign("test")!.progress.completedGames;
    assert(progress < 10);
    await m.close();
    m = open();
    assert.equal(m.getCampaign("test")!.status, "PAUSED");
    assert.equal(m.getCampaign("test")!.progress.completedGames, progress);
    m.resumeCampaign("test");
    m.resumeCampaign("test");
    await drained(m);
    const r = m.getCampaign("test")!;
    assert.equal(r.status, "COMPLETED");
    assert.equal(r.progress.completedGames, 10);
    assert.equal(
      query(dir, "SELECT * FROM batches WHERE state='VALIDATED'").length,
      4,
    );
    const games = Array.from({ length: 10 }, (_, g) =>
      runSingleGame(D, ["COORD_HYBRID"], 42001 + g, "TABLE_COORD", g === 0),
    );
    assert.deepEqual(
      r.variantResults[0].tableSummaries[0],
      summarizeTableGames(config().selectedTableConfigs[0], games),
    );
  }));
test("interruption with an unconfirmed lot replays it exactly once", () =>
  isolated(async (dir, open) => {
    let m = open();
    m.startCampaign(config());
    await until(() => m.getSystemTelemetry().busyWorkers === 1);
    await m.close();
    m = open();
    const r = m.getCampaign("test")!;
    assert.equal(r.status, "PAUSED");
    assert.equal(r.orchestration?.reason, "INTERRUPTED");
    assert.equal(r.progress.completedGames, 0);
    m.resumeCampaign("test");
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 10);
    assert.equal(
      query(dir, "SELECT * FROM batches WHERE state='VALIDATED'").length,
      4,
    );
  }));
test("randomized stress restores exact parameter stream and aggregate sums", () =>
  isolated(async (dir, open) => {
    let m = open();
    m.startCampaign(config("stress", true));
    await until(() => m.getCampaign("stress")!.progress.completedGames >= 3);
    m.pauseCampaign("stress");
    await drained(m);
    await m.close();
    m = open();
    m.resumeCampaign("stress");
    await drained(m);
    const final = m.getCampaign("stress")!;
    assert.equal(final.progress.completedGames, 21);
    const rows = query(
      dir,
      "SELECT request FROM batches WHERE id='stress' ORDER BY seq",
    ) as { request: string }[];
    const jobs = rows.flatMap((r) => JSON.parse(r.request).jobs);
    assert.deepEqual(jobs, stressParams(config("stress", true), 0, 21).jobs);
    const otherDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "amazonia-continuous-"),
    );
    const other = new CampaignManager({ campaignsDir: otherDir, batchSize: 3 });
    try {
      other.startCampaign(config("stress", true));
      await drained(other);
      const a = final.stressTelemetry!,
        b = other.getCampaign("stress")!.stressTelemetry!;
      a.elapsedSeconds = b.elapsedSeconds;
      a.gamesPerSecond = b.gamesPerSecond;
      assert.deepEqual(a, b);
    } finally {
      await other.close();
      fs.rmSync(otherDir, { recursive: true, force: true });
    }
  }));
test("pause drains assigned work; stop preserves partial results and assigns no further lots", () =>
  isolated(async (_dir, open) => {
    const m = open();
    m.startCampaign(config());
    m.pauseCampaign("test");
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 3);
    assert.equal(m.getCampaign("test")!.status, "PAUSED");
    m.resumeCampaign("test");
    await until(() => m.getSystemTelemetry().busyWorkers === 1);
    m.stopCampaign("test");
    await drained(m);
    const r = m.getCampaign("test")!;
    assert.equal(r.status, "STOPPED");
    assert.equal(r.progress.completedGames, 6);
    assert.equal(r.orchestration?.pendingBatches, 0);
    assert.equal(r.orchestration?.partial, true);
    m.resumeCampaign("test");
    assert.equal(m.getCampaign("test")!.status, "STOPPED");
  }));
test("checkpoint fault never advances durable counts and explicit resume replays batch", () =>
  isolated(async (dir, open) => {
    let count = 0;
    let m = open({
      beforeCheckpoint: () => {
        if (++count === 2) throw new Error("injected disk failure");
      },
    });
    m.startCampaign(config());
    await drained(m);
    assert.equal(m.getCampaign("test")!.status, "ERROR");
    assert.equal(m.getCampaign("test")!.progress.completedGames, 3);
    assert.equal(
      query(dir, "SELECT * FROM batches WHERE state='VALIDATED'").length,
      1,
    );
    await m.close();
    m = open();
    assert.equal(m.getCampaign("test")!.progress.completedGames, 3);
    m.resumeCampaign("test");
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 10);
  }));
test("concurrent campaigns obey shared worker and queue limits", () =>
  isolated(async (_dir, open) => {
    const m = open({ maxCampaigns: 2 });
    m.startCampaign(config("a"));
    m.startCampaign(config("b"));
    assert.throws(() => m.startCampaign(config("c")));
    let max = 0;
    while (m.getSystemTelemetry().activeCampaigns) {
      const t = m.getSystemTelemetry();
      max = Math.max(max, t.busyWorkers);
      assert(t.queuedTasks <= 2);
      await sleep(10);
    }
    assert.equal(max, 1);
    assert.equal(m.getCampaign("a")!.progress.completedGames, 10);
    assert.equal(m.getCampaign("b")!.progress.completedGames, 10);
  }));
test("delete, late completion, immediate recreation and restart cannot resurrect old generation", () =>
  isolated(async (_dir, open) => {
    let m = open({ maxCampaigns: 3 });
    const first = m.startCampaign(config());
    m.deleteCampaign("test");
    const second = m.startCampaign(config());
    assert.notEqual(
      first.orchestration?.generation,
      second.orchestration?.generation,
    );
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 10);
    m.deleteCampaign("test");
    await m.close();
    m = open();
    assert.equal(m.getCampaign("test"), undefined);
  }));
for (const mode of ["error", "exit", "hang"])
  test(`worker ${mode}: finite retries then explicit campaign error`, () =>
    isolated(async (_dir, open) => {
      const m = open({
        pool: {
          workers: 1,
          queue: 1,
          retries: 1,
          timeoutMs: 200,
          workerUrl: new URL(`./fixtures/workers/${mode}.mjs`, import.meta.url),
        },
      });
      m.startCampaign(config());
      await drained(m);
      const r = m.getCampaign("test")!;
      assert.equal(r.status, "ERROR");
      assert.equal(r.progress.completedGames, 0);
      assert.equal(r.orchestration?.retries, 1);
      assert.equal(r.orchestration?.failedBatches, 1);
      assert(r.orchestration?.lastError);
    }));
test("second manager cannot concurrently own the same directory", () =>
  isolated(async (_dir, open) => {
    open();
    assert.throws(() => open(), /possède/);
  }));
test("HTTP disconnect, two independent clients and reconnect never own or duplicate the calculation", () =>
  isolated(async (_dir, open) => {
    const m = open();
    const { app } = await createApp({ manager: m, web: false, authorize: () => true });
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    const address = server.address() as { port: number },
      base = `http://127.0.0.1:${address.port}/api`;
    try {
      const response = await fetch(`${base}/campaigns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config()),
      });
      assert.equal(response.status, 201);
      const accepted = await response.json();
      await response.body?.cancel().catch(() => {});
      // Clients use independent, disposable TCP connections; no polling is needed to advance the runner.
      await drained(m);
      const read = async () => {
        const r = await fetch(`${base}/campaigns/test`, {
          headers: { Connection: "close" },
        });
        return r.json();
      };
      const [a, b] = await Promise.all([read(), read()]);
      assert.equal(a.status, "COMPLETED");
      assert.deepEqual(a, b);
      assert.equal(a.progress.completedGames, 10);
      assert.equal(
        a.orchestration.generation,
        accepted.orchestration.generation,
      );
      assert.equal((await (await fetch(`${base}/campaigns`)).json()).length, 1);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((r, e) =>
        server.close((err) => (err ? e(err) : r())),
      );
    }
  }));
test("unavailable server rejects campaign API without local computation or storage", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error("offline");
  };
  try {
    const api = await import("../src/api");
    await assert.rejects(api.createCampaign(config()), /offline/);
    await assert.rejects(api.fetchCampaigns(), /offline/);
    assert.equal(api.isUsingBrowserFallback(), false);
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
import { spawn } from "node:child_process";
async function processServer(dir: string) {
  const child = spawn(
    process.execPath,
    [
      "--import",
      "tsx",
      new URL("./fixtures/serverProcess.ts", import.meta.url).pathname,
      dir,
    ],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, TSX_DISABLE_CACHE: "1" },
    },
  );
  let errors = "";
  child.stderr.on("data", (s) => (errors += s.toString().slice(0, 2000)));
  const port = await new Promise<number>((resolve, reject) => {
    let output = "";
    const timer = setTimeout(
      () => reject(new Error("Server startup timeout " + errors)),
      10000,
    );
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("server exited " + errors));
    });
    child.stdout.on("data", (s) => {
      output += s.toString();
      if (output.includes("\n")) {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(output.split("\n")[0]).port);
        } catch (e) {
          reject(e);
        }
      }
    });
  });
  return {
    child,
    base: `http://127.0.0.1:${port}/api`,
    kill: async () => {
      if (child.exitCode !== null || child.signalCode) return;
      const exited = new Promise((r) => child.once("exit", r));
      child.kill("SIGKILL");
      await exited;
    },
  };
}
test("SIGKILL server process: durable checkpoints survive, restart is paused and two clients recover same campaign", () =>
  isolated(async (dir, _open) => {
    let server = await processServer(dir);
    try {
      const c = { ...config(), gamesPerVariantAndTable: 30 };
      const created = await fetch(server.base + "/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json", Connection: "close" },
        body: JSON.stringify(c),
      });
      assert.equal(created.status, 201);
      await created.json();
      let before: any;
      for (let i = 0; i < 100; i++) {
        before = await (await fetch(server.base + "/campaigns/test")).json();
        if (before.progress.completedGames >= 2) break;
        await sleep(20);
      }
      assert(
        before.progress.completedGames >= 2 &&
          before.progress.completedGames < 30,
      );
      await server.kill();
      server = await processServer(dir);
      const restored = await (
        await fetch(server.base + "/campaigns/test")
      ).json();
      assert.equal(restored.status, "PAUSED");
      assert(
        restored.progress.completedGames >= before.progress.completedGames,
      );
      assert(restored.progress.completedGames < 30);
      await fetch(server.base + "/campaigns/test/resume", { method: "POST" });
      let after: any;
      for (let i = 0; i < 200; i++) {
        after = await (
          await fetch(server.base + "/campaigns/test", {
            headers: { Connection: "close" },
          })
        ).json();
        if (after.status === "COMPLETED") break;
        await sleep(20);
      }
      assert.equal(after.status, "COMPLETED");
      assert.equal(after.progress.completedGames, 30);
      assert.equal(after.orchestration.validatedBatches, 15);
    } finally {
      await server.kill();
    }
  }));
test("SQLite rollback preserves committed metadata on write failure", () =>
  isolated(async (dir, open) => {
    const m = open();
    m.startCampaign(config());
    m.pauseCampaign("test");
    await drained(m);
    const before = m.getCampaign("test")!;
    const db = (m as unknown as { store: { db: DatabaseSync } }).store.db;
    db.exec("PRAGMA query_only=ON");
    assert.throws(() => m.resumeCampaign("test"));
    db.exec("PRAGMA query_only=OFF");
    assert.deepEqual(m.getCampaign("test"), before);
    m.resumeCampaign("test");
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 10);
  }));
test("stop followed by process interruption stays stopped after restart", () =>
  isolated(async (_dir, open) => {
    let m = open();
    m.startCampaign(config());
    m.stopCampaign("test");
    await m.close();
    m = open();
    assert.equal(m.getCampaign("test")!.status, "STOPPED");
    assert.equal(m.getCampaign("test")!.orchestration?.runningBatches, 0);
    assert.equal(m.getSystemTelemetry().activeCampaigns, 0);
  }));
test("pool rejects excess queue entries and recovers capacity after failure", async () => {
  const pool = new WorkerPool({
    workers: 1,
    queue: 1,
    retries: 0,
    timeoutMs: 100,
    workerUrl: new URL("./fixtures/workers/hang.mjs", import.meta.url),
  });
  const request = {
    taskId: 1,
    type: "RUN_EVAL_BATCH" as const,
    params: D,
    tableId: "x",
    botProfiles: ["BLIND" as const],
    jobs: [],
  };
  try {
    const a = pool.run(request, () => {}),
      b = pool.run({ ...request, taskId: 2 }, () => {});
    const ar = assert.rejects(a),
      br = assert.rejects(b);
    await assert.rejects(
      pool.run({ ...request, taskId: 3 }, () => {}),
      /pleine/,
    );
    assert.equal(pool.stats.busyWorkers, 1);
    assert.equal(pool.stats.queuedTasks, 1);
    await Promise.all([ar, br]);
    assert.equal(pool.stats.busyWorkers, 0);
  } finally {
    await pool.close();
  }
});
test("pause multiple in-flight campaigns and resume does not duplicate work", () =>
  isolated(async (_dir, open) => {
    const m = open({ pool: { workers: 2, queue: 1 }, maxCampaigns: 2 });
    m.startCampaign(config("a"));
    m.startCampaign(config("b"));
    assert.equal(m.getSystemTelemetry().busyWorkers, 2);
    m.pauseCampaign("a");
    m.pauseCampaign("b");
    m.resumeCampaign("a");
    m.pauseCampaign("a");
    await drained(m);
    assert.equal(m.getCampaign("a")!.progress.completedGames, 3);
    assert.equal(m.getCampaign("b")!.progress.completedGames, 3);
    m.resumeCampaign("a");
    m.resumeCampaign("b");
    await drained(m);
    assert.equal(m.getCampaign("a")!.progress.completedGames, 10);
    assert.equal(m.getCampaign("b")!.progress.completedGames, 10);
  }));
test("stop a queued batch cancels without marking the campaign as failed", () =>
  isolated(async (_dir, open) => {
    const m = open();
    m.startCampaign(config("a"));
    m.startCampaign(config("b"));
    m.stopCampaign("b");
    await drained(m);
    assert.equal(m.getCampaign("b")!.status, "STOPPED");
    assert.equal(m.getCampaign("b")!.progress.completedGames, 0);
    assert.equal(m.getCampaign("b")!.orchestration?.runningBatches, 0);
  }));
import { campaignReport } from "../src/campaignReport";
test("partial exports include durable unfinished table summaries without invented rankings", () =>
  isolated(async (_dir, open) => {
    const m = open();
    m.startCampaign(config());
    m.pauseCampaign("test");
    await drained(m);
    const r = m.getCampaign("test")!;
    assert.equal(r.partialResults?.tableSummaries[0].gamesCount, 3);
    assert.equal(r.variantResults.length, 0);
    const md = campaignReport(r);
    assert(md.includes("BILAN PARTIEL"));
    assert(md.includes("3 parties"));
  }));
test("a failed worker is replaced and a successful retry is committed once", () =>
  isolated(async (dir, open) => {
    const previous = process.env.AMAZONIA_TEST_ONCE;
    process.env.AMAZONIA_TEST_ONCE = path.join(dir, "attempt-marker");
    try {
      const m = open({
        pool: {
          workers: 1,
          queue: 1,
          retries: 1,
          workerUrl: new URL("./fixtures/workers/recover.mjs", import.meta.url),
        },
      });
      m.startCampaign(config());
      await drained(m);
      const r = m.getCampaign("test")!;
      assert.equal(r.status, "COMPLETED");
      assert.equal(r.progress.completedGames, 10);
      assert.equal(r.orchestration?.retries, 1);
      assert.equal(
        query(dir, "SELECT * FROM batches WHERE state='VALIDATED'").length,
        4,
      );
    } finally {
      if (previous === undefined) delete process.env.AMAZONIA_TEST_ONCE;
      else process.env.AMAZONIA_TEST_ONCE = previous;
    }
  }));
import {
  expandParameterSweep,
  evaluateFourCriteria,
} from "../src/sim/evaluator";
import { DEFAULT_TABLE_CONFIGS } from "../src/sim/i18n";
test("multiple variants and all seven tables retain the historical evaluator outputs", () =>
  isolated(async (_dir, open) => {
    const m = open({ batchSize: 5 });
    const c = {
      ...config(),
      gamesPerVariantAndTable: 5,
      includeCalibrationTables: true,
      sweep: {
        ...config().sweep,
        tacticalDefenderCapValues: [1, 2] as (1 | 2)[],
      },
    };
    m.startCampaign(c);
    await drained(m);
    const r = m.getCampaign("test")!;
    assert.equal(r.status, "COMPLETED");
    assert.equal(r.progress.completedGames, 70);
    for (const [i, spec] of expandParameterSweep(c.sweep).entries()) {
      const tables = [
        ...c.selectedTableConfigs,
        ...DEFAULT_TABLE_CONFIGS.filter((t) => t.id !== "TABLE_COORD"),
      ];
      const summaries = tables.map((t) =>
        summarizeTableGames(
          t,
          Array.from({ length: 5 }, (_, g) =>
            runSingleGame(spec.params, t.botProfiles, 42001 + g, t.id, g === 0),
          ),
        ),
      );
      assert.deepEqual(r.variantResults[i].tableSummaries, summaries);
      assert.deepEqual(
        r.variantResults[i].criteria,
        evaluateFourCriteria(spec.params, summaries),
      );
    }
  }));
test("failed COMMIT rolls back admission and publishes no phantom campaign", () =>
  isolated(async (_dir, open) => {
    const m = open();
    const db = (m as unknown as { store: { db: DatabaseSync } }).store.db;
    const exec = db.exec.bind(db);
    let fail = true;
    db.exec = (sql: string) => {
      if (sql === "COMMIT" && fail) {
        fail = false;
        throw new Error("injected COMMIT failure");
      }
      return exec(sql);
    };
    try {
      assert.throws(() => m.startCampaign(config()), /COMMIT/);
      assert.equal(m.getCampaign("test"), undefined);
      assert.equal(m.getSystemTelemetry().activeCampaigns, 0);
    } finally {
      db.exec = exec;
    }
    m.startCampaign(config());
    await drained(m);
    assert.equal(m.getCampaign("test")!.progress.completedGames, 10);
  }));

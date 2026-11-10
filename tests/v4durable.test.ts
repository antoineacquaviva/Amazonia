import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { StudyManager } from "../src/v4science/manager";
import { backupStudies, restoreStudies } from "../src/v4science/backup";
import { PROTOCOL, type Plan } from "../src/v4science/types";
import { DEFAULT_V4_CONFIG } from "../src/v4/types";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until(fn: () => boolean, timeout = 30000) {
  const end = Date.now() + timeout;
  while (!fn()) {
    assert(Date.now() < end, "timeout");
    await wait(10);
  }
}
const plan = (): Plan => ({
  protocol: PROTOCOL,
  name: "durable",
  configs: [structuredClone(DEFAULT_V4_CONFIG)],
  families: ["BLIND", "COORD_HYBRID"],
  seeds: [301, 302, 303, 304],
  experimentSeed: 11,
  environmentSeed: 13,
  policySeed: 17,
  independentGames: true,
});
function temp() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-durable-"));
}
test("durable pause/reopen never auto-runs, resumes exactly once; backup and restoration preserve unit samples", async () => {
  const root = temp(),
    archive = root + "-backup",
    restored = root + "-restored";
  let m: StudyManager | undefined = new StudyManager({ root, batchSize: 1 });
  let copy: StudyManager | undefined;
  try {
    const s = m.start(plan());
    await until(() => m!.get(s.id).completed >= 1);
    m.control(s.id, "pause");
    await until(() => !m!.busy);
    const paused = m.get(s.id),
      prior = m.samples(s.id);
    assert(paused.completed < paused.total);
    assert.equal(paused.status, "PAUSED");
    await backupStudies(root, archive);
    restoreStudies(archive, restored);
    copy = new StudyManager({ root: restored, batchSize: 1 });
    assert.deepEqual(copy.samples(s.id), prior);
    assert.equal(copy.get(s.id).status, "PAUSED");
    assert.equal(copy.busy, 0);
    await m.close();
    m = new StudyManager({ root, batchSize: 1 });
    assert.equal(m.get(s.id).completed, paused.completed);
    assert.equal(m.busy, 0);
    await wait(30);
    assert.equal(m.sampleCount(s.id), prior.length);
    m.control(s.id, "resume");
    await until(() => m!.get(s.id).status === "COMPLETED");
    await until(() => !m!.busy);
    copy.control(s.id, "resume");
    await until(() => copy!.get(s.id).status === "COMPLETED");
    await until(() => !copy!.busy);
    assert.deepEqual(copy.samples(s.id), m.samples(s.id));
    assert.equal(m.sampleCount(s.id), 8);
    assert.equal(m.get(s.id).completed, 8);
    assert.equal(m.report(s.id).complete, true);
    assert.throws(() => restoreStudies(archive, restored));
  } finally {
    await m?.close();
    await copy?.close();
    for (const dir of [root, archive, restored])
      fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("checkpoint failure rolls back samples and counters, retry succeeds without double accounting; stop discards in-flight batch", async () => {
  const root = temp();
  let fail = true;
  const m = new StudyManager({
    root,
    batchSize: 2,
    beforeCheckpoint: () => {
      if (fail) throw new Error("injected checkpoint fault");
    },
  });
  try {
    const s = m.start(plan());
    await until(() => m.get(s.id).status === "ERROR");
    await until(() => !m.busy);
    assert.equal(m.sampleCount(s.id), 0);
    assert.equal(m.get(s.id).cursor, 0);
    fail = false;
    m.control(s.id, "resume");
    await until(() => m.get(s.id).completed >= 2);
    m.control(s.id, "stop");
    const checkpoint = m.get(s.id).completed;
    await until(() => !m.busy);
    assert.equal(m.sampleCount(s.id), checkpoint);
    assert.equal(m.get(s.id).status, "STOPPED");
    m.control(s.id, "resume");
    await until(() => m.get(s.id).status === "COMPLETED");
    assert.equal(m.sampleCount(s.id), 8);
  } finally {
    await m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("resume rejects incompatible provenance or modified manifest, and writer lease is exclusive", async () => {
  const root = temp(),
    m = new StudyManager({ root });
  try {
    assert.throws(() => new StudyManager({ root }), /possède déjà/);
    const s = m.start(plan());
    m.control(s.id, "pause");
    await until(() => !m.busy);
    const altered = m.get(s.id);
    altered.provenance.sourceHash = "bad";
    m.store.db
      .prepare("UPDATE v4_studies SET body=? WHERE id=?")
      .run(JSON.stringify(altered), s.id);
    assert.throws(() => m.control(s.id, "resume"), /incompatibles/);
    assert.equal(m.get(s.id).status, "ERROR");
    const other = m.start(plan());
    m.control(other.id, "pause");
    await until(() => !m.busy);
    const body = m.get(other.id);
    body.plan.policySeed++;
    m.store.db
      .prepare("UPDATE v4_studies SET body=? WHERE id=?")
      .run(JSON.stringify(body), other.id);
    assert.throws(() => m.control(other.id, "resume"), /incompatibles/);
  } finally {
    await m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("scientific API survives browser reconnect, offers controls, reports and autonomous private exports under existing guards", async () => {
  const root = temp(),
    studies = new StudyManager({ root: path.join(root, "studies") }),
    manager = new CampaignManager({
      campaignsDir: path.join(root, "legacy"),
      createReference: false,
      pool: { workers: 1, queue: 2 },
    });
  const { app } = await createApp({
    studies,
    manager,
    web: false,
    authorize: () => true,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  try {
    const base = `http://127.0.0.1:${(server.address() as any).port}/api/v4/studies`,
      post = (body: unknown) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    assert.equal(
      (await fetch(base + "/estimate", post({ ...plan(), seeds: [1, 1] })))
        .status,
      400,
    );
    const estimate = await (
      await fetch(base + "/estimate", post(plan()))
    ).json();
    assert.equal(estimate.total, 8);
    assert(estimate.estimatedSeconds > 0);
    const response = await fetch(base, post(plan()));
    assert.equal(response.status, 202);
    const s = await response.json();
    assert.equal((await fetch(base, post(plan()))).status, 400);
    assert.equal((await fetch(base + `/${s.id}/pause`, post({}))).status, 200);
    await until(() => !studies.busy);
    const partial = await (await fetch(base + `/${s.id}/report`)).json();
    assert.equal(partial.complete, false);
    assert(
      partial.tables.every((t: any) => t.difficulty.standing.ci95 === null),
    );
    assert.equal((await fetch(base + `/${s.id}/resume`, post({}))).status, 200);
    // No client polling until work finishes.
    await until(() => studies.get(s.id).status === "COMPLETED");
    const list = await (await fetch(base)).json();
    assert.equal(list.studies[0].completed, 8);
    const archive = await (await fetch(base + `/${s.id}/export/json`)).json();
    assert.equal(archive.samples.length, 8);
    assert.equal(archive.format, "V4_AUTONOMOUS_ARCHIVE_1");
    assert(
      archive.study.documentSnapshots["docs/V4_MEASURES.md"].text.includes(
        "Mesures V4",
      ),
    );
    assert.equal((await fetch(base + `/${s.id}/export/markdown`)).status, 200);
    assert.equal(manager.listCampaigns().length, 0);
    const alias = base.replace("/api/", "/sim/api/");
    assert.equal((await fetch(alias + `/${s.id}`)).status, 200);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await studies.close();
    await manager.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("SQL failure inside checkpoint transaction rolls back the first inserted sample too", async () => {
  const root = temp(),
    m = new StudyManager({ root, batchSize: 2 });
  try {
    m.store.db.exec(
      "CREATE TRIGGER reject_v4_sample BEFORE INSERT ON v4_samples WHEN NEW.job_index=1 BEGIN SELECT RAISE(ABORT,'injected SQL failure'); END;",
    );
    const s = m.start(plan());
    await until(() => m.get(s.id).status === "ERROR");
    await until(() => !m.busy);
    assert.equal(m.sampleCount(s.id), 0);
    assert.equal(m.get(s.id).completed, 0);
    m.store.db.exec("DROP TRIGGER reject_v4_sample");
    m.control(s.id, "resume");
    await until(() => m.get(s.id).status === "COMPLETED");
    assert.equal(m.sampleCount(s.id), 8);
  } finally {
    await m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("SIGKILL leaves an unconfirmed batch replayable only after explicit resume", async () => {
  const { spawn } = await import("node:child_process"),
    root = temp();
  let m: StudyManager | undefined;
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "tests/fixtures/v4CrashProcess.ts", root],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  let errors = "";
  child.stdout.on("data", (b) => (output += b));
  child.stderr.on("data", (b) => (errors += b));
  try {
    await until(() => output.includes('"completed":1'), 30000);
    const id = JSON.parse(output.split("\n")[0]).id;
    const exit = new Promise<void>((r) => child.once("exit", () => r()));
    child.kill("SIGKILL");
    await exit;
    m = new StudyManager({ root, batchSize: 1 });
    const checkpoint = m.get(id);
    assert.equal(checkpoint.status, "PAUSED");
    assert.equal(m.busy, 0);
    const n = checkpoint.completed;
    assert(n >= 1 && n < 12);
    await wait(40);
    assert.equal(m.get(id).completed, n);
    m.control(id, "resume");
    await until(() => m!.get(id).status === "COMPLETED");
    assert.equal(m.sampleCount(id), 12);
    assert.equal(new Set(m.samples(id).map((s) => s.unit)).size, 12);
  } catch (e) {
    throw new Error(`${(e as Error).message}; child: ${errors}`);
  } finally {
    child.kill("SIGKILL");
    await m?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test(
  "parallel V4 wave uses two workers and commits identical ordered results",
  { skip: os.availableParallelism() < 3 },
  async () => {
    const parallel = temp(),
      sequential = temp();
    const a = new StudyManager({
        root: parallel,
        batchSize: 2,
        pool: { workers: 2 },
      }),
      b = new StudyManager({ root: sequential, batchSize: 2 });
    try {
      const p = plan();
      const x = a.start(p);
      assert.equal(a.pool.stats.busyWorkers, 2);
      const y = b.start(p);
      await until(() => !a.busy && !b.busy);
      assert.equal(a.get(x.id).status, "COMPLETED");
      assert.deepEqual(a.samples(x.id), b.samples(y.id));
    } finally {
      await a.close();
      await b.close();
      for (const root of [parallel, sequential])
        fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

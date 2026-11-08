import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { configuredCampaignsDir } from "../src/server/storageConfig";
import { singleInput } from "../src/server/singleValidation";
import { backupCampaigns, restoreCampaigns } from "../scripts/backup";
import { DatabaseSync } from "node:sqlite";

async function settled(m: CampaignManager) {
  const end = Date.now() + 15000;
  while (
    m.getSystemTelemetry().busyWorkers ||
    m.getSystemTelemetry().queuedTasks ||
    m.getSystemTelemetry().activeCampaigns
  ) {
    if (Date.now() > end) throw new Error("Timeout");
    await new Promise((r) => setTimeout(r, 10));
  }
}
async function http(
  authorize: any,
  action: (base: string, m: CampaignManager) => Promise<void>,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-security-"));
  const m = new CampaignManager({
    campaignsDir: dir,
    pool: { workers: 1, queue: 1, timeoutMs: 10000, retries: 0 },
  });
  const { app } = await createApp({ manager: m, web: false, authorize });
  const s = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => s.once("listening", r));
  try {
    await action(`http://127.0.0.1:${(s.address() as any).port}`, m);
  } finally {
    s.closeAllConnections();
    await new Promise<void>((r) => s.close(() => r()));
    await m.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
test("unconfigured security denies all sensitive aliases and forged identity, including reads and audits", async () => {
  await http(undefined, async (base) => {
    for (const prefix of ["/api", "/amazonia/api", "/other/api"])
      for (const [method, route] of [
        ["GET", "/health"],
        ["GET", "/campaigns"],
        ["GET", "/campaigns/test/scientific-audits/0/t"],
        ["POST", "/campaigns"],
        ["POST", "/simulate-single"],
        ["DELETE", "/campaigns/test"],
      ]) {
        const r = await fetch(base + prefix + route, {
          method,
          headers: {
            "x-user": "admin",
            "x-forwarded-user": "admin",
            Referer: "https://trusted/amazonia/",
            Origin: "https://trusted",
          },
        });
        assert.equal(r.status, 503);
        assert.equal(r.headers.get("cache-control"), "no-store");
      }
  });
});
test("trusted integration seam enforces permissions, fails closed and rejects cross-site requests", async () => {
  await http(
    (_req: any, p: string) => p === "read",
    async (base) => {
      assert.equal((await fetch(base + "/api/health")).status, 200);
      for (const route of ["/campaigns", "/simulate-single"])
        assert.equal(
          (await fetch(base + "/api" + route, { method: "POST" })).status,
          403,
        );
      assert.equal(
        (await fetch(base + "/api/campaigns/test/scientific-audits/0/t"))
          .status,
        403,
      );
      assert.equal(
        (
          await fetch(base + "/api/health", {
            headers: { "sec-fetch-site": "cross-site" },
          })
        ).status,
        403,
      );
    },
  );
  await http(
    () => {
      throw new Error("/private/secret");
    },
    async (base) => {
      const r = await fetch(base + "/api/health");
      assert.equal(r.status, 503);
      assert.ok(!(await r.text()).includes("secret"));
    },
  );
});
test("authorized input validation, body bound and global quota cover aliases", async () => {
  await http(
    () => true,
    async (base) => {
      const headers = { "Content-Type": "application/json" };
      assert.equal(
        (
          await fetch(base + "/api/simulate-single", {
            method: "POST",
            headers,
            body: '{"params":{"numTurns":999999}}',
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await fetch(base + "/api/simulate-single", {
            method: "POST",
            headers,
            body: JSON.stringify({ large: "x".repeat(270000) }),
          })
        ).status,
        413,
      );
      const r = await fetch(base + "/amazonia/api/simulate-single", {
        method: "POST",
        headers,
        body: "{}",
      });
      assert.equal(r.status, 200);
      assert.ok((await r.json()).textualJournal);
      for (let i = 0; i < 30; i++)
        await fetch(base + "/other/api/simulate-single", {
          method: "POST",
          headers,
          body: '{"seed":-1}',
        });
      assert.equal(
        (
          await fetch(base + "/api/campaigns", {
            method: "POST",
            headers,
            body: "{}",
          })
        ).status,
        429,
      );
    },
  );
});
test("single validation rejects numeric coercion, arbitrary state, unsupported science and long profiles", () => {
  for (const value of [
    { seed: "1" },
    { params: { numPlayers: 100 } },
    { params: { initialMachinesState: [] } },
    { botProfiles: Array(7).fill("BLIND") },
    { protocol: "BAD" },
    { protocol: "SCIENTIFIC_V1" },
    { params: { tacticsTrackSetup: ["A1"] } },
  ])
    assert.throws(() => singleInput(value));
});
test("single simulation shares occupied campaign pool rather than creating spare compute", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "single-budget-"));
  const m = new CampaignManager({
    campaignsDir: dir,
    pool: {
      workers: 1,
      queue: 1,
      timeoutMs: 1000,
      retries: 0,
      workerUrl: new URL("./fixtures/workers/hang.mjs", import.meta.url),
    },
  });
  try {
    const p = m.simulateSingle(singleInput({}));
    await assert.rejects(m.simulateSingle(singleInput({})), /occupées/);
    await assert.rejects(p, /Délai/);
  } finally {
    await m.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("production storage is explicit, existing, canonical and intentionally initialized", () => {
  const old = process.env.NODE_ENV,
    oldDir = process.env.AMAZONIA_CAMPAIGNS_DIR;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "storage-config-"));
  try {
    process.env.NODE_ENV = "production";
    delete process.env.AMAZONIA_CAMPAIGNS_DIR;
    assert.throws(configuredCampaignsDir);
    process.env.AMAZONIA_CAMPAIGNS_DIR = dir;
    assert.throws(configuredCampaignsDir, /initialisé/);
    fs.writeFileSync(path.join(dir, ".amazonia-storage"), "");
    assert.equal(configuredCampaignsDir(), dir);
    process.env.AMAZONIA_CAMPAIGNS_DIR = dir + "/missing";
    assert.throws(configuredCampaignsDir);
    fs.chmodSync(dir, 0o500); // mode check also works when tests run as privileged user
    assert.throws(configuredCampaignsDir);
    fs.chmodSync(dir, 0o700);
    fs.symlinkSync(dir, dir + "-link");
    process.env.AMAZONIA_CAMPAIGNS_DIR = dir + "-link";
    assert.throws(configuredCampaignsDir);
  } finally {
    if (old === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = old;
    if (oldDir === undefined) delete process.env.AMAZONIA_CAMPAIGNS_DIR;
    else process.env.AMAZONIA_CAMPAIGNS_DIR = oldDir;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(dir + "-link", { force: true });
  }
});
test("live WAL backup, hashes, legacy preservation and exclusive restoration without source lease changes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "backup-test-")),
    source = path.join(root, "source"),
    dest = path.join(root, "backup"),
    restored = path.join(root, "restored");
  fs.mkdirSync(source);
  const m = new CampaignManager({ campaignsDir: source });
  try {
    fs.writeFileSync(
      path.join(source, "legacy.json"),
      "invalid original preserved",
    );
    fs.mkdirSync(path.join(source, "quarantine"));
    fs.writeFileSync(
      path.join(source, "quarantine", "a".repeat(64) + ".json"),
      "quarantine bytes",
    );
    const db = new DatabaseSync(path.join(source, "orchestration.sqlite"));
    db.exec("CREATE TABLE marker(n); INSERT INTO marker VALUES(42)");
    const owner = db.prepare("SELECT * FROM owner").get();
    await backupCampaigns(source, dest);
    assert.deepEqual(db.prepare("SELECT * FROM owner").get(), owner);
    db.close();
    await assert.rejects(backupCampaigns(source, dest), /EEXIST/);
    restoreCampaigns(dest, restored);
    assert.equal(
      fs.readFileSync(path.join(restored, "legacy.json"), "utf8"),
      "invalid original preserved",
    );
    const copy = new DatabaseSync(path.join(restored, "orchestration.sqlite"));
    assert.equal(copy.prepare("SELECT n FROM marker").get()!.n, 42);
    assert.equal(copy.prepare("SELECT count(*) n FROM owner").get()!.n, 0);
    copy.close();
    const reopened = new CampaignManager({ campaignsDir: restored });
    await reopened.close();
    assert.throws(() => restoreCampaigns(dest, restored), /EEXIST/);
    fs.appendFileSync(path.join(dest, "legacy.json"), "corrupted");
    assert.throws(
      () => restoreCampaigns(dest, path.join(root, "bad")),
      /Empreinte/,
    );
  } finally {
    await m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("restored active checkpoint is paused, counters survive and resume is explicit", async () => {
  const { DEFAULT_SWEEP_INPUT: S } = await import("../src/sim/i18n");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "restore-resume-"));
  const source = path.join(root, "live");
  fs.mkdirSync(source);
  const m = new CampaignManager({
    campaignsDir: source,
    batchSize: 2,
    pool: { workers: 1, queue: 1 },
  });
  let restored: CampaignManager | undefined;
  try {
    m.startCampaign({
      id: "recover",
      name: "recover",
      type: "MONTE_CARLO_SWEEP",
      createdAt: "2026-11-08",
      gamesPerVariantAndTable: 10,
      baseSeed: 42,
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
          id: "t",
          name: "t",
          description: "test",
          botProfiles: ["COORD_HYBRID"],
        },
      ],
      includeCalibrationTables: false,
    });
    m.pauseCampaign("recover");
    await settled(m);
    const before = m.getCampaign("recover")!.progress.completedGames;
    await backupCampaigns(source, path.join(root, "archive"));
    restoreCampaigns(path.join(root, "archive"), path.join(root, "restored"));
    restored = new CampaignManager({
      campaignsDir: path.join(root, "restored"),
      batchSize: 2,
      pool: { workers: 1, queue: 1 },
    });
    assert.equal(restored.getCampaign("recover")!.status, "PAUSED");
    assert.equal(
      restored.getCampaign("recover")!.progress.completedGames,
      before,
    );
    restored.resumeCampaign("recover");
    await settled(restored);
    assert.equal(restored.getCampaign("recover")!.status, "COMPLETED");
    assert.equal(restored.getCampaign("recover")!.progress.completedGames, 10);
  } finally {
    await restored?.close();
    await m.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("client refusal stays on its prefix and never invokes local fallback", async () => {
  const original = globalThis.fetch;
  const previousWindow = (globalThis as any).window;
  const urls: string[] = [];
  try {
    (globalThis as any).window = { location: { pathname: "/amazonia/" } };
    globalThis.fetch = async (input) => {
      urls.push(String(input));
      return new Response("{}", {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    };
    const api = await import("../src/api");
    assert.equal(await api.fetchServerHealth(true), null);
    assert.deepEqual(urls, ["/amazonia/api/health"]);
    assert.match(api.getLastBackendDiagnostic()!.reason, /autorisation/);
    assert.equal(api.isUsingBrowserFallback(), false);
  } finally {
    globalThis.fetch = original;
    (globalThis as any).window = previousWindow;
  }
});

import { SCIENTIFIC_PILOT_NOTICE } from "../src/scientific/pilotNotice";
import {
  classifyProfiles,
  summarizeScientific,
} from "../src/scientific/reports";
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { runScientificGame } from "../src/scientific/runner";
import { DecisionRandom } from "../src/scientific/random";
import { decide } from "../src/scientific/policies";
import {
  observe,
  POLICY_VERSIONS,
  type SupportedPolicy,
} from "../src/scientific/observations";
import {
  normalizeProtocol,
  type ScienceOptions,
  type ProtocolConfig,
} from "../src/scientific/protocol";
import {
  meanEstimate,
  proportionEstimate,
  pairedDifference,
} from "../src/scientific/statistics";
import {
  DEFAULT_SIMULATION_CONFIG as D,
  DEFAULT_SWEEP_INPUT as S,
} from "../src/sim/i18n";
import type {
  PlayerForestGroup,
  SecretVillainDraw,
  BotProfileId,
} from "../src/sim/types";
import { CampaignManager } from "../src/server/campaignManager";
import { campaignReport } from "../src/campaignReport";
const assumptions = {
  independentGames: true,
  fixedSampleSize: true,
  analysis: "EXPLORATORY" as const,
};
const options: ScienceOptions = {
  experimentSeed: 7,
  environmentSeed: 11,
  policySeed: 13,
  assumptions,
};
const run = (profiles: BotProfileId[], seed = 42001, policy?: typeof decide) =>
  runScientificGame(D, profiles, seed, "science", true, options, policy);
test("scientific same manifest is exactly replayable; historical reference panel stays separate", () => {
  for (const p of Object.keys(POLICY_VERSIONS) as SupportedPolicy[]) {
    const a = run([p]),
      b = run([p]);
    assert.deepEqual(a, b);
    assert.equal(a.violations.length, 0);
    assert.equal(a.scientific.protocol.protocol, "SCIENTIFIC_V1");
    assert.equal(a.traces?.length, 8);
  }
});
test("different policies and extra decision RNG consumption cannot modify exogenous dice", () => {
  const a = run(["BLIND"]),
    b = run(["PROB_ONLY"]),
    c = run(["BLIND"], 42001, (o, r) => {
      for (let i = 0; i < 100; i++) r.nextInt(0, 99);
      return decide(o, r);
    });
  assert.deepEqual(
    a.scientific.environmentEvents,
    b.scientific.environmentEvents,
  );
  assert.deepEqual(
    a.scientific.environmentEvents,
    c.scientific.environmentEvents,
  );
  assert.equal(
    a.scientific.environmentFingerprint,
    c.scientific.environmentFingerprint,
  );
  assert.equal(a.scientific.pairingKey, b.scientific.pairingKey);
  const different = runScientificGame(D, ["BLIND"], 42001, "science", true, {
    ...options,
    environmentSeed: 12,
  });
  assert.notEqual(
    a.scientific.environmentFingerprint,
    different.scientific.environmentFingerprint,
  );
  const policySeed = runScientificGame(D, ["BLIND"], 42001, "science", true, {
    ...options,
    policySeed: 99,
  });
  assert.deepEqual(
    a.scientific.environmentEvents,
    policySeed.scientific.environmentEvents,
  );
});
function board(): PlayerForestGroup[] {
  return Array.from({ length: 4 }, (_, playerIndex) => ({
    playerIndex,
    rankOnEvilEye: playerIndex + 1,
    harvester: {
      type: "A",
      status: "NORMAL",
      position: 1,
      startOfTurnPosition: 1,
      hasSabotage: false,
    },
    bulldozer: {
      type: "B",
      status: "NORMAL",
      position: 1,
      startOfTurnPosition: 1,
      hasSabotage: false,
    },
    cells: Array.from({ length: 16 }, (_, i) => ({
      cellIndex: i + 1,
      standingTrees: 2,
      stumps: 0,
      hasTrap: false,
      tacticalDefenders: 0,
      stealthDefenders: 0,
      faceUpCards: [],
      faceDownCards: [],
      explodedHereThisTurn: false,
    })),
  }));
}
function draws(): SecretVillainDraw[] {
  return Array.from({ length: 4 }, (_, rollerPlayerIndex) => ({
    rollerPlayerIndex,
    d1: 1,
    d2: 1,
    mIndex: 1,
    tactic: "A1",
    targetPlayerIndex: 0,
  }));
}
for (const profile of [
  "BLIND",
  "PROB_ONLY",
  "SOLO_INFORMED",
  "COORD_ONE_SHOT",
] as const)
  test(`${profile}: partner secrets and invisible metadata never enter the observation`, () => {
    const input = {
      policy: profile,
      player: 0,
      turn: 1,
      step: 2 as const,
      groups: board(),
      draws: draws(),
      placements: [
        {
          playerIndex: 1,
          step: 1 as const,
          targetPlayerIndex: 1,
          cellIndex: 2,
          track: "TACTICAL" as const,
        },
      ],
      history: [],
      track: D.tacticsTrackSetup,
      config: D,
    };
    const a = observe(input);
    const altered = structuredClone(input);
    altered.draws[1] = {
      rollerPlayerIndex: 1,
      d1: 6,
      d2: 6,
      mIndex: 6,
      tactic: "B3",
      targetPlayerIndex: 2,
    };
    (altered.placements[0] as unknown as { reason: string }).reason =
      "Signal PRIVATE";
    (altered.groups[0].cells[0] as unknown as { secret: string }).secret =
      "hidden";
    altered.groups[0].cells[0].faceDownCards = ["B3"];
    const b = observe(altered);
    assert.deepEqual(a, b);
    assert.deepEqual(
      decide(a, new DecisionRandom("fixed")),
      decide(b, new DecisionRandom("fixed")),
    );
    assert(!("allCurrentRolls" in a));
    assert(!JSON.stringify(a).includes("PRIVATE"));
    assert(!("faceDownCards" in a.publicBoard[0].cells[0]));
    assert(Object.isFrozen(a));
    assert.throws(() => a.publicBoard.push(a.publicBoard[0]));
  });
test("blind penalties remove the own die; visible state can legitimately change public policy", () => {
  const input = {
    policy: "BLIND" as const,
    player: 0,
    turn: 1,
    step: 1 as const,
    groups: board(),
    draws: draws(),
    placements: [],
    history: [],
    track: D.tacticsTrackSetup,
    config: D,
  };
  const a = observe(input);
  const altered = structuredClone(input);
  altered.draws[0].tactic = "B3";
  assert.deepEqual(a, observe(altered));
  assert.equal(a.personalRoll, undefined);
  const p = observe({ ...input, policy: "PROB_ONLY" });
  const changed = board();
  changed[0].harvester.status = "DESTROYED";
  changed[0].harvester.position = null;
  changed[0].bulldozer.position = 4;
  const q = observe({ ...input, policy: "PROB_ONLY", groups: changed });
  assert.notDeepEqual(
    decide(p, new DecisionRandom("x")),
    decide(q, new DecisionRandom("x")),
  );
});
test("visible signals only follow the completed first step; no revision or private reasons", () => {
  const r = run(["COORD_ONE_SHOT"]);
  const obs = r.scientific.observations!;
  assert(
    obs
      .filter((o) => o.step === 1 && o.turn === 1)
      .every((o) => o.visiblePlacements.length === 0),
  );
  assert(
    obs
      .filter((o) => o.step === 2 && o.turn === 1)
      .every((o) => o.visiblePlacements.length === 4),
  );
  assert(
    obs.every((o) => !JSON.stringify(o.visiblePlacements).includes("reason")),
  );
  assert.equal(r.step2RevisionsCount, 0);
});
test("mixed ordinary teams and every cyclic seat rotation have explicit reproducible policies", () => {
  const team: BotProfileId[] = [
    "BLIND",
    "PROB_ONLY",
    "SOLO_INFORMED",
    "COORD_ONE_SHOT",
  ];
  const tape = run(team).scientific.environmentEvents;
  for (let i = 0; i < team.length; i++) {
    const rotated = team.slice(i).concat(team.slice(0, i));
    const r = run(rotated);
    assert.deepEqual(r.scientific.team, rotated);
    assert.deepEqual(r.scientific.environmentEvents, tape);
    assert.equal(r.scientific.policyVersions.length, 4);
    assert.equal(r.violations.length, 0);
  }
  assert.throws(() => run(["COORD_HYBRID"]), /revisions/);
  assert.throws(() => run(["COORD_NO_DICE"]), /revisions/);
  assert.throws(() => run(["OMNISCIENT", "BLIND"]), /privileged/);
  const privileged = run(["OMNISCIENT"]);
  assert(
    privileged.scientific.observations!.every(
      (o) =>
        o.policy === "OMNISCIENT" &&
        o.privilege === "ALL_CURRENT_ROLLS" &&
        o.allCurrentRolls.length === 4,
    ),
  );
  assert(!/plafond théorique/i.test(privileged.textualJournal!));
});
test("shuffled public tactics match actual exogenous events and preserve reproducibility", () => {
  const params = { ...D, shuffleTacticsTrack: true };
  const a = runScientificGame(params, ["BLIND"], 42001, "x", true, options),
    b = runScientificGame(params, ["PROB_ONLY"], 42001, "x", true, options);
  assert.deepEqual(
    a.scientific.environmentEvents,
    b.scientific.environmentEvents,
  );
  for (const t of a.traces!)
    for (const d of t.draws)
      assert.equal(
        d.tactic,
        a.scientific.observations![0].tacticsTrack[d.mIndex - 1],
      );
  assert.throws(
    () =>
      runScientificGame(
        { ...D, initialMachinesState: [] },
        ["BLIND"],
        1,
        "x",
        false,
        options,
      ),
    /Unspecified/,
  );
});
test("known moments; finite sample uncertainty differs from dispersion", () => {
  const e = meanEstimate([1, 2, 3, 4], [0, 4], assumptions);
  assert.equal(e.n, 4);
  assert.equal(e.mean, 2.5);
  assert(Math.abs(e.sampleSd! - Math.sqrt(5 / 3)) < 1e-12);
  assert(Math.abs(e.standardError! - Math.sqrt(5 / 3) / 2) < 1e-12);
  assert(e.ci95);
  const single = meanEstimate([0.5], [0, 1], assumptions);
  assert.equal(single.sampleSd, null);
  assert.deepEqual(single.ci95, [0, 1]);
  assert.equal(
    meanEstimate([0.5], [0, 1], { ...assumptions, independentGames: false })
      .ci95,
    null,
  );
  assert.equal(meanEstimate([0.5], [0, 1], assumptions, false).ci95, null);
});
test("missing observations stay explicit; Wilson handles zero/all successes", () => {
  const e = meanEstimate([0.2, null, 0.6], [0, 1], assumptions);
  assert.equal(e.n, 2);
  assert.equal(e.missing, 1);
  assert.equal(e.mean, 0.4);
  assert.equal(e.ci95, null);
  assert.equal(meanEstimate([], [0, 1], assumptions).status, "UNAVAILABLE");
  const zero = proportionEstimate(Array(10).fill(false), assumptions),
    all = proportionEstimate(Array(10).fill(true), assumptions);
  assert(Math.abs(zero.ci95![1] - 0.2775327998628892) < 1e-12);
  assert(zero.ci95![1] > 0);
  assert(all.ci95![0] < 1);
  assert.equal(proportionEstimate([], assumptions).mean, null);
});
test("paired zero variance is descriptive, not a proof of zero population uncertainty", () => {
  const left = [0, 1, 2].map((i) => ({
      unit: String(i),
      pairingKey: "rules",
      environmentFingerprint: String(i),
      value: 0.6,
    })),
    right = left.map((x) => ({ ...x, value: 0.4 }));
  const e = pairedDifference(left, right, assumptions);
  assert.equal(e.paired, true);
  assert(Math.abs(e.mean! - 0.2) < 1e-12);
  assert.equal(e.sampleSd, 0);
  assert(e.ci95![1] > e.ci95![0]);
  assert.equal(
    pairedDifference(left, right.slice(1), assumptions).paired,
    false,
  );
  assert.equal(
    pairedDifference(
      left,
      right.map((x) => ({ ...x, environmentFingerprint: "different" })),
      assumptions,
    ).reason,
    "INCOMPATIBLE_ENVIRONMENTS",
  );
  assert.throws(
    () => pairedDifference([...left, left[0]], right, assumptions),
    /Duplicate/,
  );
});
function config(id = "scientific"): ProtocolConfig {
  return {
    id,
    name: "SCI test",
    type: "MONTE_CARLO_SWEEP",
    createdAt: "2026-11-08",
    gamesPerVariantAndTable: 5,
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
        id: "blind",
        name: "Blind",
        description: "SCI",
        botProfiles: ["BLIND"],
      },
      {
        id: "prob",
        name: "Public",
        description: "SCI",
        botProfiles: ["PROB_ONLY"],
      },
    ],
    includeCalibrationTables: false,
    protocol: "SCIENTIFIC_V1",
    science: options,
  };
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function drain(m: CampaignManager) {
  const end = Date.now() + 15000;
  while (m.getSystemTelemetry().activeCampaigns) {
    assert(Date.now() < end);
    await sleep(10);
  }
}
test("scientific campaigns survive checkpoints exactly; samples and protocol remain isolated", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-science-"));
  let m: CampaignManager | undefined, other: CampaignManager | undefined;
  try {
    m = new CampaignManager({
      campaignsDir: path.join(root, "resumed"),
      batchSize: 2,
    });
    m.startCampaign(config());
    m.pauseCampaign("scientific");
    await drain(m);
    assert.equal(m.getCampaign("scientific")!.progress.completedGames, 2);
    const partial = m.getCampaign("scientific")!;
    assert.equal(
      partial.scientificPartial![0].pilotNotice,
      SCIENTIFIC_PILOT_NOTICE,
    );
    assert(campaignReport(partial).includes(SCIENTIFIC_PILOT_NOTICE));
    await m.close();
    m = new CampaignManager({
      campaignsDir: path.join(root, "resumed"),
      batchSize: 3,
    });
    m.resumeCampaign("scientific");
    await drain(m);
    other = new CampaignManager({
      campaignsDir: path.join(root, "continuous"),
      batchSize: 2,
    });
    other.startCampaign(config());
    await drain(other);
    const a = m.getCampaign("scientific")!,
      b = other.getCampaign("scientific")!;
    assert.equal(a.status, "COMPLETED");
    assert.equal(a.orchestration!.version, 2);
    assert.deepEqual(a.scientificResults, b.scientificResults);
    assert.equal(a.variantResults.length, 0);
    const report = a.scientificResults![0];
    assert.equal(report.tableSummaries.length, 2);
    assert.equal(report.comparisons[0].estimate.paired, true);
    assert.equal(report.comparisons[0].estimate.n, 5);
    assert(report.unselectedProfiles.includes("OMNISCIENT"));
    assert(!report.unavailableProfiles.includes("OMNISCIENT"));
    assert(report.tableSummaries[0].survival.ci95);
    assert(campaignReport(a).includes("SCIENTIFIC_V1"));
    assert.deepEqual(report.selectedProfiles, ["BLIND", "PROB_ONLY"]);
    assert.deepEqual(report.unselectedProfiles, [
      "SOLO_INFORMED",
      "COORD_ONE_SHOT",
      "OMNISCIENT",
    ]);
    assert.deepEqual(report.unavailableProfiles, [
      "COORD_NO_DICE",
      "COORD_HYBRID",
    ]);
    const json = JSON.parse(JSON.stringify(a));
    assert.equal(
      json.scientificResults[0].pilotNotice,
      SCIENTIFIC_PILOT_NOTICE,
    );
    assert(
      json.scientificResults[0].tableSummaries.every(
        (t: { pilotNotice: string }) =>
          t.pilotNotice === SCIENTIFIC_PILOT_NOTICE,
      ),
    );
    const md = campaignReport(a);
    assert(md.includes(SCIENTIFIC_PILOT_NOTICE));
    assert(
      md.includes(
        "Politiques implémentées et sélectionnées : BLIND, PROB_ONLY",
      ),
    );
    assert(
      md.includes(
        "Politiques implémentées mais non sélectionnées : SOLO_INFORMED, COORD_ONE_SHOT, OMNISCIENT",
      ),
    );
    assert(
      md.includes(
        "Politiques scientifiques indisponibles : COORD_NO_DICE, COORD_HYBRID",
      ),
    );

    assert(!campaignReport(a).includes("Note Design"));
    const db = new DatabaseSync(
      path.join(root, "resumed", "orchestration.sqlite"),
    );
    assert.equal(
      db.prepare("SELECT count(*) AS n FROM scientific_samples").get()!.n,
      10,
    );
    db.close();
  } finally {
    await m?.close();
    await other?.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
test("tampered manifest/checkpoint cannot resume under a different experiment", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-manifest-"));
  let m: CampaignManager | undefined;
  try {
    m = new CampaignManager({ campaignsDir: dir, batchSize: 2 });
    m.startCampaign(config());
    m.pauseCampaign("scientific");
    await drain(m);
    await m.close();
    const db = new DatabaseSync(path.join(dir, "orchestration.sqlite"));
    const state = JSON.parse(
      (db.prepare("SELECT body FROM campaigns").get() as { body: string }).body,
    );
    state.record.config.science.environmentSeed++;
    db.prepare("UPDATE campaigns SET body=?").run(JSON.stringify(state));
    db.close();
    m = new CampaignManager({ campaignsDir: dir });
    assert.equal(m.getCampaign("scientific")!.status, "ERROR");
    assert.equal(
      m.getCampaign("scientific")!.orchestration!.reason,
      "PROTOCOL_MISMATCH",
    );
    assert.throws(() => m!.resumeCampaign("scientific"), /manifest/);
  } finally {
    await m?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("protocol mismatch and unsupported scientific team fail before campaign admission", () => {
  assert.throws(
    () => normalizeProtocol({ ...config(), protocol: "wrong" as never }),
    /protocol/,
  );
  assert.throws(
    () => normalizeProtocol({ ...config(), type: "ORACLE_STRESS_TEST" }),
    /deferred/,
  );
  assert.throws(
    () => normalizeProtocol({ ...config(), includeCalibrationTables: true }),
    /revisions/,
  );
  assert.throws(
    () => normalizeProtocol({ ...config(), science: undefined }),
    /manifest/,
  );
});
test("larger fixed samples narrow bounded intervals; incomplete and dependent plans have none", () => {
  const small = meanEstimate(Array(10).fill(0.5), [0, 1], assumptions),
    large = meanEstimate(Array(1000).fill(0.5), [0, 1], assumptions);
  assert(large.ci95![1] - large.ci95![0] < small.ci95![1] - small.ci95![0]);
  assert.equal(large.sampleSd, 0);
  assert(large.ci95![1] > 0.5);
  assert.equal(
    meanEstimate([0.5], [0, 1], { ...assumptions, fixedSampleSize: false })
      .ci95,
    null,
  );
  assert.throws(() => meanEstimate([1], [NaN, 2], assumptions));
});
test("untagged 1B.2 checkpoint remains historical and resumes without conversion", async () => {
  const dir = fs.mkdtempSync(
    path.join(os.tmpdir(), "amazonia-old-checkpoint-"),
  );
  let m: CampaignManager | undefined;
  try {
    m = new CampaignManager({ campaignsDir: dir, batchSize: 2 });
    const c = config("old");
    delete c.protocol;
    delete c.science;
    m.startCampaign(c);
    m.pauseCampaign("old");
    await drain(m);
    await m.close();
    const db = new DatabaseSync(path.join(dir, "orchestration.sqlite"));
    const state = JSON.parse(
      (db.prepare("SELECT body FROM campaigns").get() as { body: string }).body,
    );
    delete state.record.config.protocol;
    db.prepare("UPDATE campaigns SET body=?").run(JSON.stringify(state));
    for (const row of db
      .prepare("SELECT seq,request FROM batches")
      .all() as unknown as { seq: number; request: string }[]) {
      const request = JSON.parse(row.request);
      delete request.experiment;
      db.prepare("UPDATE batches SET request=? WHERE seq=?").run(
        JSON.stringify(request),
        row.seq,
      );
    }
    db.close();
    m = new CampaignManager({ campaignsDir: dir });
    assert.equal(m.getCampaign("old")!.protocol, "HISTORICAL_V33");
    assert.equal(
      (m.getCampaign("old")!.config as ProtocolConfig).protocol,
      undefined,
    );
    m.resumeCampaign("old");
    await drain(m);
    assert.equal(m.getCampaign("old")!.status, "COMPLETED");
    assert.equal(m.getCampaign("old")!.scientificResults!.length, 0);
    assert.equal(m.getCampaign("old")!.variantResults.length, 1);
  } finally {
    await m?.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("HTTP carries scientific protocol and returns scientific results instead of legacy scores", async () => {
  const { createApp } = await import("../server");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-sci-http-"));
  const m = new CampaignManager({ campaignsDir: dir, batchSize: 5 });
  const { app } = await createApp({ manager: m, web: false });
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
  try {
    const created = await fetch(base + "/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config()),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).protocol, "SCIENTIFIC_V1");
    await drain(m);
    const r = await (await fetch(base + "/campaigns/scientific")).json();
    assert.equal(r.variantResults.length, 0);
    assert.equal(r.scientificResults[0].comparisons[0].estimate.paired, true);
    const md = await (
      await fetch(base + "/campaigns/scientific/export/markdown")
    ).text();
    assert(md.includes("SCIENTIFIC_V1"));
    assert(!md.includes("Classement Synthétique"));
    const bad = await fetch(base + "/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...config("bad"),
        includeCalibrationTables: true,
      }),
    });
    assert.equal(bad.status, 400);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
    await m.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("audit samples are separately durable; summaries stay compact and missing profiles remain absent", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-audit-sample-"));
  const m = new CampaignManager({ campaignsDir: dir, batchSize: 5 });
  try {
    m.startCampaign(config());
    await drain(m);
    const r = m.getCampaign("scientific")!;
    const table = r.scientificResults![0].tableSummaries[0];
    assert(table.audit);
    assert(!("observations" in table.audit));
    const audit = m.getScientificAudit("scientific", 0, "blind");
    assert.equal(audit.gameSeed, 42001);
    assert(audit.observations.length > 0);
    assert.deepEqual(audit.team, ["BLIND", "BLIND", "BLIND", "BLIND"]);
    assert(
      audit.observations.every(
        (o: { personalRoll?: unknown; allCurrentRolls?: unknown }) =>
          o.personalRoll === undefined && o.allCurrentRolls === undefined,
      ),
    );
    assert(
      r.scientificResults![0].unavailableProfiles.includes("COORD_HYBRID"),
    );
    assert.equal(r.scientificResults![0].comparisonFamily.adjustment, "NONE");
  } finally {
    await m.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
test("unregistered test policies cannot be aggregated as versioned scientific policies", () => {
  const c = normalizeProtocol(config());
  const g = runScientificGame(
    D,
    ["BLIND"],
    42001,
    "blind",
    true,
    options,
    (o, r) => decide(o, r),
  );
  assert.equal(g.scientific.testOverride, true);
  assert.throws(
    () => summarizeScientific(c.selectedTableConfigs[0], [g], c, true),
    /Unregistered/,
  );
  assert(
    g.scientific.policyVersions.every((p) => p.endsWith("_TEST_OVERRIDE")),
  );
});
test("unmatched unit counts include missing pairs on both sides", () => {
  const row = (unit: string) => ({
    unit,
    pairingKey: "same",
    environmentFingerprint: unit,
    value: 0.5,
  });
  const e = pairedDifference(
    ["a", "b", "c"].map(row),
    ["b", "c", "d"].map(row),
    assumptions,
  );
  assert.equal(e.paired, false);
  assert.equal(e.n, 2);
  assert.equal(e.missing, 2);
  assert.equal(e.mean, null);
  assert.equal(e.ci95, null);
});

test("scientific fixed-N rejects time-limited stopping", () => {
  assert.throws(
    () => normalizeProtocol({ ...config(), targetDurationSeconds: 1 }),
    /fixed-N/,
  );
});

test("implemented selected policies are unique, including mixed teams", () => {
  const status = classifyProfiles([
    { team: ["BLIND", "PROB_ONLY", "BLIND"] },
    { team: ["BLIND"] },
  ]);
  assert.deepEqual(status.selectedProfiles, ["BLIND", "PROB_ONLY"]);
});
test("implemented policies absent from the plan are unselected, not unavailable", () => {
  const status = classifyProfiles([{ team: ["BLIND"] }]);
  assert.deepEqual(status.unselectedProfiles, [
    "PROB_ONLY",
    "SOLO_INFORMED",
    "COORD_ONE_SHOT",
    "OMNISCIENT",
  ]);
  assert(!status.unavailableProfiles.includes("OMNISCIENT"));
});
test("unavailable scientific policies remain distinct when every implemented policy is selected", () => {
  const status = classifyProfiles(
    Object.keys(POLICY_VERSIONS).map((profile) => ({ team: [profile] })),
  );
  assert.equal(status.selectedProfiles.length, 5);
  assert.deepEqual(status.unselectedProfiles, []);
  assert.deepEqual(status.unavailableProfiles, [
    "COORD_NO_DICE",
    "COORD_HYBRID",
  ]);
});

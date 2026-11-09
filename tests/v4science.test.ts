import test from "node:test";
import assert from "node:assert/strict";
import { digest, DecisionRandom } from "../src/scientific/random";
import { DEFAULT_V4_CONFIG as config } from "../src/v4/types";
import { initialBoard, resolveDraw } from "../src/v4/engine";
import {
  FAMILIES,
  PROTOCOL,
  type Plan,
  type Study,
  type Sample,
} from "../src/v4science/types";
import {
  panelObserve,
  coordinated,
  revisable,
} from "../src/v4science/observations";
import { panelProgram, panelChoose } from "../src/v4science/policies";
import {
  provenance,
  validatePlan,
  jobAt,
  documentSnapshots,
} from "../src/v4science/protocol";
import { runScience, environmentEvents } from "../src/v4science/runner";
import {
  studyReport,
  pairedContrast,
  validateSample,
} from "../src/v4science/statistics";
export const plan: Plan = {
  protocol: PROTOCOL,
  name: "Test",
  configs: [structuredClone(config)],
  families: [...FAMILIES],
  seeds: [101, 102],
  experimentSeed: 11,
  environmentSeed: 13,
  policySeed: 17,
  independentGames: true,
};
const prov = provenance();
function study(p = plan): Study {
  const docs = documentSnapshots();
  return {
    id: "test",
    plan: p,
    provenance: prov,
    manifestHash: digest({ plan: p, provenance: prov, docs }),
    status: "COMPLETED",
    reason: "test",
    completed: p.families.length * p.configs.length * p.seeds.length,
    total: p.families.length * p.configs.length * p.seeds.length,
    cursor: p.families.length * p.configs.length * p.seeds.length,
    batchSize: 2,
    createdAt: "test",
    updatedAt: "test",
    documentSnapshots: docs,
  };
}
const clone = <T>(x: T): T => structuredClone(x);
test("scientific V4 plan refuses duplicates, unsupported teams, overflow and nonfixed seeds", () => {
  assert.equal(validatePlan(plan).protocol, PROTOCOL);
  assert.throws(() =>
    validatePlan({ ...plan, families: ["OMNISCIENT", "random"] }),
  );
  assert.throws(() => validatePlan({ ...plan, seeds: [1, 1] }));
  assert.throws(() => validatePlan({ ...plan, configs: [config, config] }));
  assert.throws(() =>
    validatePlan({ ...plan, configs: [{ ...config, trackLength: 8 }] }),
  );
  assert.throws(() => validatePlan({ ...plan, maxSeconds: 2 }));
  assert.throws(() => validatePlan(plan, 1));
  assert.equal(jobAt(plan, 2).family, "PROB_ONLY");
});
test("all seven family DTOs obey private, blind, coordination and privilege contracts", () => {
  const board = initialBoard(config),
    draws = [
      resolveDraw(0, 1, 1, board.eyeOrder),
      resolveDraw(1, 6, 6, board.eyeOrder),
      resolveDraw(2, 4, 4, board.eyeOrder),
    ];
  const placements = [
    {
      owner: 1,
      step: 1 as const,
      target: 1,
      cell: 3,
      mode: "COMBAT" as const,
      sabotageChoice: "A" as const,
      reason: "PARTNER_SENTINEL_SECRET_987",
      intention: draws[1],
    },
  ];
  for (const f of FAMILIES) {
    const o = panelObserve(board, config, draws, 0, 1, placements, f);
    assert.equal(o.placements.length, coordinated(f) ? 1 : 0);
    assert(!JSON.stringify(o).includes("PARTNER_SENTINEL_SECRET_987"));
    assert(Object.isFrozen(o.board));
    if (f === "OMNISCIENT") {
      assert.equal((o as any).privilegedRolls.length, 3);
      assert.equal((o as any).privilege, "ALL_CURRENT_ROLLS");
    } else {
      assert(!("privilegedRolls" in o));
      assert(!("privilege" in o));
      assert.equal(
        "personalRoll" in o,
        ["SOLO_INFORMED", "COORD_ONE_SHOT", "COORD_HYBRID"].includes(f),
      );
      const other = draws.map((d, i) =>
        i === 0 ? d : resolveDraw(i, 2, 2, board.eyeOrder),
      );
      assert.deepEqual(
        panelObserve(board, config, other, 0, 1, placements, f),
        o,
      );
    }
    board.blind = [0];
    const blind = panelObserve(board, config, draws, 0, 1, placements, f);
    assert(!("personalRoll" in blind));
    board.blind = [];
  }
  const solo = panelObserve(
    board,
    config,
    draws,
    0,
    2,
    placements,
    "SOLO_INFORMED",
  );
  assert.equal(solo.placements.length, 0);
});
test("BLIND strategically ignores public board, private rolls and partner placements; legality leak is explicit", () => {
  const board = initialBoard(config),
    draws = [0, 1, 2].map((p) => resolveDraw(p, 1, 1, board.eyeOrder));
  const a = panelObserve(board, config, draws, 0, 1, [], "BLIND");
  const b = clone(a);
  b.board.forests[0].machines[0].position = 8;
  b.personalRoll = draws[0];
  b.placements = [
    {
      owner: 2,
      step: 2,
      target: 0,
      cell: 2,
      mode: "COMBAT",
      sabotageChoice: "A",
    },
  ];
  assert.deepEqual(
    panelChoose(a, new DecisionRandom(1)),
    panelChoose(b, new DecisionRandom(1)),
  );
  const placed = [
    {
      owner: 1,
      step: 2 as const,
      target: 0,
      cell: 2,
      mode: "STEALTH" as const,
      sabotageChoice: "A" as const,
    },
  ];
  const o = panelObserve(board, config, draws, 0, 1, placed, "PROB_ONLY");
  assert.equal(o.placements.length, 0);
  assert(!o.legalActions.some((a) => a.cell === 2 && a.mode === "STEALTH"));
});
test("negotiation is deterministic, single-shot finalization and own placements are irreversible", () => {
  const b = initialBoard(config),
    d = [0, 1, 2].map((p) => resolveDraw(p, 1, 1, b.eyeOrder));
  for (const f of FAMILIES) {
    const x = panelProgram(b, config, d, f, plan, 101);
    assert.deepEqual(x, panelProgram(b, config, d, f, plan, 101));
    assert.equal(
      x.decisions.filter((e) => e.phase === "ALLY_REVISE").length,
      revisable(f) ? 6 : 0,
    );
    for (const owner of [0, 1, 2]) {
      const ev = x.decisions.filter((e) => e.owner === owner);
      assert.equal(ev.filter((e) => e.phase === "OWN_FINAL").length, 1);
      assert.deepEqual(
        ev.find((e) => e.phase === "OWN_FINAL")!.action,
        x.placements.find((p) => p.owner === owner && p.step === 1),
      );
      assert.equal(ev.at(-1)!.phase, "ALLY_FINAL");
    }
  }
});
test("indexed worlds stay identical despite BLIND decision burns, more revisions and changed eye consequences", () => {
  const a = runScience(
      plan,
      { configIndex: 0, family: "BLIND", seed: 101, trace: true },
      prov,
    ),
    b = runScience(
      plan,
      { configIndex: 0, family: "BLIND", seed: 101, trace: true },
      prov,
      30,
    ),
    c = runScience(
      plan,
      { configIndex: 0, family: "COORD_HYBRID", seed: 101, trace: true },
      prov,
    );
  assert.deepEqual(a.events, b.events);
  assert.deepEqual(a.events, c.events);
  assert.equal(a.eventFingerprint, c.eventFingerprint);
  assert.notDeepEqual(a.trace![0].placements, b.trace![0].placements);
  assert.deepEqual(
    runScience(
      plan,
      { configIndex: 0, family: "BLIND", seed: 101, trace: true },
      prov,
    ),
    a,
  );
  assert(b.violations.includes("TEST_DECISION_OVERRIDE"));
});
test("scientific samples retain ecology, dilution, player/rank trajectory and turn measures for 3–6 players", () => {
  for (const n of [3, 4, 5, 6]) {
    const p = {
      ...clone(plan),
      configs: [
        {
          ...clone(config),
          numPlayers: n,
          initialEyeOrder: Array.from({ length: n }, (_, i) => n - 1 - i),
          numTurns: 3,
        },
      ],
      seeds: [101],
    };
    const a = runScience(
      p,
      { configIndex: 0, family: "COORD_HYBRID", seed: 101, trace: true },
      prov,
    );
    validateSample(a, p);
    assert.equal(a.measures.untouchedUnreachableCells, n * 12);
    assert.equal(a.measures.unreachableStanding, n * 24);
    assert.equal(a.measures.reachableLoss, a.measures.ecologicalLoss);
    assert.equal(a.measures.byPlayer.length, n);
    assert.equal(a.measures.turns.length, 3);
    assert.equal(a.measures.byPlayer[0].initialRank, n);
    assert.equal(a.measures.byPlayer[0].rankTrajectory.length, 4);
  }
});
test("paired contrasts use known differences and refuse forged events, duplicates and incompatible configurations", () => {
  const p = {
      ...clone(plan),
      families: ["PROB_ONLY", "BLIND"] as Plan["families"],
    },
    s = study(p),
    rows = p.families.flatMap((f) =>
      p.seeds.map((seed) =>
        runScience(p, { configIndex: 0, family: f, seed, trace: false }, prov),
      ),
    );
  // Synthetic known unit outcomes: keep ecological identities coherent.
  for (const row of rows) {
    const loss = row.family === "BLIND" ? 4 : 2;
    row.measures.finalStanding = 96 - loss;
    row.measures.ecologicalLoss = loss;
    row.measures.byPlayer.forEach((p, i) => (p.loss = i === 0 ? loss : 0));
  }
  const left = rows.filter((r) => r.family === "PROB_ONLY"),
    right = rows.filter((r) => r.family === "BLIND"),
    c = pairedContrast(left, right, s);
  assert.equal(c.mean, 2);
  assert(c.paired);
  assert(c.ci95 && c.ci95[1] > c.ci95[0]);
  assert.equal(c.sampleSd, 0);
  const fake = clone(right);
  fake[0].events[0].d1 = 6;
  assert.equal(pairedContrast(left, fake, s).status, "UNAVAILABLE");
  const forged = clone(right);
  forged[0].eventFingerprint = "fake";
  assert.equal(pairedContrast(left, forged, s).status, "UNAVAILABLE");
  assert.throws(
    () => pairedContrast([...left, left[0]], right, s),
    /dupliquées/,
  );
  assert.equal(pairedContrast(left, right.slice(1), s).status, "UNAVAILABLE");
  const report = studyReport(s, rows);
  assert.equal(report.tables[0].difficulty.loss.mean, 2);
  assert.equal(report.globalScore.status, "UNAVAILABLE");
  s.status = "PAUSED";
  assert.equal(pairedContrast(left, right, s).ci95, null);
  s.status = "COMPLETED";
  s.plan.independentGames = false;
  assert.equal(pairedContrast(left, right, s).ci95, null);
});
test("rule and eye-order comparisons allow only declared fields, not a new horizon", () => {
  const p = clone(plan);
  p.families = ["COORD_HYBRID"];
  p.seeds = [101];
  p.configs.push(
    { ...clone(config), eyeMode: "FULL_CAPTURE" },
    { ...clone(config), initialEyeOrder: [2, 1, 0] },
    { ...clone(config), numTurns: 7 },
  );
  const s = study(p),
    r = p.configs.map((_, configIndex) =>
      runScience(
        p,
        { configIndex, family: "COORD_HYBRID", seed: 101, trace: false },
        prov,
      ),
    );
  assert.equal(pairedContrast([r[1]], [r[0]], s, "RULE_VARIANT").paired, true);
  assert.equal(pairedContrast([r[2]], [r[0]], s, "EYE_ORDER").paired, true);
  assert.equal(pairedContrast([r[1]], [r[0]], s, "POLICY").paired, false);
  assert.equal(pairedContrast([r[3]], [r[0]], s, "RULE_VARIANT").paired, false);
});

import { regenerate } from "../src/v4/engine";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_V4_CONFIG as D,
  type V4Config,
  type Board,
  type Draw,
  type Placement,
} from "../src/v4/types";
import { validateV4Config } from "../src/v4/config";
import {
  initialBoard,
  resolveDraw,
  resolveTurn,
  moveEye,
  legalActions,
  runV4,
} from "../src/v4/engine";
import { observe } from "../src/v4/observations";
import { programBots, REVISION_SWEEPS } from "../src/v4/policies";
import {
  computeEvilEyeProbabilities,
  MASTER_MATRIX_6X6,
} from "../src/sim/i18n";
const cfg = (extra: Partial<V4Config> = {}) => ({
  ...structuredClone(D),
  ...extra,
});
const placements = (): Placement[] =>
  Array.from({ length: 3 }, (_, owner) => [
    {
      owner,
      step: 1 as const,
      target: owner,
      cell: 16,
      mode: "COMBAT" as const,
      sabotageChoice: "A" as const,
    },
    {
      owner,
      step: 2 as const,
      target: (owner + 1) % 3,
      cell: 16,
      mode: "COMBAT" as const,
      sabotageChoice: "A" as const,
    },
  ]).flat();
function draws(
  b: Board,
  pairs: number[][] = [
    [1, 1],
    [2, 5],
    [1, 5],
  ],
): Draw[] {
  return pairs.map(([a, c], p) => resolveDraw(p, a, c, b.eyeOrder));
}
function combat(
  p: Placement[],
  owner: number,
  step: 1 | 2,
  target = 0,
  cell = 2,
) {
  Object.assign(p.find((p) => p.owner === owner && p.step === step)!, {
    target,
    cell,
    mode: "COMBAT",
  });
}
function stealth(
  p: Placement[],
  owner: number,
  step: 1 | 2,
  target = 0,
  cell = 1,
  choice = "A",
) {
  Object.assign(p.find((p) => p.owner === owner && p.step === step)!, {
    target,
    cell,
    mode: "STEALTH",
    sabotageChoice: choice,
  });
}
test("V4 config refuses unknown rules and every possible track overflow; explicit order is required", () => {
  assert.throws(
    () => validateV4Config(cfg({ trackLength: 8 })),
    /Fin de piste/,
  );
  assert.throws(
    () => validateV4Config({ ...D, initialEyeOrder: [0, 0, 2] }),
    /Ordre/,
  );
  assert.throws(
    () => validateV4Config({ ...D, combatThresholdShift: 0 }),
    /Paramètre/,
  );
  assert.throws(
    () => validateV4Config({ ...D, rulesVersion: "V33_RULES" }),
    /Version/,
  );
  assert.deepEqual(
    validateV4Config(cfg({ trackLength: 9 })),
    cfg({ trackLength: 9 }),
  );
});
test("matrix frequencies use precisely the historical 36 cells", () => {
  assert.equal(MASTER_MATRIX_6X6.flat().length, 36);
  for (const [n, counts] of [
    [3, [20, 10, 6]],
    [4, [18, 10, 6, 2]],
    [5, [16, 9, 6, 3, 2]],
    [6, [15, 9, 6, 3, 2, 1]],
  ] as const)
    assert.deepEqual(
      computeEvilEyeProbabilities(n).map((c) => c.countOutOf36),
      counts,
    );
});
test("initial J1/J2 exception follows explicit ranks, not person indices", () => {
  const b = initialBoard(cfg({ initialEyeOrder: [2, 0, 1] }));
  assert.equal(b.forests[2].cells[1].stumps, 1);
  assert.equal(b.forests[0].cells[1].stumps, 1);
  assert.equal(b.forests[1].cells[1].stumps, 0);
});
test("HS activation recovers at most one, without movement, power, new wear or sabotage purge", () => {
  const b = initialBoard(D),
    p = placements();
  b.forests[0].machines[0].hs = 2;
  b.forests[0].machines[0].sabotage = true;
  const t = resolveTurn(
    b,
    D,
    draws(b, [
      [5, 5],
      [3, 3],
      [1, 5],
    ]),
    p,
  );
  assert.equal(t.activations[0].recovering, true);
  assert.equal(t.activations[0].to, 1);
  assert.equal(b.forests[0].machines[0].hs, 1);
  assert.equal(b.forests[0].machines[0].sabotage, true);
  assert(!t.combats.some((c) => c.target === 0));
  resolveTurn(
    b,
    D,
    draws(b, [
      [5, 5],
      [3, 3],
      [1, 5],
    ]),
    p,
  );
  assert.equal(b.forests[0].machines[0].hs, 0);
  assert.equal(b.forests[0].machines[0].position, 1);
});
test("one advance per machine, summed power, non-additive wear even on global parry", () => {
  const b = initialBoard(D),
    p = placements();
  combat(p, 0, 1);
  b.forests[0].cells[1].trap = true;
  const t = resolveTurn(
      b,
      D,
      draws(b, [
        [3, 3],
        [5, 5],
        [3, 3],
      ]),
      p,
    ),
    c = t.combats[0];
  assert.equal(c.power, 7);
  assert.equal(c.parried, true);
  assert.equal(c.cut, 0);
  assert.equal(b.forests[0].machines[0].position, 2);
  assert.equal(b.forests[0].machines[0].hs, 2);
  assert.equal(t.activations.length, 1);
});
test("parry requires D strictly greater than P; no extra combat capacity cap", () => {
  for (const d of [1, 2]) {
    const b = initialBoard(D),
      p = placements();
    combat(p, 0, 1);
    if (d === 2) combat(p, 2, 2);
    const t = resolveTurn(b, D, draws(b), p);
    assert.equal(t.combats.find((c) => c.target === 0)!.parried, d === 2);
  }
  const b = initialBoard(D),
    p = placements();
  combat(p, 0, 1);
  combat(p, 1, 2);
  combat(p, 2, 2);
  const t = resolveTurn(
    b,
    D,
    draws(b, [
      [3, 3],
      [2, 5],
      [1, 5],
    ]),
    p,
  );
  assert.equal(t.combats.find((c) => c.target === 0)!.defenders, 3);
  assert.equal(t.combats.find((c) => c.target === 0)!.parried, true);
});
test("sabotage on A with one defender globally parries A+B and consumes all engaged tokens", () => {
  const b = initialBoard(D),
    p = placements();
  combat(p, 0, 1);
  b.forests[0].machines[0].sabotage = true;
  b.forests[0].machines[1].sabotage = true;
  b.forests[0].cells[1].trap = true;
  const t = resolveTurn(
      b,
      D,
      draws(b, [
        [5, 5],
        [6, 6],
        [1, 5],
      ]),
      p,
    ),
    c = t.combats.find((c) => c.target === 0)!;
  assert.equal(c.power, 6);
  assert.equal(c.parried, true);
  assert.deepEqual(c.machines, ["A", "B"]);
  assert.deepEqual(c.sabotageConsumed, ["A", "B"]);
  assert.equal(c.trapConsumed, true);
  assert.equal(b.forests[0].machines[0].hs, 2);
  assert.equal(b.forests[0].machines[1].hs, 2);
  assert.equal(b.forests[0].cells[1].trees, 1);
  assert.equal(b.forests[0].cells[1].stumps, 1);
});
test("unparried A+B have independent ecological effects; B never destroys standing trees", () => {
  const b = initialBoard(D);
  const t = resolveTurn(
    b,
    D,
    draws(b, [
      [1, 1],
      [2, 2],
      [1, 5],
    ]),
    placements(),
  );
  const c = t.combats.find((c) => c.target === 0)!;
  assert.equal(c.cut, 1);
  assert.equal(c.cleared, 1);
  assert.equal(b.forests[0].cells[1].stumps, 1);
  assert.equal(b.forests[0].cells[1].trees, 0);
  const other = initialBoard(D);
  other.forests[0].cells[1].stumps = 0;
  other.forests[0].cells[1].trees = 2;
  resolveTurn(
    other,
    D,
    draws(other, [
      [2, 2],
      [2, 2],
      [1, 5],
    ]),
    placements(),
  );
  assert.equal(other.forests[0].cells[1].trees, 2);
});
test("discovery prioritizes HS activation and suppresses sabotage of the stationary other machine", () => {
  const b = initialBoard(D),
    p = placements();
  b.forests[0].machines[0].hs = 1;
  stealth(p, 0, 1);
  const t = resolveTurn(b, D, draws(b), p);
  assert.equal(t.stealth[0].outcome, "DISCOVERED");
  assert.deepEqual(b.blind, [0]);
  assert(b.forests[0].machines.every((m) => !m.sabotage));
});
test("stealth geometry detects departure and arrival, but not a stationary machine in p+1", () => {
  for (const cell of [1, 2]) {
    const b = initialBoard(D),
      p = placements();
    stealth(p, 0, 1, 0, cell);
    const t = resolveTurn(b, D, draws(b), p);
    assert.equal(t.stealth[0].discovered, true);
  }
  const b = initialBoard(D),
    p = placements();
  b.forests[0].machines.forEach((m) => (m.position = 2));
  stealth(p, 0, 1, 0, 1);
  const t = resolveTurn(
    b,
    D,
    draws(b, [
      [1, 4],
      [2, 5],
      [1, 5],
    ]),
    p,
  );
  assert.equal(t.stealth[0].outcome, "TRAP");
});
test("simultaneous eye shifts deduplicate discoveries, move runs once, preserve relative order", () => {
  assert.deepEqual(moveEye([0, 1, 2, 3], [1, 3], "ONE_STEP"), [1, 0, 3, 2]);
  assert.deepEqual(moveEye([0, 1, 2, 3], [1, 3], "FULL_CAPTURE"), [1, 3, 0, 2]);
  assert.deepEqual(
    moveEye([0, 1, 2, 3, 4], [2, 1, 2, 4], "ONE_STEP"),
    [1, 2, 0, 4, 3],
  );
  assert.deepEqual(
    moveEye([0, 1, 2, 3], [0, 1, 2, 3], "ONE_STEP"),
    [0, 1, 2, 3],
  );
  const b = initialBoard(D),
    p = placements(),
    config = cfg({ stealthCapacity: "MULTIPLE", eyeMode: "FULL_CAPTURE" });
  stealth(p, 0, 1);
  stealth(p, 1, 2);
  stealth(p, 2, 2);
  const t = resolveTurn(b, config, draws(b), p);
  assert.deepEqual(t.discoveredOwners, [0, 1, 2]);
  assert.deepEqual(b.blind, [0, 1, 2]);
});
test("traps persist without combat, are consumed without defenders; pose occurs after combat", () => {
  const b = initialBoard(D),
    p = placements();
  stealth(p, 0, 1, 0, 4);
  resolveTurn(b, D, draws(b), p);
  assert.equal(b.forests[0].cells[3].trap, true);
  const q = placements();
  resolveTurn(b, D, draws(b), q);
  assert.equal(b.forests[0].cells[3].trap, true);
  b.forests[0].machines[0].position = 3;
  const t = resolveTurn(b, D, draws(b), q);
  const c = t.combats.find((c) => c.target === 0)!;
  assert.equal(c.trapConsumed, true);
  assert.equal(c.parried, false);
  assert.equal(b.forests[0].cells[3].trap, false);
});
test("sabotage one vs both, no global reserve; non-engaged machine retains its token", () => {
  for (const mode of ["ONE_MACHINE", "BOTH_MACHINES"] as const) {
    const b = initialBoard(D),
      p = placements();
    stealth(p, 0, 1);
    resolveTurn(
      b,
      cfg({ sabotageMode: mode }),
      draws(b, [
        [1, 4],
        [2, 5],
        [1, 5],
      ]),
      p,
    );
    assert.equal(b.forests[0].machines[0].sabotage, true);
    assert.equal(b.forests[0].machines[1].sabotage, mode === "BOTH_MACHINES");
    b.forests[0].machines[1].sabotage = true;
    resolveTurn(b, D, draws(b), placements());
    assert.equal(b.forests[0].machines[0].sabotage, false);
    assert.equal(b.forests[0].machines[1].sabotage, true);
  }
});
test("stealth capacity variants affect legality only, with no limit on combat", () => {
  const b = initialBoard(D),
    p = placements();
  stealth(p, 0, 1);
  stealth(p, 1, 2);
  assert.throws(() => resolveTurn(b, D, draws(b), p), /illégal/);
  assert.doesNotThrow(() =>
    resolveTurn(
      initialBoard(D),
      cfg({ stealthCapacity: "MULTIPLE" }),
      draws(initialBoard(D)),
      p,
    ),
  );
  assert.equal(
    legalActions(b, D, 1, 2, [p[0]]).some(
      (a) => a.target === 0 && a.cell === 1 && a.mode === "STEALTH",
    ),
    false,
  );
});
test("ordinary observations never leak other private rolls, blind own rolls, or arbitrary engine properties", () => {
  const b = initialBoard(D),
    d = draws(b),
    p = placements();
  (b.forests[0] as any).secret = "secret";
  (d[0] as any).secret = "secret";
  const a = observe(b, D, d, 0, 1, []);
  assert.equal(a.personalRoll!.d1, 1);
  assert(!JSON.stringify(a).includes("secret"));
  assert(!("draws" in a));
  assert(!("allCurrentRolls" in a));
  assert(Object.isFrozen(a.board.forests[0].machines[0]));
  const changed = draws(b, [
    [1, 1],
    [6, 6],
    [6, 6],
  ]);
  assert.deepEqual(observe(b, D, changed, 0, 1, []), a);
  b.blind = [0];
  assert.equal(observe(b, D, d, 0, 1, p).personalRoll, undefined);
  assert.deepEqual(
    observe(
      b,
      D,
      draws(b, [
        [6, 6],
        [6, 6],
        [6, 6],
      ]),
      0,
      1,
      p,
    ),
    observe(b, D, d, 0, 1, p),
  );
});
test("bot negotiations terminate deterministically, freeze first defenders, finalize allies irreversibly", () => {
  const b = initialBoard(D),
    d = draws(b),
    a = programBots(b, D, d);
  assert.deepEqual(a, programBots(b, D, d));
  assert.equal(a.decisions.length, 3 * (3 + REVISION_SWEEPS));
  for (const owner of [0, 1, 2]) {
    const events = a.decisions.filter((e) => e.owner === owner);
    assert.equal(events.filter((e) => e.phase === "OWN_FINAL").length, 1);
    assert.equal(events.at(-1)!.phase, "ALLY_FINAL");
    assert.deepEqual(
      events.find((e) => e.phase === "OWN_FINAL")!.action,
      a.placements.find((p) => p.owner === owner && p.step === 1),
    );
  }
  assert.doesNotThrow(() => resolveTurn(b, D, d, a.placements));
});
test("replay is exact, score is standing trees after max one regeneration per cell, no V33 victory labels", () => {
  const a = runV4(D, 42001);
  assert.deepEqual(a, runV4(D, 42001));
  assert.equal(a.finalStanding, a.standingBeforeRegeneration + a.regenerated);
  assert.equal(a.ecologicalLoss, 96 - a.finalStanding);
  assert(!("victoryBracket" in a));
  assert.equal(a.traces!.length, 8);
  assert(
    a.finalBoard.forests.every((f) =>
      f.cells.every((c) => c.trees >= 0 && c.stumps >= 0),
    ),
  );
  assert.equal(a.initialStanding, 94);
  assert.deepEqual(runV4(D, 42001, false).finalBoard, a.finalBoard);
});

test("final regeneration converts at most one stump in each cell including multiple-stump cases", () => {
  const b = initialBoard(D);
  b.forests[0].cells[1] = { trees: 0, stumps: 3, trap: false };
  assert.equal(regenerate(b), 2);
  assert.deepEqual(b.forests[0].cells[1], { trees: 1, stumps: 2, trap: false });
});
test("blind penalty lasts one turn and target resolution uses the new persistent eye order", () => {
  const b = initialBoard(D),
    p = placements();
  stealth(p, 1, 2);
  resolveTurn(b, D, draws(b), p);
  assert.deepEqual(b.eyeOrder, [1, 0, 2]);
  assert.deepEqual(b.blind, [1]);
  assert.equal(resolveDraw(0, 1, 1, b.eyeOrder).target, 1);
  resolveTurn(b, D, draws(b), placements());
  assert.deepEqual(b.blind, []);
  assert.deepEqual(b.eyeOrder, [1, 0, 2]);
});

test("sabotage on A ALONE is enough to parry a joint A+B combat", () => {
  const b = initialBoard(D),
    p = placements();
  combat(p, 0, 1);
  b.forests[0].machines[0].sabotage = true;
  const t = resolveTurn(
      b,
      D,
      draws(b, [
        [5, 5],
        [6, 6],
        [1, 5],
      ]),
      p,
    ),
    c = t.combats.find((c) => c.target === 0)!;
  assert.equal(c.trapConsumed, false);
  assert.deepEqual(c.sabotageConsumed, ["A"]);
  assert.equal(c.parried, true);
  assert.equal(c.cut, 0);
  assert.equal(c.cleared, 0);
});

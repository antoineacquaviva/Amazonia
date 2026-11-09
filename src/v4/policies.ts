import { resolveDraw } from "./engine";
import { observe, type Observation } from "./observations";
import type {
  V4Config,
  Board,
  Draw,
  Placement,
  DecisionEvent,
  Action,
} from "./types";
export const REVISION_SWEEPS = 2;
type Hypothesis = { draw: Draw; probability: number };
export function rollBeliefs(
  o: Observation & { privilegedRolls?: Draw[] },
): Hypothesis[][] {
  return o.board.forests.map((f) =>
    o.privilegedRolls?.find((d) => d.roller === f.player)
      ? [
          {
            draw: o.privilegedRolls.find((d) => d.roller === f.player)!,
            probability: 1,
          },
        ]
      : o.personalRoll?.roller === f.player
        ? [{ draw: o.personalRoll, probability: 1 }]
        : Array.from({ length: 36 }, (_, i) => ({
            draw: resolveDraw(
              f.player,
              Math.floor(i / 6) + 1,
              (i % 6) + 1,
              o.board.eyeOrder,
            ),
            probability: 1 / 36,
          })),
  );
}
/** Exact small distribution of (power, engaged A/B) at a cell, based only on the observation. */
function attackDistribution(
  o: Observation,
  beliefs: Hypothesis[][],
  target: number,
  cell: number,
) {
  const f = o.board.forests[target];
  let states = new Map<string, number>([["0:0", 1]]);
  for (const rolls of beliefs) {
    const contributions = new Map<string, number>();
    for (const { draw: d, probability: q } of rolls) {
      const m = f.machines.find((m) => m.kind === d.tactic[0])!;
      const attacking =
        d.target === target && m.hs === 0 && m.position + 1 === cell;
      const k = attacking
        ? `${Number(d.tactic[1])}:${m.kind === "A" ? 1 : 2}`
        : "0:0";
      contributions.set(k, (contributions.get(k) ?? 0) + q);
    }
    const next = new Map<string, number>();
    for (const [key, p] of states)
      for (const [contribution, q] of contributions) {
        const [power, mask] = key.split(":").map(Number),
          [v, m] = contribution.split(":").map(Number),
          k = `${power + v}:${mask | m}`;
        next.set(k, (next.get(k) ?? 0) + p * q);
      }
    states = next;
  }
  return [...states].map(([k, q]) => {
    const [power, mask] = k.split(":").map(Number);
    return { power, mask, q };
  });
}
export function chooseAction(o: Observation): Action {
  const beliefs = rollBeliefs(o),
    cache = new Map<string, number>();
  const score = (a: Action) => {
    const key = `${a.target}:${a.cell}:${a.mode}:${a.sabotageChoice}`;
    if (cache.has(key)) return cache.get(key)!;
    const f = o.board.forests[a.target],
      c = f.cells[a.cell - 1];
    let value = 0;
    if (a.mode === "COMBAT") {
      const existing = o.placements.filter(
        (p) =>
          p.target === a.target && p.cell === a.cell && p.mode === "COMBAT",
      ).length;
      for (const { power, mask, q } of attackDistribution(
        o,
        beliefs,
        a.target,
        a.cell,
      ))
        if (power > 0) {
          const token =
            c.trap ||
            f.machines.some(
              (m) => m.sabotage && mask & (m.kind === "A" ? 1 : 2),
            );
          const before = existing > power || (existing > 0 && token),
            after = existing + 1 > power || token;
          // Greedy utility, not a game rule: immediate damage plus a small signal for a nearly completed defense.
          const damage =
            (mask & 1 && c.trees > 0 ? 0.65 : 0) +
            (mask & 2 && c.stumps > 0 ? 1 : 0);
          if (!before)
            value += q * damage * (after ? 1 : 0.12 / (power + 1 - existing));
        }
    } else {
      const present = f.machines.filter((m) => m.position === a.cell);
      const dangerous = (d: Draw) => {
        if (d.target !== a.target) return false;
        const m = f.machines.find((m) => m.kind === d.tactic[0])!;
        return (
          m.position === a.cell || (m.hs === 0 && m.position + 1 === a.cell)
        );
      };
      const safe = beliefs.reduce(
        (prob, rolls) =>
          prob *
          rolls
            .filter((r) => !dangerous(r.draw))
            .reduce((n, r) => n + r.probability, 0),
        1,
      );
      const already = o.placements.filter(
        (p) =>
          p.mode === "STEALTH" && p.target === a.target && p.cell === a.cell,
      );
      if (present.length) {
        const chosen = present.filter(
          (m) =>
            o.config.sabotageMode === "BOTH_MACHINES" ||
            m.kind === a.sabotageChoice,
        );
        value =
          safe *
          chosen.filter(
            (m) =>
              !m.sabotage &&
              !already.some(
                (p) =>
                  o.config.sabotageMode === "BOTH_MACHINES" ||
                  p.sabotageChoice === m.kind,
              ),
          ).length *
          0.8;
      } else if (!c.trap && !already.length) {
        const distance = Math.min(
          ...f.machines.map((m) => a.cell - m.position).filter((d) => d > 0),
        );
        value = Number.isFinite(distance) ? (safe * 0.65) / (1 + distance) : 0;
      }
      value -= (1 - safe) * 0.45;
    }
    cache.set(key, value);
    return value;
  };
  let best = o.legalActions[0],
    bestValue = -Infinity;
  for (const a of o.legalActions) {
    const v = score(a);
    if (v > bestValue + 1e-12) {
      best = a;
      bestValue = v;
    }
  }
  if (!best) throw new Error("Aucune action légale");
  return { ...best };
}
export function programBots(board: Board, config: V4Config, draws: Draw[]) {
  const placements: Placement[] = [],
    decisions: DecisionEvent[] = [];
  const decide = (
    owner: number,
    step: 1 | 2,
    phase: DecisionEvent["phase"],
    round: number,
  ) => {
    const old = placements.findIndex(
      (p) => p.owner === owner && p.step === step,
    );
    if (old >= 0) placements.splice(old, 1);
    const action = {
      ...chooseAction(observe(board, config, draws, owner, step, placements)),
      owner,
      step,
    };
    placements.push(action);
    decisions.push({ owner, phase, action: { ...action }, round });
  };
  // The eye order for this turn remains fixed throughout programming.
  for (const p of board.eyeOrder) decide(p, 1, "OWN_FINAL", 0);
  for (const p of board.eyeOrder) decide(p, 2, "ALLY_TENTATIVE", 0);
  for (let r = 1; r <= REVISION_SWEEPS; r++)
    for (const p of board.eyeOrder) decide(p, 2, "ALLY_REVISE", r);
  // Validate in order, never revisit a finalized token. No additional placements or parry caps.
  for (const owner of board.eyeOrder) {
    const action = placements.find((p) => p.owner === owner && p.step === 2)!;
    decisions.push({
      owner,
      phase: "ALLY_FINAL",
      action: { ...action },
      round: REVISION_SWEEPS,
    });
  }
  return { placements, decisions };
}

import type { V4Config, Board, TurnTrace } from "../v4/types";
import type { Measures, TurnMeasures } from "./types";
export function measures(
  config: V4Config,
  traces: TurnTrace[],
  final: Board,
  regenerated: number,
): Measures {
  const attacked = new Set<string>(),
    reached = new Set<string>();
  for (const f of final.forests)
    for (
      let cell = 1;
      cell <= Math.max(...f.machines.map((m) => m.position));
      cell++
    )
      reached.add(`${f.player}:${cell}`);
  for (const t of traces)
    for (const c of t.combats) attacked.add(`${c.target}:${c.cell}`);
  let previousLoss = 0;
  const turns: TurnMeasures[] = traces.map((t) => {
    const combats = t.combats,
      defenders = t.placements.filter((p) => p.mode === "COMBAT");
    let unengaged = 0;
    const groups = new Map<string, number>();
    for (const p of defenders) {
      const k = `${p.target}:${p.cell}`;
      groups.set(k, (groups.get(k) ?? 0) + 1);
      if (!combats.some((c) => c.target === p.target && c.cell === p.cell))
        unengaged++;
    }
    const last = new Map<number, string>();
    let revisionChanges = 0;
    for (const e of t.decisions)
      if (e.action.step === 2) {
        const a = JSON.stringify(e.action);
        if (
          e.phase === "ALLY_REVISE" &&
          last.has(e.owner) &&
          last.get(e.owner) !== a
        )
          revisionChanges++;
        last.set(e.owner, a);
      }
    const ecologicalLoss =
      config.numPlayers * config.trackLength * config.initialTreesPerCell -
      t.end.forests.reduce(
        (n, f) =>
          n + f.cells.reduce((a, c) => a + c.trees + Math.min(1, c.stumps), 0),
        0,
      );
    const ecologicalDamage = ecologicalLoss - previousLoss;
    previousLoss = ecologicalLoss;
    const pivotalCombatDefenders = combats.reduce((n, c) => {
      const d = c.defenders - 1,
        stillParried =
          d > c.power ||
          (d >= 1 && (c.trapConsumed || c.sabotageConsumed.length > 0));
      return n + (c.parried && !stillParried ? c.defenders : 0);
    }, 0);
    return {
      turn: t.turn,
      ecologicalLoss,
      ecologicalDamage,
      pivotalCombatDefenders,
      hsMachinesEnd: t.end.forests.reduce(
        (n, f) => n + f.machines.filter((m) => m.hs > 0).length,
        0,
      ),
      cuts: combats.reduce((n, c) => n + c.cut, 0),
      cleared: combats.reduce((n, c) => n + c.cleared, 0),
      parries: combats.filter((c) => c.parried).length,
      combats: combats.length,
      activated: t.activations.length,
      recoveries: t.activations.filter((a) => a.recovering).length,
      trapConsumed: combats.filter((c) => c.trapConsumed).length,
      sabotageConsumed: combats.reduce(
        (n, c) => n + c.sabotageConsumed.length,
        0,
      ),
      tokenEnabledParries: combats.filter(
        (c) => c.parried && c.defenders <= c.power,
      ).length,
      combatDefenders: defenders.length,
      unengagedDefenders: unengaged,
      concentration: Math.max(0, ...groups.values()),
      stealthNoEffect: t.stealth.filter((s) => s.outcome === "NO_EFFECT")
        .length,
      discoveries: t.discoveredOwners.length,
      blindPlayers: t.blind.length,
      revisions: t.decisions.filter((d) => d.phase === "ALLY_REVISE").length,
      revisionChanges,
      trapsPlaced: t.stealth.filter((s) => s.outcome === "TRAP").length,
      sabotagesPlaced: t.stealth.reduce((n, s) => n + s.sabotaged.length, 0),
    };
  });
  let finalStanding = 0,
    reachedFinalStanding = 0,
    reachableFinalStanding = 0,
    unreachableStanding = 0;
  for (const f of final.forests)
    for (let i = 0; i < f.cells.length; i++) {
      const trees = f.cells[i].trees;
      finalStanding += trees;
      if (reached.has(`${f.player}:${i + 1}`)) reachedFinalStanding += trees;
      if (i + 1 <= config.numTurns + 1) reachableFinalStanding += trees;
      else unreachableStanding += trees;
    }
  const reachableCells = config.numPlayers * (config.numTurns + 1),
    initialStock =
      config.numPlayers * config.trackLength * config.initialTreesPerCell;
  return {
    finalStanding,
    ecologicalLoss: initialStock - finalStanding,
    regenerated,
    initialStock,
    reachedCells: reached.size,
    attackedCells: attacked.size,
    reachableCells,
    untouchedUnreachableCells:
      config.numPlayers * config.trackLength - reachableCells,
    reachedFinalStanding,
    reachedLoss:
      reached.size * config.initialTreesPerCell - reachedFinalStanding,
    reachableFinalStanding,
    reachableLoss:
      reachableCells * config.initialTreesPerCell - reachableFinalStanding,
    unreachableStanding,
    turns,
    byPlayer: final.forests.map((f) => ({
      player: f.player,
      initialRank: config.initialEyeOrder.indexOf(f.player) + 1,
      finalRank: final.eyeOrder.indexOf(f.player) + 1,
      rankTrajectory: [
        config.initialEyeOrder.indexOf(f.player) + 1,
        ...traces.map((t) => t.eyeAfter.indexOf(f.player) + 1),
      ],
      loss:
        config.trackLength * config.initialTreesPerCell -
        f.cells.reduce((n, c) => n + c.trees, 0),
      discoveries: traces.filter((t) => t.discoveredOwners.includes(f.player))
        .length,
      blindTurns: traces.filter((t) => t.blind.includes(f.player)).length,
    })),
  };
}

import type { Observation } from "./observations";
import { DecisionRandom } from "./random";
import { resolveTargetPlayerRank1Based } from "../sim/i18n";
/** Versioned baseline policies. No revisions, stealth optimization or private metadata signaling. */
export function decide(observation: Observation, random: DecisionRandom) {
  const o = observation,
    target = o.step === 1 ? o.player : (o.player + 1) % o.config.numPlayers,
    group = o.publicBoard[target];
  const legal = o.legalActions.filter((a) => a.targetPlayerIndex === target);
  if (!legal.length) throw new Error("No legal baseline action");
  const position = group.harvester.position ?? group.bulldozer.position ?? 1;
  if (o.policy === "BLIND") {
    const desired = position + random.nextInt(1, 2);
    return legal.find((a) => a.cellIndex === desired) ?? legal[0];
  }
  const scores = new Map<number, number>();
  for (const [kind, machine] of [
    ["A", group.harvester],
    ["B", group.bulldozer],
  ] as const) {
    if (machine.position === null || machine.status === "DESTROYED") continue;
    const cellIndex = machine.position + 1,
      cell = group.cells[cellIndex - 1];
    if (!cell) continue;
    let probability = 0;
    for (let d1 = 1; d1 <= 6; d1++)
      for (let d2 = 1; d2 <= 6; d2++)
        if (
          resolveTargetPlayerRank1Based(d1, d2, o.config.numPlayers) - 1 ===
            target &&
          o.tacticsTrack[Math.min(d1, d2) - 1].startsWith(kind)
        )
          probability += 1 / 36;
    let expected = probability * o.config.numPlayers;
    if (o.personalRoll) {
      expected =
        probability * (o.config.numPlayers - 1) +
        Number(
          o.personalRoll.targetPlayerIndex === target &&
            o.personalRoll.tactic.startsWith(kind),
        );
    }
    if (o.policy === "OMNISCIENT")
      expected = o.allCurrentRolls.filter(
        (d) => d.targetPlayerIndex === target && d.tactic.startsWith(kind),
      ).length;
    const vulnerability =
      kind === "B" ? 1 + cell.stumps : 1 + cell.standingTrees * 0.2;
    let score = expected * vulnerability * (machine.status === "HS" ? 0.15 : 1);
    if (o.policy === "COORD_ONE_SHOT" && o.step === 2) {
      const tokens = cell.tacticalDefenders ?? 0;
      const bonus = Number(cell.hasTrap) + Number(machine.hasSabotage);
      if (tokens > 0 && tokens + bonus < 3 + o.config.combatThresholdShift)
        score += 0.5;
    }
    scores.set(cellIndex, (scores.get(cellIndex) ?? 0) + score);
  }
  return [...legal].sort(
    (a, b) =>
      (scores.get(b.cellIndex) ?? 0) - (scores.get(a.cellIndex) ?? 0) ||
      a.cellIndex - b.cellIndex,
  )[0];
}

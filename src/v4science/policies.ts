import type { PressureRules } from "../v4/pressure";
import { chooseAction } from "../v4/policies";
import { DecisionRandom } from "../scientific/random";
import type {
  V4Config,
  Board,
  Draw,
  Placement,
  DecisionEvent,
} from "../v4/types";
import {
  panelObserve,
  revisable,
  type PanelObservation,
  type PrivilegedObservation,
} from "./observations";
import { NEGOTIATION, POLICY_VERSIONS, type Family, type Plan } from "./types";
export function panelChoose(
  o: PanelObservation | PrivilegedObservation,
  random: DecisionRandom,
  pressure?: PressureRules,
) {
  if (o.family === "BLIND") {
    // Legal actions only: no dice, board heuristics, probabilities or partner signals.
    // Deduplicate the sabotage choice so combat/stealth each have half the naive mass.
    const actions = o.legalActions.filter(
      (a) => a.mode === "COMBAT" || a.sabotageChoice === "A",
    );
    const a = { ...actions[random.nextInt(0, actions.length - 1)] };
    if (a.mode === "STEALTH")
      a.sabotageChoice = random.nextInt(0, 1) ? "A" : "B";
    return a;
  }
  return chooseAction(o as unknown as Parameters<typeof chooseAction>[0], pressure);
}
export function panelProgram(
  board: Board,
  config: V4Config,
  draws: Draw[],
  family: Family,
  plan: Pick<Plan, "experimentSeed" | "policySeed">,
  seed: number,
  decisionBurn = 0,
  combatOpening = false,
  pressure?: PressureRules,
) {
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
    const o = panelObserve(
      board,
      config,
      draws,
      owner,
      step,
      placements,
      family,
    );
    const random = new DecisionRandom([
      NEGOTIATION,
      plan.experimentSeed,
      plan.policySeed,
      seed,
      board.turn,
      owner,
      step,
      round,
      POLICY_VERSIONS[family],
    ]);
    for (let i = 0; i < decisionBurn; i++) random.nextInt(0, 1000);
    const observation = combatOpening && board.turn === 1 && step === 1
      ? { ...o, legalActions: o.legalActions.filter(action => action.mode === "COMBAT") }
      : o;
    const action = { ...panelChoose(observation, random, pressure), owner, step };
    placements.push(action);
    decisions.push({ owner, phase, round, action: { ...action } });
  };
  for (const owner of board.eyeOrder) decide(owner, 1, "OWN_FINAL", 0);
  for (const owner of board.eyeOrder) {
    decide(owner, 2, revisable(family) ? "ALLY_TENTATIVE" : "ALLY_FINAL", 0);
  }
  if (revisable(family)) {
    for (let round = 1; round <= 2; round++)
      for (const owner of board.eyeOrder)
        decide(owner, 2, "ALLY_REVISE", round);
    for (const owner of board.eyeOrder)
      decisions.push({
        owner,
        phase: "ALLY_FINAL",
        round: 2,
        action: {
          ...placements.find((p) => p.owner === owner && p.step === 2)!,
        },
      });
  }
  return { placements, decisions };
}

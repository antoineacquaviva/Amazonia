import { indexedInt, digest } from "../scientific/random";
import {
  initialBoard,
  resolveDraw,
  resolveTurn,
  regenerate,
} from "../v4/engine";
import { validateV4Config, validateSeed } from "../v4/config";
import { panelProgram } from "./policies";
import { measures } from "./measures";
import {
  PROTOCOL,
  RANDOM,
  POLICY_VERSIONS,
  type Plan,
  type Job,
  type Provenance,
  type Sample,
  type EnvEvent,
} from "./types";
export function environmentEvents(
  plan: Pick<Plan, "experimentSeed" | "environmentSeed">,
  config: Plan["configs"][number],
  seed: number,
) {
  const key = [
      PROTOCOL,
      RANDOM,
      plan.experimentSeed,
      plan.environmentSeed,
      seed,
      config.numPlayers,
      config.numTurns,
    ],
    events: EnvEvent[] = [];
  for (let turn = 1; turn <= config.numTurns; turn++)
    for (let player = 0; player < config.numPlayers; player++) {
      const id = digest([key, turn, player]);
      events.push({
        id,
        turn,
        player,
        d1: indexedInt([key, turn, player, "D1"], 1, 6),
        d2: indexedInt([key, turn, player, "D2"], 1, 6),
      });
    }
  return { environmentKey: digest(key), events };
}
export function runScience(
  plan: Plan,
  job: Job,
  provenance: Provenance,
  decisionBurn = 0,
): Sample {
  const config = validateV4Config(plan.configs[job.configIndex]);
  validateSeed(job.seed);
  const { events, environmentKey } = environmentEvents(plan, config, job.seed),
    board = initialBoard(config),
    traces = [];
  for (let turn = 1; turn <= config.numTurns; turn++) {
    const draws = events
      .filter((e) => e.turn === turn)
      .map((e) => resolveDraw(e.player, e.d1, e.d2, board.eyeOrder));
    const programmed = panelProgram(
      board,
      config,
      draws,
      job.family,
      plan,
      job.seed,
      decisionBurn,
    );
    traces.push(
      resolveTurn(
        board,
        config,
        draws,
        programmed.placements,
        programmed.decisions,
      ),
    );
  }
  const regenerated = regenerate(board),
    m = measures(config, traces, board, regenerated),
    violations: string[] = [];
  if (
    board.forests.some(
      (f) =>
        f.cells.some(
          (c) =>
            c.trees < 0 ||
            c.stumps < 0 ||
            !Number.isInteger(c.trees) ||
            !Number.isInteger(c.stumps),
        ) ||
        f.machines.some(
          (machine) =>
            machine.hs < 0 ||
            machine.hs > 2 ||
            machine.position > config.trackLength,
        ),
    )
  )
    violations.push("V4_INVALID_BOARD");
  if (
    m.ecologicalLoss < 0 ||
    m.ecologicalLoss > m.initialStock ||
    m.finalStanding !==
      m.byPlayer.reduce(
        (n, p) => n + config.trackLength * config.initialTreesPerCell - p.loss,
        0,
      )
  )
    violations.push("V4_ECOLOGICAL_ACCOUNTING");
  const pairingKey = digest([
    PROTOCOL,
    provenance.sourceHash,
    provenance.runtime,
    environmentKey,
    config.numPlayers,
    config.numTurns,
    config.trackLength,
    config.initialTreesPerCell,
  ]);
  return {
    protocol: PROTOCOL,
    config,
    configId: digest(config),
    family: job.family,
    team: Array(config.numPlayers).fill(job.family),
    policyVersions: Array(config.numPlayers).fill(POLICY_VERSIONS[job.family]),
    privileged: job.family === "OMNISCIENT",
    seed: job.seed,
    unit: `game:${job.seed}`,
    environmentKey,
    eventFingerprint: digest(events),
    events,
    pairingKey,
    provenance,
    measures: m,
    finalBoard: board,
    ...(job.trace ? { trace: traces } : {}),
    violations: decisionBurn
      ? ["TEST_DECISION_OVERRIDE", ...violations]
      : violations,
  };
}

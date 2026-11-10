import { blockedMask, redirect, pursuitTargets, type PressureRules } from "./pressure";
import { resolveTargetPlayerRank1Based } from "../sim/i18n";
import { SeededRNG } from "../sim/rng";
import { validateSeed, validateV4Config } from "./config";
import { programBots } from "./policies";
import {
  BOT_VERSION,
  OBS_VERSION,
  RULES_VERSION,
  TACTICS,
  type V4Config,
  type Board,
  type Draw,
  type Placement,
  type TurnTrace,
  type DecisionEvent,
  type GameResult,
} from "./types";
export function initialBoard(config: V4Config): Board {
  return {
    turn: 1,
    eyeOrder: [...config.initialEyeOrder],
    blind: [],
    forests: Array.from({ length: config.numPlayers }, (_, player) => ({
      player,
      cells: Array.from({ length: config.trackLength }, (_, i) => {
        const stumps =
          i === 1 && config.initialEyeOrder.slice(0, 2).includes(player)
            ? 1
            : 0;
        return {
          trees: config.initialTreesPerCell - stumps,
          stumps,
          trap: false,
        };
      }),
      machines: (["A", "B"] as const).map((kind) => ({
        kind,
        position: 1,
        hs: 0,
        sabotage: false,
      })),
    })),
  };
}
export function resolveDraw(
  roller: number,
  d1: number,
  d2: number,
  eye: number[],
): Draw {
  if (![d1, d2].every((d) => Number.isInteger(d) && d >= 1 && d <= 6))
    throw new Error("Dés invalides");
  return {
    roller,
    d1,
    d2,
    target: eye[resolveTargetPlayerRank1Based(d1, d2, eye.length) - 1],
    tactic: TACTICS[Math.min(d1, d2) - 1],
  };
}
export function moveEye(
  order: number[],
  discovered: readonly number[],
  mode: V4Config["eyeMode"],
): number[] {
  const d = new Set(discovered);
  if (mode === "FULL_CAPTURE")
    return [
      ...order.filter((p) => d.has(p)),
      ...order.filter((p) => !d.has(p)),
    ];
  const next = [...order];
  // Process each discovered run from the ORIGINAL order. Exchange it with its preceding non-discovered player.
  for (let i = 0; i < order.length; ) {
    if (!d.has(order[i])) {
      i++;
      continue;
    }
    let end = i;
    while (end + 1 < order.length && d.has(order[end + 1])) end++;
    if (i > 0)
      next.splice(i - 1, end - i + 2, ...order.slice(i, end + 1), order[i - 1]);
    i = end + 1;
  }
  return next;
}
export function legalActions(
  board: Board,
  config: V4Config,
  owner: number,
  step: 1 | 2,
  placements: Placement[],
) {
  return board.forests
    .filter((f) => (step === 1 ? f.player === owner : f.player !== owner))
    .flatMap((f) =>
      f.cells.flatMap((_, i) => {
        const cell = i + 1,
          base = { target: f.player, cell, sabotageChoice: "A" as const };
        const combat = { ...base, mode: "COMBAT" as const };
        if (
          config.stealthCapacity === "SINGLE" &&
          placements.some(
            (p) =>
              p.target === f.player && p.cell === cell && p.mode === "STEALTH",
          )
        )
          return [combat];
        return [
          combat,
          { ...base, mode: "STEALTH" as const },
          { ...base, mode: "STEALTH" as const, sabotageChoice: "B" as const },
        ];
      }),
    );
}
export function validatePlacements(
  board: Board,
  config: V4Config,
  placements: Placement[],
) {
  if (placements.length !== 2 * config.numPlayers)
    throw new Error("Deux défenseurs par joueur requis");
  const placed: Placement[] = [];
  for (const p of placements) {
    if (
      !Number.isInteger(p.owner) ||
      p.owner < 0 ||
      p.owner >= config.numPlayers ||
      ![1, 2].includes(p.step) ||
      placed.some((q) => q.owner === p.owner && q.step === p.step)
    )
      throw new Error("Propriétaire ou étape invalide");
    if (
      !legalActions(board, config, p.owner, p.step, placed).some(
        (a) =>
          a.target === p.target &&
          a.cell === p.cell &&
          a.mode === p.mode &&
          a.sabotageChoice === p.sabotageChoice,
      )
    )
      throw new Error("Placement illégal");
    placed.push(p);
  }
}
/** Trusted resolution owns draws. No policy is called after revelation. Mutates the board. */
export function resolveTurn(
  board: Board,
  config: V4Config,
  draws: Draw[],
  placements: Placement[],
  decisions: DecisionEvent[] = [],
  pressure?: PressureRules,
): TurnTrace {
  validatePlacements(board, config, placements);
  if (
    draws.length !== config.numPlayers ||
    new Set(draws.map((d) => d.roller)).size !== config.numPlayers ||
    draws.some(
      (d) =>
        d.roller < 0 ||
        d.roller >= config.numPlayers ||
        JSON.stringify(resolveDraw(d.roller, d.d1, d.d2, board.eyeOrder)) !==
          JSON.stringify(d),
    )
  )
    throw new Error("Lancers incohérents");
  if (pressure?.pursuit && board.turn >= 3) {
    const targets = pursuitTargets(board);
    draws = draws.map(d => redirect(d, targets));
  }
  const trace: TurnTrace = {
    turn: board.turn,
    eyeBefore: [...board.eyeOrder],
    eyeAfter: [],
    blind: [...board.blind],
    draws: structuredClone(draws),
    placements: structuredClone(placements),
    decisions: structuredClone(decisions),
    activations: [],
    combats: [],
    stealth: [],
    discoveredOwners: [],
    end: null!,
  };
  const dangerous = new Set<string>();
  for (const f of board.forests)
    for (const m of f.machines) {
      const cards = draws
        .filter((d) => d.target === f.player && d.tactic[0] === m.kind)
        .map((d) => d.tactic);
      if (!cards.length) continue;
      const from = m.position,
        hsBefore = m.hs,
        recovering = m.hs > 0;
      dangerous.add(`${f.player}:${from}`);
      if (recovering) m.hs--;
      else {
        if (m.position >= config.trackLength)
          throw new Error("Dépassement non pris en charge");
        m.position++;
        dangerous.add(`${f.player}:${m.position}`);
      }
      trace.activations.push({
        target: f.player,
        kind: m.kind,
        from,
        to: m.position,
        recovering,
        hsBefore,
        hsAfter: m.hs,
        cards,
      });
    }
  const discovered = new Set<number>();
  for (const p of placements.filter((p) => p.mode === "STEALTH"))
    if (dangerous.has(`${p.target}:${p.cell}`)) discovered.add(p.owner);
  // All activated operational machines at a destination form one global combat.
  for (const f of board.forests) {
    const attacking = trace.activations.filter(
      (a) => a.target === f.player && !a.recovering,
    );
    for (const dest of new Set(attacking.map((a) => a.to))) {
      const activations = attacking.filter((a) => a.to === dest),
        cards = activations.flatMap((a) => a.cards);
      const machines = f.machines.filter((m) =>
        activations.some((a) => a.kind === m.kind),
      );
      const cell = f.cells[dest - 1],
        power = cards.reduce((n, c) => n + Number(c[1]), 0);
      const defenders = placements.filter(
        (p) => p.target === f.player && p.cell === dest && p.mode === "COMBAT",
      ).length;
      const sabotageConsumed = machines
          .filter((m) => m.sabotage)
          .map((m) => m.kind),
        trapConsumed = cell.trap;
      const mask = machines.reduce((bits, m) => bits | (m.kind === "A" ? 1 : 2), 0);
      const sabotage = sabotageConsumed.reduce((bits, kind) => bits | (kind === "A" ? 1 : 2), 0);
      const blocked = blockedMask(mask, power, defenders, cell.trap, sabotage,
        !!pressure?.partialSabotage && board.turn >= 3);
      const parried = blocked === mask;
      const oldStumps = cell.stumps;
      let cut = 0,
        cleared = 0;
      if (!parried) {
        if ((mask & 1) && !(blocked & 1) && cell.trees > 0) {
          cell.trees--;
          cell.stumps++;
          cut = 1;
        }
        if ((mask & 2) && !(blocked & 2)) {
          cleared = oldStumps;
          cell.stumps -= oldStumps;
        }
      }
      cell.trap = false;
      for (const m of machines) {
        m.sabotage = false;
        m.hs = Math.max(
          ...cards.filter((c) => c[0] === m.kind).map((c) => Number(c[1]) - 1),
        );
        trace.activations.find(
          (a) => a.target === f.player && a.kind === m.kind,
        )!.hsAfter = m.hs;
      }
      trace.combats.push({
        target: f.player,
        cell: dest,
        cards,
        machines: machines.map((m) => m.kind),
        power,
        defenders,
        parried,
        cut,
        cleared,
        trapConsumed,
        sabotageConsumed,
      });
    }
  }
  for (const p of placements.filter((p) => p.mode === "STEALTH")) {
    const event: TurnTrace["stealth"][number] = {
      placement: structuredClone(p),
      discovered: dangerous.has(`${p.target}:${p.cell}`),
      outcome: "NO_EFFECT",
      sabotaged: [],
    };
    if (event.discovered) event.outcome = "DISCOVERED";
    else {
      const f = board.forests[p.target],
        machines = f.machines.filter((m) => m.position === p.cell),
        cell = f.cells[p.cell - 1];
      if (machines.length) {
        // ONE_MACHINE is an explicit choice. Already sabotaged target wastes this action.
        const chosen =
          config.sabotageMode === "BOTH_MACHINES"
            ? machines
            : machines.filter((m) => m.kind === p.sabotageChoice);
        for (const m of chosen)
          if (!m.sabotage) {
            m.sabotage = true;
            event.sabotaged.push(m.kind);
          }
        if (event.sabotaged.length) event.outcome = "SABOTAGE";
      } else if (!cell.trap) {
        cell.trap = true;
        event.outcome = "TRAP";
      }
    }
    trace.stealth.push(event);
  }
  trace.discoveredOwners = board.eyeOrder.filter((p) => discovered.has(p));
  board.eyeOrder = moveEye(
    board.eyeOrder,
    trace.discoveredOwners,
    config.eyeMode,
  );
  board.blind = [...trace.discoveredOwners];
  board.turn++;
  trace.eyeAfter = [...board.eyeOrder];
  trace.end = structuredClone(board);
  return trace;
}
/** One stump becomes one standing tree per eligible cell, only at game end. */
export function regenerate(board: Board): number {
  let count = 0;
  for (const f of board.forests)
    for (const cell of f.cells)
      if (cell.stumps > 0) {
        cell.stumps--;
        cell.trees++;
        count++;
      }
  return count;
}
export function runV4(
  configInput: V4Config,
  seed: number,
  recordTrace = true,
): GameResult {
  const config = validateV4Config(configInput);
  validateSeed(seed);
  const board = initialBoard(config),
    rng = new SeededRNG(seed),
    traces: TurnTrace[] = [];
  const count = () =>
    board.forests.map((f) => f.cells.reduce((n, c) => n + c.trees, 0));
  const initialStanding = count().reduce((a, b) => a + b, 0),
    initialEcologicalStock =
      config.numPlayers * config.trackLength * config.initialTreesPerCell;
  for (let turn = 1; turn <= config.numTurns; turn++) {
    const draws = Array.from({ length: config.numPlayers }, (_, p) => {
      const d = rng.roll2D6();
      return resolveDraw(p, d.d1, d.d2, board.eyeOrder);
    });
    const { placements, decisions } = programBots(board, config, draws);
    const trace = resolveTurn(board, config, draws, placements, decisions);
    if (recordTrace) traces.push(trace);
  }
  const standingBeforeRegeneration = count().reduce((a, b) => a + b, 0);
  const regenerated = regenerate(board);
  const finalStandingByPlayer = count(),
    finalStanding = finalStandingByPlayer.reduce((a, b) => a + b, 0);
  return {
    rulesVersion: RULES_VERSION,
    config,
    seed,
    botVersion: BOT_VERSION,
    observationVersion: OBS_VERSION,
    privileged: false,
    randomVersion: "MULBERRY32_ENV_ONLY_V1",
    initialStanding,
    initialEcologicalStock,
    standingBeforeRegeneration,
    regenerated,
    finalStanding,
    ecologicalLoss: initialEcologicalStock - finalStanding,
    finalStandingByPlayer,
    finalBoard: board,
    ...(recordTrace ? { traces } : {}),
  };
}

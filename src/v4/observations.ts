import { legalActions } from "./engine";
import {
  OBS_VERSION,
  type V4Config,
  type Board,
  type Draw,
  type Placement,
  type Action,
} from "./types";
export interface Observation {
  version: typeof OBS_VERSION;
  player: number;
  step: 1 | 2;
  board: Board;
  config: V4Config;
  placements: Placement[];
  legalActions: Action[];
  personalRoll?: Draw;
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
/** Explicit allowlist: never forward an engine object or all draws to a policy. */
export function observe(
  board: Board,
  config: V4Config,
  draws: Draw[],
  player: number,
  step: 1 | 2,
  placements: Placement[],
): Observation {
  const publicBoard: Board = {
    turn: board.turn,
    eyeOrder: [...board.eyeOrder],
    blind: [...board.blind],
    forests: board.forests.map((f) => ({
      player: f.player,
      cells: f.cells.map((c) => ({
        trees: c.trees,
        stumps: c.stumps,
        trap: c.trap,
      })),
      machines: f.machines.map((m) => ({
        kind: m.kind,
        position: m.position,
        hs: m.hs,
        sabotage: m.sabotage,
      })),
    })),
  };
  const publicPlacements = placements.map((p) => ({
    owner: p.owner,
    step: p.step,
    target: p.target,
    cell: p.cell,
    mode: p.mode,
    sabotageChoice: p.sabotageChoice,
  }));
  const own = draws.find((d) => d.roller === player);
  return freeze({
    version: OBS_VERSION,
    player,
    step,
    board: publicBoard,
    config: structuredClone(config),
    placements: publicPlacements,
    legalActions: legalActions(
      publicBoard,
      config,
      player,
      step,
      publicPlacements,
    ),
    ...(!board.blind.includes(player) && own
      ? {
          personalRoll: {
            roller: own.roller,
            d1: own.d1,
            d2: own.d2,
            target: own.target,
            tactic: own.tactic,
          },
        }
      : {}),
  });
}

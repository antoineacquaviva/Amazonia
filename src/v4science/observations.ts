import { observe as legacyObserve } from "../v4/observations";
import { legalActions } from "../v4/engine";
import type { V4Config, Board, Draw, Placement, Action } from "../v4/types";
import { OBSERVATION, type Family } from "./types";
export interface PanelObservation {
  version: typeof OBSERVATION;
  family: Family;
  player: number;
  step: 1 | 2;
  board: Board;
  config: V4Config;
  placements: Placement[];
  legalActions: Action[];
  personalRoll?: Draw;
}
export interface PrivilegedObservation extends PanelObservation {
  family: "OMNISCIENT";
  privilege: "ALL_CURRENT_ROLLS";
  privilegedRolls: Draw[];
}
export function coordinated(f: Family) {
  return [
    "COORD_NO_DICE",
    "COORD_ONE_SHOT",
    "COORD_HYBRID",
    "OMNISCIENT",
  ].includes(f);
}
export function revisable(f: Family) {
  return ["COORD_NO_DICE", "COORD_HYBRID", "OMNISCIENT"].includes(f);
}
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}
export function panelObserve(
  board: Board,
  config: V4Config,
  draws: Draw[],
  player: number,
  step: 1 | 2,
  placements: Placement[],
  family: Family,
): PanelObservation | PrivilegedObservation {
  // Reuse the explicit public projection, then discard all unauthorized fields.
  const projected = legacyObserve(
    board,
    config,
    draws,
    player,
    step,
    placements,
  );
  const personal = ["SOLO_INFORMED", "COORD_ONE_SHOT", "COORD_HYBRID"].includes(
    family,
  )
    ? projected.personalRoll
    : undefined;
  const base = {
    version: OBSERVATION,
    family,
    player,
    step,
    board: structuredClone(projected.board),
    config: structuredClone(config),
    placements: coordinated(family)
      ? structuredClone(projected.placements)
      : [],
    legalActions: legalActions(
      projected.board,
      config,
      player,
      step,
      projected.placements,
    ),
    ...(personal ? { personalRoll: structuredClone(personal) } : {}),
  };
  if (family === "OMNISCIENT")
    return freeze({
      ...base,
      family,
      privilege: "ALL_CURRENT_ROLLS",
      privilegedRolls: draws.map((d) => ({
        roller: d.roller,
        d1: d.d1,
        d2: d.d2,
        target: d.target,
        tactic: d.tactic,
      })),
    }) as PrivilegedObservation;
  return freeze(base) as PanelObservation;
}

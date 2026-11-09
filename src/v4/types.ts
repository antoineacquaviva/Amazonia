import type { TacticType } from "../sim/types";
export const RULES_VERSION = "V4_EXPERIMENTAL_2026_11_09" as const;
export const BOT_VERSION = "V4_PRIVATE_GREEDY_REVISION_1" as const;
export const OBS_VERSION = "V4_PRIVATE_REVISABLE_1" as const;
export const TACTICS: TacticType[] = ["A1", "B1", "A2", "B2", "A3", "B3"];
export interface V4Config {
  rulesVersion: typeof RULES_VERSION;
  numPlayers: number;
  numTurns: number;
  trackLength: number;
  initialTreesPerCell: 2 | 3;
  initialEyeOrder: number[];
  eyeMode: "ONE_STEP" | "FULL_CAPTURE";
  stealthCapacity: "SINGLE" | "MULTIPLE";
  sabotageMode: "ONE_MACHINE" | "BOTH_MACHINES";
}
export const DEFAULT_V4_CONFIG: V4Config = {
  rulesVersion: RULES_VERSION,
  numPlayers: 3,
  numTurns: 8,
  trackLength: 16,
  initialTreesPerCell: 2,
  initialEyeOrder: [0, 1, 2],
  eyeMode: "ONE_STEP",
  stealthCapacity: "SINGLE",
  sabotageMode: "ONE_MACHINE",
};
export interface Cell {
  trees: number;
  stumps: number;
  trap: boolean;
}
export interface Machine {
  kind: "A" | "B";
  position: number;
  hs: number;
  sabotage: boolean;
}
export interface Forest {
  player: number;
  cells: Cell[];
  machines: Machine[];
}
export interface Board {
  forests: Forest[];
  eyeOrder: number[];
  blind: number[];
  turn: number;
}
export interface Draw {
  roller: number;
  d1: number;
  d2: number;
  target: number;
  tactic: TacticType;
}
export interface Action {
  target: number;
  cell: number;
  mode: "COMBAT" | "STEALTH";
  sabotageChoice: "A" | "B";
}
export interface Placement extends Action {
  owner: number;
  step: 1 | 2;
}
export interface DecisionEvent {
  owner: number;
  phase: "OWN_FINAL" | "ALLY_TENTATIVE" | "ALLY_REVISE" | "ALLY_FINAL";
  action: Placement;
  round: number;
}
export interface Combat {
  target: number;
  cell: number;
  cards: TacticType[];
  machines: ("A" | "B")[];
  power: number;
  defenders: number;
  parried: boolean;
  cut: number;
  cleared: number;
  trapConsumed: boolean;
  sabotageConsumed: ("A" | "B")[];
}
export interface Activation {
  target: number;
  kind: "A" | "B";
  from: number;
  to: number;
  recovering: boolean;
  hsBefore: number;
  hsAfter: number;
  cards: TacticType[];
}
export interface StealthEvent {
  placement: Placement;
  discovered: boolean;
  outcome: "DISCOVERED" | "TRAP" | "SABOTAGE" | "NO_EFFECT";
  sabotaged: ("A" | "B")[];
}
export interface TurnTrace {
  turn: number;
  eyeBefore: number[];
  eyeAfter: number[];
  blind: number[];
  draws: Draw[];
  placements: Placement[];
  decisions: DecisionEvent[];
  activations: Activation[];
  combats: Combat[];
  stealth: StealthEvent[];
  discoveredOwners: number[];
  end: Board;
}
export interface Provenance {
  commit: string;
  dirty: boolean;
  sourceSha256: string;
  node: string;
  rulesVersion: typeof RULES_VERSION;
  botVersion: typeof BOT_VERSION;
  observationVersion: typeof OBS_VERSION;
}
export interface GameResult {
  rulesVersion: typeof RULES_VERSION;
  config: V4Config;
  seed: number;
  botVersion: typeof BOT_VERSION;
  observationVersion: typeof OBS_VERSION;
  privileged: false;
  randomVersion: "MULBERRY32_ENV_ONLY_V1";
  provenance?: Provenance;
  initialStanding: number;
  initialEcologicalStock: number;
  standingBeforeRegeneration: number;
  regenerated: number;
  finalStanding: number;
  ecologicalLoss: number;
  finalStandingByPlayer: number[];
  finalBoard: Board;
  traces?: TurnTrace[];
}

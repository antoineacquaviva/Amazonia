import type { V4Config, TurnTrace, Board } from "../v4/types";
export const PROTOCOL = "V4_SCIENTIFIC_1" as const;
export const OBSERVATION = "V4_PANEL_PRIVATE_1" as const;
export const NEGOTIATION = "EYE_ORDER_OWN_FINAL_ALLY_R2_V1" as const;
export const RANDOM = "V4_INDEXED_SHA256_REJECTION_1" as const;
export const FAMILIES = [
  "BLIND",
  "PROB_ONLY",
  "SOLO_INFORMED",
  "COORD_NO_DICE",
  "COORD_ONE_SHOT",
  "COORD_HYBRID",
  "OMNISCIENT",
] as const;
export type Family = (typeof FAMILIES)[number];
export const POLICY_VERSIONS = Object.fromEntries(
  FAMILIES.map((f) => [
    f,
    f === "BLIND" ? "V4_BLIND_NAIVE_1" : `V4_${f}_SHARED_GREEDY_1`,
  ]),
) as Record<Family, string>;
export interface Plan {
  protocol: typeof PROTOCOL;
  name: string;
  configs: V4Config[];
  families: Family[];
  seeds: number[];
  experimentSeed: number;
  environmentSeed: number;
  policySeed: number;
  independentGames: boolean;
}
export interface Provenance {
  protocol: typeof PROTOCOL;
  rulesVersion: string;
  observation: string;
  negotiation: string;
  random: string;
  policyVersions: Record<Family, string>;
  sourceHash: string;
  sourceFiles: Record<string, string>;
  commit: string;
  dirty: boolean;
  runtime: { node: string; v8: string; platform: string; arch: string };
}
export interface EnvEvent {
  id: string;
  turn: number;
  player: number;
  d1: number;
  d2: number;
}
export interface TurnMeasures {
  turn: number;
  ecologicalLoss: number;
  ecologicalDamage: number;
  pivotalCombatDefenders: number;
  hsMachinesEnd: number;
  cuts: number;
  cleared: number;
  parries: number;
  combats: number;
  activated: number;
  recoveries: number;
  trapConsumed: number;
  sabotageConsumed: number;
  tokenEnabledParries: number;
  combatDefenders: number;
  unengagedDefenders: number;
  concentration: number;
  stealthNoEffect: number;
  discoveries: number;
  blindPlayers: number;
  revisions: number;
  revisionChanges: number;
  trapsPlaced: number;
  sabotagesPlaced: number;
}
export interface Measures {
  finalStanding: number;
  ecologicalLoss: number;
  regenerated: number;
  initialStock: number;
  reachedCells: number;
  attackedCells: number;
  reachableCells: number;
  untouchedUnreachableCells: number;
  reachedFinalStanding: number;
  reachedLoss: number;
  reachableFinalStanding: number;
  reachableLoss: number;
  unreachableStanding: number;
  byPlayer: {
    player: number;
    initialRank: number;
    finalRank: number;
    rankTrajectory: number[];
    loss: number;
    discoveries: number;
    blindTurns: number;
  }[];
  turns: TurnMeasures[];
}
export interface Sample {
  protocol: typeof PROTOCOL;
  config: V4Config;
  configId: string;
  family: Family;
  team: Family[];
  policyVersions: string[];
  privileged: boolean;
  seed: number;
  unit: string;
  environmentKey: string;
  eventFingerprint: string;
  events: EnvEvent[];
  pairingKey: string;
  provenance: Provenance;
  measures: Measures;
  finalBoard: Board;
  trace?: TurnTrace[];
  violations: string[];
}
export type Status = "RUNNING" | "PAUSED" | "STOPPED" | "COMPLETED" | "ERROR";
export interface Study {
  id: string;
  plan: Plan;
  provenance: Provenance;
  manifestHash: string;
  status: Status;
  reason: string;
  completed: number;
  total: number;
  cursor: number;
  batchSize: number;
  createdAt: string;
  updatedAt: string;
  lastError?: string;
  documentSnapshots: Record<string, { sha256: string; text: string }>;
}
export interface Job {
  configIndex: number;
  family: Family;
  seed: number;
  trace: boolean;
}
export interface ScienceRequest {
  taskId: number;
  type: "RUN_V4_SCIENCE";
  plan: Plan;
  provenance: Provenance;
  jobs: Job[];
}
export interface ScienceResponse {
  taskId: number;
  type: "RUN_V4_SCIENCE_RESULT";
  samples: Sample[];
}

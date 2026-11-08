import type {
  BotProfileId,
  PlayerForestGroup,
  SecretVillainDraw,
  SimulationConfig,
  TacticType,
} from "../sim/types";
export const POLICY_VERSIONS = {
  BLIND: "SCI_BLIND_V1",
  PROB_ONLY: "SCI_PUBLIC_PROB_V1",
  SOLO_INFORMED: "SCI_PERSONAL_V1",
  COORD_ONE_SHOT: "SCI_VISIBLE_ONE_PASS_V1",
  OMNISCIENT: "SCI_PRIVILEGED_HEURISTIC_V1",
} as const;
export type SupportedPolicy = keyof typeof POLICY_VERSIONS;
export const supported = (id: BotProfileId): id is SupportedPolicy =>
  id in POLICY_VERSIONS;
export interface VisiblePlacement {
  playerIndex: number;
  step: 1 | 2;
  targetPlayerIndex: number;
  cellIndex: number;
  track: "TACTICAL" | "STEALTH";
}
export interface PublicGroup {
  playerIndex: number;
  harvester: { status: string; position: number | null; hasSabotage: boolean };
  bulldozer: { status: string; position: number | null; hasSabotage: boolean };
  cells: {
    cellIndex: number;
    standingTrees: number;
    stumps: number;
    hasTrap: boolean;
    tacticalDefenders?: number;
    stealthDefenders?: number;
  }[];
}
export interface OrdinaryObservation {
  contract: "OBS_V1_NO_REVISIONS";
  policy: Exclude<SupportedPolicy, "OMNISCIENT">;
  turn: number;
  player: number;
  step: 1 | 2;
  publicBoard: PublicGroup[];
  publicHistory: VisiblePlacement[];
  visiblePlacements: VisiblePlacement[];
  personalRoll?: SecretVillainDraw;
  tacticsTrack: TacticType[];
  config: SimulationConfig;
  legalActions: {
    targetPlayerIndex: number;
    cellIndex: number;
    track: "TACTICAL";
  }[];
}
export interface PrivilegedObservation extends Omit<
  OrdinaryObservation,
  "policy"
> {
  policy: "OMNISCIENT";
  privilege: "ALL_CURRENT_ROLLS";
  allCurrentRolls: SecretVillainDraw[];
}
export type Observation = OrdinaryObservation | PrivilegedObservation;
export function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const child of Object.values(value)) freeze(child);
  }
  return value;
}
/** The trusted adapter owns secrets. Policies receive only detached, explicit DTOs. */
export function observe(input: {
  policy: SupportedPolicy;
  turn: number;
  player: number;
  step: 1 | 2;
  groups: PlayerForestGroup[];
  draws: SecretVillainDraw[];
  placements: VisiblePlacement[];
  history: VisiblePlacement[];
  track: TacticType[];
  config: SimulationConfig;
}): Observation {
  const { policy, player, step, groups } = input,
    coordinate = policy === "COORD_ONE_SHOT" || policy === "OMNISCIENT";
  const publicBoard = groups.map((g) => ({
    playerIndex: g.playerIndex,
    harvester: {
      status: g.harvester.status,
      position: g.harvester.position,
      hasSabotage: g.harvester.hasSabotage,
    },
    bulldozer: {
      status: g.bulldozer.status,
      position: g.bulldozer.position,
      hasSabotage: g.bulldozer.hasSabotage,
    },
    cells: g.cells.map((c) => ({
      cellIndex: c.cellIndex,
      standingTrees: c.standingTrees,
      stumps: c.stumps,
      hasTrap: c.hasTrap,
      ...(coordinate
        ? {
            tacticalDefenders: c.tacticalDefenders,
            stealthDefenders: c.stealthDefenders,
          }
        : {}),
    })),
  }));
  const legalActions = groups
    .filter((g) =>
      step === 1 ? g.playerIndex === player : g.playerIndex !== player,
    )
    .flatMap((g) =>
      g.cells
        .filter((c) => c.tacticalDefenders < input.config.tacticalDefenderCap)
        .map((c) => ({
          targetPlayerIndex: g.playerIndex,
          cellIndex: c.cellIndex,
          track: "TACTICAL" as const,
        })),
    );
  const visible = (events: VisiblePlacement[]) =>
    events.map((e) => ({
      playerIndex: e.playerIndex,
      step: e.step,
      targetPlayerIndex: e.targetPlayerIndex,
      cellIndex: e.cellIndex,
      track: e.track,
    }));
  const base = {
    contract: "OBS_V1_NO_REVISIONS" as const,
    policy,
    turn: input.turn,
    player,
    step,
    publicBoard,
    publicHistory: coordinate ? visible(input.history) : [],
    visiblePlacements: coordinate ? visible(input.placements) : [],
    tacticsTrack: [...input.track],
    config: {
      numPlayers: input.config.numPlayers,
      numTurns: input.config.numTurns,
      initialTreesPerCell: input.config.initialTreesPerCell,
      tacticsTrackPreset: input.config.tacticsTrackPreset,
      tacticsTrackSetup: [...input.track],
      shuffleTacticsTrack: input.config.shuffleTacticsTrack,
      tacticalDefenderCap: input.config.tacticalDefenderCap,
      combatThresholdShift: input.config.combatThresholdShift,
      bulldozerZeroStumpAction: input.config.bulldozerZeroStumpAction,
      initialStumpCell2: input.config.initialStumpCell2,
      parryHsRule: input.config.parryHsRule,
    },
    legalActions,
  };
  // No face-down cards, partner reasons, collective private flags or arbitrary group properties.
  const ownRaw = input.draws[player];
  const personal = {
    rollerPlayerIndex: ownRaw.rollerPlayerIndex,
    d1: ownRaw.d1,
    d2: ownRaw.d2,
    mIndex: ownRaw.mIndex,
    tactic: ownRaw.tactic,
    targetPlayerIndex: ownRaw.targetPlayerIndex,
  };
  const own =
    policy === "SOLO_INFORMED" ||
    policy === "COORD_ONE_SHOT" ||
    policy === "OMNISCIENT"
      ? personal
      : undefined;
  const projected =
    policy === "OMNISCIENT"
      ? {
          ...base,
          policy,
          personalRoll: own,
          privilege: "ALL_CURRENT_ROLLS" as const,
          allCurrentRolls: structuredClone(input.draws),
        }
      : { ...base, policy, personalRoll: own };
  return freeze(projected as Observation);
}

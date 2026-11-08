import type { SeededRNG } from "./rng";
import type {
  BotProfileId,
  PlayerForestGroup,
  SecretVillainDraw,
  SimulationConfig,
} from "./types";
import type { Phase2ExecutionResult } from "./bots";
/** Trusted versioned adapter seam. Default historical execution does not use this interface. */
export interface SimulationRuntime {
  environment: SeededRNG;
  phase2: (
    params: SimulationConfig,
    groups: PlayerForestGroup[],
    draws: SecretVillainDraw[],
    profiles: BotProfileId[],
  ) => Phase2ExecutionResult;
}

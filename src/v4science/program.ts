import { DEFAULT_V4_CONFIG } from "../v4/types";
import {
  FAMILIES,
  PROTOCOL,
  type Plan,
  type Provenance,
  type Status,
} from "./types";

export const depths = [2, 32, 128] as const;
export const coverage = "V4_TABLES_1";
export function programPlans(repeats: number, maxGames: number): Plan[] {
  if (!depths.some((n) => n === repeats))
    throw new Error("Profondeur inconnue");
  const chunk = Math.floor(maxGames / (8 * FAMILIES.length));
  if (chunk < 1)
    throw new Error("Budget insuffisant pour une table de 56 parties");
  const plans: Plan[] = [];
  for (const numPlayers of [3, 4, 5, 6]) {
    for (const initialTreesPerCell of [2, 3] as const) {
      const initialEyeOrder = Array.from({ length: numPlayers }, (_, i) => i);
      const configs = (["ONE_STEP", "FULL_CAPTURE"] as const).flatMap(
        (eyeMode) =>
          (["SINGLE", "MULTIPLE"] as const).flatMap((stealthCapacity) =>
            (["ONE_MACHINE", "BOTH_MACHINES"] as const).map((sabotageMode) => ({
              ...DEFAULT_V4_CONFIG,
              numPlayers,
              initialTreesPerCell,
              initialEyeOrder,
              eyeMode,
              stealthCapacity,
              sabotageMode,
            })),
          ),
      );
      for (let first = 0; first < repeats; first += chunk) {
        plans.push({
          protocol: PROTOCOL,
          name: `Table ${numPlayers} joueurs · ${initialTreesPerCell} arbres · série ${first + 1}`,
          configs,
          families: [...FAMILIES],
          seeds: Array.from(
            { length: Math.min(chunk, repeats - first) },
            (_, i) => 51001 + first + i,
          ),
          experimentSeed: 17,
          environmentSeed: 23,
          policySeed: 29,
          independentGames: true,
        });
      }
    }
  }
  return plans;
}
export interface Program {
  id: string;
  repeats: number;
  version: typeof coverage;
  provenance: Provenance;
  sourceHash: string;
  created: string;
  status: Status;
  reason: string;
  index: number;
  parts: { id: string; plan: Plan }[];
}

import { SeededRNG } from "../sim/rng";
import { TACTICS_TRACK_PRESETS, DEFAULT_TABLE_CONFIGS } from "../sim/i18n";
import { expandParameterSweep } from "../sim/evaluator";
import type {
  CampaignConfig,
  SimulationConfig,
  BotProfileId,
} from "../sim/types";
export const BOTS: BotProfileId[] = [
  "BLIND",
  "PROB_ONLY",
  "SOLO_INFORMED",
  "COORD_NO_DICE",
  "COORD_ONE_SHOT",
  "COORD_HYBRID",
  "OMNISCIENT",
];
export function tablesFor(c: CampaignConfig) {
  const tables = structuredClone(
    c.selectedTableConfigs.length
      ? c.selectedTableConfigs
      : DEFAULT_TABLE_CONFIGS,
  );
  if (c.includeCalibrationTables)
    for (const t of DEFAULT_TABLE_CONFIGS)
      if (!tables.some((x) => x.id === t.id)) tables.push(structuredClone(t));
  return tables;
}
// External checkpoint adapter: engine/RNG source and historical draw order remain untouched.
export function stressParams(
  c: CampaignConfig,
  start: number,
  count: number,
  state?: number,
) {
  const rng = new SeededRNG(c.baseSeed || 77777);
  if (state !== undefined) (rng as unknown as { state: number }).state = state;
  const variants = c.randomizeParametersInStress
    ? []
    : expandParameterSweep(c.sweep);
  const jobs = [];
  for (let i = start; i < start + count; i++) {
    let params: SimulationConfig;
    if (c.randomizeParametersInStress) {
      const n = rng.nextInt(3, 6),
        preset = (["ASSAULT_LOW", "ASSAULT_HIGH"] as const)[rng.nextInt(0, 1)];
      params = {
        numPlayers: n,
        numTurns: rng.nextInt(6, 12),
        initialTreesPerCell: rng.nextInt(2, 3),
        tacticsTrackPreset: preset,
        tacticsTrackSetup: [...TACTICS_TRACK_PRESETS[preset].setup],
        shuffleTacticsTrack: rng.nextFloat() < 0.25,
        tacticalDefenderCap: ([99, 2, 1] as const)[rng.nextInt(0, 2)],
        combatThresholdShift: ([0, 1] as const)[rng.nextInt(0, 1)],
        parryHsRule: (["SYNERGY_TRAP_SAB", "STANDARD_S3"] as const)[
          rng.nextInt(0, 1)
        ],
        bulldozerZeroStumpAction: (["DESTROY_TREE", "NONE"] as const)[
          rng.nextInt(0, 1)
        ],
        initialStumpCell2: rng.nextFloat() < 0.75,
      };
    } else params = variants[i % variants.length].params;
    jobs.push({
      seed: (c.baseSeed || 900000) + i + 1,
      params,
      botProfile: BOTS[i % BOTS.length],
    });
  }
  return { jobs, state: (rng as unknown as { state: number }).state };
}

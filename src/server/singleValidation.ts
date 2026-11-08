import { DEFAULT_SIMULATION_CONFIG } from "../sim/i18n";
import type { SimulationConfig, BotProfileId } from "../sim/types";
import { validateScienceOptions, validateTeam } from "../scientific/protocol";
export function singleInput(body: any) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some(
      (k) =>
        !["params", "seed", "botProfiles", "protocol", "science"].includes(k),
    )
  )
    throw new Error("Corps invalide");
  if (
    body.params !== undefined &&
    (!body.params ||
      typeof body.params !== "object" ||
      Array.isArray(body.params))
  )
    throw new Error("Paramètres invalides");
  const params: SimulationConfig = {
    ...DEFAULT_SIMULATION_CONFIG,
    ...body.params,
  };
  const domains: Record<string, unknown[]> = {
    numPlayers: [3, 4, 5, 6],
    numTurns: [6, 7, 8, 9, 10, 11, 12],
    initialTreesPerCell: [2, 3],
    tacticsTrackPreset: ["ASSAULT_LOW", "ASSAULT_HIGH"],
    shuffleTacticsTrack: [true, false],
    tacticalDefenderCap: [1, 2, 99],
    combatThresholdShift: [0, 1],
    bulldozerZeroStumpAction: ["NONE", "DESTROY_TREE"],
    initialStumpCell2: [true, false],
    parryHsRule: ["STANDARD_S3", "SYNERGY_TRAP_SAB"],
  };
  for (const [key, value] of Object.entries(params)) {
    if (key === "tacticsTrackSetup") {
      if (
        !Array.isArray(value) ||
        value.length !== 6 ||
        value.some((v) => !["A1", "A2", "A3", "B1", "B2", "B3"].includes(v))
      )
        throw new Error("Piste invalide");
    } else if (!domains[key]?.includes(value))
      throw new Error("Paramètre invalide");
  }
  const seed = body.seed ?? 42001;
  if (!Number.isSafeInteger(seed) || seed < 1 || seed > 0xffffffff)
    throw new Error("Graine invalide");
  const botProfiles: BotProfileId[] = body.botProfiles ?? ["COORD_HYBRID"];
  if (
    !Array.isArray(botProfiles) ||
    botProfiles.length < 1 ||
    botProfiles.length > 6 ||
    botProfiles.some(
      (p) =>
        ![
          "BLIND",
          "PROB_ONLY",
          "SOLO_INFORMED",
          "COORD_NO_DICE",
          "COORD_ONE_SHOT",
          "COORD_HYBRID",
          "OMNISCIENT",
        ].includes(p),
    )
  )
    throw new Error("Profils invalides");
  const protocol = body.protocol ?? "HISTORICAL_V33";
  if (!["HISTORICAL_V33", "SCIENTIFIC_V1"].includes(protocol))
    throw new Error("Protocole invalide");
  if (protocol === "SCIENTIFIC_V1") {
    validateScienceOptions(body.science);
    validateTeam(botProfiles);
  } else if (body.science !== undefined)
    throw new Error("Manifeste scientifique hors protocole");
  return { params, seed, botProfiles, protocol, science: body.science };
}

import { BOTS } from "../server/campaignPlan";
import type { SimulationConfig, TableConfig } from "../sim/types";
import {
  meanEstimate,
  proportionEstimate,
  pairedDifference,
  type Estimate,
  type Pairable,
} from "./statistics";
import type { ScientificGame, ScientificSample } from "./runner";
import type { ProtocolConfig, Assumptions, Provenance } from "./protocol";
import { POLICY_VERSIONS } from "./observations";
import { digest } from "./random";
export const METRICS = {
  survival: {
    formula: "clamp(1 - treesLost / (N*X*a),0,1)",
    unit: "ratio",
    favorable: "HIGHER",
    population: "independent simulated games at fixed rules/team",
  },
  treesLost: {
    formula:
      "sum_players(max(0, allocated ecological potential - final standing trees after regeneration))",
    unit: "trees",
    favorable: "LOWER",
  },
  defeat: { formula: "survival < 0.45", unit: "frequency", favorable: "LOWER" },
} as const;
export interface ScientificTable {
  tableId: string;
  name: string;
  team: string[];
  policyVersions: string[];
  n: number;
  survival: Estimate;
  treesLost: Estimate;
  defeat: Estimate;
  audit?: ScientificSample;
}
export interface ScientificVariant {
  kind: "SCIENTIFIC_V1";
  variantId: string;
  variantLabel: string;
  params: SimulationConfig;
  provenance: Provenance;
  tableSummaries: ScientificTable[];
  comparisonFamily: {
    id: string | null;
    reportedContrasts: number;
    scope: "THIS_VARIANT_ONLY";
    adjustment: "NONE";
  };
  comparisons: {
    left: string;
    right: string;
    metric: "survival";
    estimate: ReturnType<typeof pairedDifference>;
  }[];
  unavailableProfiles: string[];
  assumptions: Assumptions;
  dictionary: typeof METRICS;
  limitations: string[];
}
export function scientificSample(game: ScientificGame): ScientificSample {
  const {
    unit,
    gameSeed,
    pairingKey,
    environmentFingerprint,
    team,
    policyVersions,
    survival,
    treesLost,
    defeat,
    protocol,
  } = game.scientific;
  return {
    unit,
    gameSeed,
    pairingKey,
    environmentFingerprint,
    team,
    policyVersions,
    survival,
    treesLost,
    defeat,
    protocol,
  };
}
export function summarizeScientific(
  table: TableConfig,
  games: ScientificGame[],
  c: ProtocolConfig,
  complete: boolean,
): ScientificTable {
  if (games.some((g) => !g.scientific))
    throw new Error("Historical data cannot enter a scientific aggregate");
  if (new Set(games.map((g) => g.scientific?.unit)).size !== games.length)
    throw new Error("Duplicate experimental units");
  if (games.some((g) => digest(g.params) !== digest(games[0].params)))
    throw new Error("Mixed rules configurations");
  if (
    games.some((g) => g.scientific.testOverride || g.tableConfigId !== table.id)
  )
    throw new Error("Unregistered test policy or mismatched table");
  const expected = Array.from(
    { length: games[0]?.params.numPlayers ?? 0 },
    (_, i) => table.botProfiles[i % table.botProfiles.length],
  );
  for (const g of games) {
    const p = g.scientific?.protocol;
    if (
      !p ||
      p.protocol !== "SCIENTIFIC_V1" ||
      p.rulesFingerprint !== c.provenance!.rulesFingerprint ||
      p.implementationFingerprint !== c.provenance!.implementationFingerprint ||
      digest(g.scientific.policyVersions) !==
        digest(
          expected.map(
            (p) => POLICY_VERSIONS[p as keyof typeof POLICY_VERSIONS],
          ),
        ) ||
      digest(g.scientific.team) !== digest(expected)
    )
      throw new Error(
        "Mixed protocols, implementations or teams in scientific aggregate",
      );
  }
  const options = c.science!,
    bounds = games[0]?.initialTotalTreesAllocated ?? 1;
  return {
    tableId: table.id,
    name: expected.every((p) => p === "OMNISCIENT")
      ? "OMNISCIENT — contrôle heuristique privilégié"
      : table.name,
    team: expected,
    policyVersions: expected.map(
      (p) => POLICY_VERSIONS[p as keyof typeof POLICY_VERSIONS],
    ),
    n: games.length,
    survival: meanEstimate(
      games.map((g) => g.scientific.survival),
      [0, 1],
      options.assumptions,
      complete,
    ),
    treesLost: meanEstimate(
      games.map((g) => g.scientific.treesLost),
      [0, bounds],
      options.assumptions,
      complete,
    ),
    defeat: proportionEstimate(
      games.map((g) => g.scientific.defeat),
      options.assumptions,
      complete,
    ),
    ...(games.find((g) => g.scientific.observations)
      ? {
          audit: scientificSample(
            games.find((g) => g.scientific.observations)!,
          ),
        }
      : {}),
  };
}
export function scientificVariant(
  spec: { variantId: string; variantLabel: string; params: SimulationConfig },
  tables: ScientificTable[],
  c: ProtocolConfig,
  samples: (tableId: string) => ScientificSample[],
): ScientificVariant {
  const ref = tables[0];
  const pairable = (s: ScientificSample): Pairable => ({
    unit: s.unit,
    pairingKey: s.pairingKey,
    environmentFingerprint: s.environmentFingerprint,
    value: s.survival,
  });
  const baseline = ref ? samples(ref.tableId).map(pairable) : [];
  return {
    kind: "SCIENTIFIC_V1",
    variantId: spec.variantId,
    variantLabel: spec.variantLabel,
    params: spec.params,
    provenance: c.provenance!,
    tableSummaries: tables,
    comparisonFamily: {
      id: c.science!.assumptions.familyId ?? null,
      reportedContrasts: Math.max(0, tables.length - 1),
      scope: "THIS_VARIANT_ONLY",
      adjustment: "NONE",
    },
    comparisons: tables.slice(1).map((t) => ({
      left: t.tableId,
      right: ref.tableId,
      metric: "survival",
      estimate: pairedDifference(
        samples(t.tableId).map(pairable),
        baseline,
        c.science!.assumptions,
      ),
    })),
    unavailableProfiles: BOTS.filter(
      (p) => !tables.some((t) => t.team.includes(p)),
    ),
    assumptions: c.science!.assumptions,
    dictionary: METRICS,
    limitations: [
      "Policy contrasts are not causal information effects.",
      "No Shapley decomposition, certified optimum or adaptive stopping.",
      "95% intervals are marginal and unadjusted for multiplicity; no family-wise guarantee.",
      "IID and fixed-N assumptions are declarations, not empirical proofs.",
      "Baseline policies route the second token to the next seat, use tactical tokens only, and never revise.",
      "COORD_NO_DICE and COORD_HYBRID unavailable until revision rules are validated.",
    ],
  };
}

import { generateCampaignMarkdownReport } from "./sim/evaluator";
import type { ManagedRecord } from "./server/campaignManager";
export function campaignReport(record: ManagedRecord) {
  const protocol =
    record.protocol ??
    (record.config as { protocol?: string }).protocol ??
    "HISTORICAL_V33";
  if (protocol === "SCIENTIFIC_V1") {
    const reports = record.scientificResults ?? [];
    const lines = [
      `# Amazonia — SCIENTIFIC_V1`,
      `Statut : ${record.status}. ${record.status !== "COMPLETED" || record.orchestration?.partial ? "BILAN PARTIEL." : ""}`,
      `Configuration et manifeste :`,
      "```json",
      JSON.stringify(record.config, null, 2),
      "```",
      `Les contrastes de politiques ne sont ni des effets causaux I1/I2/I3 ni une décomposition Shapley. Le contrôle privilégié est heuristique, sans preuve d'optimalité.`,
    ];
    const estimate = (x: {
      mean: number | null;
      ci95: [number, number] | null;
      n: number;
      reason?: string;
    }) =>
      `${x.mean ?? "INDISPONIBLE"} ; n=${x.n} ; IC95=${x.ci95 ? JSON.stringify(x.ci95) : "INDISPONIBLE (" + (x.reason ?? "non calculable") + ")"}`;
    for (const v of reports) {
      lines.push(
        `## ${v.variantId}`,
        JSON.stringify(v.provenance),
        `Hypothèses : ${JSON.stringify(v.assumptions)}`,
      );
      for (const t of v.tableSummaries)
        lines.push(
          `- ${t.name} (${t.policyVersions.join(", ")}) : survie ${estimate(t.survival)} ; pertes ${estimate(t.treesLost)} ; défaite ${estimate(t.defeat)}`,
        );
      for (const c of v.comparisons)
        lines.push(
          `- Survie ${c.left} − ${c.right} : ${estimate(c.estimate)} ; apparié=${c.estimate.paired}`,
        );
      lines.push(
        `Profils sans mesure : ${v.unavailableProfiles.join(", ")}`,
        `Méthodes : Hoeffding borné et Wilson ; intervalles marginaux non ajustés.`,
        ...v.limitations,
      );
    }
    if (record.scientificPartial?.length)
      lines.push(
        "## Tables partielles (pas de classement)",
        ...record.scientificPartial.map(
          (t) => `${t.name}: n=${t.n}, survie=${estimate(t.survival)}`,
        ),
      );
    return lines.join("\n\n");
  }

  const historicalNotice =
    "**HISTORICAL_V33 — résultats historiques ; RNG partagé, gains non causaux, absence de véritable Shapley et de borne optimale certifiée.**\n\n";
  let text =
    historicalNotice +
    (record.status !== "COMPLETED" || record.orchestration?.partial
      ? "**BILAN PARTIEL — résultats non exhaustifs**\n\n"
      : "") +
    generateCampaignMarkdownReport(record);
  if (record.partialResults) {
    text +=
      "\n\n## Résultats partiels durables (sans classement de variante)\n";
    for (const t of record.partialResults.tableSummaries)
      text += `\n- ${t.tableConfigName} : ${t.gamesCount} parties, survie moyenne ${t.meanSurvivalRateHorizon}, écart-type ${t.stdDevSurvivalRateHorizon}.`;
  }
  return text;
}

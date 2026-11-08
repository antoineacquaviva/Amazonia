import { generateCampaignMarkdownReport } from "./sim/evaluator";
import type { ManagedRecord } from "./server/campaignManager";
export function campaignReport(record: ManagedRecord) {
  let text =
    (record.status !== "COMPLETED" || record.orchestration?.partial
      ? "**BILAN PARTIEL — résultats non exhaustifs**\n\n"
      : "") + generateCampaignMarkdownReport(record);
  if (record.partialResults) {
    text +=
      "\n\n## Résultats partiels durables (sans classement de variante)\n";
    for (const t of record.partialResults.tableSummaries)
      text += `\n- ${t.tableConfigName} : ${t.gamesCount} parties, survie moyenne ${t.meanSurvivalRateHorizon}, écart-type ${t.stdDevSurvivalRateHorizon}.`;
  }
  return text;
}

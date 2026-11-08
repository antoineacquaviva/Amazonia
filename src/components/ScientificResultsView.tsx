import { SCIENTIFIC_PILOT_NOTICE } from "../scientific/pilotNotice";
import React from "react";
import type { CampaignRecord } from "../sim/types";
import type { ManagedRecord } from "../server/campaignManager";
import type { Estimate } from "../scientific/statistics";
import { downloadCampaignJson, downloadCampaignMarkdown } from "../api";
export function ScientificResultsView({
  campaign,
  campaigns,
  onSelect,
  onControl,
  onDelete,
}: {
  campaign: ManagedRecord;
  campaigns: CampaignRecord[];
  onSelect: (id: string) => void;
  onControl: (id: string, action: "pause" | "resume" | "stop") => void;
  onDelete: (id: string) => void;
}) {
  const estimate = (e: Estimate) =>
    e.mean === null
      ? "Indisponible"
      : `${e.mean.toFixed(4)} ; σ=${e.sampleSd?.toFixed(4) ?? "indisponible"} ; SE=${e.standardError?.toFixed(4) ?? "indisponible"} ; IC95=${e.ci95 ? e.ci95.map((x) => x.toFixed(4)).join(" à ") : "indisponible — " + (e.reason ?? "non calculable")}`;
  return (
    <section
      aria-label="Résultats scientifiques"
      className="p-4 border rounded space-y-4"
    >
      <h2>SCIENTIFIC_V1 — comparaisons descriptives de politiques</h2>
      <p role="note">{SCIENTIFIC_PILOT_NOTICE}</p>
      <p>
        Politiques pilotes à deux poses, sans révision. Les intervalles sont
        marginaux, non ajustés pour comparaisons multiples. Le contrôle
        privilégié est une heuristique.
      </p>
      <label>
        Campagne{" "}
        <select value={campaign.id} onChange={(e) => onSelect(e.target.value)}>
          {campaigns.map((c) => (
            <option key={c.id} value={c.id}>
              {c.config.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-3">
        {campaign.status === "RUNNING" && (
          <button onClick={() => onControl(campaign.id, "pause")}>Pause</button>
        )}
        {(campaign.status === "PAUSED" || campaign.status === "ERROR") && (
          <button onClick={() => onControl(campaign.id, "resume")}>
            Reprendre
          </button>
        )}
        {["RUNNING", "PAUSED", "ERROR"].includes(campaign.status) && (
          <button onClick={() => onControl(campaign.id, "stop")}>
            Arrêter
          </button>
        )}
        <button onClick={() => downloadCampaignMarkdown(campaign)}>
          Exporter Markdown
        </button>
        <button onClick={() => downloadCampaignJson(campaign)}>
          Exporter JSON
        </button>
        <button onClick={() => onDelete(campaign.id)}>Supprimer</button>
      </div>
      {!campaign.scientificResults?.length && (
        <p>
          Aucune variante entièrement validée.{" "}
          {campaign.progress.completedGames} parties enregistrées durablement.
        </p>
      )}
      {campaign.scientificResults?.map((v) => (
        <article key={v.variantId} className="space-y-2">
          <h3>{v.variantLabel}</h3>
          <p>
            Analyse {v.assumptions.analysis} ; indépendance déclarée :{" "}
            {String(v.assumptions.independentGames)} ; effectif fixé déclaré :{" "}
            {String(v.assumptions.fixedSampleSize)}
          </p>
          <table>
            <thead>
              <tr>
                <th>Équipe / versions</th>
                <th>n</th>
                <th>Survie, ratio</th>
                <th>Pertes, arbres</th>
                <th>Fréquence de défaite</th>
              </tr>
            </thead>
            <tbody>
              {v.tableSummaries.map((t) => (
                <tr key={t.tableId}>
                  <td>
                    {t.name} : {t.policyVersions.join(", ")}
                  </td>
                  <td>{t.n}</td>
                  <td>{estimate(t.survival)}</td>
                  <td>{estimate(t.treesLost)}</td>
                  <td>{estimate(t.defeat)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {v.comparisons.map((c) => (
            <p key={c.left}>
              {c.left} − {c.right} : {estimate(c.estimate)} ; n={c.estimate.n} ;
              appariement vérifié : {String(c.estimate.paired)}
            </p>
          ))}
          {v.selectedProfiles && v.unselectedProfiles ? (
            <div>
              <p>
                Politiques implémentées et sélectionnées :{" "}
                {v.selectedProfiles.join(", ") || "aucune"}
              </p>
              <p>
                Politiques implémentées mais non sélectionnées :{" "}
                {v.unselectedProfiles.join(", ") || "aucune"}
              </p>
              <p>
                Politiques scientifiques indisponibles :{" "}
                {v.unavailableProfiles.join(", ") || "aucune"}
              </p>
            </div>
          ) : (
            <p>
              Rapport antérieur : classification des politiques non renseignée.
            </p>
          )}
        </article>
      ))}
      {!!campaign.scientificPartial?.length && (
        <div>
          <h3>Tables durables partielles</h3>
          {campaign.scientificPartial.map((t) => (
            <p key={t.tableId}>
              {t.name} : n={t.n} ; survie {estimate(t.survival)}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

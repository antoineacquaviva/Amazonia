import type { StudyManager } from "./manager";
import { digest } from "../scientific/random";
import { meanEstimate } from "../scientific/statistics";
import { FAMILIES } from "./types";
import type { Program } from "./program";
import type { V4Config } from "../v4/types";

export function variant(c: V4Config) {
  return [c.eyeMode, c.stealthCapacity, c.sabotageMode].join("/");
}
export function describe(c: V4Config) {
  return [
    c.eyeMode === "ONE_STEP"
      ? "Les joueurs découverts avancent d’un rang."
      : "Les joueurs découverts passent en tête.",
    c.stealthCapacity === "SINGLE"
      ? "Une case furtive accueille un seul défenseur."
      : "Plusieurs défenseurs peuvent partager une case furtive.",
    c.sabotageMode === "ONE_MACHINE"
      ? "Le sabotage vise une machine."
      : "Le sabotage peut viser les deux machines.",
  ].join(" ");
}
export interface Recommendation {
  programId: string;
  variant: string;
  rationale: string;
  alternatives: string;
  limits: string;
}
export function saveRecommendation(
  m: StudyManager,
  p: Program,
  data: Recommendation,
) {
  if (
    p.status !== "COMPLETED" ||
    data?.programId !== p.id ||
    !p.parts[0].plan.configs.some((c) => variant(c) === data.variant) ||
    ![data.rationale, data.alternatives, data.limits].every(
      (v) => typeof v === "string" && v.trim().length && v.length <= 8000,
    )
  )
    throw new Error(
      "Proposition incompatible avec cette campagne terminée. Vérifier l’identifiant, la variante et les trois textes du bilan.",
    );
  const rec = {
    programId: p.id,
    variant: data.variant,
    rationale: data.rationale,
    alternatives: data.alternatives,
    limits: data.limits,
  };
  m.store.db
    .prepare(
      "INSERT INTO v4_proposals VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    )
    .run(p.id, JSON.stringify(rec));
}
export function programReport(m: StudyManager, p: Program) {
  const cells = new Map<
    string,
    {
      config: V4Config;
      family: string;
      planned: number;
      observed: number;
      lossSum: number;
      regenerated: number;
      revisions: number;
      pivotal: number;
      violations: number;
      witness?: { study: string; index: number };
    }
  >();
  const units = new Map<string, Map<string, number>>();
  const groups = m.store.db.prepare(
    "SELECT config,family,pair,loss,regenerated,revisions,pivotal,job FROM v4_program_units WHERE study=? ORDER BY job",
  );
  for (const part of p.parts) {
    for (const config of part.plan.configs)
      for (const family of FAMILIES) {
        const key = digest(config) + family;
        if (!cells.has(key))
          cells.set(key, {
            config,
            family,
            planned: 0,
            observed: 0,
            lossSum: 0,
            regenerated: 0,
            revisions: 0,
            pivotal: 0,
            violations: 0,
          });
        cells.get(key)!.planned += part.plan.seeds.length;
      }
    for (const row of groups.all(part.id)) {
      const cell = cells.get(String(row.config) + String(row.family))!;
      const key = String(row.config) + String(row.family);
      if (!units.has(key)) units.set(key, new Map());
      units.get(key)!.set(String(row.pair), Number(row.loss));
      cell.observed++;
      cell.lossSum += Number(row.loss);
      cell.regenerated += Number(row.regenerated);
      cell.revisions += Number(row.revisions);
      cell.pivotal += Number(row.pivotal);

      cell.witness ??= { study: part.id, index: Number(row.job) };
    }
  }
  const proposal = m.store.db
    .prepare("SELECT body FROM v4_proposals WHERE id=?")
    .get(p.id);
  return {
    recommendation: proposal
      ? (JSON.parse(String(proposal.body)) as Recommendation)
      : null,
    format: "AMAZONIA_PROGRAMME_1",
    program: m.programSummary(p),
    manifest: p,
    interpretation:
      "Effectifs fixes. Comparer dans chaque table et famille. Le contrôle omniscient utilise des informations privilégiées. Les pertes moyennes sont descriptives. Distinguer faits, hypothèses, compromis et recommandation sur les quatre axes.",
    analysisRequest:
      "Proposer une variante principale et des alternatives si les données le permettent. Citer cellules, limites, incertitudes et tests humains. Pour relire la proposition dans Amazonia, fournir un JSON avec programId, variant (identifiant exact), rationale, limits et alternatives (textes).",
    rules: p.provenance.rulesVersion,
    provenance: p.provenance,
    cells: Array.from(cells.entries(), ([key, c]) => {
      const own = units.get(key) ?? new Map<string, number>();
      const solo = units.get(digest(c.config) + "SOLO_INFORMED");
      const stock =
        c.config.numPlayers *
        c.config.trackLength *
        c.config.initialTreesPerCell;
      const complete = p.status === "COMPLETED" && own.size === c.planned;
      const assumptions = {
        independentGames: true,
        fixedSampleSize: true,
        analysis: "EXPLORATORY" as const,
      };
      const delta = Array.from(own, ([pair, loss]) =>
        solo?.has(pair) ? solo.get(pair)! - loss : null,
      );
      return {
        ...c,
        variant: variant(c.config),
        rules: describe(c.config),
        lossEstimate: meanEstimate(
          [...own.values()],
          [0, stock],
          assumptions,
          complete,
        ),
        gainAgainstSolo:
          c.family === "SOLO_INFORMED"
            ? null
            : meanEstimate(
                delta,
                [-stock, stock],
                assumptions,
                complete && solo?.size === c.planned,
              ),
        meanLoss: c.observed ? c.lossSum / c.observed : null,
        missing: c.planned - c.observed,
        reason: c.observed === c.planned ? null : p.reason || p.status,
      };
    }),
  };
}

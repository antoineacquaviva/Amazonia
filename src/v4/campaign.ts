import { validateSeed, validateV4Config } from "./config";
import type { V4Config, GameResult, Provenance } from "./types";
export interface CampaignInput {
  config: V4Config;
  seeds: number[];
  allVariants: boolean;
}
export interface V4Campaign {
  id: string;
  rulesVersion: V4Config["rulesVersion"];
  input: CampaignInput;
  configs: V4Config[];
  provenance: Provenance;
  status: "RUNNING" | "COMPLETED" | "ERROR";
  completed: number;
  total: number;
  createdAt: string;
  finishedAt?: string;
  error?: string;
  results: GameResult[];
}
export function campaignInput(raw: unknown): CampaignInput {
  if (
    !raw ||
    typeof raw !== "object" ||
    Array.isArray(raw) ||
    Object.keys(raw).some(
      (k) => !["config", "seeds", "allVariants"].includes(k),
    )
  )
    throw new Error("Requête V4 invalide");
  const i = raw as CampaignInput,
    config = validateV4Config(i.config);
  if (
    typeof i.allVariants !== "boolean" ||
    !Array.isArray(i.seeds) ||
    !i.seeds.length ||
    i.seeds.length * (i.allVariants ? 8 : 1) > 64 ||
    new Set(i.seeds).size !== i.seeds.length
  )
    throw new Error(
      "1 à 64 parties, graines distinctes ; 8 graines maximum pour les huit variantes",
    );
  i.seeds.forEach(validateSeed);
  return { config, seeds: [...i.seeds], allVariants: i.allVariants };
}
export function variantConfigs(i: CampaignInput): V4Config[] {
  if (!i.allVariants) return [structuredClone(i.config)];
  return (["ONE_STEP", "FULL_CAPTURE"] as const).flatMap((eyeMode) =>
    (["SINGLE", "MULTIPLE"] as const).flatMap((stealthCapacity) =>
      (["ONE_MACHINE", "BOTH_MACHINES"] as const).map((sabotageMode) => ({
        ...structuredClone(i.config),
        eyeMode,
        stealthCapacity,
        sabotageMode,
      })),
    ),
  );
}
export function v4Report(c: V4Campaign): string {
  const lines = [
    `# Démonstration Amazonia ${c.rulesVersion}`,
    `Statut : ${c.status} ; ${c.completed}/${c.total} parties.`,
    `Graines communes : ${c.input.seeds.join(", ")}.`,
    `Ordre initial : ${c.input.config.initialEyeOrder.map((p) => `J${p + 1}`).join("–")}.`,
    `Code : ${c.provenance.commit}, modifié : ${c.provenance.dirty}, SHA256 : ${c.provenance.sourceSha256}.`,
    `Bots : ${c.provenance.botVersion} ; observation : ${c.provenance.observationVersion} ; aucun profil privilégié.`,
    `Paramètres effectifs : ${JSON.stringify(c.input.config)}`,
    "",
    "| Œil | Furtivité | Sabotage | n | Arbres debout moyens après régénération | Pertes écologiques moyennes |",
    "|---|---|---|---:|---:|---:|",
  ];
  for (const config of c.configs) {
    const r = c.results.filter(
      (r) =>
        r.config.eyeMode === config.eyeMode &&
        r.config.stealthCapacity === config.stealthCapacity &&
        r.config.sabotageMode === config.sabotageMode,
    );
    const avg = (k: "finalStanding" | "ecologicalLoss") =>
      r.length ? (r.reduce((n, g) => n + g[k], 0) / r.length).toFixed(3) : "—";
    lines.push(
      `| ${config.eyeMode} | ${config.stealthCapacity} | ${config.sabotageMode} | ${r.length} | ${avg("finalStanding")} | ${avg("ecologicalLoss")} |`,
    );
  }
  lines.push(
    "",
    "Essai exploratoire borné, sans conclusion d’équilibrage ni seuil de victoire V4.",
    "Le JSON contient chaque résultat, ses paramètres, sa graine et sa provenance ; la première partie de chaque variante contient la trace complète.",
    "Conservation serveur en mémoire seulement : exporter avant redémarrage. Aucun historique V3.3 relu comme V4.",
  );
  if (c.error) lines.push(`Erreur : ${c.error}`);
  return lines.join("\n");
}

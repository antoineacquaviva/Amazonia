import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { digest } from "../scientific/random";
import { validateV4Config, validateSeed } from "../v4/config";
import { RULES_VERSION } from "../v4/types";
import {
  FAMILIES,
  PROTOCOL,
  OBSERVATION,
  NEGOTIATION,
  RANDOM,
  POLICY_VERSIONS,
  type Plan,
  type Provenance,
  type Job,
} from "./types";
export function validatePlan(raw: unknown, maxGames = 20000): Plan {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("Plan V4 scientifique requis");
  const p = raw as Plan,
    keys = [
      "protocol",
      "name",
      "configs",
      "families",
      "seeds",
      "experimentSeed",
      "environmentSeed",
      "policySeed",
      "independentGames",
    ];
  if (
    Object.keys(p).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in p)) ||
    p.protocol !== PROTOCOL
  )
    throw new Error("Protocole ou champs du plan non pris en charge");
  if (
    typeof p.name !== "string" ||
    p.name.length < 1 ||
    p.name.length > 200 ||
    typeof p.independentGames !== "boolean"
  )
    throw new Error("Nom et hypothèses explicites requis");
  if (
    !Array.isArray(p.configs) ||
    p.configs.length < 1 ||
    p.configs.length > 16
  )
    throw new Error("Sélection ciblée de 1 à 16 configurations requise");
  p.configs.forEach(validateV4Config);
  if (new Set(p.configs.map(digest)).size !== p.configs.length)
    throw new Error("Configurations dupliquées");
  if (
    !Array.isArray(p.families) ||
    !p.families.length ||
    p.families.some((f) => !FAMILIES.includes(f)) ||
    new Set(p.families).size !== p.families.length
  )
    throw new Error(
      "Familles V4 distinctes requises ; équipes homogènes uniquement",
    );
  if (
    !Array.isArray(p.seeds) ||
    !p.seeds.length ||
    p.seeds.length > 1000 ||
    new Set(p.seeds).size !== p.seeds.length ||
    p.seeds.length * p.families.length * p.configs.length > maxGames
  )
    throw new Error(`Effectif fixe hors budget (${maxGames} parties maximum)`);
  p.seeds.forEach(validateSeed);
  for (const k of ["experimentSeed", "environmentSeed", "policySeed"] as const)
    validateSeed(p[k]);
  return structuredClone(p);
}
export function totalJobs(p: Plan) {
  return p.configs.length * p.families.length * p.seeds.length;
}
export function jobAt(p: Plan, index: number): Job {
  const perConfig = p.families.length * p.seeds.length,
    configIndex = Math.floor(index / perConfig),
    family = p.families[Math.floor(index / p.seeds.length) % p.families.length],
    seed = p.seeds[index % p.seeds.length];
  if (index < 0 || index >= totalJobs(p)) throw new Error("Curseur hors plan");
  return { configIndex, family, seed, trace: index % p.seeds.length === 0 };
}
export const DOCUMENT_FILES = [
  "design/VISION.md",
  "design/Amazonia_v4_specification_regles.md",
  "design/V4_DECISIONS.md",
  "docs/V4_SCIENTIFIC.md",
  "docs/V4_MEASURES.md",
];
export function documentSnapshots() {
  return Object.fromEntries(
    DOCUMENT_FILES.map((file) => {
      const text = fs.readFileSync(
        new URL("../../" + file, import.meta.url),
        "utf8",
      );
      return [file, { sha256: digest(text), text }];
    }),
  );
}
export function provenance(): Provenance {
  const root = new URL("../../", import.meta.url),
    files = [
      "src/v4/engine.ts",
      "src/v4/types.ts",
      "src/v4/config.ts",
      "src/v4/policies.ts",
      "src/v4/observations.ts",
      "src/sim/i18n.ts",
      "src/sim/rng.ts",
      "src/scientific/random.ts",
      "src/scientific/statistics.ts",
      "src/server/workerPool.ts",
      "src/server/simWorker.ts",
      "src/server/durableStore.ts",
      "src/v4science/types.ts",
      "src/v4science/protocol.ts",
      "src/v4science/observations.ts",
      "src/v4science/policies.ts",
      "src/v4science/runner.ts",
      "src/v4science/measures.ts",
      "src/v4science/statistics.ts",
      "src/v4science/program.ts",
      "src/v4science/programReport.ts",
      "src/v4science/diagnostics.ts",
      "src/v4science/manager.ts",
      "src/v4science/routes.ts",
      "src/v4science/backup.ts",
      "src/v4science/privateAccess.ts",
      "server.ts",
      "src/components/V4ScienceView.tsx",
      "scripts/v4-private-server.ts",
      "scripts/oracle-v4-install.sh",
      "scripts/oracle-v4-control.sh",
      "package.json",
      "package-lock.json",
    ];
  const sourceFiles = Object.fromEntries(
    files.map((f) => [f, digest(fs.readFileSync(new URL(f, root), "utf8"))]),
  );
  let commit = "UNAVAILABLE",
    dirty = true;
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    dirty = !!execFileSync("git", ["status", "--porcelain", "--", ...files], {
      cwd: root,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    const file = new URL(".release.json", root);
    if (fs.existsSync(file)) {
      const release = JSON.parse(fs.readFileSync(file, "utf8"));
      if (release.sourceHash !== digest(sourceFiles))
        throw new Error("Sources différentes de la release figée");
      commit = release.commit;
      dirty = false;
    }
  }
  return {
    protocol: PROTOCOL,
    rulesVersion: RULES_VERSION,
    observation: OBSERVATION,
    negotiation: NEGOTIATION,
    random: RANDOM,
    policyVersions: { ...POLICY_VERSIONS },
    sourceHash: digest(sourceFiles),
    sourceFiles,
    commit,
    dirty,
    runtime: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
    },
  };
}
export function compatible(a: Provenance, b: Provenance) {
  const { commit: ac, dirty: ad, ...x } = a,
    { commit: bc, dirty: bd, ...y } = b;
  return digest(x) === digest(y);
}

import fs from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { StudyManager } from "../src/v4science/manager";
import { DEFAULT_V4_CONFIG } from "../src/v4/types";
import { PROTOCOL, FAMILIES, type Plan } from "../src/v4science/types";
import { markdownReport } from "../src/v4science/statistics";
const out = process.argv[2];
if (!out || !path.isAbsolute(out))
  throw new Error(
    "Usage : tsx scripts/v4-study-pilot.ts /nouveau/dossier/absolu [--smoke-only]",
  );
fs.mkdirSync(out, { mode: 0o700 });
const m = new StudyManager({
  root: path.join(out, "checkpoint"),
  batchSize: 2,
  maxGames: 2000,
});
const configs = (["ONE_STEP", "FULL_CAPTURE"] as const).flatMap((eyeMode) =>
  (["SINGLE", "MULTIPLE"] as const).flatMap((stealthCapacity) =>
    (["ONE_MACHINE", "BOTH_MACHINES"] as const).map((sabotageMode) => ({
      ...structuredClone(DEFAULT_V4_CONFIG),
      eyeMode,
      stealthCapacity,
      sabotageMode,
    })),
  ),
);
const base: Plan = {
  protocol: PROTOCOL,
  name: "V4 sept profils / huit variantes",
  configs,
  families: [...FAMILIES],
  seeds: [51001],
  experimentSeed: 71,
  environmentSeed: 73,
  policySeed: 79,
  independentGames: true,
};
async function execute(plan: Plan, label: string) {
  const begun = performance.now(),
    s = m.start(plan);
  while (m.get(s.id).status === "RUNNING") {
    await new Promise((r) => setTimeout(r, 100));
    if (performance.now() - begun > 300000) {
      m.control(s.id, "pause");
      throw new Error(
        "Budget temporel de recette dépassé : campagne suspendue, checkpoint conservé",
      );
    }
  }
  const study = m.get(s.id);
  if (study.status !== "COMPLETED")
    throw new Error(study.lastError ?? study.reason);
  const report = m.report(study.id);
  const metadata = {
    format: "V4_AUTONOMOUS_ARCHIVE_1",
    study,
    report,
    samples: [...m.allSamples(study.id)],
  };
  fs.writeFileSync(path.join(out, label + ".json"), JSON.stringify(metadata), {
    flag: "wx",
    mode: 0o600,
  });
  fs.writeFileSync(
    path.join(out, label + ".md"),
    markdownReport(study, report),
    { flag: "wx", mode: 0o600 },
  );
  return {
    label,
    id: s.id,
    total: study.total,
    elapsedMs: performance.now() - begun,
    msPerGame: (performance.now() - begun) / study.total,
  };
}
try {
  const smoke = await execute(base, "reduced-56");
  console.log(JSON.stringify(smoke));
  const executions = [smoke];
  if (!process.argv.includes("--smoke-only")) {
    // Cost alone determines the next fixed plan, never observed game scores or significance.
    const n = smoke.msPerGame < 500 ? 4 : 2;
    const fixed = {
      ...base,
      name: `Pilote V4 fixé à ${n} unités par cellule après coût réduit`,
      seeds: Array.from({ length: n }, (_, i) => 61001 + i),
    };
    fs.writeFileSync(
      path.join(out, "pilot-plan.json"),
      JSON.stringify(fixed, null, 2),
      { flag: "wx", mode: 0o600 },
    );
    const pilot = await execute(fixed, "pilot");
    executions.push(pilot);
    console.log(JSON.stringify(pilot));
  }
  fs.writeFileSync(
    path.join(out, "execution.json"),
    JSON.stringify(
      {
        executions,
        provenance: m.current,
        warning:
          "Essais exploratoires bornés ; aucune conclusion d’équilibrage ni classement certain",
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
} finally {
  await m.close();
}

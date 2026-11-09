import fs from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  BOT_VERSION,
  OBS_VERSION,
  RULES_VERSION,
  type Provenance,
} from "./types";
export function v4Provenance(): Provenance {
  const root = new URL("../../", import.meta.url);
  const files = [
    "src/v4/types.ts",
    "src/v4/config.ts",
    "src/v4/engine.ts",
    "src/v4/observations.ts",
    "src/v4/policies.ts",
    "src/v4/provenance.ts",
    "src/v4/campaign.ts",
    "src/sim/i18n.ts",
    "src/sim/rng.ts",
    "src/server/simWorker.ts",
    "src/server/workerPool.ts",
    "src/server/campaignManager.ts",
    "src/server/v4Routes.ts",
    "server.ts",
    "package.json",
    "src/components/V4View.tsx",
    "src/App.tsx",
    "src/server/apiSecurity.ts",
    "scripts/v4-demo.ts",
    "scripts/v4-dev.ts",
  ];
  const hash = createHash("sha256");
  for (const f of files) {
    hash.update(f);
    hash.update(fs.readFileSync(new URL(f, root)));
  }
  const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root })
    .toString()
    .trim();
  const dirty =
    execFileSync("git", ["status", "--porcelain", "--", ...files], {
      cwd: root,
    })
      .toString()
      .trim().length > 0;
  return {
    commit,
    dirty,
    sourceSha256: hash.digest("hex"),
    node: process.version,
    rulesVersion: RULES_VERSION,
    botVersion: BOT_VERSION,
    observationVersion: OBS_VERSION,
  };
}

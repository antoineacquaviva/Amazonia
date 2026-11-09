/** Exercises the real HTTP -> shared worker -> results -> export path. No Oracle access. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { DEFAULT_V4_CONFIG as config } from "../src/v4/types";
import { runV4 } from "../src/v4/engine";
import type { V4Campaign } from "../src/v4/campaign";
const out = process.argv[2];
if (!out || !path.isAbsolute(out))
  throw new Error(
    "Usage : npm run demo:v4 -- /chemin/absolu/resultats-nouveaux",
  );
// Exclusive creation prevents overwriting a previous run or a phase P export.
fs.mkdirSync(out, { recursive: false });
const isolated = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-demo-"));
const manager = new CampaignManager({
  campaignsDir: isolated,
  createReference: false,
  pool: { workers: 1, queue: 2 },
});
const { app } = await createApp({ manager, web: false, authorize: () => true });
const server = app.listen(0, "127.0.0.1");
await new Promise<void>((r) => server.once("listening", r));
try {
  const start = performance.now();
  runV4(config, 42001, false);
  const pilotMs = performance.now() - start;
  // Small exploratory sample, selected by measured pilot cost, never an adaptive stopping rule.
  const sample = pilotMs < 1000 ? 8 : 2,
    seeds = Array.from({ length: sample }, (_, i) => 42001 + i);
  const endpoint = `http://127.0.0.1:${(server.address() as any).port}/api/v4/campaigns`;
  const request = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ config, seeds, allVariants: true }),
  });
  if (request.status !== 202) throw new Error(await request.text());
  let c = (await request.json()) as V4Campaign;
  const campaignStart = performance.now();
  while (c.status === "RUNNING") {
    if (performance.now() - campaignStart > 120000)
      throw new Error("Démonstration bornée : délai 120 s dépassé");
    await new Promise((r) => setTimeout(r, 100));
    c = await (await fetch(`${endpoint}/${c.id}`)).json();
  }
  if (c.status !== "COMPLETED") throw new Error(c.error);
  for (const [format, name] of [
    ["json", "results.json"],
    ["markdown", "report.md"],
  ]) {
    const response = await fetch(`${endpoint}/${c.id}/export/${format}`);
    if (!response.ok) throw new Error("Export impossible");
    fs.writeFileSync(path.join(out, name), await response.text(), {
      flag: "wx",
    });
  }
  fs.writeFileSync(
    path.join(out, "execution.json"),
    JSON.stringify(
      {
        pilotMs,
        samplePerVariant: sample,
        total: c.total,
        campaignMs: performance.now() - campaignStart,
        requestPath: "/api/v4/campaigns",
        storage: "isolated temporary directory",
        completed: c.completed,
        provenance: c.provenance,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: out,
      pilotMs,
      samplePerVariant: sample,
      completed: c.completed,
      total: c.total,
      campaignMs: performance.now() - campaignStart,
    }),
  );
} finally {
  await new Promise<void>((r) => server.close(() => r()));
  await manager.close();
  fs.rmSync(isolated, { recursive: true, force: true });
}

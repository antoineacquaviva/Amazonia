import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { DEFAULT_V4_CONFIG as config } from "../src/v4/types";
import { runV4 } from "../src/v4/engine";
import type { V4Campaign } from "../src/v4/campaign";
async function isolated(
  fn: (base: string, m: CampaignManager) => Promise<void>,
  authorize?: () => boolean,
) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-api-"));
  const m = new CampaignManager({
    campaignsDir: dir,
    createReference: false,
    pool: { workers: 1, queue: 2 },
  });
  const { app } = await createApp({ manager: m, web: false, authorize });
  const s = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => s.once("listening", resolve));
  try {
    await fn(`http://127.0.0.1:${(s.address() as any).port}`, m);
  } finally {
    await new Promise<void>((r) => s.close(() => r()));
    await m.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const post = (body: unknown) => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
test("V4 routes inherit authentication on root and alias", () =>
  isolated(async (base) => {
    for (const prefix of ["/api", "/sim/api"]) {
      assert.equal((await fetch(base + prefix + "/v4/campaigns")).status, 503);
      assert.equal(
        (
          await fetch(
            base + prefix + "/v4/campaigns",
            post({ config, seeds: [1], allVariants: false }),
          )
        ).status,
        503,
      );
    }
  }));
test("V4 API rejects unsafe configs, runs eight paired variants in workers, exports real results without touching V33 campaigns", () =>
  isolated(
    async (base, m) => {
      const endpoint = base + "/api/v4/campaigns";
      for (const body of [
        {
          config: { ...config, trackLength: 8 },
          seeds: [1],
          allVariants: false,
        },
        { config, seeds: [0], allVariants: false },
        { config, seeds: [1, 1], allVariants: false },
        {
          config,
          seeds: Array.from({ length: 9 }, (_, i) => i + 1),
          allVariants: true,
        },
        {
          config: { ...config, repairRule: "invented" },
          seeds: [1],
          allVariants: false,
        },
      ])
        assert.equal((await fetch(endpoint, post(body))).status, 400);
      assert.equal(m.listCampaigns().length, 0);
      const r = await fetch(
        endpoint,
        post({ config, seeds: [42001], allVariants: true }),
      );
      assert.equal(r.status, 202);
      let c = (await r.json()) as V4Campaign;
      assert.equal(
        (
          await fetch(
            endpoint,
            post({ config, seeds: [42002], allVariants: false }),
          )
        ).status,
        409,
      );
      assert.equal(
        (await fetch(`${endpoint}/${c.id}`, { method: "DELETE" })).status,
        409,
      );
      const end = Date.now() + 30000;
      while (c.status === "RUNNING") {
        assert(Date.now() < end, "worker timeout");
        await new Promise((r) => setTimeout(r, 25));
        c = await (await fetch(`${endpoint}/${c.id}`)).json();
      }
      assert.equal(c.status, "COMPLETED", c.error);
      assert.equal(c.completed, 8);
      assert.equal(c.results.length, 8);
      assert.equal(
        new Set(
          c.configs.map(
            (c) => `${c.eyeMode}/${c.stealthCapacity}/${c.sabotageMode}`,
          ),
        ).size,
        8,
      );
      for (const result of c.results) {
        assert.equal(result.seed, 42001);
        assert.equal(
          result.provenance!.sourceSha256,
          c.provenance.sourceSha256,
        );
        const { provenance, ...game } = result;
        assert.deepEqual(game, runV4(result.config, result.seed));
      }
      const md = await fetch(`${endpoint}/${c.id}/export/markdown`);
      assert.equal(md.status, 200);
      assert((await md.text()).includes("sans conclusion"));
      const json = await fetch(`${endpoint}/${c.id}/export/json`);
      assert.deepEqual(await json.json(), c);
      const alias = await fetch(base + `/sim/api/v4/campaigns/${c.id}`);
      assert.deepEqual(await alias.json(), c);
      assert.equal(m.listCampaigns().length, 0);
      assert.equal(
        (await fetch(`${endpoint}/${c.id}`, { method: "DELETE" })).status,
        200,
      );
      assert.equal((await fetch(`${endpoint}/${c.id}`)).status, 404);
    },
    () => true,
  ));

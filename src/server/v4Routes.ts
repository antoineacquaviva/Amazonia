import { Router } from "express";
import { randomUUID } from "node:crypto";
import {
  campaignInput,
  variantConfigs,
  v4Report,
  type V4Campaign,
} from "../v4/campaign";
import { v4Provenance } from "../v4/provenance";
import type { CampaignManager } from "./campaignManager";
/** Short, bounded experiments share the existing worker pool, but never the historical store. */
export function v4Routes(manager: CampaignManager) {
  const router = Router(),
    records = new Map<string, V4Campaign>();
  let active = false;
  router.get("/", (_req, res) =>
    res.json(
      [...records.values()].map(({ results, ...c }) => ({ ...c, results: [] })),
    ),
  );
  router.post("/", (req, res) => {
    let input: ReturnType<typeof campaignInput>;
    try {
      input = campaignInput(req.body);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
      return;
    }
    if (active || records.size >= 4) {
      res
        .status(409)
        .json({
          error:
            "Une campagne V4 active maximum, quatre conservées ; exporter puis supprimer une campagne terminée",
        });
      return;
    }
    const provenance = v4Provenance(),
      configs = variantConfigs(input);
    const record: V4Campaign = {
      id: randomUUID(),
      rulesVersion: input.config.rulesVersion,
      input,
      configs,
      provenance,
      status: "RUNNING",
      completed: 0,
      total: input.seeds.length * configs.length,
      createdAt: new Date().toISOString(),
      results: [],
    };
    records.set(record.id, record);
    active = true;
    res.status(202).json(record);
    void (async () => {
      try {
        for (const config of configs)
          for (let i = 0; i < input.seeds.length; i++) {
            const result = await manager.simulateV4({
              taskId: -2,
              type: "RUN_V4",
              config,
              seed: input.seeds[i],
              trace: i === 0,
              provenance,
            });
            record.results.push(result);
            record.completed++;
          }
        record.status = "COMPLETED";
      } catch (e) {
        record.status = "ERROR";
        record.error = (e as Error).message;
      } finally {
        record.finishedAt = new Date().toISOString();
        active = false;
      }
    })();
  });
  router.get("/:id", (req, res) => {
    const c = records.get(req.params.id);
    if (!c) {
      res
        .status(404)
        .json({ error: "Campagne V4 introuvable (mémoire de ce serveur)" });
      return;
    }
    res.json(c);
  });
  router.get("/:id/export/:format", (req, res) => {
    const c = records.get(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Campagne V4 introuvable" });
      return;
    }
    if (!["json", "markdown"].includes(req.params.format)) {
      res.status(400).json({ error: "Format non pris en charge" });
      return;
    }
    const json = req.params.format === "json";
    res
      .attachment(`amazonia-v4-${c.id}.${json ? "json" : "md"}`)
      .type(json ? "application/json" : "text/markdown")
      .send(json ? JSON.stringify(c, null, 2) : v4Report(c));
  });
  router.delete("/:id", (req, res) => {
    const c = records.get(req.params.id);
    if (!c) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    if (c.status === "RUNNING") {
      res.status(409).json({ error: "Campagne active" });
      return;
    }
    records.delete(c.id);
    res.json({ deleted: true });
  });
  return router;
}

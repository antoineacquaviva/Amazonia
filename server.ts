import { runScientificGame } from "./src/scientific/runner";
import type { ProtocolConfig } from "./src/scientific/protocol";
import { pathToFileURL } from "node:url";
import { validateCampaignId } from "./src/server/campaignStore";
import express from "express";
import path from "path";
import fs from "fs";
import { CampaignManager, TOTAL_CPU_CORES } from "./src/server/campaignManager";
import {
  CampaignConfig,
  SimulationConfig,
  BotProfileId,
} from "./src/sim/types";
import { runSingleGame } from "./src/sim/engine";
import { campaignReport } from "./src/campaignReport";
import { DEFAULT_SIMULATION_CONFIG, DEFAULT_SWEEP_INPUT } from "./src/sim/i18n";

export async function createApp(
  options: { manager?: CampaignManager; web?: boolean } = {},
) {
  const app = express();
  app.use(express.json({ limit: "20mb" }));

  const campaignManager = options.manager ?? new CampaignManager();
  const apiRouter = express.Router();

  apiRouter.param("id", (req, res, next, id) => {
    try {
      validateCampaignId(id);
      next();
    } catch {
      res.status(400).json({ error: "Identifiant de campagne invalide" });
    }
  });

  // Santé & Informations d'environnement (Serveur VM Oracle multi-cœurs)
  apiRouter.get("/health", (_req, res) => {
    const sys = campaignManager.getSystemTelemetry();
    res.json({
      status: "ok",
      version: "3.3.0-shapley-7bots",
      environment: process.env.NODE_ENV || "development",
      port: Number(process.env.PORT) || 3000,
      cpuCount: TOTAL_CPU_CORES,
      workersCount: sys.workersCount,
      busyWorkers: sys.busyWorkers,
      queuedTasks: sys.queuedTasks,
      cpuPercent: sys.cpuPercent,
      loadAvg1m: sys.loadAvg1m,
      rssMemoryMb: sys.rssMemoryMb,
      activeCampaigns: sys.activeCampaigns,
    });
  });

  // ============================================================================
  // CAMPAGNES & BANCS D'ESSAI MONTE-CARLO
  // ============================================================================
  apiRouter.get("/campaigns", (_req, res) => {
    res.json(campaignManager.listCampaigns());
  });

  apiRouter.get("/campaigns/:id", (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    res.json(record);
  });

  apiRouter.get(
    "/campaigns/:id/scientific-audits/:variant/:table",
    (req, res) => {
      const audit = campaignManager.getScientificAudit(
        req.params.id,
        Number(req.params.variant),
        req.params.table,
      );
      if (!audit) {
        res.status(404).json({ error: "Audit indisponible" });
        return;
      }
      res.json(audit);
    },
  );
  apiRouter.post("/campaigns", (req, res) => {
    try {
      const body = req.body as Partial<ProtocolConfig>;
      const id =
        body.id || `camp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const config: ProtocolConfig = {
        protocol: body.protocol,
        science: body.science,
        id,
        name:
          body.name || `Campagne du ${new Date().toLocaleDateString("fr-FR")}`,
        type: body.type || "MONTE_CARLO_SWEEP",
        createdAt: new Date().toISOString(),
        gamesPerVariantAndTable: Math.max(
          5,
          Number(body.gamesPerVariantAndTable) || 100,
        ),
        sweep: body.sweep || DEFAULT_SWEEP_INPUT,
        selectedTableConfigs: body.selectedTableConfigs || [],
        includeCalibrationTables:
          body.includeCalibrationTables !== undefined
            ? body.includeCalibrationTables
            : true,
        targetDurationSeconds: body.targetDurationSeconds ?? null,
        maxTotalGames: Number(body.maxTotalGames) || 50000,
        randomizeParametersInStress: Boolean(body.randomizeParametersInStress),
        baseSeed:
          Number(body.baseSeed) || Math.floor(Math.random() * 900000) + 10000,
      };

      const record = campaignManager.startCampaign(config);
      res.status(201).json(record);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Requête invalide" });
    }
  });

  apiRouter.post("/campaigns/:id/pause", (req, res) => {
    const record = campaignManager.pauseCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    res.json(record);
  });

  apiRouter.post("/campaigns/:id/resume", (req, res) => {
    const record = campaignManager.resumeCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    res.json(record);
  });

  apiRouter.post("/campaigns/:id/stop", (req, res) => {
    const record = campaignManager.stopCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    res.json(record);
  });

  apiRouter.delete("/campaigns/:id", (req, res) => {
    campaignManager.deleteCampaign(req.params.id);
    res.json({ deleted: true });
  });

  // Export Markdown structuré prêt pour Prompt IA
  apiRouter.get("/campaigns/:id/export/markdown", (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).send("Campagne introuvable");
      return;
    }
    const markdown = campaignReport(record);
    res.setHeader("Content-Type", "text/markdown; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bilan-ia-${record.id}.md"`,
    );
    res.send(markdown);
  });

  // Export JSON complet
  apiRouter.get("/campaigns/:id/export/json", (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Campagne introuvable" });
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bilan-complet-${record.id}.json"`,
    );
    res.send(JSON.stringify(record, null, 2));
  });

  // Génération à la demande d'une partie unitaire avec Combat Log complet
  apiRouter.post("/simulate-single", (req, res) => {
    try {
      const seed = Number(req.body.seed) || 42001;
      const params: SimulationConfig = {
        ...DEFAULT_SIMULATION_CONFIG,
        ...(req.body.params || {}),
      };
      const botProfiles: BotProfileId[] = req.body.botProfiles || [
        "COORD_HYBRID",
      ];

      if (
        req.body.protocol !== undefined &&
        !["HISTORICAL_V33", "SCIENTIFIC_V1"].includes(req.body.protocol)
      )
        throw new Error("Unknown protocol");
      const game =
        req.body.protocol === "SCIENTIFIC_V1"
          ? runScientificGame(
              params,
              botProfiles,
              seed,
              "custom_inspection",
              true,
              req.body.science,
            )
          : runSingleGame(params, botProfiles, seed, "custom_inspection", true);
      res.json(game);
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || "Erreur lors de la simulation unitaire",
      });
    }
  });

  app.use("/api", apiRouter);
  app.use("/:subpath/api", apiRouter);
  app.use(
    (
      err: Error,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => res.status(400).json({ error: err.message }),
  );

  if (options.web === false) {
    return { app, manager: campaignManager };
  }

  const isProd = process.env.NODE_ENV === "production";
  if (!isProd) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use("/:subpath", express.static(distPath));
      app.get("*", (_req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return { app, manager: campaignManager };
}

async function startServer() {
  const { app } = await createApp();
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "0.0.0.0", () =>
    console.log(`Serveur actif sur le port ${port}`),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void startServer();

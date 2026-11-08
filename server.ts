import { internalAuthorization } from "./src/server/internalAuthorization";
import { apiSecurity, type Authorize } from "./src/server/apiSecurity";
import { singleInput } from "./src/server/singleValidation";
import type { ProtocolConfig } from "./src/scientific/protocol";
import { pathToFileURL } from "node:url";
import { validateCampaignId } from "./src/server/campaignStore";
import express from "express";
import path from "path";
import fs from "fs";
import { CampaignManager, TOTAL_CPU_CORES } from "./src/server/campaignManager";
import { campaignReport } from "./src/campaignReport";
import { DEFAULT_SWEEP_INPUT } from "./src/sim/i18n";

export async function createApp(
  options: {
    manager?: CampaignManager;
    web?: boolean;
    authorize?: Authorize;
  } = {},
) {
  const app = express();
  app.disable("x-powered-by");
  const guard = apiSecurity(options.authorize);
  app.use(["/api", "/:subpath/api"], guard);
  app.use(express.json({ limit: "256kb", strict: true }));

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
      if (!body || typeof body !== "object" || Array.isArray(body))
        throw new Error("Corps invalide");
      for (const key of [
        "gamesPerVariantAndTable",
        "maxTotalGames",
        "baseSeed",
        "targetDurationSeconds",
      ] as const)
        if (
          body[key] != null &&
          (!Number.isSafeInteger(body[key]) || Number(body[key]) < 1)
        )
          throw new Error("Nombre invalide");
      for (const key of [
        "includeCalibrationTables",
        "randomizeParametersInStress",
      ] as const)
        if (body[key] !== undefined && typeof body[key] !== "boolean")
          throw new Error("Booléen invalide");
      for (const key of ["id", "name", "type"] as const)
        if (
          body[key] !== undefined &&
          (typeof body[key] !== "string" || !body[key])
        )
          throw new Error("Texte invalide");

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
        gamesPerVariantAndTable: body.gamesPerVariantAndTable ?? 100,
        sweep: body.sweep || DEFAULT_SWEEP_INPUT,
        selectedTableConfigs: body.selectedTableConfigs || [],
        includeCalibrationTables:
          body.includeCalibrationTables !== undefined
            ? body.includeCalibrationTables
            : true,
        targetDurationSeconds: body.targetDurationSeconds ?? null,
        maxTotalGames: body.maxTotalGames ?? 50000,
        randomizeParametersInStress: Boolean(body.randomizeParametersInStress),
        baseSeed: body.baseSeed ?? Math.floor(Math.random() * 900000) + 10000,
      };

      const record = campaignManager.startCampaign(config);
      res.status(201).json(record);
    } catch (err: any) {
      res.status(400).json({ error: "Requête invalide" });
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
  apiRouter.post("/simulate-single", async (req, res) => {
    let input;
    try {
      input = singleInput(req.body);
    } catch {
      res.status(400).json({ error: "Paramètres de simulation invalides" });
      return;
    }
    try {
      const game = await campaignManager.simulateSingle(input);
      const result = JSON.stringify(game);
      if (Buffer.byteLength(result) > 2 * 1024 * 1024) {
        res.status(413).json({ error: "Trace trop volumineuse" });
        return;
      }
      res.type("json").send(result);
    } catch {
      res
        .status(503)
        .json({ error: "Simulation indisponible ou ressources occupées" });
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
    ) =>
      res
        .status((err as any).type === "entity.too.large" ? 413 : 400)
        .json({ error: "Requête invalide" }),
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
      const staticFiles = express.static(distPath, {
        setHeaders: (res, file) => {
          if (file.endsWith(".html"))
            res.setHeader("Cache-Control", "no-store");
        },
      });
      app.use(staticFiles);
      app.use("/:subpath", staticFiles);
      app.get("*", (_req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.sendFile(path.join(distPath, "index.html"));
      });
    }
  }

  return { app, manager: campaignManager };
}

async function startServer() {
  const { app } = await createApp({authorize: internalAuthorization()});
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, "127.0.0.1", () =>
    console.log(`Serveur actif sur le port ${port}`),
  );
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void startServer();

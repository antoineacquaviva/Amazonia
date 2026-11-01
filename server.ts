import express from 'express';
import path from 'path';
import fs from 'fs';
import {
  CampaignManager,
  TOTAL_CPU_CORES,
  WORKER_POOL_SIZE,
} from './src/server/campaignManager';
import {
  CampaignConfig,
  GameParameters,
  BotProfileId,
  MechanicalSwitches,
  ThemeVocabularyMode,
} from './src/sim/types';
import { runSingleGame, runSideBySideComparison } from './src/sim/engine';
import { generateCampaignMarkdownReport } from './src/sim/evaluator';
import {
  BUILTIN_EDITIONS,
  DEFAULT_GAME_PARAMETERS,
  V1_SWITCHES,
} from './src/sim/i18n';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '20mb' }));

  const campaignManager = new CampaignManager();
  const apiRouter = express.Router();

  // Santé & Informations d'environnement (Portail Atelier Conception Jeu)
  apiRouter.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '2.0.0',
      environment: process.env.NODE_ENV || 'development',
      port: Number(process.env.PORT) || 3000,
      cpuCount: TOTAL_CPU_CORES,
      workersCount: WORKER_POOL_SIZE,
      activeCampaigns: campaignManager
        .listCampaigns()
        .filter((c) => c.status === 'RUNNING').length,
      editionsCount: campaignManager.listEditions().length,
      pinnedSeedsCount: campaignManager.listPinnedSeeds().length,
    });
  });

  // ============================================================================
  // NIVEAU 1 DU CONSERVATOIRE : ÉDITIONS & VARIANTES SAUVEGARDÉES
  // ============================================================================
  apiRouter.get('/editions', (_req, res) => {
    res.json(campaignManager.listEditions());
  });

  apiRouter.post('/editions', (req, res) => {
    try {
      const body = req.body;
      if (!body.name) {
        res.status(400).json({ error: 'Nom requis pour sauvegarder une édition' });
        return;
      }
      const switches: MechanicalSwitches = body.switches || {
        ruleNoTargetH1: body.params?.ruleNoTargetH1 || V1_SWITCHES.ruleNoTargetH1,
        ruleParryMode: body.params?.ruleParryMode || V1_SWITCHES.ruleParryMode,
        rulePreventiveDestruction:
          body.params?.rulePreventiveDestruction ||
          V1_SWITCHES.rulePreventiveDestruction,
        ruleBulldozerTargeting:
          body.params?.ruleBulldozerTargeting ||
          V1_SWITCHES.ruleBulldozerTargeting,
        ruleScrapyardExit:
          body.params?.ruleScrapyardExit || V1_SWITCHES.ruleScrapyardExit,
        ruleInitialSetup:
          body.params?.ruleInitialSetup || V1_SWITCHES.ruleInitialSetup,
      };
      const saved = campaignManager.saveEdition({
        id: body.id,
        name: body.name,
        version: body.version,
        description: body.description,
        switches,
        defaultParams: body.defaultParams || body.params,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erreur lors de la sauvegarde de l’édition' });
    }
  });

  apiRouter.delete('/editions/:id', (req, res) => {
    const ok = campaignManager.deleteEdition(req.params.id);
    if (!ok) {
      res.status(400).json({ error: 'Impossible de supprimer cette édition (intégrée ou introuvable)' });
      return;
    }
    res.json({ deleted: true });
  });

  // ============================================================================
  // NIVEAU 3 DU CONSERVATOIRE : GRAINES ÉPINGLÉES & REJEU CÔTE-À-CÔTE
  // ============================================================================
  apiRouter.get('/seeds', (_req, res) => {
    res.json(campaignManager.listPinnedSeeds());
  });

  apiRouter.post('/seeds', (req, res) => {
    try {
      const body = req.body;
      if (!body.seed) {
        res.status(400).json({ error: 'Numéro de graine (seed) requis' });
        return;
      }
      const saved = campaignManager.savePinnedSeed({
        id: body.id,
        seed: Number(body.seed),
        title: body.title || `Graine #${body.seed}`,
        reasonCategory: body.reasonCategory || 'USER_PINNED',
        description: body.description,
        campaignId: body.campaignId,
        defaultParamsA: body.defaultParamsA,
        defaultParamsB: body.defaultParamsB,
        editionAName: body.editionAName,
        editionBName: body.editionBName,
        botProfile: body.botProfile || 'COOPERATIVE',
        scoreANormalized: body.scoreANormalized,
        scoreBNormalized: body.scoreBNormalized,
      });
      res.status(201).json(saved);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Impossible d’épingler la graine' });
    }
  });

  apiRouter.delete('/seeds/:id', (req, res) => {
    campaignManager.deletePinnedSeed(req.params.id);
    res.json({ deleted: true });
  });

  // Rejeu comparatif côte-à-côte sur la même graine (Édition A vs Édition B)
  apiRouter.post('/compare-seed', (req, res) => {
    try {
      const seed = Number(req.body.seed) || 42001;
      const editionAId = req.body.editionAId || 'ed-v1-original';
      const editionBId = req.body.editionBId || 'ed-v2-refonte';
      const edA =
        campaignManager.getEdition(editionAId) || BUILTIN_EDITIONS[0];
      const edB =
        campaignManager.getEdition(editionBId) || BUILTIN_EDITIONS[1];

      const paramsA: GameParameters = req.body.paramsA
        ? { ...DEFAULT_GAME_PARAMETERS, ...req.body.paramsA }
        : { ...DEFAULT_GAME_PARAMETERS, ...edA.defaultParams, ...edA.switches };
      const paramsB: GameParameters = req.body.paramsB
        ? { ...DEFAULT_GAME_PARAMETERS, ...req.body.paramsB }
        : { ...DEFAULT_GAME_PARAMETERS, ...edB.defaultParams, ...edB.switches };

      const editionAName = req.body.editionAName || edA.name;
      const editionBName = req.body.editionBName || edB.name;
      const botProfile: BotProfileId = req.body.botProfile || 'COOPERATIVE';
      const vocabulary: ThemeVocabularyMode = req.body.vocabulary || 'AMAZONIA';

      const result = runSideBySideComparison(
        seed,
        paramsA,
        paramsB,
        editionAName,
        editionBName,
        botProfile,
        vocabulary
      );
      res.json(result);
    } catch (err: any) {
      res.status(400).json({
        error: err?.message || 'Erreur lors de la comparaison côte-à-côte',
      });
    }
  });

  // ============================================================================
  // NIVEAU 2 DU CONSERVATOIRE : CAMPAGNES & BANCS D'ESSAI
  // ============================================================================
  apiRouter.get('/campaigns', (_req, res) => {
    res.json(campaignManager.listCampaigns());
  });

  apiRouter.get('/campaigns/:id', (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.json(record);
  });

  apiRouter.post('/campaigns', (req, res) => {
    try {
      const body = req.body as Partial<CampaignConfig>;
      const id = body.id || `camp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const config: CampaignConfig = {
        id,
        name: body.name || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`,
        type: body.type || 'EVALUATION_SWEEP',
        createdAt: new Date().toISOString(),
        gamesPerVariantAndTable: Math.max(5, Number(body.gamesPerVariantAndTable) || 60),
        ablationConfig: body.ablationConfig,
        sweep: body.sweep || {
          nValues: [4],
          qValues: [6],
          aValues: [2],
          xValues: [8],
          stockAbatteusesValues: [null],
          modeTirageDesValues: ['MIN_2D6'],
          modeResolutionParcelleValues: ['TRANSACTION_FIGEE'],
          ordreCasseValues: ['AVANT_PARCELLE_1'],
          immobiliteReparationValues: [true],
          ordreMajTactiquesValues: ['ORDRE_PISTE_TAC'],
          rancuneTerrassementDegradeValues: [false],
          granulariteRancuneValues: ['PAR_CASE'],
          nbRegenerationValues: [1],
          ruleNoTargetH1Values: [V1_SWITCHES.ruleNoTargetH1],
          ruleParryModeValues: [V1_SWITCHES.ruleParryMode],
          rulePreventiveDestructionValues: [V1_SWITCHES.rulePreventiveDestruction],
          ruleBulldozerTargetingValues: [V1_SWITCHES.ruleBulldozerTargeting],
          ruleScrapyardExitValues: [V1_SWITCHES.ruleScrapyardExit],
          ruleInitialSetupValues: [V1_SWITCHES.ruleInitialSetup],
        },
        selectedTableConfigs: body.selectedTableConfigs || [],
        includeCalibrationTables:
          body.includeCalibrationTables !== undefined ? body.includeCalibrationTables : true,
        targetDurationSeconds: body.targetDurationSeconds ?? null,
        maxTotalGames: Number(body.maxTotalGames) || 50000,
        randomizeParametersInStress: Boolean(body.randomizeParametersInStress),
        baseSeed: Number(body.baseSeed) || Math.floor(Math.random() * 900000) + 10000,
      };

      const record = campaignManager.startCampaign(config);
      res.status(201).json(record);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Requête invalide' });
    }
  });

  apiRouter.post('/campaigns/:id/pause', (req, res) => {
    const record = campaignManager.pauseCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.json(record);
  });

  apiRouter.post('/campaigns/:id/resume', (req, res) => {
    const record = campaignManager.resumeCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.json(record);
  });

  apiRouter.post('/campaigns/:id/stop', (req, res) => {
    const record = campaignManager.stopCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.json(record);
  });

  apiRouter.delete('/campaigns/:id', (req, res) => {
    campaignManager.deleteCampaign(req.params.id);
    res.json({ deleted: true });
  });

  // Export Markdown structuré v2.0 prêt pour Prompt IA
  apiRouter.get('/campaigns/:id/export/markdown', (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).send('Campagne introuvable');
      return;
    }
    const markdown = generateCampaignMarkdownReport(record);
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bilan-ia-v2-${record.id}.md"`
    );
    res.send(markdown);
  });

  // Export JSON complet
  apiRouter.get('/campaigns/:id/export/json', (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="bilan-complet-v2-${record.id}.json"`
    );
    res.send(JSON.stringify(record, null, 2));
  });

  // Génération à la demande d'une partie unitaire avec trace textuelle complète
  apiRouter.post('/simulate-single', (req, res) => {
    try {
      const seed = Number(req.body.seed) || 424242;
      const params: GameParameters = {
        ...DEFAULT_GAME_PARAMETERS,
        ...(req.body.params || {}),
      };
      const botProfiles: BotProfileId[] = req.body.botProfiles || ['COOPERATIVE'];
      const vocabulary: ThemeVocabularyMode = req.body.vocabulary || 'AMAZONIA';

      const game = runSingleGame(seed, params, 'custom_inspection', botProfiles, {
        recordTraces: true,
        vocabulary,
      });
      res.json(game);
    } catch (err: any) {
      res.status(400).json({ error: err?.message || 'Erreur lors de la simulation unitaire' });
    }
  });

  app.use('/api', apiRouter);
  app.use('/:subpath/api', apiRouter);

  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.use('/:subpath', express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  const requestedPort = Number(process.env.PORT) || 3000;

  const listenOnPort = (portToTry: number) => {
    const httpServer = app.listen(portToTry, '0.0.0.0', () => {
      console.log(`Serveur actif sur http://0.0.0.0:${portToTry}`);
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE' && portToTry !== 3000) {
        console.warn(
          `Port ${portToTry} occupé par l'environnement hôte, repli automatique sur le port 3000...`
        );
        listenOnPort(3000);
      } else {
        console.error('Erreur fatale du serveur HTTP :', err);
        process.exit(1);
      }
    });
  };

  listenOnPort(requestedPort);
}

startServer();

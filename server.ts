import express from 'express';
import path from 'path';
import fs from 'fs';
import { CampaignManager } from './src/server/campaignManager';
import { CampaignConfig, GameParameters, BotProfileId, ThemeVocabularyMode } from './src/sim/types';
import { runSingleGame } from './src/sim/engine';
import { generateCampaignMarkdownReport } from './src/sim/evaluator';
import { DEFAULT_GAME_PARAMETERS } from './src/sim/i18n';

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const campaignManager = new CampaignManager();
  const apiRouter = express.Router();

  // Santé & Informations d'environnement (Portail Atelier Conception Jeu)
  apiRouter.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      environment: process.env.NODE_ENV || 'development',
      port: Number(process.env.PORT) || 3000,
      activeCampaigns: campaignManager
        .listCampaigns()
        .filter((c) => c.status === 'RUNNING').length,
    });
  });

  // Liste toutes les campagnes (résumé léger + résultats)
  apiRouter.get('/campaigns', (_req, res) => {
    res.json(campaignManager.listCampaigns());
  });

  // Détail d'une campagne spécifique
  apiRouter.get('/campaigns/:id', (req, res) => {
    const record = campaignManager.getCampaign(req.params.id);
    if (!record) {
      res.status(404).json({ error: 'Campagne introuvable' });
      return;
    }
    res.json(record);
  });

  // Création et démarrage d'une nouvelle campagne (Type 1 ou Type 2)
  apiRouter.post('/campaigns', (req, res) => {
    try {
      const body = req.body as Partial<CampaignConfig>;
      const id = body.id || `camp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      const config: CampaignConfig = {
        id,
        name: body.name || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`,
        type: body.type || 'EVALUATION_SWEEP',
        createdAt: new Date().toISOString(),
        gamesPerVariantAndTable: Math.max(5, Number(body.gamesPerVariantAndTable) || 100),
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

  // Contrôles de supervision (Pause / Reprise / Arrêt / Suppression)
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

  // Export Markdown structuré prêt pour Prompt IA
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
      `attachment; filename="bilan-ia-${record.id}.md"`
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
      `attachment; filename="bilan-complet-${record.id}.json"`
    );
    res.send(JSON.stringify(record, null, 2));
  });

  // Génération à la demande d'une partie unitaire avec trace textuelle complète (selon Seed et Paramètres)
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

  // Montage de l'API compatible racine (AI Studio / Caddy handle_path) et sous-chemin éventuel
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
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  // Règle obligatoire Contrat d'intégration au portail Atelier Conception Jeu
  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Serveur actif sur http://0.0.0.0:${PORT}`);
  });
}

startServer();

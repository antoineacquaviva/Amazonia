import fs from 'fs';
import path from 'path';
import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  GameParameters,
  SingleGameResult,
  StressTestTelemetry,
  TableConfig,
  TacticId,
  VariantEvaluationResult,
} from '../sim/types';
import { DEFAULT_GAME_PARAMETERS, DEFAULT_TABLE_CONFIGS } from '../sim/i18n';
import { createEmptyEdgeCases, runSingleGame } from '../sim/engine';
import {
  addEdgeCases,
  evaluateFourCriteria,
  expandParameterSweep,
  summarizeTableGames,
} from '../sim/evaluator';
import { SeededRNG } from '../sim/rng';

const DATA_DIR = path.resolve(process.cwd(), 'data', 'campaigns');

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

const CALIBRATION_TABLES: TableConfig[] = [
  {
    id: 'cal_random',
    name: 'Étalon Aléatoire (N0)',
    description: 'Placement aléatoire uniforme',
    botProfiles: ['RANDOM'],
  },
  {
    id: 'cal_selfish',
    name: 'Étalon Égoïste / Myope (N1)',
    description: 'Sans communication ni recherche de destruction multiple',
    botProfiles: ['SELFISH'],
  },
  {
    id: 'cal_coop',
    name: 'Étalon Coopératif Communicant (N2)',
    description: 'Inférence bayésienne et micro-cycles de coordination',
    botProfiles: ['COOPERATIVE'],
  },
  {
    id: 'cal_strategist',
    name: 'Étalon Stratège Méta-Contremaître (N3)',
    description: 'Contrôle de la Piste des Tactiques et de la Rancune',
    botProfiles: ['STRATEGIST'],
  },
  {
    id: 'cal_omniscient',
    name: 'Étalon Omniscient (Borne Haute)',
    description: 'Information complète sur tous les dés tirés',
    botProfiles: ['OMNISCIENT'],
  },
];

export class CampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();

  constructor() {
    ensureDataDir();
    this.loadFromDisk();
    if (this.campaigns.size === 0) {
      this.createInitialReferenceCampaigns();
    }
  }

  private loadFromDisk(): void {
    try {
      const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const fullPath = path.join(DATA_DIR, file);
        const raw = fs.readFileSync(fullPath, 'utf-8');
        const record = JSON.parse(raw) as CampaignRecord;
        // Si le serveur a redémarré pendant qu'une campagne était RUNNING, la passer en PAUSED pour permettre sa reprise
        if (record.status === 'RUNNING') {
          record.status = 'PAUSED';
          record.progress.currentPhaseLabel = 'Interrompu par redémarrage serveur (Prêt à reprendre)';
        }
        this.campaigns.set(record.id, record);
      }
    } catch (err) {
      console.error('Erreur chargement des campagnes depuis le disque :', err);
    }
  }

  public saveToDisk(record: CampaignRecord): void {
    try {
      ensureDataDir();
      const filePath = path.join(DATA_DIR, `${record.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
    } catch (err) {
      console.error(`Erreur sauvegarde campagne ${record.id} :`, err);
    }
  }

  public listCampaigns(): CampaignRecord[] {
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getCampaign(id: string): CampaignRecord | undefined {
    return this.campaigns.get(id);
  }

  public deleteCampaign(id: string): boolean {
    const ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.stopped = true;
      this.activeControl.delete(id);
    }
    this.campaigns.delete(id);
    const filePath = path.join(DATA_DIR, `${id}.json`);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return true;
  }

  public pauseCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    const ctrl = this.activeControl.get(id);
    if (record && ctrl && record.status === 'RUNNING') {
      ctrl.paused = true;
      record.status = 'PAUSED';
      record.updatedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'En pause (Supervision utilisateur)';
      this.saveToDisk(record);
    }
    return record;
  }

  public resumeCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    if (!record) return undefined;
    let ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.paused = false;
      record.status = 'RUNNING';
      record.updatedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'Reprise de la simulation en arrière-plan...';
    } else if (record.status === 'PAUSED' && record.config.type === 'ORACLE_STRESS_TEST') {
      record.status = 'RUNNING';
      this.runStressTestLoop(record);
    }
    return record;
  }

  public stopCampaign(id: string): CampaignRecord | undefined {
    const record = this.campaigns.get(id);
    const ctrl = this.activeControl.get(id);
    if (record) {
      if (ctrl) {
        ctrl.stopped = true;
      }
      record.status = 'STOPPED';
      record.completedAt = new Date().toISOString();
      record.updatedAt = record.completedAt;
      record.progress.currentPhaseLabel = 'Arrêté et consolidé sur demande';
      this.saveToDisk(record);
    }
    return record;
  }

  public startCampaign(config: CampaignConfig): CampaignRecord {
    const now = new Date().toISOString();
    const variants = expandParameterSweep(config.sweep);
    const totalVariants = variants.length;

    let totalTargetGames = 0;
    if (config.type === 'EVALUATION_SWEEP') {
      const tablesCount = config.includeCalibrationTables
        ? config.selectedTableConfigs.length + CALIBRATION_TABLES.length
        : config.selectedTableConfigs.length;
      totalTargetGames =
        totalVariants * Math.max(1, tablesCount) * config.gamesPerVariantAndTable;
    } else {
      totalTargetGames = config.maxTotalGames || 100000;
    }

    const record: CampaignRecord = {
      id: config.id,
      config,
      status: 'RUNNING',
      startedAt: now,
      updatedAt: now,
      progress: {
        completedGames: 0,
        totalTargetGames,
        completedVariants: 0,
        totalVariants,
        elapsedSeconds: 0,
        gamesPerSecond: 0,
        currentPhaseLabel: 'Initialisation du moteur asynchrone...',
      },
      variantResults: [],
      stressTelemetry:
        config.type === 'ORACLE_STRESS_TEST'
          ? {
              totalGamesSimulated: 0,
              totalTurnsSimulated: 0,
              elapsedSeconds: 0,
              gamesPerSecond: 0,
              invariantsVerifiedCount: 0,
              violationsCount: 0,
              violationsLog: [],
              stagnantGamesCount: 0,
              earlyWipeoutGamesCount: 0,
              tacticMonopolyGamesCount: 0,
              omniscientUnwinnableSeedsCount: 0,
              edgeCaseOccurrences: createEmptyEdgeCases(),
              scoreDistributionByBotLevel: {
                RANDOM: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                SELFISH: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                COOPERATIVE: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                STRATEGIST: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
                OMNISCIENT: { games: 0, meanNormalized: 0, minNormalized: 1, maxNormalized: 0, defeatRate: 0, miracleRate: 0 },
              },
              capturedExtremeLogs: [],
            }
          : undefined,
    };

    this.campaigns.set(record.id, record);
    this.saveToDisk(record);

    if (config.type === 'EVALUATION_SWEEP') {
      this.runEvaluationSweepLoop(record, variants);
    } else {
      this.runStressTestLoop(record);
    }

    return record;
  }

  /**
   * Boucle asynchrone non bloquante pour les campagnes d'Évaluation Multi-Variantes (Type 1)
   */
  private runEvaluationSweepLoop(
    record: CampaignRecord,
    variants: Array<{ variantId: string; variantLabel: string; params: GameParameters }>
  ): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now();
    let currentVariantIdx = 0;
    let seedCounter = record.config.baseSeed || 10000;

    const userTables =
      record.config.selectedTableConfigs.length > 0
        ? record.config.selectedTableConfigs
        : [DEFAULT_TABLE_CONFIGS[0], DEFAULT_TABLE_CONFIGS[1], DEFAULT_TABLE_CONFIGS[2]];

    // Combiner les tables sélectionnées et les tables d'étalonnage sans doublons inutiles
    const allTablesToRun: Array<{ table: TableConfig; isUserSelected: boolean; calKey?: 'random' | 'selfish' | 'cooperative' | 'strategist' | 'omniscient' }> = [];
    for (const ut of userTables) {
      let calKey: 'random' | 'selfish' | 'cooperative' | 'strategist' | 'omniscient' | undefined;
      if (ut.botProfiles.length === 1) {
        if (ut.botProfiles[0] === 'RANDOM') calKey = 'random';
        else if (ut.botProfiles[0] === 'SELFISH') calKey = 'selfish';
        else if (ut.botProfiles[0] === 'COOPERATIVE') calKey = 'cooperative';
        else if (ut.botProfiles[0] === 'STRATEGIST') calKey = 'strategist';
        else if (ut.botProfiles[0] === 'OMNISCIENT') calKey = 'omniscient';
      }
      allTablesToRun.push({ table: ut, isUserSelected: true, calKey });
    }

    if (record.config.includeCalibrationTables) {
      const calMap: Array<{ table: TableConfig; key: 'random' | 'selfish' | 'cooperative' | 'strategist' | 'omniscient' }> = [
        { table: CALIBRATION_TABLES[0], key: 'random' },
        { table: CALIBRATION_TABLES[1], key: 'selfish' },
        { table: CALIBRATION_TABLES[2], key: 'cooperative' },
        { table: CALIBRATION_TABLES[3], key: 'strategist' },
        { table: CALIBRATION_TABLES[4], key: 'omniscient' },
      ];
      for (const item of calMap) {
        if (!allTablesToRun.some((t) => t.calKey === item.key)) {
          allTablesToRun.push({ table: item.table, isUserSelected: false, calKey: item.key });
        }
      }
    }

    record.progress.totalTargetGames =
      variants.length * allTablesToRun.length * record.config.gamesPerVariantAndTable;

    // État interne de la variante en cours de calcul
    let currentTableIdx = 0;
    let currentGameInTable = 0;
    let currentTableGames: SingleGameResult[] = [];
    let variantTableSummaries: VariantEvaluationResult['tableSummaries'] = [];
    let variantSampleTraces: VariantEvaluationResult['sampleTraces'] = [];
    let variantEdgeCases = createEmptyEdgeCases();
    let gamesByCat: {
      random: SingleGameResult[];
      selfish: SingleGameResult[];
      cooperative: SingleGameResult[];
      strategist: SingleGameResult[];
      omniscient: SingleGameResult[];
      allPrimaryGames: SingleGameResult[];
    } = {
      random: [],
      selfish: [],
      cooperative: [],
      strategist: [],
      omniscient: [],
      allPrimaryGames: [],
    };

    const stepBatch = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepBatch, 200);
        return;
      }

      const sliceStart = Date.now();
      // Exécuter des parties par tranches de ~25ms pour garder le serveur Express ultra-réactif
      while (Date.now() - sliceStart < 25 && currentVariantIdx < variants.length) {
        const vSpec = variants[currentVariantIdx];
        const tSpec = allTablesToRun[currentTableIdx];
        const targetG = record.config.gamesPerVariantAndTable;

        // Utiliser la même séquence de graines pour chaque table d'une même variante (Réduction de variance CRN !)
        const gameSeed =
          (record.config.baseSeed || 10000) +
          currentVariantIdx * 100000 +
          currentGameInTable +
          1;
        seedCounter = gameSeed;

        const shouldRecordTrace = currentGameInTable < 2;
        const gRes = runSingleGame(
          gameSeed,
          vSpec.params,
          tSpec.table.id,
          tSpec.table.botProfiles,
          { recordTraces: shouldRecordTrace }
        );

        currentTableGames.push(gRes);
        addEdgeCases(variantEdgeCases, gRes.edgeCases);

        if (tSpec.isUserSelected) {
          gamesByCat.allPrimaryGames.push(gRes);
          if (shouldRecordTrace && gRes.textualJournal) {
            variantSampleTraces.push({
              seed: gRes.seed,
              tableConfigName: tSpec.table.name,
              rawScore: gRes.rawScore,
              normalizedScore: gRes.normalizedScore,
              victoryBracket: gRes.victoryBracket,
              tag:
                gRes.normalizedScore >= 0.48 && gRes.normalizedScore <= 0.78
                  ? 'HIGH_TENSION'
                  : 'TYPICAL',
              textualJournal: gRes.textualJournal,
            });
          }
        }
        if (tSpec.calKey) {
          gamesByCat[tSpec.calKey].push(gRes);
        }

        currentGameInTable++;
        record.progress.completedGames++;

        if (currentGameInTable >= targetG) {
          // Fin de cette table pour cette variante
          if (tSpec.isUserSelected) {
            const summary = summarizeTableGames(
              tSpec.table.id,
              tSpec.table.name,
              currentTableGames
            );
            variantTableSummaries.push(summary);
          }
          currentTableGames = [];
          currentGameInTable = 0;
          currentTableIdx++;

          if (currentTableIdx >= allTablesToRun.length) {
            // Fin de toutes les tables pour cette variante -> Évaluer les 4 critères !
            const criteria = evaluateFourCriteria(vSpec.params, gamesByCat);
            record.variantResults.push({
              variantId: vSpec.variantId,
              variantLabel: vSpec.variantLabel,
              params: vSpec.params,
              tableSummaries: variantTableSummaries,
              criteria,
              edgeCaseTotals: variantEdgeCases,
              sampleTraces: variantSampleTraces.slice(0, 6),
            });

            record.progress.completedVariants++;
            currentVariantIdx++;
            currentTableIdx = 0;
            variantTableSummaries = [];
            variantSampleTraces = [];
            variantEdgeCases = createEmptyEdgeCases();
            gamesByCat = {
              random: [],
              selfish: [],
              cooperative: [],
              strategist: [],
              omniscient: [],
              allPrimaryGames: [],
            };
          }
        }
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = record.progress.completedGames / elapsedSec;
      record.updatedAt = new Date().toISOString();

      if (currentVariantIdx < variants.length) {
        const curV = variants[currentVariantIdx];
        const curT = allTablesToRun[currentTableIdx];
        record.progress.currentPhaseLabel = `Variante ${currentVariantIdx + 1}/${variants.length} (${curV.variantLabel}) — ${curT.table.name}`;

        if (Date.now() - ctrl.lastSavedAt > 3000) {
          this.saveToDisk(record);
          ctrl.lastSavedAt = Date.now();
        }
        setImmediate(stepBatch);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Campagne terminée (${record.variantResults.length} variante(s) évaluée(s))`;
        this.saveToDisk(record);
        this.activeControl.delete(record.id);
      }
    };

    setImmediate(stepBatch);
  }

  /**
   * Boucle asynchrone de Stress-Test Longue Durée sur VM Oracle (Type 2)
   * Explore des milliers / millions de parties en arrière-plan pour vérifier tous les invariants (I1-I4)
   * et traquer les situations inextricables, sans issue ou cycliques.
   */
  private runStressTestLoop(record: CampaignRecord): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now() - (record.progress.elapsedSeconds || 0) * 1000;
    const variants = expandParameterSweep(record.config.sweep);
    const paramRng = new SeededRNG((record.config.baseSeed || 77777) + record.progress.completedGames);
    const botLevels: BotProfileId[] = ['COOPERATIVE', 'STRATEGIST', 'SELFISH', 'OMNISCIENT', 'RANDOM'];

    const telemetry = record.stressTelemetry!;
    // Accumulateurs pour les moyennes incrémentales par niveau de bot
    const botSums: Record<BotProfileId, { sumNorm: number; defeats: number; miracles: number }> = {
      RANDOM: { sumNorm: 0, defeats: 0, miracles: 0 },
      SELFISH: { sumNorm: 0, defeats: 0, miracles: 0 },
      COOPERATIVE: { sumNorm: 0, defeats: 0, miracles: 0 },
      STRATEGIST: { sumNorm: 0, defeats: 0, miracles: 0 },
      OMNISCIENT: { sumNorm: 0, defeats: 0, miracles: 0 },
    };

    // Initialiser les accumulateurs si c'est une reprise
    for (const b of botLevels) {
      const existing = telemetry.scoreDistributionByBotLevel[b];
      if (existing && existing.games > 0) {
        botSums[b].sumNorm = existing.meanNormalized * existing.games;
        botSums[b].defeats = Math.round(existing.defeatRate * existing.games);
        botSums[b].miracles = Math.round(existing.miracleRate * existing.games);
      }
    }

    const stepStressBatch = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepStressBatch, 250);
        return;
      }

      const sliceStart = Date.now();
      const maxGames = record.config.maxTotalGames || 1000000;
      const maxDurationSec = record.config.targetDurationSeconds || null;

      while (Date.now() - sliceStart < 25) {
        const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
        if (telemetry.totalGamesSimulated >= maxGames) {
          break;
        }
        if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) {
          break;
        }

        const gameIdx = telemetry.totalGamesSimulated;
        const seed = (record.config.baseSeed || 900000) + gameIdx + 1;

        // Choisir les paramètres (soit parmi la grille, soit mutés aléatoirement si randomizeParametersInStress est actif)
        let params: GameParameters;
        if (record.config.randomizeParametersInStress) {
          params = {
            n: paramRng.nextInt(3, 6),
            q: paramRng.nextInt(4, 8),
            a: paramRng.nextInt(1, 3),
            x: paramRng.nextInt(6, 10),
            stockAbatteuses: paramRng.nextFloat() < 0.7 ? null : paramRng.nextInt(4, 12),
            modeTirageDes: (['MIN_2D6', '1D6', 'MAX_2D6'] as const)[paramRng.nextInt(0, 2)],
            modeResolutionParcelle:
              paramRng.nextFloat() < 0.8 ? 'TRANSACTION_FIGEE' : 'SEQUENTIEL',
            ordreCasse:
              paramRng.nextFloat() < 0.8 ? 'AVANT_PARCELLE_1' : 'APRES_PARCELLE_Q',
            immobiliteReparation: paramRng.nextFloat() < 0.85,
            ordreMajTactiques:
              paramRng.nextFloat() < 0.8 ? 'ORDRE_PISTE_TAC' : 'FIXE',
            rancuneTerrassementDegrade: paramRng.nextFloat() < 0.25,
            granulariteRancune: (
              ['PAR_CASE', 'PAR_EVENEMENT', 'CARTE_ET_DESTRUCTION'] as const
            )[paramRng.nextInt(0, 2)],
            nbRegeneration: paramRng.nextInt(0, 2),
            rMaxCycles: 5,
          };
        } else {
          params = variants[gameIdx % variants.length].params;
        }

        const chosenBot = botLevels[gameIdx % botLevels.length];
        const res = runSingleGame(seed, params, `stress_${chosenBot}`, [chosenBot], {
          recordTraces: false,
        });

        telemetry.totalGamesSimulated += 1;
        telemetry.totalTurnsSimulated += params.x;
        // 4 invariants vérifiés à chaque tour (2 fois par tour + setup + fin de partie)
        telemetry.invariantsVerifiedCount += (params.x * 2 + 2) * 4;
        addEdgeCases(telemetry.edgeCaseOccurrences, res.edgeCases);

        // Mise à jour des distributions par niveau de Bot
        const bStat = telemetry.scoreDistributionByBotLevel[chosenBot];
        const bSum = botSums[chosenBot];
        bStat.games += 1;
        bSum.sumNorm += res.normalizedScore;
        if (res.victoryBracket === 'DEFEAT') bSum.defeats += 1;
        if (res.victoryBracket === 'MIRACLE') bSum.miracles += 1;
        bStat.meanNormalized = bSum.sumNorm / bStat.games;
        bStat.minNormalized = Math.min(bStat.minNormalized, res.normalizedScore);
        bStat.maxNormalized = Math.max(bStat.maxNormalized, res.normalizedScore);
        bStat.defeatRate = bSum.defeats / bStat.games;
        bStat.miracleRate = bSum.miracles / bStat.games;

        // Détection d'anomalies, cas extrêmes ou situations sans issue
        let captureCategory:
          | 'INVARIANT_VIOLATION'
          | 'EARLY_WIPEOUT'
          | 'STAGNATION'
          | 'TACTIC_MONOPOLY'
          | 'OMNISCIENT_DEFEAT'
          | 'RECORD_EDGE_CASES'
          | null = null;
        let captureSummary = '';

        if (res.violations.length > 0) {
          telemetry.violationsCount += res.violations.length;
          for (const v of res.violations) {
            if (telemetry.violationsLog.length < 50) {
              telemetry.violationsLog.push(v);
            }
          }
          captureCategory = 'INVARIANT_VIOLATION';
          captureSummary = res.violations[0].message;
        }

        if (res.stagnantTurns > 0) {
          telemetry.stagnantGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'STAGNATION';
            captureSummary = `${res.stagnantTurns} tour(s) stagnant(s) sans évolution d'état ni mouvement.`;
          }
        }

        if (res.earlyWipeoutTurn !== null) {
          telemetry.earlyWipeoutGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'EARLY_WIPEOUT';
            captureSummary = `Destruction totale de la forêt dès le tour ${res.earlyWipeoutTurn}/${params.x} (Bot: ${chosenBot}).`;
          }
        }

        const AllTactics: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];
        const monopolyTac = AllTactics.find((t) => res.tacticSlot1Turns[t] === params.x);
        if (monopolyTac) {
          telemetry.tacticMonopolyGamesCount += 1;
          if (!captureCategory) {
            captureCategory = 'TACTIC_MONOPOLY';
            captureSummary = `La tactique ${monopolyTac} est restée verrouillée en Case 1 pendant 100% des ${params.x} tours.`;
          }
        }

        if (chosenBot === 'OMNISCIENT' && res.victoryBracket === 'DEFEAT') {
          telemetry.omniscientUnwinnableSeedsCount += 1;
          if (!captureCategory) {
            captureCategory = 'OMNISCIENT_DEFEAT';
            captureSummary = `Graine très punitive : même le Bot Omniscient subit une Défaite (${(res.normalizedScore * 100).toFixed(1)}% d'arbres sauvés).`;
          }
        }

        const totalEdgeInGame =
          res.edgeCases.H1_noTargetEligible +
          res.edgeCases.H2_multipleHarvesterCardsSingleTree +
          res.edgeCases.H3_multipleBulldozerCardsSameCell +
          res.edgeCases.H4_repairedBulldozerImmunityInCell1;
        if (!captureCategory && totalEdgeInGame >= 5) {
          captureCategory = 'RECORD_EDGE_CASES';
          captureSummary = `Forte concentration de cas limites en une seule partie (${totalEdgeInGame} occurrences H1-H4).`;
        }

        // Si un cas remarquable est détecté et qu'on a moins de 12 journaux capturés, on rejoue exactement la graine avec recordTraces: true !
        if (captureCategory && telemetry.capturedExtremeLogs.length < 12) {
          const alreadyHasCategoryCount = telemetry.capturedExtremeLogs.filter(
            (l) => l.category === captureCategory
          ).length;
          if (alreadyHasCategoryCount < 3 || captureCategory === 'INVARIANT_VIOLATION') {
            const detailed = runSingleGame(
              seed,
              params,
              `stress_${chosenBot}`,
              [chosenBot],
              { recordTraces: true }
            );
            telemetry.capturedExtremeLogs.push({
              seed,
              category: captureCategory,
              summary: captureSummary,
              params,
              textualJournal: detailed.textualJournal || '',
            });
          }
        }

        record.progress.completedGames = telemetry.totalGamesSimulated;
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      telemetry.elapsedSeconds = elapsedSec;
      telemetry.gamesPerSecond = telemetry.totalGamesSimulated / elapsedSec;
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = telemetry.gamesPerSecond;
      record.updatedAt = new Date().toISOString();

      const targetReached =
        telemetry.totalGamesSimulated >= (record.config.maxTotalGames || 1000000) ||
        (record.config.targetDurationSeconds !== null &&
          record.config.targetDurationSeconds !== undefined &&
          elapsedSec >= record.config.targetDurationSeconds);

      if (!targetReached) {
        record.progress.currentPhaseLabel = `Exploration intensive en cours (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties, ${telemetry.invariantsVerifiedCount.toLocaleString('fr-FR')} invariants vérifiés)...`;
        if (Date.now() - ctrl.lastSavedAt > 4000) {
          this.saveToDisk(record);
          ctrl.lastSavedAt = Date.now();
        }
        setImmediate(stepStressBatch);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Stress-Test terminé : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées, ${telemetry.violationsCount} violation(s) d'invariants.`;
        this.saveToDisk(record);
        this.activeControl.delete(record.id);
      }
    };

    setImmediate(stepStressBatch);
  }

  /**
   * Crée au premier démarrage deux campagnes de référence pré-calculées :
   * 1. Une campagne d'Équilibrage Multi-Variantes comparant les règles officielles (Transaction figée, min(2d6), PAR_CASE)
   *    à 2 variantes alternatives sur les différentes configurations de table.
   * 2. Une campagne de Stress-Test & Vérification Formelle sur 1 500 parties avec journaux des cas limites.
   */
  private createInitialReferenceCampaigns(): void {
    const evalConfig: CampaignConfig = {
      id: 'camp_ref_equilibrage_amazonia',
      name: 'Campagne de Référence — Règles Officielles vs Variantes de Rancune & Tirage',
      type: 'EVALUATION_SWEEP',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: 80,
      sweep: {
        nValues: [4],
        qValues: [6],
        aValues: [2],
        xValues: [8],
        stockAbatteusesValues: [null],
        modeTirageDesValues: ['MIN_2D6', '1D6'],
        modeResolutionParcelleValues: ['TRANSACTION_FIGEE'],
        ordreCasseValues: ['AVANT_PARCELLE_1'],
        immobiliteReparationValues: [true],
        ordreMajTactiquesValues: ['ORDRE_PISTE_TAC'],
        rancuneTerrassementDegradeValues: [false],
        granulariteRancuneValues: ['PAR_CASE', 'PAR_EVENEMENT'],
        nbRegenerationValues: [1],
      },
      selectedTableConfigs: [
        DEFAULT_TABLE_CONFIGS[0], // Coopératif N2
        DEFAULT_TABLE_CONFIGS[1], // Stratège N3
        DEFAULT_TABLE_CONFIGS[2], // Égoïste N1
        DEFAULT_TABLE_CONFIGS[3], // Table Mixte
        DEFAULT_TABLE_CONFIGS[4], // Omniscient
      ],
      includeCalibrationTables: true,
      baseSeed: 42000,
    };

    const stressConfig: CampaignConfig = {
      id: 'camp_ref_stress_verification',
      name: 'Vérification Formelle Initiale — Invariants I1-I4 & Cas Limites H1-H7',
      type: 'ORACLE_STRESS_TEST',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: 100,
      sweep: {
        nValues: [3, 4, 5, 6],
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
      selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
      includeCalibrationTables: true,
      maxTotalGames: 1200,
      targetDurationSeconds: null,
      randomizeParametersInStress: true,
      baseSeed: 900000,
    };

    this.startCampaign(evalConfig);
    this.startCampaign(stressConfig);
  }
}

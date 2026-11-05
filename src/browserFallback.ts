import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  InitialMachineConfig,
  SimulationConfig,
  SingleGameResult,
  TableConfig,
  VariantEvaluationResult,
} from './sim/types';
import {
  DEFAULT_SWEEP_INPUT,
  DEFAULT_TABLE_CONFIGS,
} from './sim/i18n';
import { runSingleGame } from './sim/engine';
import {
  evaluateFourCriteria,
  expandParameterSweep,
  summarizeTableGames,
} from './sim/evaluator';
import { SeededRNG } from './sim/rng';

const LS_CAMPAIGNS_KEY = 'amazonia_v3_campaigns';

class BrowserCampaignManager {
  private campaigns: Map<string, CampaignRecord> = new Map();
  private activeControl: Map<
    string,
    { paused: boolean; stopped: boolean; lastSavedAt: number }
  > = new Map();
  private initialized = false;

  public ensureInitialized(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.loadFromStorage();
    if (this.campaigns.size === 0) {
      this.createInitialReferenceCampaign();
    }
  }

  private loadFromStorage(): void {
    try {
      const rawCamps = localStorage.getItem(LS_CAMPAIGNS_KEY);
      if (rawCamps) {
        const list = JSON.parse(rawCamps) as CampaignRecord[];
        for (const c of list) {
          if (c && c.id) {
            const isCompatible =
              c.config?.type === 'ORACLE_STRESS_TEST'
                ? Boolean(c.stressTelemetry?.scoreDistributionByBotLevel?.COMBAT_PURE)
                : c.variantResults.length === 0 ||
                  Boolean(c.variantResults[0]?.optionDTag);
            if (!isCompatible) continue;

            if (c.status === 'RUNNING') {
              c.status = 'PAUSED';
              c.progress.currentPhaseLabel = 'En pause (Reprise disponible)';
            }
            this.campaigns.set(c.id, c);
          }
        }
      }
    } catch {
      // ignore storage errors
    }
  }

  private persistCampaigns(): void {
    try {
      localStorage.setItem(
        LS_CAMPAIGNS_KEY,
        JSON.stringify(Array.from(this.campaigns.values()))
      );
    } catch {
      // ignore quota
    }
  }

  public listCampaigns(): CampaignRecord[] {
    this.ensureInitialized();
    return Array.from(this.campaigns.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  public getCampaign(id: string): CampaignRecord | undefined {
    this.ensureInitialized();
    return this.campaigns.get(id);
  }

  public deleteCampaign(id: string): void {
    this.ensureInitialized();
    const ctrl = this.activeControl.get(id);
    if (ctrl) {
      ctrl.stopped = true;
      this.activeControl.delete(id);
    }
    this.campaigns.delete(id);
    this.persistCampaigns();
  }

  public controlCampaign(
    id: string,
    action: 'pause' | 'resume' | 'stop'
  ): CampaignRecord {
    this.ensureInitialized();
    const record = this.campaigns.get(id);
    if (!record) throw new Error('Campagne introuvable');
    const ctrl = this.activeControl.get(id);
    if (action === 'pause' && ctrl) {
      ctrl.paused = true;
      record.status = 'PAUSED';
      record.progress.currentPhaseLabel = 'En pause';
    } else if (action === 'resume') {
      if (ctrl) {
        ctrl.paused = false;
        record.status = 'RUNNING';
      } else if (record.status === 'PAUSED' && record.config.type === 'ORACLE_STRESS_TEST') {
        record.status = 'RUNNING';
        this.runStressTestLoop(record);
      }
    } else if (action === 'stop') {
      if (ctrl) ctrl.stopped = true;
      record.status = 'STOPPED';
      record.completedAt = new Date().toISOString();
      record.progress.currentPhaseLabel = 'Arrêté sur demande';
    }
    record.updatedAt = new Date().toISOString();
    this.persistCampaigns();
    return record;
  }

  public startCampaign(body: Partial<CampaignConfig>): CampaignRecord {
    this.ensureInitialized();
    const id = body.id || `camp_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const config: CampaignConfig = {
      id,
      name: body.name || `Campagne du ${new Date().toLocaleDateString('fr-FR')}`,
      type: body.type || 'MONTE_CARLO_SWEEP',
      createdAt: new Date().toISOString(),
      gamesPerVariantAndTable: Math.max(5, Number(body.gamesPerVariantAndTable) || 60),
      sweep: body.sweep || DEFAULT_SWEEP_INPUT,
      selectedTableConfigs: body.selectedTableConfigs || DEFAULT_TABLE_CONFIGS,
      includeCalibrationTables:
        body.includeCalibrationTables !== undefined ? body.includeCalibrationTables : true,
      targetDurationSeconds: body.targetDurationSeconds ?? null,
      maxTotalGames: Number(body.maxTotalGames) || 10000,
      randomizeParametersInStress: Boolean(body.randomizeParametersInStress),
      baseSeed: Number(body.baseSeed) || 42000,
    };

    const variants = expandParameterSweep(config.sweep);
    const tablesToUse = this.resolveTables(config);

    const totalTargetGames =
      config.type === 'ORACLE_STRESS_TEST'
        ? config.maxTotalGames || 10000
        : variants.length * Math.max(1, tablesToUse.length) * config.gamesPerVariantAndTable;

    const now = new Date().toISOString();
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
        totalVariants: variants.length,
        elapsedSeconds: 0,
        gamesPerSecond: 0,
        currentPhaseLabel: 'Initialisation du moteur local...',
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
              totalExplosionsObserved: 0,
              totalParryAndHSObserved: 0,
              totalTrapsAndSabotagesObserved: 0,
              scoreDistributionByBotLevel: {
                RANDOM: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                COMBAT_PURE: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                HYBRID_STEALTH_COMBAT: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
                OMNISCIENT: { games: 0, meanSurvivalHorizon: 0, meanTreesLost: 0, meanExplosions: 0, defeatRate: 0, miracleRate: 0 },
              },
              capturedExtremeLogs: [],
            }
          : undefined,
    };

    this.campaigns.set(record.id, record);
    this.persistCampaigns();

    if (config.type === 'ORACLE_STRESS_TEST') {
      this.runStressTestLoop(record);
    } else {
      this.runEvaluationSweepLoop(record, variants, tablesToUse);
    }

    return record;
  }

  private resolveTables(config: CampaignConfig): TableConfig[] {
    const selected =
      config.selectedTableConfigs && config.selectedTableConfigs.length > 0
        ? [...config.selectedTableConfigs]
        : [...DEFAULT_TABLE_CONFIGS];
    if (config.includeCalibrationTables) {
      for (const def of DEFAULT_TABLE_CONFIGS) {
        if (!selected.some((t) => t.id === def.id)) {
          selected.push(def);
        }
      }
    }
    return selected;
  }

  private runEvaluationSweepLoop(
    record: CampaignRecord,
    variants: ReturnType<typeof expandParameterSweep>,
    tablesToUse: TableConfig[]
  ): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);
    const startTimeMs = Date.now();
    let currentVariantIdx = 0;
    let currentTableIdx = 0;
    let currentGameInTable = 0;
    let currentTableGames: SingleGameResult[] = [];
    let variantTableSummaries: VariantEvaluationResult['tableSummaries'] = [];
    let variantSampleTraces: VariantEvaluationResult['sampleTraces'] = [];
    let variantViolations = 0;

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
      while (Date.now() - sliceStart < 20 && currentVariantIdx < variants.length) {
        const vSpec = variants[currentVariantIdx];
        const table = tablesToUse[currentTableIdx];
        const targetG = record.config.gamesPerVariantAndTable;
        const gameSeed =
          (record.config.baseSeed || 42000) + currentGameInTable + 1;

        const shouldRecordTrace = currentGameInTable < 1;
        const gRes = runSingleGame(
          vSpec.params,
          table.botProfiles,
          gameSeed,
          table.id,
          shouldRecordTrace
        );

        currentTableGames.push(gRes);
        variantViolations += gRes.violations.length;

        if (shouldRecordTrace && gRes.textualJournal && variantSampleTraces.length < 4) {
          variantSampleTraces.push({
            seed: gRes.seed,
            tableConfigName: table.name,
            survivalRateHorizon: gRes.survivalRateHorizon,
            totalTreesLost: gRes.totalTreesLost,
            explosionsCount: gRes.explosionsCount,
            victoryBracket: gRes.victoryBracket,
            textualJournal: gRes.textualJournal,
          });
        }

        currentGameInTable++;
        record.progress.completedGames++;

        if (currentGameInTable >= targetG) {
          variantTableSummaries.push(summarizeTableGames(table, currentTableGames));
          currentTableGames = [];
          currentGameInTable = 0;
          currentTableIdx++;

          if (currentTableIdx >= tablesToUse.length) {
            const criteria = evaluateFourCriteria(vSpec.params, variantTableSummaries);
            record.variantResults.push({
              variantId: vSpec.variantId,
              variantLabel: vSpec.variantLabel,
              optionDTag: vSpec.optionDTag,
              params: vSpec.params,
              tableSummaries: variantTableSummaries,
              criteria,
              invariantViolationsCount: variantViolations,
              sampleTraces: variantSampleTraces,
            });

            record.progress.completedVariants++;
            currentVariantIdx++;
            currentTableIdx = 0;
            variantTableSummaries = [];
            variantSampleTraces = [];
            variantViolations = 0;
          }
        }
      }

      const elapsedSec = Math.max(0.05, (Date.now() - startTimeMs) / 1000);
      record.progress.elapsedSeconds = elapsedSec;
      record.progress.gamesPerSecond = record.progress.completedGames / elapsedSec;
      record.updatedAt = new Date().toISOString();

      if (currentVariantIdx < variants.length) {
        const curV = variants[currentVariantIdx];
        const curT = tablesToUse[currentTableIdx];
        record.progress.currentPhaseLabel = `Variante ${currentVariantIdx + 1}/${variants.length} (${curV.variantLabel}) — ${curT.name}`;
        setTimeout(stepBatch, 0);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Campagne terminée (${record.variantResults.length} variante(s) évaluée(s))`;
        this.persistCampaigns();
        this.activeControl.delete(record.id);
      }
    };

    setTimeout(stepBatch, 0);
  }

  private runStressTestLoop(record: CampaignRecord): void {
    const ctrl = { paused: false, stopped: false, lastSavedAt: Date.now() };
    this.activeControl.set(record.id, ctrl);

    const startTimeMs = Date.now() - (record.progress.elapsedSeconds || 0) * 1000;
    const variants = expandParameterSweep(record.config.sweep);
    const paramRng = new SeededRNG(
      (record.config.baseSeed || 77777) + record.progress.completedGames
    );
    const botLevels: BotProfileId[] = [
      'HYBRID_STEALTH_COMBAT',
      'COMBAT_PURE',
      'OMNISCIENT',
      'RANDOM',
    ];

    const telemetry = record.stressTelemetry!;
    const botSums: Record<
      BotProfileId,
      { sumSurv: number; sumLost: number; sumExp: number; defeats: number; miracles: number }
    > = {
      RANDOM: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      COMBAT_PURE: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      HYBRID_STEALTH_COMBAT: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
      OMNISCIENT: { sumSurv: 0, sumLost: 0, sumExp: 0, defeats: 0, miracles: 0 },
    };

    const stepStress = () => {
      if (ctrl.stopped) {
        this.activeControl.delete(record.id);
        return;
      }
      if (ctrl.paused) {
        setTimeout(stepStress, 250);
        return;
      }

      const sliceStart = Date.now();
      const maxGames = record.config.maxTotalGames || 10000;
      const maxDurationSec = record.config.targetDurationSeconds || null;

      while (Date.now() - sliceStart < 20) {
        const currentElapsedSec = (Date.now() - startTimeMs) / 1000;
        if (telemetry.totalGamesSimulated >= maxGames) break;
        if (maxDurationSec !== null && currentElapsedSec >= maxDurationSec) break;

        const gameIdx = telemetry.totalGamesSimulated;
        const seed = (record.config.baseSeed || 900000) + gameIdx + 1;

        let params: SimulationConfig;
        if (record.config.randomizeParametersInStress) {
          const n = paramRng.nextInt(3, 6);
          const initMachines: InitialMachineConfig[] = Array.from({ length: n }, () => ({
            harvesterPos: 1,
            harvesterStatus: paramRng.nextFloat() < 0.8 ? 'NORMAL' : 'HS',
            bulldozerPos: 1,
            bulldozerStatus: paramRng.nextFloat() < 0.8 ? 'NORMAL' : 'HS',
            initialStumpsCell1: paramRng.nextInt(0, 2),
          }));
          params = {
            numPlayers: n,
            numTurns: paramRng.nextInt(6, 12),
            initialTreesPerCell: paramRng.nextInt(2, 4),
            tacticsTrackSetup: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'],
            shuffleTacticsTrack: paramRng.nextFloat() < 0.5,
            initialMachinesState: initMachines,
            overheatIncludesBaseAction: paramRng.nextFloat() < 0.5,
            assaultIncludesBaseAction: paramRng.nextFloat() < 0.5,
            overheatStacksTreeRemoval: paramRng.nextFloat() < 0.7,
            endOfGameRegeneration: paramRng.nextFloat() < 0.7,
          };
        } else {
          params = variants[gameIdx % variants.length].params;
        }

        const chosenBot = botLevels[gameIdx % botLevels.length];
        const res = runSingleGame(params, [chosenBot], seed, `stress_${chosenBot}`, false);

        telemetry.totalGamesSimulated += 1;
        telemetry.totalTurnsSimulated += params.numTurns;
        telemetry.invariantsVerifiedCount += params.numTurns * 4;
        telemetry.totalExplosionsObserved += res.explosionsCount;
        telemetry.totalParryAndHSObserved += res.parryAndHSCount;
        telemetry.totalTrapsAndSabotagesObserved +=
          res.trapsPlacedCount + res.sabotagesPlacedCount;

        const bStat = telemetry.scoreDistributionByBotLevel[chosenBot];
        const bSum = botSums[chosenBot];
        bStat.games += 1;
        bSum.sumSurv += res.survivalRateHorizon;
        bSum.sumLost += res.totalTreesLost;
        bSum.sumExp += res.explosionsCount;
        if (res.victoryBracket === 'DEFEAT') bSum.defeats += 1;
        if (res.victoryBracket === 'MIRACLE') bSum.miracles += 1;
        bStat.meanSurvivalHorizon = bSum.sumSurv / bStat.games;
        bStat.meanTreesLost = bSum.sumLost / bStat.games;
        bStat.meanExplosions = bSum.sumExp / bStat.games;
        bStat.defeatRate = bSum.defeats / bStat.games;
        bStat.miracleRate = bSum.miracles / bStat.games;

        if (res.violations.length > 0) {
          telemetry.violationsCount += res.violations.length;
          telemetry.violationsLog.push(...res.violations.slice(0, 10));
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
        telemetry.totalGamesSimulated >= maxGames ||
        (maxDurationSec !== null && elapsedSec >= maxDurationSec);

      if (!targetReached) {
        record.progress.currentPhaseLabel = `Exploration en cours (${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties)...`;
        setTimeout(stepStress, 0);
      } else {
        record.status = 'COMPLETED';
        record.completedAt = new Date().toISOString();
        record.updatedAt = record.completedAt;
        record.progress.currentPhaseLabel = `Stress-Test terminé : ${telemetry.totalGamesSimulated.toLocaleString('fr-FR')} parties vérifiées, ${telemetry.violationsCount} violation(s).`;
        this.persistCampaigns();
        this.activeControl.delete(record.id);
      }
    };

    setTimeout(stepStress, 0);
  }

  private createInitialReferenceCampaign(): void {
    this.startCampaign({
      id: 'camp_ref_d1_vs_d2',
      name: 'Campagne de Référence — Comparaison Directe Options D1 vs D2 (Surchauffe × Assaut)',
      type: 'D1_D2_COMPARISON',
      gamesPerVariantAndTable: 50,
      sweep: {
        ...DEFAULT_SWEEP_INPUT,
        overheatIncludesBaseActionValues: [false, true],
        assaultIncludesBaseActionValues: [false, true],
      },
      selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
      includeCalibrationTables: true,
      baseSeed: 42000,
    });
  }
}

export const browserCampaignManager = new BrowserCampaignManager();

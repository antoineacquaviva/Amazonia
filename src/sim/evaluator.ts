import {
  CampaignRecord,
  FourCriteriaEvaluation,
  InitialMachineConfig,
  ParameterSweepInput,
  SimulationConfig,
  SingleGameResult,
  TableConfig,
  TableConfigSummary,
  VariantEvaluationResult,
  VictoryBracket,
} from './types';

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr: number[], m?: number): number {
  if (arr.length <= 1) return 0;
  const avg = m !== undefined ? m : mean(arr);
  const variance = arr.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / arr.length;
  return Math.sqrt(variance);
}

export function buildLeversCode(params: SimulationConfig): string {
  return `Setup:${params.staggeredInitialSetup ? 'Oui' : 'Non'} · MaxN:${
    params.limitStealthTokensToN ? 'Oui' : 'Non'
  } · PurgeSab:${params.repairClearsSabotage ? 'Oui' : 'Non'} · BullOver:${
    params.bulldozerOverflowAbattage ? 'Oui' : 'Non'
  } · ActRep:${params.activeRepairOnMultiHit ? 'Oui' : 'Non'}`;
}

export function buildVariantLabel(params: SimulationConfig): string {
  return `N=${params.numPlayers} · X=${params.numTurns}t · a=${params.initialTreesPerCell} · ${buildLeversCode(params)}`;
}

export function expandParameterSweep(sweep: ParameterSweepInput): Array<{
  variantId: string;
  variantLabel: string;
  leversCode: string;
  params: SimulationConfig;
}> {
  const results: Array<{
    variantId: string;
    variantLabel: string;
    leversCode: string;
    params: SimulationConfig;
  }> = [];

  const nVals = sweep.numPlayersValues.length > 0 ? sweep.numPlayersValues : [4];
  const xVals = sweep.numTurnsValues.length > 0 ? sweep.numTurnsValues : [8];
  const filteredAVals = (sweep.initialTreesPerCellValues ?? [2]).filter((a) => a === 2 || a === 3);
  const aVals = filteredAVals.length > 0 ? filteredAVals : [2];

  const setupVals =
    sweep.staggeredInitialSetupValues && sweep.staggeredInitialSetupValues.length > 0
      ? sweep.staggeredInitialSetupValues
      : [true];
  const maxNVals =
    sweep.limitStealthTokensToNValues && sweep.limitStealthTokensToNValues.length > 0
      ? sweep.limitStealthTokensToNValues
      : [true];
  const purgeSabVals =
    sweep.repairClearsSabotageValues && sweep.repairClearsSabotageValues.length > 0
      ? sweep.repairClearsSabotageValues
      : [true];
  const bullOverVals =
    sweep.bulldozerOverflowAbattageValues && sweep.bulldozerOverflowAbattageValues.length > 0
      ? sweep.bulldozerOverflowAbattageValues
      : [true];
  const actRepVals =
    sweep.activeRepairOnMultiHitValues && sweep.activeRepairOnMultiHitValues.length > 0
      ? sweep.activeRepairOnMultiHitValues
      : [true];
  const shufVals =
    sweep.shuffleTacticsTrackValues && sweep.shuffleTacticsTrackValues.length > 0
      ? sweep.shuffleTacticsTrackValues
      : [false];

  const hasCustomInitialMachines =
    (sweep.initialHarvesterStatus && sweep.initialHarvesterStatus !== 'NORMAL') ||
    (sweep.initialBulldozerStatus && sweep.initialBulldozerStatus !== 'NORMAL') ||
    (sweep.initialStumpsCell1 !== undefined && sweep.initialStumpsCell1 > 0);

  let idx = 1;
  for (const numPlayers of nVals) {
    for (const numTurns of xVals) {
      for (const initialTreesPerCell of aVals) {
        for (const staggeredInitialSetup of setupVals) {
          for (const limitStealthTokensToN of maxNVals) {
            for (const repairClearsSabotage of purgeSabVals) {
              for (const bulldozerOverflowAbattage of bullOverVals) {
                for (const activeRepairOnMultiHit of actRepVals) {
                  for (const shuffleTacticsTrack of shufVals) {
                    const initialMachinesState: InitialMachineConfig[] | undefined =
                      hasCustomInitialMachines
                        ? Array.from({ length: numPlayers }, () => ({
                            harvesterPos: staggeredInitialSetup ? 2 : 1,
                            harvesterStatus: sweep.initialHarvesterStatus || 'NORMAL',
                            bulldozerPos: 1,
                            bulldozerStatus: sweep.initialBulldozerStatus || 'NORMAL',
                            initialStumpsCell1:
                              sweep.initialStumpsCell1 ?? (staggeredInitialSetup ? 1 : 0),
                          }))
                        : undefined;

                    const params: SimulationConfig = {
                      numPlayers,
                      numTurns,
                      initialTreesPerCell,
                      tacticsTrackSetup:
                        sweep.tacticsTrackSetup && sweep.tacticsTrackSetup.length === 6
                          ? [...sweep.tacticsTrackSetup]
                          : ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'],
                      shuffleTacticsTrack,
                      initialMachinesState,
                      staggeredInitialSetup,
                      limitStealthTokensToN,
                      repairClearsSabotage,
                      bulldozerOverflowAbattage,
                      activeRepairOnMultiHit,
                    };

                    results.push({
                      variantId: `V${String(idx++).padStart(3, '0')}`,
                      variantLabel: buildVariantLabel(params),
                      leversCode: buildLeversCode(params),
                      params,
                    });
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  return results;
}

export function summarizeTableGames(
  tableConfig: TableConfig,
  games: SingleGameResult[]
): TableConfigSummary {
  const nGames = games.length;
  if (nGames === 0) {
    return {
      tableConfigId: tableConfig.id,
      tableConfigName: tableConfig.name,
      botProfiles: tableConfig.botProfiles,
      gamesCount: 0,
      meanSurvivalRateHorizon: 0,
      stdDevSurvivalRateHorizon: 0,
      meanSurvivalRateVisited: 0,
      meanTreesLostTotal: 0,
      stdDevTreesLostTotal: 0,
      meanTreesLostPerTurn: [],
      stdDevTreesLostPerTurn: [],
      meanTreesLostPerPlayer: [],
      stdDevTreesLostPerPlayer: [],
      victoryBracketsRate: {
        MIRACLE: 0,
        MAJOR_VICTORY: 0,
        COSTLY_VICTORY: 0,
        DEFEAT: 0,
      },
      meanCuts: 0,
      meanBulldozerOverflowCuts: 0,
      meanClearings: 0,
      meanStumpsCleared: 0,
      meanOverheats: 0,
      meanOverheatTreesRemoved: 0,
      meanAssaults: 0,
      meanSimpleParries: 0,
      meanParryAndHS: 0,
      meanExplosions: 0,
      meanTrapsPlaced: 0,
      meanSabotagesPlaced: 0,
      meanStealthBlockedByLimit: 0,
      meanRepairs: 0,
      meanActiveRepairsStep31: 0,
      meanSabotageClearedByRepair: 0,
      meanRespiteDraws: 0,
    };
  }

  const numTurns = games[0].params.numTurns;
  const numPlayers = games[0].params.numPlayers;

  const survivalHorizons = games.map((g) => g.survivalRateHorizon);
  const survivalVisited = games.map((g) => g.survivalRateVisited);
  const treesLostTotals = games.map((g) => g.totalTreesLost);

  const meanSurvH = mean(survivalHorizons);
  const stdSurvH = stdDev(survivalHorizons, meanSurvH);
  const meanSurvV = mean(survivalVisited);
  const meanLost = mean(treesLostTotals);
  const stdLost = stdDev(treesLostTotals, meanLost);

  // Par tour (t = 1..X)
  const meanTreesLostPerTurn: number[] = [];
  const stdDevTreesLostPerTurn: number[] = [];
  for (let t = 0; t < numTurns; t++) {
    const vals = games.map((g) => g.treesLostPerTurn[t] ?? 0);
    const m = mean(vals);
    meanTreesLostPerTurn.push(m);
    stdDevTreesLostPerTurn.push(stdDev(vals, m));
  }

  // Par joueur (J1..JN)
  const meanTreesLostPerPlayer: number[] = [];
  const stdDevTreesLostPerPlayer: number[] = [];
  for (let p = 0; p < numPlayers; p++) {
    const vals = games.map((g) => g.treesLostPerPlayer[p] ?? 0);
    const m = mean(vals);
    meanTreesLostPerPlayer.push(m);
    stdDevTreesLostPerPlayer.push(stdDev(vals, m));
  }

  const bracketCounts: Record<VictoryBracket, number> = {
    MIRACLE: 0,
    MAJOR_VICTORY: 0,
    COSTLY_VICTORY: 0,
    DEFEAT: 0,
  };
  for (const g of games) {
    bracketCounts[g.victoryBracket]++;
  }

  return {
    tableConfigId: tableConfig.id,
    tableConfigName: tableConfig.name,
    botProfiles: tableConfig.botProfiles,
    gamesCount: nGames,
    meanSurvivalRateHorizon: meanSurvH,
    stdDevSurvivalRateHorizon: stdSurvH,
    meanSurvivalRateVisited: meanSurvV,
    meanTreesLostTotal: meanLost,
    stdDevTreesLostTotal: stdLost,
    meanTreesLostPerTurn,
    stdDevTreesLostPerTurn,
    meanTreesLostPerPlayer,
    stdDevTreesLostPerPlayer,
    victoryBracketsRate: {
      MIRACLE: bracketCounts.MIRACLE / nGames,
      MAJOR_VICTORY: bracketCounts.MAJOR_VICTORY / nGames,
      COSTLY_VICTORY: bracketCounts.COSTLY_VICTORY / nGames,
      DEFEAT: bracketCounts.DEFEAT / nGames,
    },
    meanCuts: mean(games.map((g) => g.cutsCount)),
    meanBulldozerOverflowCuts: mean(games.map((g) => g.bulldozerOverflowCutsCount)),
    meanClearings: mean(games.map((g) => g.clearingsCount)),
    meanStumpsCleared: mean(games.map((g) => g.stumpsClearedCount)),
    meanOverheats: mean(games.map((g) => g.overheatTriggersCount)),
    meanOverheatTreesRemoved: mean(games.map((g) => g.overheatTreesRemovedCount)),
    meanAssaults: mean(games.map((g) => g.assaultTriggersCount)),
    meanSimpleParries: mean(games.map((g) => g.simpleParriesCount)),
    meanParryAndHS: mean(games.map((g) => g.parryAndHSCount)),
    meanExplosions: mean(games.map((g) => g.explosionsCount)),
    meanTrapsPlaced: mean(games.map((g) => g.trapsPlacedCount)),
    meanSabotagesPlaced: mean(games.map((g) => g.sabotagesPlacedCount)),
    meanStealthBlockedByLimit: mean(games.map((g) => g.stealthBlockedByLimitCount)),
    meanRepairs: mean(games.map((g) => g.repairsCount)),
    meanActiveRepairsStep31: mean(games.map((g) => g.activeRepairsStep31Count)),
    meanSabotageClearedByRepair: mean(games.map((g) => g.sabotageClearedByRepairCount)),
    meanRespiteDraws: mean(games.map((g) => g.respiteDrawsOnDestroyedCount)),
  };
}

export function evaluateFourCriteria(
  params: SimulationConfig,
  summaries: TableConfigSummary[]
): FourCriteriaEvaluation {
  const byId = new Map<string, TableConfigSummary>();
  for (const s of summaries) {
    byId.set(s.tableConfigId, s);
  }

  const randomSummary = byId.get('TABLE_RANDOM') ?? summaries[0];
  const combatSummary = byId.get('TABLE_COMBAT_PURE') ?? summaries[0];
  const hybridSummary = byId.get('TABLE_HYBRID') ?? combatSummary;
  const primarySummary = hybridSummary ?? combatSummary ?? summaries[0];

  // ---------------------------------------------------------------------------
  // CRITÈRE 1 : INTÉRÊT STRATÉGIQUE & SYNERGIE FURTIVITÉ (/100)
  // ---------------------------------------------------------------------------
  const survRandom = randomSummary ? randomSummary.meanSurvivalRateHorizon : 0.45;
  const survCombat = combatSummary ? combatSummary.meanSurvivalRateHorizon : 0.65;
  const survHybrid = hybridSummary ? hybridSummary.meanSurvivalRateHorizon : survCombat;

  const deltaCombatVsRandom = Math.max(0, survCombat - survRandom);
  const deltaHybridVsCombat = survHybrid - survCombat;

  // Gain Combat Pur vs Aléatoire : cible +18% d'arbres sauvés -> 50/50
  const combatVsRandomGainScore = clamp((deltaCombatVsRandom / 0.18) * 50, 0, 50);

  // Gain ou compétitivité Hybride (Furtivité + Combat) vs Combat Pur :
  const trapsSabPerGame = primarySummary
    ? primarySummary.meanTrapsPlaced + primarySummary.meanSabotagesPlaced
    : 0;
  const stealthActivityBonus = clamp((trapsSabPerGame / Math.max(2, params.numTurns * 0.4)) * 20, 0, 20);
  const hybridDeltaComponent = clamp(((deltaHybridVsCombat + 0.03) / 0.08) * 30, 0, 30);
  const hybridVsCombatGainScore = clamp(stealthActivityBonus + hybridDeltaComponent, 0, 50);

  const stratScore = Math.round(combatVsRandomGainScore + hybridVsCombatGainScore);

  // ---------------------------------------------------------------------------
  // CRITÈRE 2 : TENSION & COURBE D'ATTRITION (/100)
  // ---------------------------------------------------------------------------
  // Cible idéale de survie : 68% des arbres sur l'horizon N*X*a (ni promenade de santé >92%, ni écrasement <35%)
  const meanSurvivalHorizon = primarySummary ? primarySummary.meanSurvivalRateHorizon : 0.68;
  const distFromTarget = Math.abs(meanSurvivalHorizon - 0.68);
  const survivalTargetProximityScore = clamp((1 - distFromTarget / 0.28) * 50, 0, 50);

  const meanExplosionsPerGame = primarySummary ? primarySummary.meanExplosions : 0;
  const meanParryAndHSPerGame = primarySummary ? primarySummary.meanParryAndHS : 0;
  const meanOverheatsPerGame = primarySummary ? primarySummary.meanOverheats : 0;

  // Dynamique des états machines (Mises HS, Surchauffes, Explosions rares mais présentes)
  const hsActivityRatio =
    (meanParryAndHSPerGame + meanOverheatsPerGame) / Math.max(1, params.numTurns * 0.6);
  const hsScore = clamp(hsActivityRatio * 35, 0, 35);
  const explosionBonus = clamp(meanExplosionsPerGame * 30, 0, 15);
  const hsAndExplosionDynamicsScore = clamp(hsScore + explosionBonus, 0, 50);

  const tensionScore = Math.round(survivalTargetProximityScore + hsAndExplosionDynamicsScore);

  // ---------------------------------------------------------------------------
  // CRITÈRE 3 : EFFICACITÉ DE LA COORDINATION & DES SEUILS S (/100)
  // ---------------------------------------------------------------------------
  const parriesTotal = primarySummary
    ? primarySummary.meanSimpleParries + primarySummary.meanParryAndHS
    : 0;
  const damageEvents = primarySummary
    ? primarySummary.meanCuts + primarySummary.meanClearings + primarySummary.meanExplosions
    : 1;
  const combatSuccessDefenseRate = parriesTotal / Math.max(1, parriesTotal + damageEvents * 0.65);

  const parryAndKnockoutRateScore = clamp((combatSuccessDefenseRate / 0.55) * 60, 0, 60);
  const stealthConversionRateScore = clamp(
    (trapsSabPerGame / Math.max(1.5, params.numTurns * 0.35)) * 40,
    0,
    40
  );
  const coordScore = Math.round(parryAndKnockoutRateScore + stealthConversionRateScore);

  // ---------------------------------------------------------------------------
  // CRITÈRE 4 : ÉQUITÉ D'EXPOSITION SUR L'ŒIL (J1 .. JN) (/100)
  // ---------------------------------------------------------------------------
  const playerLosses = primarySummary ? primarySummary.meanTreesLostPerPlayer : [];
  let j1VsOthersRatio = 1;
  let playerLossSpread = 0;

  if (playerLosses.length >= 2) {
    const j1Loss = playerLosses[0];
    const othersMean = mean(playerLosses.slice(1));
    j1VsOthersRatio = othersMean > 0.05 ? j1Loss / othersMean : 1;
    const maxL = Math.max(...playerLosses);
    const minL = Math.min(...playerLosses);
    const avgL = Math.max(0.5, mean(playerLosses));
    playerLossSpread = (maxL - minL) / avgL;
  }

  // Idéalement la coopération compense la sur-exposition probabiliste de J1 (ratio proche de 1.0..1.25)
  const ratioPenalty = Math.abs(j1VsOthersRatio - 1.1) * 45;
  const spreadPenalty = Math.max(0, playerLossSpread - 0.25) * 35;
  const fairnessScore = Math.round(clamp(100 - ratioPenalty - spreadPenalty, 0, 100));

  const overallDesignScore = Math.round(
    stratScore * 0.3 + tensionScore * 0.3 + coordScore * 0.25 + fairnessScore * 0.15
  );

  return {
    strategicAndStealthSynergy: {
      score: stratScore,
      combatVsRandomGainScore: Math.round(combatVsRandomGainScore),
      hybridVsCombatGainScore: Math.round(hybridVsCombatGainScore),
      deltaCombatVsRandom,
      deltaHybridVsCombat,
      interpretation:
        deltaCombatVsRandom >= 0.12
          ? `Le placement tactique apporte un gain net (+${(deltaCombatVsRandom * 100).toFixed(1)} pts de survie vs Aléatoire) et la Furtivité génère ${trapsSabPerGame.toFixed(1)} pièges/sabotages par partie.`
          : `Écart modéré entre jeu coordonné et aléatoire (+${(deltaCombatVsRandom * 100).toFixed(1)} pts).`,
    },
    tensionAndAttrition: {
      score: tensionScore,
      survivalTargetProximityScore: Math.round(survivalTargetProximityScore),
      hsAndExplosionDynamicsScore: Math.round(hsAndExplosionDynamicsScore),
      meanSurvivalHorizon,
      meanExplosionsPerGame,
      meanParryAndHSPerGame,
      interpretation: `Survie moyenne à ${(meanSurvivalHorizon * 100).toFixed(1)}% sur l'horizon N×X×a (${meanParryAndHSPerGame.toFixed(2)} mises HS défensives et ${meanExplosionsPerGame.toFixed(2)} explosion(s) par partie).`,
    },
    coordinationEfficiency: {
      score: coordScore,
      parryAndKnockoutRateScore: Math.round(parryAndKnockoutRateScore),
      stealthConversionRateScore: Math.round(stealthConversionRateScore),
      combatSuccessDefenseRate,
      trapsAndSabotagesPerGame: trapsSabPerGame,
      interpretation: `Taux de parades/mises HS en combat de ${(combatSuccessDefenseRate * 100).toFixed(1)}% avec ${trapsSabPerGame.toFixed(2)} pièges/sabotages posés en moyenne.`,
    },
    evilEyeFairness: {
      score: fairnessScore,
      j1VsOthersRatio,
      playerLossSpread,
      interpretation: `Ratio de pertes J1 / Autres joueurs = ${j1VsOthersRatio.toFixed(2)}x (dispersion relative ${(playerLossSpread * 100).toFixed(1)}%).`,
    },
    overallDesignScore,
  };
}

export function evaluateVariantGames(
  variantId: string,
  variantLabel: string,
  leversCode: string,
  params: SimulationConfig,
  gamesByTableId: Map<string, SingleGameResult[]>,
  tableConfigs: TableConfig[]
): VariantEvaluationResult {
  const tableSummaries: TableConfigSummary[] = [];
  let invariantViolationsCount = 0;
  const sampleTraces: VariantEvaluationResult['sampleTraces'] = [];

  for (const tc of tableConfigs) {
    const games = gamesByTableId.get(tc.id) ?? [];
    for (const g of games) {
      invariantViolationsCount += g.violations.length;
      if (g.textualJournal && sampleTraces.length < 6) {
        sampleTraces.push({
          seed: g.seed,
          tableConfigName: tc.name,
          survivalRateHorizon: g.survivalRateHorizon,
          totalTreesLost: g.totalTreesLost,
          explosionsCount: g.explosionsCount,
          victoryBracket: g.victoryBracket,
          textualJournal: g.textualJournal,
        });
      }
    }
    tableSummaries.push(summarizeTableGames(tc, games));
  }

  const criteria = evaluateFourCriteria(params, tableSummaries);

  return {
    variantId,
    variantLabel,
    leversCode,
    params,
    tableSummaries,
    criteria,
    invariantViolationsCount,
    sampleTraces,
  };
}

export function generateCampaignMarkdownReport(campaign: CampaignRecord): string {
  const lines: string[] = [];
  lines.push(
    `# Rapport de Simulation Monte-Carlo — Amazonia v3.1 (D2-Double Figé & 5 Leviers d'Équilibrage)`
  );
  lines.push(`- **Campagne** : ${campaign.config.name} (\`${campaign.id}\`)`);
  lines.push(`- **Type** : \`${campaign.config.type}\``);
  lines.push(`- **Statut** : \`${campaign.status}\``);
  lines.push(
    `- **Options figées en dur** : \`overheatIncludesBaseAction = true\`, \`assaultIncludesBaseAction = true\` (D2-Double), \`overheatStacksTreeRemoval = true\` (CumulA2), \`endOfGameRegeneration = true\``
  );
  lines.push(
    `- **Parties simulées** : ${campaign.progress.completedGames.toLocaleString('fr-FR')} / ${campaign.progress.totalTargetGames.toLocaleString('fr-FR')} (${campaign.progress.gamesPerSecond.toFixed(0)} parties/s)`
  );
  lines.push(``);

  if (campaign.variantResults.length > 0) {
    lines.push(`## 1. Classement Synthétique des Variantes & État des 5 Leviers`);
    lines.push(
      `| ID | Variante | Note Design (/100) | Survie Hybride (%) | Survie Combat (%) | Arbres Perdus (Moy±σ) | Abattages (dont BullOver) | Terrassements | Surchauffes | Assauts | Parades S=2+k | Mises HS S≥3+k | Explosions | Pièges+Sab (Bloqués MaxN) | Réparations (ActRep 3.1 / PurgeSab) |`
    );
    lines.push(
      `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`
    );

    const sorted = [...campaign.variantResults].sort(
      (a, b) => b.criteria.overallDesignScore - a.criteria.overallDesignScore
    );

    for (const v of sorted) {
      const hybridTable = v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_HYBRID');
      const combatTable = v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COMBAT_PURE');
      const mainTable = hybridTable ?? combatTable ?? v.tableSummaries[0];

      if (!mainTable) continue;
      const survHybridStr = hybridTable
        ? `${(hybridTable.meanSurvivalRateHorizon * 100).toFixed(1)}%`
        : `${(mainTable.meanSurvivalRateHorizon * 100).toFixed(1)}%`;
      const survCombatStr = combatTable
        ? `${(combatTable.meanSurvivalRateHorizon * 100).toFixed(1)}%`
        : `-`;

      lines.push(
        `| ${v.variantId} | ${v.variantLabel} | **${v.criteria.overallDesignScore}/100** | ${survHybridStr} | ${survCombatStr} | ${mainTable.meanTreesLostTotal.toFixed(2)} ± ${mainTable.stdDevTreesLostTotal.toFixed(2)} | ${mainTable.meanCuts.toFixed(2)} (${mainTable.meanBulldozerOverflowCuts.toFixed(2)}) | ${mainTable.meanClearings.toFixed(2)} | ${mainTable.meanOverheats.toFixed(2)} | ${mainTable.meanAssaults.toFixed(2)} | ${mainTable.meanSimpleParries.toFixed(2)} | ${mainTable.meanParryAndHS.toFixed(2)} | ${mainTable.meanExplosions.toFixed(2)} | ${(mainTable.meanTrapsPlaced + mainTable.meanSabotagesPlaced).toFixed(2)} (${mainTable.meanStealthBlockedByLimit.toFixed(2)}) | ${mainTable.meanRepairs.toFixed(2)} (${mainTable.meanActiveRepairsStep31.toFixed(2)} / ${mainTable.meanSabotageClearedByRepair.toFixed(2)}) |`
      );
    }
    lines.push(``);

    lines.push(`## 2. Détail des Pertes par Tour (1..X) et par Joueur (J1..JN)`);
    for (const v of sorted.slice(0, 8)) {
      const mainTable =
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_HYBRID') ??
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COMBAT_PURE') ??
        v.tableSummaries[0];
      if (!mainTable) continue;

      lines.push(`### ${v.variantId} — ${v.variantLabel} (Profil : ${mainTable.tableConfigName})`);
      lines.push(
        `- **Pertes par Tour (Moyenne ± σ)** : ` +
          mainTable.meanTreesLostPerTurn
            .map(
              (m, idx) =>
                `T${idx + 1}: ${m.toFixed(2)} (±${(mainTable.stdDevTreesLostPerTurn[idx] ?? 0).toFixed(2)})`
            )
            .join(' | ')
      );
      lines.push(
        `- **Pertes par Joueur (Moyenne ± σ)** : ` +
          mainTable.meanTreesLostPerPlayer
            .map(
              (m, idx) =>
                `J${idx + 1}: ${m.toFixed(2)} (±${(mainTable.stdDevTreesLostPerPlayer[idx] ?? 0).toFixed(2)})`
            )
            .join(' | ')
      );
      lines.push(``);
    }
  }

  if (campaign.stressTelemetry) {
    const st = campaign.stressTelemetry;
    lines.push(`## 3. Télémétrie Stress-Test Multi-Cœurs`);
    lines.push(`- **Parties vérifiées** : ${st.totalGamesSimulated.toLocaleString('fr-FR')}`);
    lines.push(`- **Tours simulés** : ${st.totalTurnsSimulated.toLocaleString('fr-FR')}`);
    lines.push(`- **Violations d'invariants (I1..I4)** : ${st.violationsCount}`);
    lines.push(`- **Explosions totales observées** : ${st.totalExplosionsObserved.toLocaleString('fr-FR')}`);
    lines.push(`- **Mises HS défensives (S >= 3+k)** : ${st.totalParryAndHSObserved.toLocaleString('fr-FR')}`);
    lines.push(`- **Pièges & Sabotages posés** : ${st.totalTrapsAndSabotagesObserved.toLocaleString('fr-FR')}`);
  }

  return lines.join('\n');
}

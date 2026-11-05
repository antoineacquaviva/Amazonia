import {
  BulldozerZeroStumpAction,
  CampaignRecord,
  CombatThresholdShift,
  FourCriteriaEvaluation,
  InformationAndCoordinationMetrics,
  ParameterSweepInput,
  SimulationConfig,
  SingleGameResult,
  TableConfig,
  TableConfigSummary,
  TacticalDefenderCap,
  TacticsTrackPreset,
  VariantEvaluationResult,
  VictoryBracket,
} from './types';
import { resolveTacticsTrackFromPreset } from './i18n';

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
  const capStr =
    params.tacticalDefenderCap === 99 ? '99(Illim)' : String(params.tacticalDefenderCap);
  return `Cap:${capStr} · Shift:+${params.combatThresholdShift} · Bull0:${
    params.bulldozerZeroStumpAction
  } · StumpC2:${params.initialStumpCell2 ? 'Oui' : 'Non'} · Piste:${params.tacticsTrackPreset}`;
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

  const nVals = sweep.numPlayersValues?.length > 0 ? sweep.numPlayersValues : [3, 4, 5, 6];
  const xVals =
    sweep.numTurnsValues?.length > 0 ? sweep.numTurnsValues : [6, 7, 8, 9, 10, 12];
  const filteredAVals = (sweep.initialTreesPerCellValues ?? [2, 3]).filter(
    (a) => a === 2 || a === 3
  );
  const aVals = filteredAVals.length > 0 ? filteredAVals : [2, 3];

  const capVals: TacticalDefenderCap[] =
    sweep.tacticalDefenderCapValues?.length > 0
      ? sweep.tacticalDefenderCapValues
      : [99, 2, 1];
  const shiftVals: CombatThresholdShift[] =
    sweep.combatThresholdShiftValues?.length > 0
      ? sweep.combatThresholdShiftValues
      : [0, 1];
  const bullZeroVals: BulldozerZeroStumpAction[] =
    sweep.bulldozerZeroStumpActionValues?.length > 0
      ? sweep.bulldozerZeroStumpActionValues
      : ['NONE', 'DESTROY_TREE'];
  const stumpC2Vals: boolean[] =
    sweep.initialStumpCell2Values?.length > 0
      ? sweep.initialStumpCell2Values
      : [false, true];
  const presetVals: TacticsTrackPreset[] =
    sweep.tacticsTrackPresetValues?.length > 0
      ? sweep.tacticsTrackPresetValues
      : ['ASSAULT_HIGH', 'ASSAULT_LOW'];
  const shufVals: boolean[] =
    sweep.shuffleTacticsTrackValues?.length > 0
      ? sweep.shuffleTacticsTrackValues
      : [false];

  let idx = 1;
  for (const numPlayers of nVals) {
    for (const numTurns of xVals) {
      for (const initialTreesPerCell of aVals) {
        for (const tacticalDefenderCap of capVals) {
          for (const combatThresholdShift of shiftVals) {
            for (const bulldozerZeroStumpAction of bullZeroVals) {
              for (const initialStumpCell2 of stumpC2Vals) {
                for (const tacticsTrackPreset of presetVals) {
                  for (const shuffleTacticsTrack of shufVals) {
                    const params: SimulationConfig = {
                      numPlayers,
                      numTurns,
                      initialTreesPerCell,
                      tacticsTrackPreset,
                      tacticsTrackSetup: resolveTacticsTrackFromPreset(tacticsTrackPreset),
                      shuffleTacticsTrack,
                      tacticalDefenderCap,
                      combatThresholdShift,
                      bulldozerZeroStumpAction,
                      initialStumpCell2,
                    };

                    results.push({
                      variantId: `V${String(idx++).padStart(4, '0')}`,
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
      meanBulldozerDestroyedTrees: 0,
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
      meanOrphanStealthTokens: 0,
      meanTacticalOverkillTokens: 0,
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
    meanBulldozerDestroyedTrees: mean(games.map((g) => g.bulldozerDestroyedTreesCount)),
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
    meanOrphanStealthTokens: mean(games.map((g) => g.orphanStealthTokensCount)),
    meanTacticalOverkillTokens: mean(games.map((g) => g.tacticalOverkillTokensCount)),
    meanRepairs: mean(games.map((g) => g.repairsCount)),
    meanActiveRepairsStep31: mean(games.map((g) => g.activeRepairsStep31Count)),
    meanSabotageClearedByRepair: mean(games.map((g) => g.sabotageClearedByRepairCount)),
    meanRespiteDraws: mean(games.map((g) => g.respiteDrawsOnDestroyedCount)),
  };
}

/**
 * Calcule la Note Design (/100) recalibrée v3.2 :
 * 1. Survie Coord dans la cible de difficulté élevée [70% .. 82%] (pénalise fortement >88% trop facile ou <50% punitif).
 * 2. Gain Info Privée élevé (Survie Solo - Survie Aveugle >= +5%).
 * 3. Gain Coordination élevé (Survie Coord - Survie Solo >= +5%).
 * 4. Équité d'exposition sur l'Œil (J1..JN).
 */
export function evaluateFourCriteria(
  params: SimulationConfig,
  summaries: TableConfigSummary[]
): FourCriteriaEvaluation {
  const byId = new Map<string, TableConfigSummary>();
  for (const s of summaries) {
    byId.set(s.tableConfigId, s);
  }

  const blindSummary = byId.get('TABLE_BLIND') ?? summaries[0];
  const soloSummary = byId.get('TABLE_SOLO') ?? blindSummary;
  const coordSummary = byId.get('TABLE_COORD') ?? soloSummary ?? summaries[0];
  const omniSummary = byId.get('TABLE_OMNI') ?? coordSummary;

  const survBlind = blindSummary ? blindSummary.meanSurvivalRateHorizon : 0.55;
  const survSolo = soloSummary ? soloSummary.meanSurvivalRateHorizon : 0.65;
  const survCoord = coordSummary ? coordSummary.meanSurvivalRateHorizon : 0.75;
  const survOmni = omniSummary ? omniSummary.meanSurvivalRateHorizon : 0.85;

  const treesLostBlind = blindSummary ? blindSummary.meanTreesLostTotal : 0;
  const treesLostSolo = soloSummary ? soloSummary.meanTreesLostTotal : 0;
  const treesLostCoord = coordSummary ? coordSummary.meanTreesLostTotal : 0;
  const treesLostOmni = omniSummary ? omniSummary.meanTreesLostTotal : 0;

  const privateInfoGainPct = survSolo - survBlind;
  const privateInfoGainTrees = treesLostBlind - treesLostSolo;
  const coordinationGainPct = survCoord - survSolo;
  const coordinationGainTrees = treesLostSolo - treesLostCoord;
  const fogOfWarCostPct = survOmni - survCoord;
  const fogOfWarCostTrees = treesLostCoord - treesLostOmni;

  const meanOrphanStealthCoord = coordSummary
    ? coordSummary.meanOrphanStealthTokens
    : 0;
  const meanTacticalOverkillCoord = coordSummary
    ? coordSummary.meanTacticalOverkillTokens
    : 0;
  const meanTacticalOverkillSolo = soloSummary
    ? soloSummary.meanTacticalOverkillTokens
    : 0;

  const infoAndCoordMetrics: InformationAndCoordinationMetrics = {
    survBlind,
    survSolo,
    survCoord,
    survOmni,
    treesLostBlind,
    treesLostSolo,
    treesLostCoord,
    treesLostOmni,
    privateInfoGainPct,
    privateInfoGainTrees,
    coordinationGainPct,
    coordinationGainTrees,
    fogOfWarCostPct,
    fogOfWarCostTrees,
    meanOrphanStealthCoord,
    meanTacticalOverkillCoord,
    meanTacticalOverkillSolo,
  };

  // ---------------------------------------------------------------------------
  // CRITÈRE 1 : TENSION & CIBLE DE DIFFICULTÉ ÉLEVÉE [70% .. 82%] (/100)
  // ---------------------------------------------------------------------------
  let survivalTargetProximityScore = 0;
  if (survCoord >= 0.70 && survCoord <= 0.82) {
    // Dans la fenêtre idéale [70% .. 82%] -> 70/70
    const distFromCenter = Math.abs(survCoord - 0.76);
    survivalTargetProximityScore = 70 - (distFromCenter / 0.06) * 4; // 66..70/70
  } else if (survCoord > 0.82) {
    // Au-dessus de 82% : pénalité forte surtout au-delà de 88% (trop facile)
    const excess = survCoord - 0.82;
    if (survCoord <= 0.88) {
      survivalTargetProximityScore = 66 - (excess / 0.06) * 30; // descend de 66 à 36
    } else {
      survivalTargetProximityScore = clamp(36 - ((survCoord - 0.88) / 0.08) * 36, 0, 36);
    }
  } else {
    // En dessous de 70% : pénalité forte surtout en dessous de 50% (punitif)
    const deficit = 0.70 - survCoord;
    if (survCoord >= 0.50) {
      survivalTargetProximityScore = 66 - (deficit / 0.20) * 40; // descend de 66 à 26
    } else {
      survivalTargetProximityScore = clamp(26 - ((0.50 - survCoord) / 0.25) * 26, 0, 26);
    }
  }

  const meanExplosionsPerGame = coordSummary ? coordSummary.meanExplosions : 0;
  const meanParryAndHSPerGame = coordSummary ? coordSummary.meanParryAndHS : 0;
  const meanOverheatsPerGame = coordSummary ? coordSummary.meanOverheats : 0;

  const hsActivityRatio =
    (meanParryAndHSPerGame + meanOverheatsPerGame) / Math.max(1, params.numTurns * 0.5);
  const hsScore = clamp(hsActivityRatio * 22, 0, 22);
  const explosionBonus = clamp(meanExplosionsPerGame * 16, 0, 8);
  const hsAndExplosionDynamicsScore = clamp(hsScore + explosionBonus, 0, 30);

  const tensionScore = Math.round(
    clamp(survivalTargetProximityScore + hsAndExplosionDynamicsScore, 0, 100)
  );

  // ---------------------------------------------------------------------------
  // CRITÈRE 2 : GAIN INFO PRIVÉE (Survie Solo - Survie Aveugle >= +5%) (/100)
  // ---------------------------------------------------------------------------
  // Si >= +5% -> 85..100/100 ; si 0% -> 20/100
  let privateInfoScore = 0;
  if (privateInfoGainPct >= 0.05) {
    privateInfoScore = clamp(85 + ((privateInfoGainPct - 0.05) / 0.05) * 15, 85, 100);
  } else if (privateInfoGainPct > 0) {
    privateInfoScore = clamp(20 + (privateInfoGainPct / 0.05) * 65, 20, 85);
  } else {
    privateInfoScore = clamp(20 + privateInfoGainPct * 200, 0, 20);
  }
  privateInfoScore = Math.round(privateInfoScore);

  // ---------------------------------------------------------------------------
  // CRITÈRE 3 : GAIN COORDINATION & FURTIVITÉ (Survie Coord - Survie Solo >= +5%) (/100)
  // ---------------------------------------------------------------------------
  const trapsSabPerGame = coordSummary
    ? coordSummary.meanTrapsPlaced + coordSummary.meanSabotagesPlaced
    : 0;
  let coordGainBase = 0;
  if (coordinationGainPct >= 0.05) {
    coordGainBase = clamp(70 + ((coordinationGainPct - 0.05) / 0.05) * 15, 70, 85);
  } else if (coordinationGainPct > 0) {
    coordGainBase = clamp(15 + (coordinationGainPct / 0.05) * 55, 15, 70);
  } else {
    coordGainBase = clamp(15 + coordinationGainPct * 150, 0, 15);
  }
  const stealthActivityBonus = clamp((trapsSabPerGame / 2.5) * 15, 0, 15);
  const orphanPenalty = clamp(meanOrphanStealthCoord * 8, 0, 20);
  const coordScore = Math.round(
    clamp(coordGainBase + stealthActivityBonus - orphanPenalty, 0, 100)
  );

  // ---------------------------------------------------------------------------
  // CRITÈRE 4 : ÉQUITÉ D'EXPOSITION SUR L'ŒIL (J1 .. JN) (/100)
  // ---------------------------------------------------------------------------
  const playerLosses = coordSummary ? coordSummary.meanTreesLostPerPlayer : [];
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

  const ratioPenalty = Math.abs(j1VsOthersRatio - 1.15) * 35;
  const spreadPenalty = Math.max(0, playerLossSpread - 0.30) * 30;
  const fairnessScore = Math.round(clamp(100 - ratioPenalty - spreadPenalty, 0, 100));

  // Pondération globale recalibrée v3.2 :
  // 35% Cible de survie [70%..82%] + 25% Gain Info Privée + 25% Gain Coordination + 15% Équité
  const overallDesignScore = Math.round(
    tensionScore * 0.35 +
      privateInfoScore * 0.25 +
      coordScore * 0.25 +
      fairnessScore * 0.15
  );

  return {
    tensionAndAttrition: {
      score: tensionScore,
      survivalTargetProximityScore: Math.round(survivalTargetProximityScore),
      hsAndExplosionDynamicsScore: Math.round(hsAndExplosionDynamicsScore),
      meanSurvivalHorizon: survCoord,
      meanExplosionsPerGame,
      meanParryAndHSPerGame,
      interpretation: `Survie Coord à ${(survCoord * 100).toFixed(1)}% (Cible [70%–82%]) · ${meanParryAndHSPerGame.toFixed(2)} mises HS et ${meanExplosionsPerGame.toFixed(2)} explosion(s)/partie.`,
    },
    privateInfoValue: {
      score: privateInfoScore,
      deltaSoloVsBlind: privateInfoGainPct,
      treesSavedByPrivateInfo: privateInfoGainTrees,
      interpretation: `Gain Info Privée (Solo vs Aveugle) : ${privateInfoGainPct >= 0 ? '+' : ''}${(privateInfoGainPct * 100).toFixed(1)} pts (${privateInfoGainTrees >= 0 ? '+' : ''}${privateInfoGainTrees.toFixed(2)} arbres sauvés).`,
    },
    coordinationEfficiency: {
      score: coordScore,
      deltaCoordVsSolo: coordinationGainPct,
      treesSavedByCoordination: coordinationGainTrees,
      trapsAndSabotagesPerGame: trapsSabPerGame,
      orphanStealthPerGame: meanOrphanStealthCoord,
      tacticalOverkillPerGame: meanTacticalOverkillCoord,
      interpretation: `Gain Coordination (Coord vs Solo) : ${coordinationGainPct >= 0 ? '+' : ''}${(coordinationGainPct * 100).toFixed(1)} pts (${coordinationGainTrees >= 0 ? '+' : ''}${coordinationGainTrees.toFixed(2)} arbres) · ${trapsSabPerGame.toFixed(2)} pièges/sab., ${meanOrphanStealthCoord.toFixed(2)} furt. orpheline.`,
    },
    evilEyeFairness: {
      score: fairnessScore,
      j1VsOthersRatio,
      playerLossSpread,
      interpretation: `Ratio de pertes J1 / Autres = ${j1VsOthersRatio.toFixed(2)}x · Coût du Brouillard (Omni - Coord) = ${(fogOfWarCostPct * 100).toFixed(1)} pts.`,
    },
    infoAndCoordMetrics,
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
    `# Rapport de Simulation Monte-Carlo — Amazonia v3.2 (Connaissance Privée, Coordination & Nouveaux Leviers)`
  );
  lines.push(`- **Campagne** : ${campaign.config.name} (\`${campaign.id}\`)`);
  lines.push(`- **Type** : \`${campaign.config.type}\``);
  lines.push(`- **Statut** : \`${campaign.status}\``);
  lines.push(
    `- **Règles validées figées en dur (v3.2)** : \`D2-Double = true\`, \`CumulA2 = true\`, \`Régén = true\`, \`ActRep = true\`, \`PurgeSab = true\`, \`MaxN = true\`, Départ \`A & B en case 1 (NORMAL)\``
  );
  lines.push(
    `- **Parties simulées** : ${campaign.progress.completedGames.toLocaleString('fr-FR')} / ${campaign.progress.totalTargetGames.toLocaleString('fr-FR')} (${campaign.progress.gamesPerSecond.toFixed(0)} parties/s)`
  );
  lines.push(``);

  if (campaign.variantResults.length > 0) {
    const sorted = [...campaign.variantResults].sort(
      (a, b) => b.criteria.overallDesignScore - a.criteria.overallDesignScore
    );

    lines.push(
      `## 1. Classement Synthétique des Variantes (Cible Survie Coord [70%–82%], Gain Info Privée & Coordination)`
    );
    lines.push(
      `| ID | Variante (N, X, a & 5 Leviers v3.2) | Note Design (/100) | Survie Aveugle (%) | Survie Solo (%) | Survie Coord (%) | Survie Omni (%) | Gain Info Privée | Gain Coordination | Coût Brouillard | Furt. Orpheline | Overkill Tact. | Abattages (+Bull0) | Terrassements | Mises HS | Pièges+Sab. |`
    );
    lines.push(
      `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`
    );

    for (const v of sorted) {
      const m = v.criteria.infoAndCoordMetrics;
      const coordTable =
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ??
        v.tableSummaries[0];

      if (!coordTable) continue;

      const infoGainStr = `${m.privateInfoGainPct >= 0 ? '+' : ''}${(
        m.privateInfoGainPct * 100
      ).toFixed(1)}% (${m.privateInfoGainTrees >= 0 ? '+' : ''}${m.privateInfoGainTrees.toFixed(1)} arb.)`;
      const coordGainStr = `${m.coordinationGainPct >= 0 ? '+' : ''}${(
        m.coordinationGainPct * 100
      ).toFixed(1)}% (${m.coordinationGainTrees >= 0 ? '+' : ''}${m.coordinationGainTrees.toFixed(1)} arb.)`;
      const fogStr = `${(m.fogOfWarCostPct * 100).toFixed(1)}% (${m.fogOfWarCostTrees.toFixed(1)} arb.)`;

      lines.push(
        `| ${v.variantId} | ${v.variantLabel} | **${v.criteria.overallDesignScore}/100** | ${(m.survBlind * 100).toFixed(1)}% | ${(m.survSolo * 100).toFixed(1)}% | **${(m.survCoord * 100).toFixed(1)}%** | ${(m.survOmni * 100).toFixed(1)}% | ${infoGainStr} | ${coordGainStr} | ${fogStr} | ${m.meanOrphanStealthCoord.toFixed(2)} | ${m.meanTacticalOverkillCoord.toFixed(2)} | ${coordTable.meanCuts.toFixed(2)} (+${coordTable.meanBulldozerDestroyedTrees.toFixed(2)}) | ${coordTable.meanClearings.toFixed(2)} | ${coordTable.meanParryAndHS.toFixed(2)} | ${(coordTable.meanTrapsPlaced + coordTable.meanSabotagesPlaced).toFixed(2)} |`
      );
    }
    lines.push(``);

    lines.push(
      `## 2. Analyse Détaillée de la Connaissance Privée & de la Coordination (Top 20 Variantes)`
    );
    lines.push(
      `Cette section isole l'apport exact de la lecture du dé sous gobelet (**Gain Info Privée** = \`Survie Solo - Survie Aveugle\`), l'apport de la coordination tacite et de la Furtivité (**Gain Coordination** = \`Survie Coord - Survie Solo\`), et le **Coût du Brouillard** (\`Survie Omni - Survie Coord\`).`
    );
    lines.push(``);
    lines.push(
      `| ID | Variante | Survie Aveugle | Survie Solo | Gain Info Privée (% / Arbres) | Survie Coord | Gain Coordination (% / Arbres) | Survie Omni | Coût du Brouillard (% / Arbres) | Furtivité Orpheline (Coord) | Overkill Tactique (Solo → Coord) |`
    );
    lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`);

    for (const v of sorted.slice(0, 20)) {
      const m = v.criteria.infoAndCoordMetrics;
      lines.push(
        `| ${v.variantId} | ${v.variantLabel} | ${(m.survBlind * 100).toFixed(1)}% (${m.treesLostBlind.toFixed(1)} perdus) | ${(m.survSolo * 100).toFixed(1)}% (${m.treesLostSolo.toFixed(1)} perdus) | **${m.privateInfoGainPct >= 0 ? '+' : ''}${(m.privateInfoGainPct * 100).toFixed(1)} pts** (${m.privateInfoGainTrees >= 0 ? '+' : ''}${m.privateInfoGainTrees.toFixed(2)} arb.) | **${(m.survCoord * 100).toFixed(1)}%** (${m.treesLostCoord.toFixed(1)} perdus) | **${m.coordinationGainPct >= 0 ? '+' : ''}${(m.coordinationGainPct * 100).toFixed(1)} pts** (${m.coordinationGainTrees >= 0 ? '+' : ''}${m.coordinationGainTrees.toFixed(2)} arb.) | ${(m.survOmni * 100).toFixed(1)}% (${m.treesLostOmni.toFixed(1)} perdus) | ${(m.fogOfWarCostPct * 100).toFixed(1)} pts (${m.fogOfWarCostTrees.toFixed(2)} arb.) | ${m.meanOrphanStealthCoord.toFixed(2)} / partie | ${m.meanTacticalOverkillSolo.toFixed(2)} → ${m.meanTacticalOverkillCoord.toFixed(2)} / partie |`
      );
    }
    lines.push(``);

    lines.push(`## 3. Détail des Pertes par Tour (1..X) et par Joueur (J1..JN) sur Bot Coordonné`);
    for (const v of sorted.slice(0, 8)) {
      const mainTable =
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ??
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
    lines.push(`## 4. Télémétrie Stress-Test Multi-Cœurs`);
    lines.push(`- **Parties vérifiées** : ${st.totalGamesSimulated.toLocaleString('fr-FR')}`);
    lines.push(`- **Tours simulés** : ${st.totalTurnsSimulated.toLocaleString('fr-FR')}`);
    lines.push(`- **Violations d'invariants (I1..I4)** : ${st.violationsCount}`);
    lines.push(`- **Explosions totales observées** : ${st.totalExplosionsObserved.toLocaleString('fr-FR')}`);
    lines.push(`- **Mises HS défensives** : ${st.totalParryAndHSObserved.toLocaleString('fr-FR')}`);
    lines.push(`- **Pièges & Sabotages posés** : ${st.totalTrapsAndSabotagesObserved.toLocaleString('fr-FR')}`);
  }

  return lines.join('\n');
}

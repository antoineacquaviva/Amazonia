import {
  BulldozerZeroStumpAction,
  CampaignRecord,
  CombatThresholdShift,
  FourCriteriaEvaluation,
  InformationAndCoordinationMetrics,
  ParameterSweepInput,
  ParryHsRule,
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
  const variance =
    arr.reduce((acc, v) => acc + (v - avg) * (v - avg), 0) / arr.length;
  return Math.sqrt(variance);
}

/**
 * Calcule le coefficient de corrélation linéaire de Pearson r in [-1, 1]
 */
function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n <= 2) return 0;
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const denom = Math.sqrt(denX * denY);
  if (denom < 1e-9) return 0;
  return clamp(num / denom, -1, 1);
}

export function buildLeversCode(params: SimulationConfig): string {
  const capStr =
    params.tacticalDefenderCap === 99
      ? '99(Illim)'
      : String(params.tacticalDefenderCap);
  const hsStr =
    (params.parryHsRule ?? 'SYNERGY_TRAP_SAB') === 'SYNERGY_TRAP_SAB'
      ? 'SynergieHS(S>=2)'
      : 'StandardHS(S>=3)';
  return `Cap:${capStr} · Shift:+${params.combatThresholdShift} · ${hsStr} · Bull0:${
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

  const nVals =
    sweep.numPlayersValues?.length > 0 ? sweep.numPlayersValues : [3, 4, 5, 6];
  const xVals =
    sweep.numTurnsValues?.length > 0
      ? sweep.numTurnsValues
      : [6, 7, 8, 9, 10, 12];
  const filteredAVals = (sweep.initialTreesPerCellValues ?? [2]).filter(
    (a) => a === 2 || a === 3
  );
  const aVals = filteredAVals.length > 0 ? filteredAVals : [2];

  const capVals: TacticalDefenderCap[] =
    sweep.tacticalDefenderCapValues?.length > 0
      ? sweep.tacticalDefenderCapValues
      : [1, 2];
  const shiftVals: CombatThresholdShift[] =
    sweep.combatThresholdShiftValues?.length > 0
      ? sweep.combatThresholdShiftValues
      : [0, 1];
  const bullZeroVals: BulldozerZeroStumpAction[] =
    sweep.bulldozerZeroStumpActionValues?.length > 0
      ? sweep.bulldozerZeroStumpActionValues
      : ['DESTROY_TREE'];
  const stumpC2Vals: boolean[] =
    sweep.initialStumpCell2Values?.length > 0
      ? sweep.initialStumpCell2Values
      : [true];
  const presetVals: TacticsTrackPreset[] =
    sweep.tacticsTrackPresetValues?.length > 0
      ? sweep.tacticsTrackPresetValues
      : ['ASSAULT_LOW'];
  const parryHsVals: ParryHsRule[] =
    sweep.parryHsRuleValues && sweep.parryHsRuleValues.length > 0
      ? sweep.parryHsRuleValues
      : ['SYNERGY_TRAP_SAB', 'STANDARD_S3'];
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
            for (const parryHsRule of parryHsVals) {
              for (const bulldozerZeroStumpAction of bullZeroVals) {
                for (const initialStumpCell2 of stumpC2Vals) {
                  for (const tacticsTrackPreset of presetVals) {
                    for (const shuffleTacticsTrack of shufVals) {
                      const params: SimulationConfig = {
                        numPlayers,
                        numTurns,
                        initialTreesPerCell,
                        tacticsTrackPreset,
                        tacticsTrackSetup:
                          resolveTacticsTrackFromPreset(tacticsTrackPreset),
                        shuffleTacticsTrack,
                        tacticalDefenderCap,
                        combatThresholdShift,
                        bulldozerZeroStumpAction,
                        initialStumpCell2,
                        parryHsRule,
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
      meanStep2Revisions: 0,
      meanSuccessfulSignalCompletions: 0,
      meanPlacementRelevanceScore: 0,
      choiceToSurvivalCorrelation: 0,
    };
  }

  const numTurns = games[0].params.numTurns;
  const numPlayers = games[0].params.numPlayers;

  const survivalHorizons = games.map((g) => g.survivalRateHorizon);
  const survivalVisited = games.map((g) => g.survivalRateVisited);
  const treesLostTotals = games.map((g) => g.totalTreesLost);
  const relevanceScores = games.map((g) => g.placementRelevanceScore ?? 0);

  const meanSurvH = mean(survivalHorizons);
  const stdSurvH = stdDev(survivalHorizons, meanSurvH);
  const meanSurvV = mean(survivalVisited);
  const meanLost = mean(treesLostTotals);
  const stdLost = stdDev(treesLostTotals, meanLost);

  const meanTreesLostPerTurn: number[] = [];
  const stdDevTreesLostPerTurn: number[] = [];
  for (let t = 0; t < numTurns; t++) {
    const vals = games.map((g) => g.treesLostPerTurn[t] ?? 0);
    const m = mean(vals);
    meanTreesLostPerTurn.push(m);
    stdDevTreesLostPerTurn.push(stdDev(vals, m));
  }

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

  const choiceToSurvivalCorrelation = pearsonCorrelation(
    relevanceScores,
    survivalHorizons
  );

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
    meanBulldozerDestroyedTrees: mean(
      games.map((g) => g.bulldozerDestroyedTreesCount)
    ),
    meanClearings: mean(games.map((g) => g.clearingsCount)),
    meanStumpsCleared: mean(games.map((g) => g.stumpsClearedCount)),
    meanOverheats: mean(games.map((g) => g.overheatTriggersCount)),
    meanOverheatTreesRemoved: mean(
      games.map((g) => g.overheatTreesRemovedCount)
    ),
    meanAssaults: mean(games.map((g) => g.assaultTriggersCount)),
    meanSimpleParries: mean(games.map((g) => g.simpleParriesCount)),
    meanParryAndHS: mean(games.map((g) => g.parryAndHSCount)),
    meanExplosions: mean(games.map((g) => g.explosionsCount)),
    meanTrapsPlaced: mean(games.map((g) => g.trapsPlacedCount)),
    meanSabotagesPlaced: mean(games.map((g) => g.sabotagesPlacedCount)),
    meanStealthBlockedByLimit: mean(
      games.map((g) => g.stealthBlockedByLimitCount)
    ),
    meanOrphanStealthTokens: mean(games.map((g) => g.orphanStealthTokensCount)),
    meanTacticalOverkillTokens: mean(
      games.map((g) => g.tacticalOverkillTokensCount)
    ),
    meanRepairs: mean(games.map((g) => g.repairsCount)),
    meanActiveRepairsStep31: mean(
      games.map((g) => g.activeRepairsStep31Count)
    ),
    meanSabotageClearedByRepair: mean(
      games.map((g) => g.sabotageClearedByRepairCount)
    ),
    meanRespiteDraws: mean(games.map((g) => g.respiteDrawsOnDestroyedCount)),
    meanStep2Revisions: mean(games.map((g) => g.step2RevisionsCount ?? 0)),
    meanSuccessfulSignalCompletions: mean(
      games.map((g) => g.successfulSignalCompletionsCount ?? 0)
    ),
    meanPlacementRelevanceScore: mean(relevanceScores),
    choiceToSurvivalCorrelation,
  };
}

/**
 * Calcule la Note Design (/100) refondue v3.3 autour des 4 Piliers et des 5 Gains Décisionnels :
 * 1) Tension, Difficulté & Synergie HS (25%) : Survie dans [45%..82%] (plateau optimal [50%..80%]) + dynamisme HS/Terrassements/Abattages.
 * 2) Récompense de la Lecture des Intentions I1 + I2 (30%) : Gain Probabiliste I2 (PROB_ONLY - BLIND) + Vrai Gain I1 en Équipe (COORD_HYBRID - COORD_NO_DICE).
 * 3) Récompense de la Coordination & Boucle Révisable I3 (30%) : Gain Coordination totale (COORD_HYBRID - SOLO_INFORMED) + Gain Boucle 2.2 (COORD_HYBRID - COORD_ONE_SHOT) + Corrélation Choix/Survie r.
 * 4) Efficience Cognitive & Équité (15%) : Faible Coût du Brouillard (OMNI - COORD_HYBRID), zéro Furtivité Orpheline, maîtrise de l'Overkill Tactique et équité sur l'Œil.
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
  const probSummary = byId.get('TABLE_PROB') ?? blindSummary;
  const soloSummary = byId.get('TABLE_SOLO') ?? probSummary;
  const coordNoDiceSummary = byId.get('TABLE_COORD_NO_DICE') ?? soloSummary;
  const coordOneShotSummary = byId.get('TABLE_COORD_ONE_SHOT') ?? soloSummary;
  const coordSummary =
    byId.get('TABLE_COORD') ?? coordOneShotSummary ?? summaries[0];
  const omniSummary = byId.get('TABLE_OMNI') ?? coordSummary;

  const survBlind = blindSummary ? blindSummary.meanSurvivalRateHorizon : 0.45;
  const survProbOnly = probSummary ? probSummary.meanSurvivalRateHorizon : survBlind;
  const survSolo = soloSummary ? soloSummary.meanSurvivalRateHorizon : survProbOnly;
  const survCoordNoDice = coordNoDiceSummary
    ? coordNoDiceSummary.meanSurvivalRateHorizon
    : survProbOnly;
  const survCoordOneShot = coordOneShotSummary
    ? coordOneShotSummary.meanSurvivalRateHorizon
    : survSolo;
  const survCoord = coordSummary ? coordSummary.meanSurvivalRateHorizon : 0.7;
  const survOmni = omniSummary ? omniSummary.meanSurvivalRateHorizon : 0.8;

  const treesLostBlind = blindSummary ? blindSummary.meanTreesLostTotal : 0;
  const treesLostProbOnly = probSummary ? probSummary.meanTreesLostTotal : treesLostBlind;
  const treesLostSolo = soloSummary ? soloSummary.meanTreesLostTotal : treesLostProbOnly;
  const treesLostCoordNoDice = coordNoDiceSummary
    ? coordNoDiceSummary.meanTreesLostTotal
    : treesLostProbOnly;
  const treesLostCoordOneShot = coordOneShotSummary
    ? coordOneShotSummary.meanTreesLostTotal
    : treesLostSolo;
  const treesLostCoord = coordSummary ? coordSummary.meanTreesLostTotal : 0;
  const treesLostOmni = omniSummary ? omniSummary.meanTreesLostTotal : 0;

  // Les 5 Gains Décisionnels v3.3
  const probabilisticReadingGainPct = survProbOnly - survBlind;
  const probabilisticReadingGainTrees = treesLostBlind - treesLostProbOnly;

  const privateInfoSoloGainPct = survSolo - survProbOnly;
  const privateInfoSoloGainTrees = treesLostProbOnly - treesLostSolo;

  const privateInfoTeamGainPct = survCoord - survCoordNoDice;
  const privateInfoTeamGainTrees = treesLostCoordNoDice - treesLostCoord;

  const coordinationOneShotGainPct = survCoordOneShot - survSolo;
  const coordinationOneShotGainTrees = treesLostSolo - treesLostCoordOneShot;

  const step2RevisionLoopGainPct = survCoord - survCoordOneShot;
  const step2RevisionLoopGainTrees = treesLostCoordOneShot - treesLostCoord;

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
  const meanStep2RevisionsCoord = coordSummary
    ? coordSummary.meanStep2Revisions
    : 0;
  const meanSignalCompletionsCoord = coordSummary
    ? coordSummary.meanSuccessfulSignalCompletions
    : 0;
  const choiceToSurvivalCorrelationCoord = coordSummary
    ? coordSummary.choiceToSurvivalCorrelation
    : 0;

  const infoAndCoordMetrics: InformationAndCoordinationMetrics = {
    survBlind,
    survProbOnly,
    survSolo,
    survCoordNoDice,
    survCoordOneShot,
    survCoord,
    survOmni,
    treesLostBlind,
    treesLostProbOnly,
    treesLostSolo,
    treesLostCoordNoDice,
    treesLostCoordOneShot,
    treesLostCoord,
    treesLostOmni,
    probabilisticReadingGainPct,
    probabilisticReadingGainTrees,
    privateInfoSoloGainPct,
    privateInfoSoloGainTrees,
    privateInfoTeamGainPct,
    privateInfoTeamGainTrees,
    privateInfoGainPct: privateInfoTeamGainPct,
    privateInfoGainTrees: privateInfoTeamGainTrees,
    coordinationOneShotGainPct,
    coordinationOneShotGainTrees,
    step2RevisionLoopGainPct,
    step2RevisionLoopGainTrees,
    step2RevisionGainPct: step2RevisionLoopGainPct,
    coordinationGainPct,
    coordinationGainTrees,
    fogOfWarCostPct,
    fogOfWarCostTrees,
    meanOrphanStealthCoord,
    meanTacticalOverkillCoord,
    meanTacticalOverkillSolo,
    meanStep2RevisionsCoord,
    meanSignalCompletionsCoord,
    choiceToSurvivalCorrelationCoord,
  };

  // ---------------------------------------------------------------------------
  // PILIER 1 : TENSION, DIFFICULTÉ & SYNERGIE HS [45% .. 82%] (25%)
  // (Aucune pénalité sous 70% : plateau optimal plein entre 50% et 80%)
  // ---------------------------------------------------------------------------
  let survivalTargetProximityScore = 0;
  if (survCoord >= 0.50 && survCoord <= 0.80) {
    // Plateau optimal plein [50% .. 80%] -> 68..70 / 70
    const distFromMid = Math.abs(survCoord - 0.65);
    survivalTargetProximityScore = 70 - (distFromMid / 0.15) * 2;
  } else if (survCoord >= 0.42 && survCoord < 0.50) {
    // Décroissance douce entre 42% et 50% (Hardcore exigeant)
    survivalTargetProximityScore = 52 + ((survCoord - 0.42) / 0.08) * 16;
  } else if (survCoord < 0.42) {
    // En dessous de 42% : trop punitif / injouable
    survivalTargetProximityScore = clamp((survCoord / 0.42) * 52, 0, 52);
  } else if (survCoord > 0.80 && survCoord <= 0.82) {
    survivalTargetProximityScore = 64;
  } else {
    // Au-dessus de 82% : trop facile (pénalité forte)
    const excess = survCoord - 0.82;
    survivalTargetProximityScore = clamp(64 - (excess / 0.12) * 64, 0, 64);
  }

  const meanExplosionsPerGame = coordSummary ? coordSummary.meanExplosions : 0;
  const meanParryAndHSPerGame = coordSummary ? coordSummary.meanParryAndHS : 0;
  const meanOverheatsPerGame = coordSummary ? coordSummary.meanOverheats : 0;
  const meanClearingsAndBull0 = coordSummary
    ? coordSummary.meanClearings + coordSummary.meanBulldozerDestroyedTrees
    : 0;

  const hsActivityRatio =
    (meanParryAndHSPerGame + meanOverheatsPerGame * 0.5) /
    Math.max(1, params.numTurns * 0.4);
  const hsScore = clamp(hsActivityRatio * 20, 0, 20);
  const attritionDynamicBonus = clamp(
    meanClearingsAndBull0 * 3 + meanExplosionsPerGame * 8,
    0,
    10
  );
  const hsAndExplosionDynamicsScore = clamp(
    hsScore + attritionDynamicBonus,
    0,
    30
  );

  const tensionScore = Math.round(
    clamp(survivalTargetProximityScore + hsAndExplosionDynamicsScore, 0, 100)
  );

  // ---------------------------------------------------------------------------
  // PILIER 2 : RÉCOMPENSE DE LA LECTURE DES INTENTIONS I1 + I2 (30%)
  // Combine Gain de Lecture Probabiliste I2 (PROB_ONLY - BLIND) + Vrai Gain du Dé Privé I1 en Équipe (COORD_HYBRID - COORD_NO_DICE)
  // ---------------------------------------------------------------------------
  const scoreI2 = clamp(
    25 + (probabilisticReadingGainPct / 0.05) * 25,
    0,
    50
  );
  const scoreI1Team = clamp(
    25 + (privateInfoTeamGainPct / 0.04) * 25,
    0,
    50
  );
  const privateInfoScore = Math.round(clamp(scoreI2 + scoreI1Team, 0, 100));

  // ---------------------------------------------------------------------------
  // PILIER 3 : RÉCOMPENSE DE LA COORDINATION & BOUCLE RÉVISABLE I3 (30%)
  // Combine Gain Coordination totale (COORD_HYBRID - SOLO_INFORMED) + Gain Boucle Révision 2.2 (COORD_HYBRID - COORD_ONE_SHOT) + Corrélation Choix/Survie r
  // ---------------------------------------------------------------------------
  const trapsSabPerGame = coordSummary
    ? coordSummary.meanTrapsPlaced + coordSummary.meanSabotagesPlaced
    : 0;
  const scoreCoordTotal = clamp(
    20 + (coordinationGainPct / 0.05) * 25,
    0,
    45
  );
  const scoreRevisionLoop = clamp(
    10 + (step2RevisionLoopGainPct / 0.025) * 25,
    0,
    35
  );
  const scoreCorrelation = clamp(
    Math.max(0, choiceToSurvivalCorrelationCoord) * 25,
    0,
    20
  );
  const orphanPenalty = clamp(meanOrphanStealthCoord * 12, 0, 25);
  const coordScore = Math.round(
    clamp(
      scoreCoordTotal + scoreRevisionLoop + scoreCorrelation - orphanPenalty,
      0,
      100
    )
  );

  // ---------------------------------------------------------------------------
  // PILIER 4 : EFFICIENCE COGNITIVE & ÉQUITÉ SUR L'ŒIL (15%)
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

  const ratioPenalty = Math.abs(j1VsOthersRatio - 1.15) * 28;
  const spreadPenalty = Math.max(0, playerLossSpread - 0.35) * 22;
  const fogPenalty = Math.max(0, fogOfWarCostPct - 0.08) * 120;
  const overkillPenalty = Math.max(0, meanTacticalOverkillCoord - 1.5) * 5;
  const fairnessScore = Math.round(
    clamp(
      100 - ratioPenalty - spreadPenalty - fogPenalty - overkillPenalty,
      0,
      100
    )
  );

  // Pondération globale v3.3 :
  // 25% Tension & Synergie HS + 30% Lecture I1+I2 + 30% Coordination & Boucle 2.2 + 15% Efficience & Équité
  const overallDesignScore = Math.round(
    tensionScore * 0.25 +
      privateInfoScore * 0.30 +
      coordScore * 0.30 +
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
      interpretation: `Survie Coord à ${(survCoord * 100).toFixed(1)}% (Plage valide [45%–82%], optimal [50%–80%]) · ${meanParryAndHSPerGame.toFixed(2)} mises HS/p. (${params.parryHsRule ?? 'SYNERGY_TRAP_SAB'}).`,
    },
    privateInfoValue: {
      score: privateInfoScore,
      deltaSoloVsBlind: privateInfoTeamGainPct,
      treesSavedByPrivateInfo: privateInfoTeamGainTrees,
      interpretation: `Gain Lecture Prob. I2 : ${probabilisticReadingGainPct >= 0 ? '+' : ''}${(probabilisticReadingGainPct * 100).toFixed(1)} pts · Gain Dé Privé I1 en Équipe : ${privateInfoTeamGainPct >= 0 ? '+' : ''}${(privateInfoTeamGainPct * 100).toFixed(1)} pts (Solo I1 : ${privateInfoSoloGainPct >= 0 ? '+' : ''}${(privateInfoSoloGainPct * 100).toFixed(1)} pts).`,
    },
    coordinationEfficiency: {
      score: coordScore,
      deltaCoordVsSolo: coordinationGainPct,
      treesSavedByCoordination: coordinationGainTrees,
      trapsAndSabotagesPerGame: trapsSabPerGame,
      orphanStealthPerGame: meanOrphanStealthCoord,
      tacticalOverkillPerGame: meanTacticalOverkillCoord,
      interpretation: `Gain Coord. I3 : ${coordinationGainPct >= 0 ? '+' : ''}${(coordinationGainPct * 100).toFixed(1)} pts (dont Boucle 2.2 : ${step2RevisionLoopGainPct >= 0 ? '+' : ''}${(step2RevisionLoopGainPct * 100).toFixed(1)} pts, ${meanStep2RevisionsCoord.toFixed(1)} rév./p.) · Corrélation Choix/Survie r = ${choiceToSurvivalCorrelationCoord.toFixed(2)}.`,
    },
    evilEyeFairness: {
      score: fairnessScore,
      j1VsOthersRatio,
      playerLossSpread,
      interpretation: `Coût du Brouillard (Omni - Coord) = ${(fogOfWarCostPct * 100).toFixed(1)} pts · Furt. Orpheline = ${meanOrphanStealthCoord.toFixed(2)} · Ratio J1/Autres = ${j1VsOthersRatio.toFixed(2)}x.`,
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
      if (g.textualJournal && sampleTraces.length < 7) {
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

export function generateCampaignMarkdownReport(
  campaign: CampaignRecord
): string {
  const lines: string[] = [];
  lines.push(
    `# Rapport de Simulation Monte-Carlo — Amazonia v3.3 (Décomposition des 3 Sources d'Information I1/I2/I3, Boucle Révisable 2.2 & Synergie Mise HS)`
  );
  lines.push(`- **Campagne** : ${campaign.config.name} (\`${campaign.id}\`)`);
  lines.push(`- **Type** : \`${campaign.config.type}\``);
  lines.push(`- **Statut** : \`${campaign.status}\``);
  lines.push(
    `- **Invariants figés v3.3** : \`a = 2\`, \`tacticsTrackPreset = 'ASSAULT_LOW'\` (\`[A1, B1, A2, B2, A3, B3]\`), \`bulldozerZeroStumpAction = 'DESTROY_TREE'\`, \`initialStumpCell2 = true\`, \`D2-Double = true\`, \`CumulA2 = true\`, \`Régén = true\`, \`ActRep(3.1) = true\`, \`PurgeSab = true\`, \`MaxN = true\``
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
      `## 1. Classement Synthétique des Variantes v3.3 (7 Profils Orthogonaux & 5 Gains Décisionnels)`
    );
    lines.push(
      `| ID | Variante (N, X, Cap, Shift, SynergieHS) | Note Design | 1.Aveugle | 2.Prob(I2) | 3.Solo(I1+I2) | 4.CoordSansDé | 5.Coord1Passe | 6.CoordRév(Réf) | 7.Omni | Gain I2 (Prob) | Gain I1 (Équipe) | Gain I3 (Coord) | Gain Rév.2.2 | Corrél. r | Mises HS | Furt. Orph. |`
    );
    lines.push(
      `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`
    );

    for (const v of sorted) {
      const m = v.criteria.infoAndCoordMetrics;
      const coordTable =
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ??
        v.tableSummaries[0];

      if (!coordTable) continue;

      const fmtGain = (val: number) =>
        `${val >= 0 ? '+' : ''}${(val * 100).toFixed(1)}%`;

      lines.push(
        `| ${v.variantId} | ${v.variantLabel} | **${v.criteria.overallDesignScore}/100** | ${(m.survBlind * 100).toFixed(1)}% | ${(m.survProbOnly * 100).toFixed(1)}% | ${(m.survSolo * 100).toFixed(1)}% | ${(m.survCoordNoDice * 100).toFixed(1)}% | ${(m.survCoordOneShot * 100).toFixed(1)}% | **${(m.survCoord * 100).toFixed(1)}%** | ${(m.survOmni * 100).toFixed(1)}% | ${fmtGain(m.probabilisticReadingGainPct)} | **${fmtGain(m.privateInfoTeamGainPct)}** | **${fmtGain(m.coordinationGainPct)}** | **${fmtGain(m.step2RevisionLoopGainPct)}** | ${m.choiceToSurvivalCorrelationCoord.toFixed(2)} | ${coordTable.meanParryAndHS.toFixed(2)} | ${m.meanOrphanStealthCoord.toFixed(2)} |`
      );
    }
    lines.push(``);

    lines.push(
      `## 2. Décomposition Shapley des 5 Gains Décisionnels (Top 25 Variantes)`
    );
    lines.push(
      `Cette section décompose la progression exacte du taux de survie entre le plancher aveugle et le plafond omniscient :\n` +
        `1. **Gain Lecture Probabiliste ($I_2$)** = \`Surv(PROB_ONLY) - Surv(BLIND)\`\n` +
        `2. **Gain Dé Privé en Solo ($I_1$ solo)** = \`Surv(SOLO_INFORMED) - Surv(PROB_ONLY)\`\n` +
        `3. **Vrai Gain Marginal du Dé Privé en Équipe ($I_1$ équipe)** = \`Surv(COORD_HYBRID) - Surv(COORD_NO_DICE)\`\n` +
        `4. **Gain Coordination 1-Passe ($I_3$ Étape 2.1)** = \`Surv(COORD_ONE_SHOT) - Surv(SOLO_INFORMED)\`\n` +
        `5. **Gain Boucle Systémique de Révision 2.2 ($I_3$ Étape 2.2)** = \`Surv(COORD_HYBRID) - Surv(COORD_ONE_SHOT)\``
    );
    lines.push(``);
    lines.push(
      `| ID | Variante | 1. Gain I2 (Prob vs Aveugle) | 2. Gain I1 Solo (Solo vs Prob) | 3. Gain I1 Équipe (CoordRév vs CoordSansDé) | 4. Gain Coord 1P (Coord1P vs Solo) | 5. Gain Boucle 2.2 (CoordRév vs Coord1P) | Révisions 2.2 / p. | Signaux Complétés / p. | Corrélation Choix/Survie r | Coût Brouillard (Omni - CoordRév) |`
    );
    lines.push(`|---|---|---|---|---|---|---|---|---|---|---|`);

    for (const v of sorted.slice(0, 25)) {
      const m = v.criteria.infoAndCoordMetrics;
      const fmtPts = (pct: number, trees: number) =>
        `${pct >= 0 ? '+' : ''}${(pct * 100).toFixed(1)} pts (${trees >= 0 ? '+' : ''}${trees.toFixed(2)} arb.)`;

      lines.push(
        `| ${v.variantId} | ${v.variantLabel} | ${fmtPts(m.probabilisticReadingGainPct, m.probabilisticReadingGainTrees)} | ${fmtPts(m.privateInfoSoloGainPct, m.privateInfoSoloGainTrees)} | **${fmtPts(m.privateInfoTeamGainPct, m.privateInfoTeamGainTrees)}** | ${fmtPts(m.coordinationOneShotGainPct, m.coordinationOneShotGainTrees)} | **${fmtPts(m.step2RevisionLoopGainPct, m.step2RevisionLoopGainTrees)}** | ${m.meanStep2RevisionsCoord.toFixed(2)} | ${m.meanSignalCompletionsCoord.toFixed(2)} | **r = ${m.choiceToSurvivalCorrelationCoord.toFixed(2)}** | ${(m.fogOfWarCostPct * 100).toFixed(1)} pts (${m.fogOfWarCostTrees.toFixed(2)} arb.) |`
      );
    }
    lines.push(``);

    lines.push(
      `## 3. Détail des Pertes par Tour (1..X) et par Joueur (J1..JN) sur Bot Coordonné Révisable`
    );
    for (const v of sorted.slice(0, 8)) {
      const mainTable =
        v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ??
        v.tableSummaries[0];
      if (!mainTable) continue;

      lines.push(
        `### ${v.variantId} — ${v.variantLabel} (Profil : ${mainTable.tableConfigName})`
      );
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
    lines.push(`## 4. Télémétrie Stress-Test Multi-Cœurs v3.3`);
    lines.push(
      `- **Parties vérifiées** : ${st.totalGamesSimulated.toLocaleString('fr-FR')}`
    );
    lines.push(
      `- **Tours simulés** : ${st.totalTurnsSimulated.toLocaleString('fr-FR')}`
    );
    lines.push(
      `- **Violations d'invariants (I1..I4)** : ${st.violationsCount}`
    );
    lines.push(
      `- **Explosions totales observées** : ${st.totalExplosionsObserved.toLocaleString('fr-FR')}`
    );
    lines.push(
      `- **Mises HS défensives** : ${st.totalParryAndHSObserved.toLocaleString('fr-FR')}`
    );
    lines.push(
      `- **Pièges & Sabotages posés** : ${st.totalTrapsAndSabotagesObserved.toLocaleString('fr-FR')}`
    );
  }

  return lines.join('\n');
}

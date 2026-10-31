import {
  CampaignRecord,
  EdgeCaseCounts,
  FourCriteriaEvaluation,
  GameParameters,
  ParameterSweepInput,
  SingleGameResult,
  TableConfigSummary,
  TacticId,
  VariantEvaluationResult,
} from './types';
import { createEmptyEdgeCases } from './engine';

const ALL_TACTICS: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Génère la liste de toutes les variantes (produit cartésien) à partir d'un ParameterSweepInput
 */
export function expandParameterSweep(sweep: ParameterSweepInput): Array<{
  variantId: string;
  variantLabel: string;
  params: GameParameters;
}> {
  const results: Array<{ variantId: string; variantLabel: string; params: GameParameters }> = [];
  let idx = 1;

  for (const n of sweep.nValues) {
    for (const q of sweep.qValues) {
      for (const a of sweep.aValues) {
        for (const x of sweep.xValues) {
          for (const stockAbatteuses of sweep.stockAbatteusesValues) {
            for (const modeTirageDes of sweep.modeTirageDesValues) {
              for (const modeResolutionParcelle of sweep.modeResolutionParcelleValues) {
                for (const ordreCasse of sweep.ordreCasseValues) {
                  for (const immobiliteReparation of sweep.immobiliteReparationValues) {
                    for (const ordreMajTactiques of sweep.ordreMajTactiquesValues) {
                      for (const rancuneTerrassementDegrade of sweep.rancuneTerrassementDegradeValues) {
                        for (const granulariteRancune of sweep.granulariteRancuneValues) {
                          for (const nbRegeneration of sweep.nbRegenerationValues) {
                            const params: GameParameters = {
                              n,
                              q,
                              a,
                              x,
                              stockAbatteuses,
                              modeTirageDes,
                              modeResolutionParcelle,
                              ordreCasse,
                              immobiliteReparation,
                              ordreMajTactiques,
                              rancuneTerrassementDegrade,
                              granulariteRancune,
                              nbRegeneration,
                              rMaxCycles: 5,
                            };

                            const diffs: string[] = [`n=${n}`, `q=${q}`, `a=${a}`, `x=${x}`];
                            if (stockAbatteuses !== null) diffs.push(`StockH=${stockAbatteuses}`);
                            if (modeTirageDes !== 'MIN_2D6') diffs.push(`Dés=${modeTirageDes}`);
                            if (modeResolutionParcelle !== 'TRANSACTION_FIGEE')
                              diffs.push(`Rés=${modeResolutionParcelle}`);
                            if (ordreCasse !== 'AVANT_PARCELLE_1') diffs.push(`Casse=${ordreCasse}`);
                            if (!immobiliteReparation) diffs.push(`ImmobRép=Faux`);
                            if (ordreMajTactiques !== 'ORDRE_PISTE_TAC')
                              diffs.push(`MajTac=${ordreMajTactiques}`);
                            if (rancuneTerrassementDegrade) diffs.push(`RancDégradé=Vrai`);
                            if (granulariteRancune !== 'PAR_CASE')
                              diffs.push(`Rancune=${granulariteRancune}`);
                            if (nbRegeneration !== 1) diffs.push(`Régén=${nbRegeneration}`);

                            results.push({
                              variantId: `var_${idx}`,
                              variantLabel: `V${idx} (${diffs.join(', ')})`,
                              params,
                            });
                            idx++;
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
      }
    }
  }

  return results;
}

/**
 * Agrège une série de parties simulées pour une configuration de table donnée
 */
export function summarizeTableGames(
  tableConfigId: string,
  tableConfigName: string,
  games: SingleGameResult[]
): TableConfigSummary {
  const count = Math.max(1, games.length);
  const first = games[0];
  const n = first ? first.params.n : 4;

  let sumRaw = 0;
  let sumMeanPlayer = 0;
  let sumNorm = 0;
  const normScores: number[] = [];

  const brackets = {
    MIRACLE: 0,
    MAJOR_VICTORY: 0,
    COSTLY_VICTORY: 0,
    DEFEAT: 0,
  };

  const rankTreesSum = new Array(n).fill(0);
  let sumHarvActive = 0;
  let sumHarvSpawned = 0;
  let sumHarvDestroyed = 0;
  let sumBulldozerScrap = 0;

  let totalCards = 0;
  let totalParried = 0;
  let totalNoTarget = 0;
  let totalSuccess = 0;
  let totalWastedDefenders = 0;

  let totalCellsWithDefenders = 0;
  let sumD1 = 0;
  let sumD2 = 0;
  let sumD3 = 0;

  const tacticSlot1Sum: Record<TacticId, number> = {
    A1: 0,
    A2: 0,
    A3: 0,
    B1: 0,
    B2: 0,
    B3: 0,
  };
  let totalSlot1Turns = 0;

  for (const g of games) {
    sumRaw += g.rawScore;
    sumMeanPlayer += g.meanScorePerPlayer;
    sumNorm += g.normalizedScore;
    normScores.push(g.normalizedScore);
    brackets[g.victoryBracket] += 1;

    for (let r = 0; r < n; r++) {
      rankTreesSum[r] += g.perInitialRankFinalTrees[r] || 0;
    }

    sumHarvActive += g.meanActiveHarvestersPerTurn;
    sumHarvSpawned += g.totalHarvestersSpawned;
    sumHarvDestroyed += g.totalHarvestersDestroyed;
    sumBulldozerScrap += g.totalBulldozersDestroyed;

    totalCards += g.totalCardsPlaced;
    totalParried += g.totalCardsParried;
    totalNoTarget += g.totalCardsNoTarget;
    totalSuccess += g.totalCardsSucceeded;
    totalWastedDefenders += g.wastedDefendersCount;

    sumD1 += g.defenderThresholdCounts.d1;
    sumD2 += g.defenderThresholdCounts.d2;
    sumD3 += g.defenderThresholdCounts.d3Plus;
    totalCellsWithDefenders +=
      g.defenderThresholdCounts.d1 +
      g.defenderThresholdCounts.d2 +
      g.defenderThresholdCounts.d3Plus;

    for (const tac of ALL_TACTICS) {
      tacticSlot1Sum[tac] += g.tacticSlot1Turns[tac] || 0;
      totalSlot1Turns += g.tacticSlot1Turns[tac] || 0;
    }
  }

  normScores.sort((a, b) => a - b);
  const meanNormalizedScore = sumNorm / count;
  let variance = 0;
  for (const s of normScores) {
    variance += (s - meanNormalizedScore) ** 2;
  }
  const stdDevNormalizedScore = Math.sqrt(variance / count);
  const medianNormalizedScore = normScores[Math.floor(normScores.length / 2)] || 0;

  const decilesNormalizedScore: number[] = [];
  for (let d = 1; d <= 9; d++) {
    const pos = Math.min(
      normScores.length - 1,
      Math.floor((d / 10) * normScores.length)
    );
    decilesNormalizedScore.push(normScores[pos] || 0);
  }

  const totalDefendersPlaced = count * n * (first ? first.params.x : 8) * 2;
  const safeCards = Math.max(1, totalCards);
  const safeDCells = Math.max(1, totalCellsWithDefenders);
  const safeSlot1 = Math.max(1, totalSlot1Turns);

  return {
    tableConfigId,
    tableConfigName,
    botProfiles: first ? first.botProfiles : ['COOPERATIVE'],
    gamesCount: games.length,
    meanRawScore: sumRaw / count,
    meanScorePerPlayer: sumMeanPlayer / count,
    meanNormalizedScore,
    stdDevNormalizedScore,
    medianNormalizedScore,
    decilesNormalizedScore,
    victoryBracketsRate: {
      MIRACLE: brackets.MIRACLE / count,
      MAJOR_VICTORY: brackets.MAJOR_VICTORY / count,
      COSTLY_VICTORY: brackets.COSTLY_VICTORY / count,
      DEFEAT: brackets.DEFEAT / count,
    },
    perInitialRankMeanTrees: rankTreesSum.map((s) => s / count),
    meanHarvestersActive: sumHarvActive / count,
    meanHarvestersSpawned: sumHarvSpawned / count,
    meanHarvestersDestroyed: sumHarvDestroyed / count,
    meanBulldozerTripsToScrap: sumBulldozerScrap / count,
    cardParriedRate: totalParried / safeCards,
    cardNoTargetRate: totalNoTarget / safeCards,
    cardSuccessRate: totalSuccess / safeCards,
    wastedDefenderRate: totalWastedDefenders / Math.max(1, totalDefendersPlaced),
    d1Rate: sumD1 / safeDCells,
    d2Rate: sumD2 / safeDCells,
    d3PlusRate: sumD3 / safeDCells,
    tacticSlot1Distribution: {
      A1: tacticSlot1Sum.A1 / safeSlot1,
      A2: tacticSlot1Sum.A2 / safeSlot1,
      A3: tacticSlot1Sum.A3 / safeSlot1,
      B1: tacticSlot1Sum.B1 / safeSlot1,
      B2: tacticSlot1Sum.B2 / safeSlot1,
      B3: tacticSlot1Sum.B3 / safeSlot1,
    },
  };
}

/**
 * Évalue mathématiquement les 4 critères de Game Design sur une variante
 */
export function evaluateFourCriteria(
  params: GameParameters,
  gamesByCategory: {
    random: SingleGameResult[];
    selfish: SingleGameResult[];
    cooperative: SingleGameResult[];
    strategist: SingleGameResult[];
    omniscient: SingleGameResult[];
    allPrimaryGames: SingleGameResult[];
  }
): FourCriteriaEvaluation {
  const refGames =
    gamesByCategory.cooperative.length > 0
      ? gamesByCategory.cooperative
      : gamesByCategory.allPrimaryGames;
  const gCount = Math.max(1, refGames.length);

  const meanNorm = (arr: SingleGameResult[]): number =>
    arr.length > 0 ? arr.reduce((acc, g) => acc + g.normalizedScore, 0) / arr.length : 0;

  const scoreRandom = meanNorm(gamesByCategory.random);
  const scoreSelfish = meanNorm(gamesByCategory.selfish);
  const scoreCoop = meanNorm(gamesByCategory.cooperative.length > 0 ? gamesByCategory.cooperative : refGames);
  const scoreStrategist = meanNorm(
    gamesByCategory.strategist.length > 0 ? gamesByCategory.strategist : refGames
  );
  const scoreOmniscient = meanNorm(
    gamesByCategory.omniscient.length > 0 ? gamesByCategory.omniscient : refGames
  );

  // ==========================================================================
  // 1. SIMPLICITÉ ET ERGONOMIE (Fluidité & Charge cognitive de manipulation)
  // ==========================================================================
  let totalCards = 0;
  let totalNoTargetCards = 0;
  let sumBrainPermutations = 0;
  let sumRepositionings = 0;
  let sumLockCycles = 0;
  let totalEdgeCases = 0;

  for (const g of refGames) {
    totalCards += g.totalCardsPlaced;
    totalNoTargetCards += g.totalCardsNoTarget;
    sumBrainPermutations += g.meanBrainPermutationsPerTurn;
    sumRepositionings += g.meanRepositioningsPerTurn;
    sumLockCycles += g.meanStep2LockCycle;
    totalEdgeCases +=
      g.edgeCases.H1_noTargetEligible +
      g.edgeCases.H2_multipleHarvesterCardsSingleTree +
      g.edgeCases.H3_multipleBulldozerCardsSameCell +
      g.edgeCases.H4_repairedBulldozerImmunityInCell1 +
      g.edgeCases.H6_multiEventSameCellSingleGrudge;
  }

  const directResolutionRate =
    totalCards > 0 ? 1 - totalNoTargetCards / totalCards : 1;
  const meanManipulationsPerTurn =
    (sumBrainPermutations + sumRepositionings) / gCount;
  const meanNegotiationCycles = sumLockCycles / gCount;
  const edgeCaseFrequencyPerGame = totalEdgeCases / gCount;

  // Score Simplicité (sur 100) :
  // - 40 pts : Taux de résolution directe (moins il y a de cartes "sans objet" ou H1, plus la règle est intuitive)
  // - 35 pts : Sobriété des manipulations par tour (idéal <= 5 manipulations/tour, pénalisé si > 10)
  // - 25 pts : Fluidité de négociation et faible taux de cas limites complexes
  const manipScore = clamp(100 - Math.max(0, meanManipulationsPerTurn - 3.5) * 9.5, 15, 100);
  const edgePenalty = clamp(100 - edgeCaseFrequencyPerGame * 6.5, 20, 100);
  const simplicityScore = Math.round(
    clamp(
      directResolutionRate * 40 + (manipScore / 100) * 35 + (edgePenalty / 100) * 25,
      0,
      100
    )
  );

  const simplicityInterpretation =
    simplicityScore >= 78
      ? `Excellente fluidité (${meanManipulationsPerTurn.toFixed(1)} manip./tour, ${(directResolutionRate * 100).toFixed(0)}% de cartes à effet direct).`
      : simplicityScore >= 58
      ? `Charge de manipulation modérée (${meanManipulationsPerTurn.toFixed(1)} manip./tour, ${edgeCaseFrequencyPerGame.toFixed(1)} cas limites/partie).`
      : `Forte lourdeur mécanique (${meanManipulationsPerTurn.toFixed(1)} manip./tour et ${(100 - directResolutionRate * 100).toFixed(0)}% de cartes sans objet).`;

  // ==========================================================================
  // 2. INTÉRÊT STRATÉGIQUE (Impact de la maîtrise, diversité tactique, équité)
  // ==========================================================================
  const skillGapStrategistVsSelfish = Math.max(0, scoreStrategist - scoreSelfish);
  const skillGapSelfishVsRandom = Math.max(0, scoreSelfish - scoreRandom);
  const totalSkillSpan = Math.max(0, scoreStrategist - scoreRandom);

  // Entropie de Shannon normalisée sur la présence en Case 1 de la Piste des Tactiques
  const slot1Counts: Record<TacticId, number> = { A1: 0, A2: 0, A3: 0, B1: 0, B2: 0, B3: 0 };
  let totalTurns = 0;
  for (const g of refGames) {
    for (const tac of ALL_TACTICS) {
      slot1Counts[tac] += g.tacticSlot1Turns[tac] || 0;
      totalTurns += g.tacticSlot1Turns[tac] || 0;
    }
  }
  let shannonEntropy = 0;
  if (totalTurns > 0) {
    for (const tac of ALL_TACTICS) {
      const p = slot1Counts[tac] / totalTurns;
      if (p > 0) {
        shannonEntropy -= p * Math.log2(p);
      }
    }
  }
  const tacticSlot1Entropy = clamp(shannonEntropy / Math.log2(6), 0, 1);

  // Équité des Rangs initiaux sur l'Œil
  const maxTreesPerSector = params.q * params.a;
  const rankMeans = new Array(params.n).fill(0);
  for (const g of refGames) {
    for (let r = 0; r < params.n; r++) {
      rankMeans[r] += (g.perInitialRankFinalTrees[r] || 0) / maxTreesPerSector;
    }
  }
  for (let r = 0; r < params.n; r++) rankMeans[r] /= gCount;
  const avgRankSurv = rankMeans.reduce((a, b) => a + b, 0) / params.n;
  const rankStdDev = Math.sqrt(
    rankMeans.reduce((acc, v) => acc + (v - avgRankSurv) ** 2, 0) / params.n
  );
  const initialRankFairnessIndex = clamp(1 - rankStdDev * 2.5, 0, 1);

  // Un écart total (Stratège N3 - Aléatoire) >= 28% et (Stratège N3 - Égoïste N1) >= 10% traduit une vraie profondeur
  const skillScoreComponent = clamp((totalSkillSpan / 0.30) * 55 + (skillGapStrategistVsSelfish / 0.12) * 45, 0, 100);
  const strategicScore = Math.round(
    clamp(
      skillScoreComponent * 0.50 +
        tacticSlot1Entropy * 100 * 0.25 +
        initialRankFairnessIndex * 100 * 0.25,
      0,
      100
    )
  );

  const strategicInterpretation =
    strategicScore >= 75
      ? `Forte profondeur : la maîtrise rapporte +${(totalSkillSpan * 100).toFixed(1)}% de forêt sauvée et les 6 tactiques tournent sainement (entropie ${(tacticSlot1Entropy * 100).toFixed(0)}%).`
      : strategicScore >= 55
      ? `Profondeur intermédiaire : gain stratégique de +${(totalSkillSpan * 100).toFixed(1)}%, entropie tactique de ${(tacticSlot1Entropy * 100).toFixed(0)}%.`
      : `Impact stratégique limité (+${(totalSkillSpan * 100).toFixed(1)}%) ou monopole excessif d'une tactique en Case 1.`;

  // ==========================================================================
  // 3. TENSION ET CHOIX DIFFICILES (Dilemmes, Pression & Courbe dramatique)
  // ==========================================================================
  let sumDilemmaRate = 0;
  let sumPressureRatio = 0;
  let closeGamesCount = 0;

  for (const g of refGames) {
    sumDilemmaRate += g.dilemmaRate;
    sumPressureRatio += g.threatToDefenseRatio;
    // Une partie est "serrée / dramatique" si elle se joue entre 45% et 82% d'arbres sauvés
    // ou si la régénération finale fait basculer de palier de victoire
    const beforeNorm = g.standingBeforeRegen / (params.n * params.q * params.a);
    const crossedThresholdByRegen =
      (beforeNorm < 0.5 && g.normalizedScore >= 0.5) ||
      (beforeNorm < 0.75 && g.normalizedScore >= 0.75);
    if (
      (g.normalizedScore >= 0.45 && g.normalizedScore <= 0.82) ||
      crossedThresholdByRegen
    ) {
      closeGamesCount++;
    }
  }

  const dilemmaFrequency = sumDilemmaRate / gCount;
  const pressureToDefenseRatio = sumPressureRatio / gCount;
  const closeGameRate = closeGamesCount / gCount;

  // Sweet spot de survie pour une équipe coopérative : autour de 68% (entre 55% et 80%)
  // Si > 92% le jeu est trop facile ; si < 35% le jeu est punitif / décourageant
  const distFromSweetSpot = Math.abs(scoreCoop - 0.68);
  const survivalSweetSpotProximity = clamp(1 - distFromSweetSpot / 0.35, 0, 1);
  const dilemmaComponent = clamp(dilemmaFrequency / 0.32, 0, 1);

  const tensionScore = Math.round(
    clamp(
      survivalSweetSpotProximity * 100 * 0.40 +
        closeGameRate * 100 * 0.35 +
        dilemmaComponent * 100 * 0.25,
      0,
      100
    )
  );

  const tensionInterpretation =
    scoreCoop > 0.9
      ? `Tension faible : les joueurs sauvent ${(scoreCoop * 100).toFixed(1)}% des arbres trop facilement.`
      : scoreCoop < 0.42
      ? `Pression écrasante : taux de survie trop bas (${(scoreCoop * 100).toFixed(1)}%), menaces disproportionnées.`
      : `Excellente tension dramatique : ${(closeGameRate * 100).toFixed(0)}% de parties serrées et ${(dilemmaFrequency * 100).toFixed(0)}% d'arbitrages difficiles.`;

  // ==========================================================================
  // 4. INTÉRÊT À COLLABORER EFFICACEMENT (Synergie, Seuils D=2/D=3 & Signalisation)
  // ==========================================================================
  const communicationGainCoopVsSelfish = Math.max(0, scoreCoop - scoreSelfish);
  let sumCoordDestructions = 0;
  let sumOverkillAvoided = 0;
  let sumWasted = 0;

  for (const g of refGames) {
    sumCoordDestructions += g.coordinatedDestructionsCount;
    sumOverkillAvoided += g.overkillAvoidedInStep2;
    sumWasted += g.wastedDefendersCount;
  }

  const coordinatedDestructionRate = sumCoordDestructions / (gCount * params.x);
  const overkillReductionEfficiency = clamp(
    sumOverkillAvoided / Math.max(1, sumOverkillAvoided + sumWasted),
    0,
    1
  );

  const maxInfoGap = Math.max(0.03, scoreOmniscient - scoreSelfish);
  const informationEfficiencyVsOmniscient = clamp(
    communicationGainCoopVsSelfish / maxInfoGap,
    0,
    1
  );

  const collabGainComponent = clamp(communicationGainCoopVsSelfish / 0.14, 0, 1);
  const coordDestructComponent = clamp(coordinatedDestructionRate / 0.45, 0, 1);

  const collaborationScore = Math.round(
    clamp(
      collabGainComponent * 100 * 0.40 +
        coordDestructComponent * 100 * 0.30 +
        informationEfficiencyVsOmniscient * 100 * 0.15 +
        overkillReductionEfficiency * 100 * 0.15,
      0,
      100
    )
  );

  const collaborationInterpretation =
    collaborationScore >= 75
      ? `Coopération indispensable : la communication muette apporte +${(communicationGainCoopVsSelfish * 100).toFixed(1)}% de survie et ${(coordinatedDestructionRate * params.x).toFixed(1)} destructions coordonnées/partie.`
      : collaborationScore >= 52
      ? `Coopération utile (+${(communicationGainCoopVsSelfish * 100).toFixed(1)}% vs jeu égoïste, ${(coordinatedDestructionRate * params.x).toFixed(1)} destructions/partie).`
      : `Jeu trop solitaire : faible écart (+${(communicationGainCoopVsSelfish * 100).toFixed(1)}%) entre joueurs communicants et joueurs myopes.`;

  const overallDesignScore = Math.round(
    simplicityScore * 0.22 +
      strategicScore * 0.26 +
      tensionScore * 0.26 +
      collaborationScore * 0.26
  );

  return {
    simplicityErgonomics: {
      score: simplicityScore,
      directResolutionRate,
      meanManipulationsPerTurn,
      meanNegotiationCycles,
      edgeCaseFrequencyPerGame,
      interpretation: simplicityInterpretation,
    },
    strategicInterest: {
      score: strategicScore,
      skillGapStrategistVsSelfish,
      skillGapSelfishVsRandom,
      tacticSlot1Entropy,
      initialRankFairnessIndex,
      interpretation: strategicInterpretation,
    },
    tensionToughChoices: {
      score: tensionScore,
      dilemmaFrequency,
      pressureToDefenseRatio,
      closeGameRate,
      survivalSweetSpotProximity,
      interpretation: tensionInterpretation,
    },
    collaborationInterest: {
      score: collaborationScore,
      communicationGainCoopVsSelfish,
      coordinatedDestructionRate,
      overkillReductionEfficiency,
      informationEfficiencyVsOmniscient,
      interpretation: collaborationInterpretation,
    },
    overallDesignScore,
  };
}

/**
 * Additionne deux compteurs de cas limites H1..H7
 */
export function addEdgeCases(target: EdgeCaseCounts, source: EdgeCaseCounts): void {
  target.H1_noTargetEligible += source.H1_noTargetEligible;
  target.H2_multipleHarvesterCardsSingleTree += source.H2_multipleHarvesterCardsSingleTree;
  target.H3_multipleBulldozerCardsSameCell += source.H3_multipleBulldozerCardsSameCell;
  target.H4_repairedBulldozerImmunityInCell1 += source.H4_repairedBulldozerImmunityInCell1;
  target.H5_degradedBulldozerNoGrudge += source.H5_degradedBulldozerNoGrudge;
  target.H6_multiEventSameCellSingleGrudge += source.H6_multiEventSameCellSingleGrudge;
  target.H7_preventiveDestructionNoCard += source.H7_preventiveDestructionNoCard;
  target.H7_emptyCellOverDefense += source.H7_emptyCellOverDefense;
}

/**
 * Génère un rapport Markdown exhaustif, structuré pour être soumis directement à une IA (Prompt-Ready)
 */
export function generateCampaignMarkdownReport(campaign: CampaignRecord): string {
  const lines: string[] = [];

  lines.push(`# BILAN STATISTIQUE & RAPPORT D'ANALYSE IA — « AMAZONIA : DERNIER REMPART »`);
  lines.push('');
  lines.push(`> **Instructions pour l'IA Analyste :**`);
  lines.push(
    `> Ce document contient les résultats complets d'une campagne de simulation Monte-Carlo du jeu de plateau coopératif *Amazonia : Dernier Rempart*.`
  );
  lines.push(
    `> Merci d'analyser : (1) l'équilibrage mathématique global et la pertinence des variantes testées, (2) les scores sur les 4 critères de Game Design (Simplicité/Ergonomie, Intérêt Stratégique, Tension/Choix difficiles, Intérêt à Collaborer), (3) l'équité de départ selon le Rang sur l'Œil du Contremaître, et (4) les cas limites (H1-H7) ou anomalies révélés par les journaux textuels.`
  );
  lines.push('');
  lines.push(`## 1. Métadonnées de la Campagne`);
  lines.push(`- **Nom de la campagne** : ${campaign.config.name}`);
  lines.push(`- **Type de campagne** : ${campaign.config.type === 'EVALUATION_SWEEP' ? 'Évaluation Multi-Variantes & 4 Critères' : 'Stress-Test Longue Durée & Vérification Formelle (VM Oracle)'}`);
  lines.push(`- **Statut** : ${campaign.status}`);
  lines.push(`- **Parties simulées** : ${campaign.progress.completedGames.toLocaleString('fr-FR')} parties (${campaign.progress.gamesPerSecond.toFixed(0)} parties/sec, durée : ${campaign.progress.elapsedSeconds.toFixed(1)}s)`);
  lines.push(`- **Graine de base (Seed)** : ${campaign.config.baseSeed}`);
  lines.push('');

  if (campaign.stressTelemetry) {
    const st = campaign.stressTelemetry;
    lines.push(`## 2. Bilan de Vérification Formelle & Stress-Test (Invariants & Cas Limites)`);
    lines.push(`- **Tours complets simulés** : ${st.totalTurnsSimulated.toLocaleString('fr-FR')}`);
    lines.push(`- **Points de contrôle d'invariants vérifiés (I1 à I4)** : ${st.invariantsVerifiedCount.toLocaleString('fr-FR')}`);
    lines.push(`- **Violations d'invariants détectées** : **${st.violationsCount}**`);
    lines.push(`- **Parties avec tours stagnants (aucune évolution d'état)** : ${st.stagnantGamesCount} (${((st.stagnantGamesCount / Math.max(1, st.totalGamesSimulated)) * 100).toFixed(3)}%)`);
    lines.push(`- **Destructions totales précoces de la forêt avant le dernier tour** : ${st.earlyWipeoutGamesCount} (${((st.earlyWipeoutGamesCount / Math.max(1, st.totalGamesSimulated)) * 100).toFixed(3)}%)`);
    lines.push(`- **Monopoles de Tactique (100% des tours en Case 1)** : ${st.tacticMonopolyGamesCount} (${((st.tacticMonopolyGamesCount / Math.max(1, st.totalGamesSimulated)) * 100).toFixed(3)}%)`);
    lines.push(`- **Graines insolubles même pour le Bot Omniscient (Défaite < 50%)** : ${st.omniscientUnwinnableSeedsCount}`);
    lines.push('');
    lines.push(`### Occurrences des Cas Limites (Annexe H1 à H7)`);
    lines.push(`| Code | Cas Limite / Règle | Occurrences Totales | Fréquence / Partie |`);
    lines.push(`| :--- | :--- | ---: | ---: |`);
    const gDiv = Math.max(1, st.totalGamesSimulated);
    lines.push(`| **H1** | Tactique A1/A2/A3 sans cible éligible (ou Abatteuse bloquée en p=q) | ${st.edgeCaseOccurrences.H1_noTargetEligible} | ${(st.edgeCaseOccurrences.H1_noTargetEligible / gDiv).toFixed(2)} |`);
    lines.push(`| **H2** | Superposition >=2 cartes Abattage sur 1 seul Arbre debout (Image figée) | ${st.edgeCaseOccurrences.H2_multipleHarvesterCardsSingleTree} | ${(st.edgeCaseOccurrences.H2_multipleHarvesterCardsSingleTree / gDiv).toFixed(2)} |`);
    lines.push(`| **H3** | Superposition >=2 cartes Bulldozer sur le même emplacement | ${st.edgeCaseOccurrences.H3_multipleBulldozerCardsSameCell} | ${(st.edgeCaseOccurrences.H3_multipleBulldozerCardsSameCell / gDiv).toFixed(2)} |`);
    lines.push(`| **H4** | Bulldozer réparé en p=0 immunisé contre D>=3 en Parcelle 1 au même tour | ${st.edgeCaseOccurrences.H4_repairedBulldozerImmunityInCell1} | ${(st.edgeCaseOccurrences.H4_repairedBulldozerImmunityInCell1 / gDiv).toFixed(2)} |`);
    lines.push(`| **H5** | Terrassement dégradé (D=1 sur Parcelle avec Bulldozer) sans Rancune | ${st.edgeCaseOccurrences.H5_degradedBulldozerNoGrudge} | ${(st.edgeCaseOccurrences.H5_degradedBulldozerNoGrudge / gDiv).toFixed(2)} |`);
    lines.push(`| **H6** | Multi-événements défensifs sur une même case (Rancune plafonnée PAR_CASE) | ${st.edgeCaseOccurrences.H6_multiEventSameCellSingleGrudge} | ${(st.edgeCaseOccurrences.H6_multiEventSameCellSingleGrudge / gDiv).toFixed(2)} |`);
    lines.push(`| **H7a** | Destruction préventive de machine (D>=2 ou D>=3) sans carte Manœuvre | ${st.edgeCaseOccurrences.H7_preventiveDestructionNoCard} | ${(st.edgeCaseOccurrences.H7_preventiveDestructionNoCard / gDiv).toFixed(2)} |`);
    lines.push(`| **H7b** | Sur-défense à vide (jetons posés sur une case sans carte ni machine) | ${st.edgeCaseOccurrences.H7_emptyCellOverDefense} | ${(st.edgeCaseOccurrences.H7_emptyCellOverDefense / gDiv).toFixed(2)} |`);
    lines.push('');

    lines.push(`### Performance Comparée par Profil de Bot (Stress-Test)`);
    lines.push(`| Profil de Bot | Parties | Score Normalisé Moyen | Min | Max | Taux Défaite (<50%) | Taux Miracle (100%) |`);
    lines.push(`| :--- | ---: | ---: | ---: | ---: | ---: | ---: |`);
    for (const [botId, stats] of Object.entries(st.scoreDistributionByBotLevel)) {
      if (stats.games > 0) {
        lines.push(
          `| **${botId}** | ${stats.games} | ${(stats.meanNormalized * 100).toFixed(1)}% | ${(stats.minNormalized * 100).toFixed(1)}% | ${(stats.maxNormalized * 100).toFixed(1)}% | ${(stats.defeatRate * 100).toFixed(1)}% | ${(stats.miracleRate * 100).toFixed(1)}% |`
        );
      }
    }
    lines.push('');
  }

  if (campaign.variantResults.length > 0) {
    lines.push(`## 3. Synthèse Comparative des Variantes & Évaluation des 4 Critères`);
    lines.push(
      `| Variante | Score Design Global | 1. Simplicité & Ergo | 2. Intérêt Stratégique | 3. Tension & Dilemmes | 4. Intérêt Collaboration | Préservation Moy. (Coop N2) |`
    );
    lines.push(`| :--- | ---: | ---: | ---: | ---: | ---: | ---: |`);

    for (const v of campaign.variantResults) {
      const coopTable =
        v.tableSummaries.find((t) => t.botProfiles.includes('COOPERATIVE')) ||
        v.tableSummaries[0];
      const coopNorm = coopTable ? `${(coopTable.meanNormalizedScore * 100).toFixed(1)}%` : 'N/A';
      lines.push(
        `| **${v.variantLabel}** | **${v.criteria.overallDesignScore}/100** | ${v.criteria.simplicityErgonomics.score}/100 | ${v.criteria.strategicInterest.score}/100 | ${v.criteria.tensionToughChoices.score}/100 | ${v.criteria.collaborationInterest.score}/100 | ${coopNorm} |`
      );
    }
    lines.push('');

    lines.push(`## 4. Analyse Détaillée par Variante`);
    for (const v of campaign.variantResults) {
      lines.push(`### ${v.variantLabel}`);
      const c = v.criteria;
      lines.push(`- **Note Globale de Game Design : ${c.overallDesignScore}/100**`);
      lines.push(
        `  - **Simplicité & Ergonomie (${c.simplicityErgonomics.score}/100)** : ${c.simplicityErgonomics.interpretation} (Résolution directe: ${(c.simplicityErgonomics.directResolutionRate * 100).toFixed(1)}%, Manipulations/tour: ${c.simplicityErgonomics.meanManipulationsPerTurn.toFixed(2)}, Cycles négociation: ${c.simplicityErgonomics.meanNegotiationCycles.toFixed(2)})`
      );
      lines.push(
        `  - **Intérêt Stratégique (${c.strategicInterest.score}/100)** : ${c.strategicInterest.interpretation} (Gain Stratège vs Égoïste: +${(c.strategicInterest.skillGapStrategistVsSelfish * 100).toFixed(1)}%, Gain Égoïste vs Aléatoire: +${(c.strategicInterest.skillGapSelfishVsRandom * 100).toFixed(1)}%, Entropie Case 1: ${(c.strategicInterest.tacticSlot1Entropy * 100).toFixed(1)}%, Équité Œil: ${(c.strategicInterest.initialRankFairnessIndex * 100).toFixed(1)}%)`
      );
      lines.push(
        `  - **Tension & Choix Difficiles (${c.tensionToughChoices.score}/100)** : ${c.tensionToughChoices.interpretation} (Taux de dilemmes <15%: ${(c.tensionToughChoices.dilemmaFrequency * 100).toFixed(1)}%, Ratio Menaces/Défenseurs: ${c.tensionToughChoices.pressureToDefenseRatio.toFixed(2)}, Parties serrées: ${(c.tensionToughChoices.closeGameRate * 100).toFixed(1)}%)`
      );
      lines.push(
        `  - **Intérêt à Collaborer (${c.collaborationInterest.score}/100)** : ${c.collaborationInterest.interpretation} (Gain Communication N2 vs N1: +${(c.collaborationInterest.communicationGainCoopVsSelfish * 100).toFixed(1)}%, Efficacité vs Omniscient: ${(c.collaborationInterest.informationEfficiencyVsOmniscient * 100).toFixed(1)}%)`
      );
      lines.push('');

      lines.push(`#### Résultats par Configuration de Table (${v.variantLabel})`);
      lines.push(
        `| Table | Score Brut Moy. | Arbres/J | Préservation % | Écart-Type | Miracle | Majeure | Coûteuse | Défaite | Parades % | Sans Objet % | Gaspillage Déf. % |`
      );
      lines.push(
        `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`
      );
      for (const ts of v.tableSummaries) {
        lines.push(
          `| ${ts.tableConfigName} | ${ts.meanRawScore.toFixed(2)} | ${ts.meanScorePerPlayer.toFixed(2)} | **${(ts.meanNormalizedScore * 100).toFixed(1)}%** | ${(ts.stdDevNormalizedScore * 100).toFixed(1)}% | ${(ts.victoryBracketsRate.MIRACLE * 100).toFixed(1)}% | ${(ts.victoryBracketsRate.MAJOR_VICTORY * 100).toFixed(1)}% | ${(ts.victoryBracketsRate.COSTLY_VICTORY * 100).toFixed(1)}% | ${(ts.victoryBracketsRate.DEFEAT * 100).toFixed(1)}% | ${(ts.cardParriedRate * 100).toFixed(1)}% | ${(ts.cardNoTargetRate * 100).toFixed(1)}% | ${(ts.wastedDefenderRate * 100).toFixed(1)}% |`
        );
      }
      lines.push('');

      const refTable =
        v.tableSummaries.find((t) => t.botProfiles.includes('COOPERATIVE')) ||
        v.tableSummaries[0];
      if (refTable) {
        lines.push(
          `#### Asymétrie selon le Rang Initial sur l'Œil & Stabilité des Tactiques (${refTable.tableConfigName})`
        );
        lines.push(
          `- **Arbres sauvés moyens selon le Rang initial sur l'Œil (sur ${v.params.q * v.params.a} arbres)** : ${refTable.perInitialRankMeanTrees
            .map((val, idx) => `Rang ${idx + 1}: **${val.toFixed(2)}** (${((val / (v.params.q * v.params.a)) * 100).toFixed(1)}%)`)
            .join(' | ')}`
        );
        lines.push(
          `- **Fréquence de présence en Case 1 (Piste des Tactiques)** : ${ALL_TACTICS.map(
            (tac) => `${tac}: ${(refTable.tacticSlot1Distribution[tac] * 100).toFixed(1)}%`
          ).join(' | ')}`
        );
        lines.push(
          `- **Dynamique des Machines (moyenne/partie)** : Abatteuses actives/tour = ${refTable.meanHarvestersActive.toFixed(2)} | Abatteuses générées = ${refTable.meanHarvestersSpawned.toFixed(2)} | Abatteuses détruites = ${refTable.meanHarvestersDestroyed.toFixed(2)} | Allers en Casse Bulldozers = ${refTable.meanBulldozerTripsToScrap.toFixed(2)}`
        );
        lines.push('');
      }
    }
  }

  // Inclusion des journaux textuels détaillés pour interprétation par l'IA
  lines.push(`## 5. Journaux Textuels Détaillés (Traces d'Exécution pour Interprétation IA)`);
  if (campaign.stressTelemetry && campaign.stressTelemetry.capturedExtremeLogs.length > 0) {
    for (const log of campaign.stressTelemetry.capturedExtremeLogs.slice(0, 6)) {
      lines.push(`### Cas Capturé [${log.category}] — Seed ${log.seed}`);
      lines.push(`- **Résumé** : ${log.summary}`);
      lines.push('```text');
      lines.push(log.textualJournal);
      lines.push('```');
      lines.push('');
    }
  } else {
    for (const v of campaign.variantResults.slice(0, 4)) {
      for (const sample of v.sampleTraces.slice(0, 2)) {
        lines.push(
          `### Trace Échantillon [${sample.tag}] — ${v.variantLabel} — ${sample.tableConfigName} (Seed ${sample.seed})`
        );
        lines.push('```text');
        lines.push(sample.textualJournal);
        lines.push('```');
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

import {
  AblationCategory,
  AblationConfig,
  CampaignRecord,
  EdgeCaseCounts,
  FiveCriteriaEvaluation,
  FourDiagnosticAxes,
  GameParameters,
  MechanicalSwitches,
  ParameterSweepInput,
  SingleGameResult,
  TableConfigSummary,
  TacticDiagnosticRow,
  TacticId,
  VariantEvaluationResult,
  VictoryBracket,
} from './types';
import { createEmptyEdgeCases } from './engine';
import {
  countSwitchesChangedFromV1,
  generateHumanRuleDiff,
  SWITCH_KEYS,
  SWITCH_META,
  V1_SWITCHES,
} from './i18n';

const ALL_TACTICS: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export interface ExpandedVariantSpec {
  variantId: string;
  variantLabel: string;
  ablationCategory: AblationCategory;
  modifiedSwitchesFromA: Array<keyof MechanicalSwitches>;
  params: GameParameters;
}

/**
 * Génère la liste de toutes les variantes (produit cartésien) à partir d'un ParameterSweepInput
 */
export function expandParameterSweep(
  sweep: ParameterSweepInput
): ExpandedVariantSpec[] {
  const results: ExpandedVariantSpec[] = [];
  let idx = 1;

  const h1Vals = sweep.ruleNoTargetH1Values || [V1_SWITCHES.ruleNoTargetH1];
  const parryVals = sweep.ruleParryModeValues || [V1_SWITCHES.ruleParryMode];
  const prevVals = sweep.rulePreventiveDestructionValues || [
    V1_SWITCHES.rulePreventiveDestruction,
  ];
  const bullVals = sweep.ruleBulldozerTargetingValues || [
    V1_SWITCHES.ruleBulldozerTargeting,
  ];
  const scrapVals = sweep.ruleScrapyardExitValues || [
    V1_SWITCHES.ruleScrapyardExit,
  ];
  const setupVals = sweep.ruleInitialSetupValues || [
    V1_SWITCHES.ruleInitialSetup,
  ];

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
                            for (const ruleNoTargetH1 of h1Vals) {
                              for (const ruleParryMode of parryVals) {
                                for (const rulePreventiveDestruction of prevVals) {
                                  for (const ruleBulldozerTargeting of bullVals) {
                                    for (const ruleScrapyardExit of scrapVals) {
                                      for (const ruleInitialSetup of setupVals) {
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
                                          ruleNoTargetH1,
                                          ruleParryMode,
                                          rulePreventiveDestruction,
                                          ruleBulldozerTargeting,
                                          ruleScrapyardExit,
                                          ruleInitialSetup,
                                        };

                                        const diffs: string[] = [
                                          `n=${n}`,
                                          `q=${q}`,
                                          `a=${a}`,
                                          `x=${x}`,
                                        ];
                                        if (stockAbatteuses !== null)
                                          diffs.push(`StockH=${stockAbatteuses}`);
                                        if (modeTirageDes !== 'MIN_2D6')
                                          diffs.push(`Dés=${modeTirageDes}`);
                                        if (granulariteRancune !== 'PAR_CASE')
                                          diffs.push(`Ranc=${granulariteRancune}`);
                                        if (nbRegeneration !== 1)
                                          diffs.push(`Régén=${nbRegeneration}`);

                                        const v2Sw: string[] = [];
                                        if (ruleNoTargetH1 !== V1_SWITCHES.ruleNoTargetH1)
                                          v2Sw.push('SW1:RepliH1');
                                        if (ruleParryMode !== V1_SWITCHES.ruleParryMode)
                                          v2Sw.push('SW2:ParadeUnit');
                                        if (
                                          rulePreventiveDestruction !==
                                          V1_SWITCHES.rulePreventiveDestruction
                                        )
                                          v2Sw.push('SW3:CarteReq');
                                        if (
                                          ruleBulldozerTargeting !==
                                          V1_SWITCHES.ruleBulldozerTargeting
                                        )
                                          v2Sw.push('SW4:B3Forêt+ŒilUnifié');
                                        if (
                                          ruleScrapyardExit !==
                                          V1_SWITCHES.ruleScrapyardExit
                                        )
                                          v2Sw.push('SW5:CasseD2Off');
                                        if (
                                          ruleInitialSetup !==
                                          V1_SWITCHES.ruleInitialSetup
                                        )
                                          v2Sw.push('SW6:SetupDense');

                                        if (v2Sw.length === 6) {
                                          diffs.push('Édition 2.0 Complète');
                                        } else if (v2Sw.length === 0) {
                                          diffs.push('Édition 1.0');
                                        } else {
                                          diffs.push(v2Sw.join('+'));
                                        }

                                        results.push({
                                          variantId: `var_${idx}`,
                                          variantLabel: `V${idx} (${diffs.join(', ')})`,
                                          ablationCategory: 'STANDARD_VARIANT',
                                          modifiedSwitchesFromA: [],
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
            }
          }
        }
      }
    }
  }

  return results;
}

/**
 * Génère les variantes d'une campagne de Test Croisé & Ablation (Couches 1, 2, 3 et optionnellement 4)
 */
export function expandAblationVariants(
  sweep: ParameterSweepInput,
  ablation: AblationConfig
): ExpandedVariantSpec[] {
  const results: ExpandedVariantSpec[] = [];
  const swA = ablation.editionASwitches;
  const swB = ablation.editionBSwitches;

  // Quels interrupteurs diffèrent entre A et B ?
  const differingKeys = SWITCH_KEYS.filter((k) => swA[k] !== swB[k]);

  // Liste ordonnée des configurations d'interrupteurs à tester
  const switchConfigs: Array<{
    code: string;
    label: string;
    category: AblationCategory;
    modifiedFromA: Array<keyof MechanicalSwitches>;
    switches: MechanicalSwitches;
  }> = [];

  // Couche 1 : Édition A (Référence) et Édition B (Cible)
  switchConfigs.push({
    code: 'L1_A',
    label: `[Réf. A] ${ablation.editionAName}`,
    category: 'BASE_EDITION_A',
    modifiedFromA: [],
    switches: { ...swA },
  });

  switchConfigs.push({
    code: 'L1_B',
    label: `[Cible B] ${ablation.editionBName}`,
    category: 'TARGET_EDITION_B',
    modifiedFromA: [...differingKeys],
    switches: { ...swB },
  });

  // Couche 2 : Ajout Unitaire (A + 1 seul interrupteur de B)
  if (ablation.includeLayer2SingleAdditions) {
    for (const k of differingKeys) {
      const meta = SWITCH_META[k];
      switchConfigs.push({
        code: `L2_ADD_${meta.shortCode}`,
        label: `[Ajout +1 sur A] A + ${meta.shortCode} (${meta.v2Label})`,
        category: 'ADD_SINGLE_SWITCH_TO_A',
        modifiedFromA: [k],
        switches: { ...swA, [k]: swB[k] },
      });
    }
  }

  // Couche 3 : Ablation Unitaire (B - 1 seul interrupteur ramené à A)
  if (ablation.includeLayer3SingleAblations) {
    for (const k of differingKeys) {
      const meta = SWITCH_META[k];
      const remainingMods = differingKeys.filter((other) => other !== k);
      switchConfigs.push({
        code: `L3_REM_${meta.shortCode}`,
        label: `[Ablation -1 sur B] B sans ${meta.shortCode} (retour ${meta.v1Label})`,
        category: 'REMOVE_SINGLE_SWITCH_FROM_B',
        modifiedFromA: remainingMods,
        switches: { ...swB, [k]: swA[k] },
      });
    }
  }

  // Couche 4 (Optionnelle) : Matrice Factorielle Complète 2^k
  if (ablation.includeLayer4FullFactorial && differingKeys.length >= 2) {
    const totalCombos = 1 << differingKeys.length;
    for (let mask = 0; mask < totalCombos; mask++) {
      const activeKeys: Array<keyof MechanicalSwitches> = [];
      const customSw: MechanicalSwitches = { ...swA };
      for (let bit = 0; bit < differingKeys.length; bit++) {
        if ((mask & (1 << bit)) !== 0) {
          const key = differingKeys[bit];
          activeKeys.push(key);
          (customSw as any)[key] = swB[key];
        }
      }
      // Éviter de dupliquer A (0), B (all), Ajout +1 (1 bit) et Ablation -1 (k-1 bits) déjà présents
      const alreadyAdded =
        activeKeys.length === 0 ||
        activeKeys.length === differingKeys.length ||
        (ablation.includeLayer2SingleAdditions && activeKeys.length === 1) ||
        (ablation.includeLayer3SingleAblations &&
          activeKeys.length === differingKeys.length - 1);

      if (!alreadyAdded) {
        const codes = activeKeys.map((k) => SWITCH_META[k].shortCode).join('+');
        switchConfigs.push({
          code: `L4_MASK_${mask}`,
          label: `[Cocktail ${activeKeys.length} règles] A + ${codes}`,
          category: 'FACTORIAL_COCKTAIL',
          modifiedFromA: activeKeys,
          switches: customSw,
        });
      }
    }
  }

  let idx = 1;
  const nList = sweep.nValues.length > 0 ? sweep.nValues : [4];
  const q = sweep.qValues[0] || 6;
  const a = sweep.aValues[0] || 2;
  const x = sweep.xValues[0] || 8;
  const stockAbatteuses =
    sweep.stockAbatteusesValues[0] !== undefined
      ? sweep.stockAbatteusesValues[0]
      : null;
  const modeTirageDes = sweep.modeTirageDesValues[0] || 'MIN_2D6';
  const modeResolutionParcelle =
    sweep.modeResolutionParcelleValues[0] || 'TRANSACTION_FIGEE';
  const ordreCasse = sweep.ordreCasseValues[0] || 'AVANT_PARCELLE_1';
  const immobiliteReparation =
    sweep.immobiliteReparationValues[0] !== undefined
      ? sweep.immobiliteReparationValues[0]
      : true;
  const ordreMajTactiques =
    sweep.ordreMajTactiquesValues[0] || 'ORDRE_PISTE_TAC';
  const rancuneTerrassementDegrade =
    sweep.rancuneTerrassementDegradeValues[0] || false;
  const granulariteRancune = sweep.granulariteRancuneValues[0] || 'PAR_CASE';
  const nbRegeneration =
    sweep.nbRegenerationValues[0] !== undefined
      ? sweep.nbRegenerationValues[0]
      : 1;

  for (const n of nList) {
    for (const sc of switchConfigs) {
      const nSuffix = nList.length > 1 ? ` [n=${n}]` : '';
      results.push({
        variantId: `abl_${idx}_${sc.code}_n${n}`,
        variantLabel: `${sc.label}${nSuffix}`,
        ablationCategory: sc.category,
        modifiedSwitchesFromA: sc.modifiedFromA,
        params: {
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
          ...sc.switches,
        },
      });
      idx++;
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
  const medianNormalizedScore =
    normScores[Math.floor(normScores.length / 2)] || 0;

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
 * Évalue mathématiquement les 5 Critères Principaux de Game Design (Section 5)
 */
export function evaluateFiveCriteria(
  params: GameParameters,
  gamesByCategory: {
    random: SingleGameResult[];
    blindProb: SingleGameResult[];
    selfish: SingleGameResult[];
    cooperative: SingleGameResult[];
    strategist: SingleGameResult[];
    omniscient: SingleGameResult[];
    allPrimaryGames: SingleGameResult[];
  }
): FiveCriteriaEvaluation {
  const refGames =
    gamesByCategory.cooperative.length > 0
      ? gamesByCategory.cooperative
      : gamesByCategory.allPrimaryGames;
  const gCount = Math.max(1, refGames.length);

  const meanNorm = (arr: SingleGameResult[]): number =>
    arr.length > 0
      ? arr.reduce((acc, g) => acc + g.normalizedScore, 0) / arr.length
      : 0;

  const scoreRandom = meanNorm(gamesByCategory.random);
  const scoreSelfish = meanNorm(gamesByCategory.selfish);
  const scoreCoop = meanNorm(
    gamesByCategory.cooperative.length > 0
      ? gamesByCategory.cooperative
      : refGames
  );
  const scoreStrategist = meanNorm(
    gamesByCategory.strategist.length > 0
      ? gamesByCategory.strategist
      : refGames
  );
  const scoreOmniscient = meanNorm(
    gamesByCategory.omniscient.length > 0
      ? gamesByCategory.omniscient
      : refGames
  );

  // ==========================================================================
  // CRITÈRE 1 : Simplicité, Fluidité & Sobriété des Règles (/100)
  // ==========================================================================
  // 1A. Taux d'Action Effective (40 pts) : 40 * (1 - (H1 + Cartes Sans Objet) / Total Dés Tirés)
  const totalDiceDrawn = gCount * params.n * params.x;
  let sumH1 = 0;
  let sumNoTargetCards = 0;
  let sumTotalPhysicalManipulations = 0;
  let sumNonStagnantTurns = 0;

  for (const g of refGames) {
    sumH1 += g.edgeCases.H1_noTargetEligible;
    sumNoTargetCards += g.totalCardsNoTarget;
    const gameManipulations =
      (g.meanBrainPermutationsPerTurn +
        g.meanRepositioningsPerTurn +
        g.meanMachineMovesAndDestructionsPerTurn) *
      params.x;
    sumTotalPhysicalManipulations += gameManipulations;
    sumNonStagnantTurns += Math.max(1, params.x - g.stagnantTurns);
  }

  const ineffectiveEvents =
    params.ruleNoTargetH1 === 'V2_FALLBACK_DEPLOY_AND_RETREAT'
      ? sumNoTargetCards // En V2, H1 déclenche une vraie action de repli !
      : sumH1 + sumNoTargetCards;
  const effectiveActionRate = clamp(
    1 - ineffectiveEvents / Math.max(1, totalDiceDrawn),
    0,
    1
  );
  const effectiveActionRateScore = effectiveActionRate * 40;

  // 1B. Sobriété des Manipulations par Tour Actif non stagnant (30 pts)
  // <= 4.5 manip/tour actif = 30 pts
  const manipulationsPerActiveTurn =
    sumTotalPhysicalManipulations / Math.max(1, sumNonStagnantTurns);
  const activeTurnManipulationScore = clamp(
    30 - Math.max(0, manipulationsPerActiveTurn - 4.5) * 3.2,
    4,
    30
  );

  // 1C. Sobriété Conceptuelle du Livret de Règles (30 pts)
  let rulebookConceptualSobrietyScore = 18;
  const activeSwitchesBonus: string[] = [];
  if (params.rulePreventiveDestruction === 'V2_CARD_REQUIRED') {
    rulebookConceptualSobrietyScore += 4;
    activeSwitchesBonus.push('+4 pts (Suppression H4/H7a : Carte requise)');
  }
  if (
    params.ruleBulldozerTargeting === 'V2_FOREST_PRIORITY_AND_UNIFIED_TIE'
  ) {
    rulebookConceptualSobrietyScore += 4;
    activeSwitchesBonus.push('+4 pts (Départage unifié Rang 1 sur l’Œil)');
  }
  if (params.ruleScrapyardExit === 'V2_OFFENSIVE_D2') {
    rulebookConceptualSobrietyScore += 4;
    activeSwitchesBonus.push('+4 pts (Seuil Bulldozer unifié Casse/Forêt D=2)');
  }

  const simplicityScore = Math.round(
    clamp(
      effectiveActionRateScore +
        activeTurnManipulationScore +
        rulebookConceptualSobrietyScore,
      0,
      100
    )
  );

  const simplicityInterpretation = `Action effective : ${(
    effectiveActionRate * 100
  ).toFixed(1)}% (${effectiveActionRateScore.toFixed(
    1
  )}/40) · Manip./tour actif : ${manipulationsPerActiveTurn.toFixed(
    2
  )} (${activeTurnManipulationScore.toFixed(
    1
  )}/30) · Sobriété livret : ${rulebookConceptualSobrietyScore}/30.`;

  // ==========================================================================
  // CRITÈRE 2 : Profondeur Stratégique (/100)
  // ==========================================================================
  const deltaN1VsRandom = scoreSelfish - scoreRandom;
  const deltaN2VsN1 = scoreCoop - scoreSelfish;
  const deltaN3VsN2 = scoreStrategist - scoreCoop;

  // 2A. Contrôle de cohérence N1 vs Random (15 pts max, plein score à +10%)
  const coherenceN1VsRandomScore = clamp((deltaN1VsRandom / 0.1) * 15, 0, 15);
  // 2B. Maîtrise Tactique N2 vs N1 (40 pts, plein score à +12%)
  const tacticalMasteryN2VsN1Score = clamp((deltaN2VsN1 / 0.12) * 40, 0, 40);
  // 2C. Maîtrise Méta-Contremaître N3 vs N2 (45 pts, plein score à +5%)
  const metaMasteryN3VsN2Score = clamp((deltaN3VsN2 / 0.05) * 45, 0, 45);

  let rawStrategicScore = Math.round(
    coherenceN1VsRandomScore +
      tacticalMasteryN2VsN1Score +
      metaMasteryN3VsN2Score
  );
  let cappedByInversion = false;
  if (scoreStrategist <= scoreSelfish) {
    rawStrategicScore = Math.min(25, rawStrategicScore);
    cappedByInversion = true;
  }
  const strategicScore = clamp(rawStrategicScore, 0, 100);

  const strategicInterpretation = cappedByInversion
    ? `Plafonné à ${strategicScore}/100 car N3 (${(scoreStrategist * 100).toFixed(
        1
      )}%) ne surpasse pas N1 (${(scoreSelfish * 100).toFixed(1)}%).`
    : `Progression N0→N1 : +${(deltaN1VsRandom * 100).toFixed(
        1
      )}% (${coherenceN1VsRandomScore.toFixed(0)}/15) · N1→N2 : +${(
        deltaN2VsN1 * 100
      ).toFixed(1)}% (${tacticalMasteryN2VsN1Score.toFixed(
        0
      )}/40) · N2→N3 : +${(deltaN3VsN2 * 100).toFixed(
        1
      )}% (${metaMasteryN3VsN2Score.toFixed(0)}/45).`;

  // ==========================================================================
  // CRITÈRE 3 : Tension & Courbe Dramatique (/100) (sur l'équipe Coopérative N2)
  // ==========================================================================
  const brackets: Record<VictoryBracket, number> = {
    MIRACLE: 0,
    MAJOR_VICTORY: 0,
    COSTLY_VICTORY: 0,
    DEFEAT: 0,
  };
  let sumAttrition = 0;
  let sumDilemma = 0;
  let sumPressure = 0;

  for (const g of refGames) {
    brackets[g.victoryBracket] += 1 / gCount;
    sumAttrition += g.attritionRateBeforeRegen;
    sumDilemma += g.dilemmaRate;
    sumPressure += g.threatToDefenseRatio;
  }

  // 3A. Distance de Manhattan par rapport à [10% Miracle, 45% Majeure, 30% Coûteuse, 15% Défaite] (50 pts)
  const targetBrackets: Record<VictoryBracket, number> = {
    MIRACLE: 0.1,
    MAJOR_VICTORY: 0.45,
    COSTLY_VICTORY: 0.3,
    DEFEAT: 0.15,
  };
  const manhattanDist =
    Math.abs(brackets.MIRACLE - targetBrackets.MIRACLE) +
    Math.abs(brackets.MAJOR_VICTORY - targetBrackets.MAJOR_VICTORY) +
    Math.abs(brackets.COSTLY_VICTORY - targetBrackets.COSTLY_VICTORY) +
    Math.abs(brackets.DEFEAT - targetBrackets.DEFEAT);
  // manhattanDist varie entre 0 (parfait) et ~1.8 (tout dans un seul palier)
  const bracketDistributionProximityScore = clamp(
    50 * (1 - manhattanDist / 1.35),
    0,
    50
  );

  // 3B. Attrition Active en Cours de Partie avant régénération (30 pts, cible idéale : 25% à 45%)
  const meanAttritionBeforeRegen = sumAttrition / gCount;
  let activeAttritionScore = 30;
  if (meanAttritionBeforeRegen < 0.25) {
    activeAttritionScore = clamp((meanAttritionBeforeRegen / 0.25) * 30, 0, 30);
  } else if (meanAttritionBeforeRegen > 0.45) {
    activeAttritionScore = clamp(
      30 * (1 - (meanAttritionBeforeRegen - 0.45) / 0.4),
      0,
      30
    );
  }

  // 3C. Fréquence des Dilemmes Décisionnels & Ratio Menaces/Défenseurs (20 pts)
  const dilemmaFrequency = sumDilemma / gCount;
  const pressureToDefenseRatio = sumPressure / gCount;
  const pressureScore = clamp((pressureToDefenseRatio / 0.65) * 10, 0, 10);
  const dilemmaScore = clamp((dilemmaFrequency / 0.28) * 10, 0, 10);
  const dilemmaFrequencyScore = pressureScore + dilemmaScore;

  const tensionScore = Math.round(
    clamp(
      bracketDistributionProximityScore +
        activeAttritionScore +
        dilemmaFrequencyScore,
      0,
      100
    )
  );

  const tensionInterpretation = `Distribution paliers : ${(
    brackets.MIRACLE * 100
  ).toFixed(0)}% Mir / ${(brackets.MAJOR_VICTORY * 100).toFixed(0)}% Maj / ${(
    brackets.COSTLY_VICTORY * 100
  ).toFixed(0)}% Coût / ${(brackets.DEFEAT * 100).toFixed(
    0
  )}% Déf (${bracketDistributionProximityScore.toFixed(
    0
  )}/50) · Attrition avant régén : ${(meanAttritionBeforeRegen * 100).toFixed(
    1
  )}% (${activeAttritionScore.toFixed(0)}/30).`;

  // ==========================================================================
  // CRITÈRE 4 : Nécessité de Collaborer (/100)
  // ==========================================================================
  const deltaCoopVsSelfish = scoreCoop - scoreSelfish;
  // 4A. Gain Net de Communication Muette (50 pts, plein score à +15%)
  const netCommunicationGainScore = clamp(
    (deltaCoopVsSelfish / 0.15) * 50,
    0,
    50
  );

  // 4B. Impact Réel des Micro-Cycles de l'Étape 2 (30 pts)
  let totalStep2SavedCells = 0;
  for (const g of refGames) {
    totalStep2SavedCells += g.step2CellsSavedCount;
  }
  const step2RescueRatePerTurn =
    totalStep2SavedCells / Math.max(1, gCount * params.x);
  // Plein score (30 pts) si >= 0.35 sauvetage décisif par tour grâce aux micro-cycles r>=2
  const microCycleRescueImpactScore = clamp(
    (step2RescueRatePerTurn / 0.35) * 30,
    0,
    30
  );

  // 4C. Convergence vers la Borne Omnisciente (20 pts)
  const omniscientSpan = Math.max(0.02, scoreOmniscient - scoreSelfish);
  const omniscientConvergenceRatio = clamp(
    Math.max(0, deltaCoopVsSelfish) / omniscientSpan,
    0,
    1
  );
  const omniscientConvergenceScore = omniscientConvergenceRatio * 20;

  let rawCollabScore = Math.round(
    netCommunicationGainScore +
      microCycleRescueImpactScore +
      omniscientConvergenceScore
  );
  let cappedByLowSynergy = false;
  if (deltaCoopVsSelfish < 0.015) {
    rawCollabScore = Math.min(10, rawCollabScore);
    cappedByLowSynergy = true;
  }
  const collaborationScore = clamp(rawCollabScore, 0, 100);

  const collaborationInterpretation = cappedByLowSynergy
    ? `Plafonné à ${collaborationScore}/100 : gain de communication quasi nul (+${(
        deltaCoopVsSelfish * 100
      ).toFixed(1)}% < +1.5%).`
    : `Gain N2 vs N1 : +${(deltaCoopVsSelfish * 100).toFixed(
        1
      )}% (${netCommunicationGainScore.toFixed(
        0
      )}/50) · Sauvetages Étape 2 : ${(step2RescueRatePerTurn * 100).toFixed(
        1
      )}%/tour (${microCycleRescueImpactScore.toFixed(
        0
      )}/30) · Convergence Omniscient : ${(
        omniscientConvergenceRatio * 100
      ).toFixed(0)}% (${omniscientConvergenceScore.toFixed(0)}/20).`;

  // ==========================================================================
  // CRITÈRE 5 : Vitalité du Contremaître & Équité des Rangs (/100)
  // ==========================================================================
  let sumStagnantTurns = 0;
  let sumSecondHalfMachines = 0;
  let monopolyGamesCount = 0;
  const slot1Counts: Record<TacticId, number> = {
    A1: 0,
    A2: 0,
    A3: 0,
    B1: 0,
    B2: 0,
    B3: 0,
  };
  let totalSlot1Turns = 0;

  for (const g of refGames) {
    sumStagnantTurns += g.stagnantTurns;
    sumSecondHalfMachines += g.meanSecondHalfActiveMachines;
    if (ALL_TACTICS.some((t) => g.tacticSlot1Turns[t] === params.x)) {
      monopolyGamesCount++;
    }
    for (const t of ALL_TACTICS) {
      slot1Counts[t] += g.tacticSlot1Turns[t] || 0;
      totalSlot1Turns += g.tacticSlot1Turns[t] || 0;
    }
  }

  const nonStagnantTurnRate = clamp(
    1 - sumStagnantTurns / Math.max(1, gCount * params.x),
    0,
    1
  );
  const secondHalfActiveMachines = sumSecondHalfMachines / gCount;
  // 5A. Activité Continue sans Stagnation (35 pts)
  const machineVitalityFactor = clamp(secondHalfActiveMachines / 2.2, 0.2, 1);
  const continuousActivityScore =
    nonStagnantTurnRate * 22 + machineVitalityFactor * 13;

  // 5B. Renouvellement de la Piste des Tactiques (35 pts)
  let shannonEntropy = 0;
  if (totalSlot1Turns > 0) {
    for (const t of ALL_TACTICS) {
      const p = slot1Counts[t] / totalSlot1Turns;
      if (p > 0) shannonEntropy -= p * Math.log2(p);
    }
  }
  const tacticSlot1Entropy = clamp(shannonEntropy / Math.log2(6), 0, 1);
  const slot1MonopolyRate = monopolyGamesCount / gCount;
  const tacticsRenewalScore =
    tacticSlot1Entropy * (1 - slot1MonopolyRate) * 35;

  // 5C. Équité Initiale sur L'Œil du Contremaître (30 pts)
  const maxTreesPerSector = params.q * params.a;
  const rankSurv = new Array(params.n).fill(0);
  for (const g of refGames) {
    for (let r = 0; r < params.n; r++) {
      rankSurv[r] +=
        (g.perInitialRankFinalTrees[r] || 0) /
        Math.max(1, maxTreesPerSector * gCount);
    }
  }
  const rank1Surv = rankSurv[0] || 0;
  const othersSurv =
    params.n > 1
      ? rankSurv.slice(1).reduce((a, b) => a + b, 0) / (params.n - 1)
      : rank1Surv;
  const rank1VsOthersGap = Math.abs(othersSurv - rank1Surv);
  const initialEyeFairnessScore = clamp(
    30 * (1 - rank1VsOthersGap / 0.35),
    0,
    30
  );

  const vitalityScore = Math.round(
    clamp(
      continuousActivityScore + tacticsRenewalScore + initialEyeFairnessScore,
      0,
      100
    )
  );

  const vitalityInterpretation = `Tours actifs : ${(
    nonStagnantTurnRate * 100
  ).toFixed(1)}% · Machines 2e moitié : ${secondHalfActiveMachines.toFixed(
    2
  )} (${continuousActivityScore.toFixed(0)}/35) · Entropie Case 1 : ${(
    tacticSlot1Entropy * 100
  ).toFixed(0)}% (Monopole ${(slot1MonopolyRate * 100).toFixed(
    1
  )}%) · Écart Rang 1 vs Rangs 2..n : ${(rank1VsOthersGap * 100).toFixed(
    1
  )}% (${initialEyeFairnessScore.toFixed(0)}/30).`;

  const overallDesignScore = Math.round(
    (simplicityScore +
      strategicScore +
      tensionScore +
      collaborationScore +
      vitalityScore) /
      5
  );

  return {
    simplicitySobriety: {
      score: simplicityScore,
      effectiveActionRateScore,
      activeTurnManipulationScore,
      rulebookConceptualSobrietyScore,
      effectiveActionRate,
      manipulationsPerActiveTurn,
      activeSwitchesBonus,
      interpretation: simplicityInterpretation,
    },
    strategicDepth: {
      score: strategicScore,
      coherenceN1VsRandomScore,
      tacticalMasteryN2VsN1Score,
      metaMasteryN3VsN2Score,
      cappedByInversion,
      deltaN1VsRandom,
      deltaN2VsN1,
      deltaN3VsN2,
      interpretation: strategicInterpretation,
    },
    tensionDrama: {
      score: tensionScore,
      bracketDistributionProximityScore,
      activeAttritionScore,
      dilemmaFrequencyScore,
      observedBrackets: brackets,
      meanAttritionBeforeRegen,
      dilemmaFrequency,
      pressureToDefenseRatio,
      interpretation: tensionInterpretation,
    },
    collaborationNecessity: {
      score: collaborationScore,
      netCommunicationGainScore,
      microCycleRescueImpactScore,
      omniscientConvergenceScore,
      cappedByLowSynergy,
      deltaCoopVsSelfish,
      step2RescueRatePerTurn,
      omniscientConvergenceRatio,
      interpretation: collaborationInterpretation,
    },
    foremanVitalityFairness: {
      score: vitalityScore,
      continuousActivityScore,
      tacticsRenewalScore,
      initialEyeFairnessScore,
      nonStagnantTurnRate,
      secondHalfActiveMachines,
      tacticSlot1Entropy,
      slot1MonopolyRate,
      rank1VsOthersGap,
      interpretation: vitalityInterpretation,
    },
    overallDesignScore,
  };
}

/**
 * Calcule les 4 Axes Diagnostiques Complémentaires (Hors Note Globale — Section 6)
 */
export function evaluateFourDiagnosticAxes(
  params: GameParameters,
  gamesByCategory: {
    random: SingleGameResult[];
    blindProb: SingleGameResult[];
    selfish: SingleGameResult[];
    cooperative: SingleGameResult[];
    strategist: SingleGameResult[];
    omniscient: SingleGameResult[];
    allPrimaryGames: SingleGameResult[];
  }
): FourDiagnosticAxes {
  const refGames =
    gamesByCategory.cooperative.length > 0
      ? gamesByCategory.cooperative
      : gamesByCategory.allPrimaryGames;
  const gCount = Math.max(1, refGames.length);
  const n = params.n;
  const x = params.x;

  // ==========================================================================
  // AXE A : Estimation de la Durée de Jeu Physique & Ratio Réflexion / Manipulation
  // ==========================================================================
  const phase1SecondsTotal = 15 * x;

  let sumNegotiationCycles = 0;
  let sumDilemmasPerTurn = 0;
  let sumCardsPerTurn = 0;
  let sumMachineMovesPerTurn = 0;
  let sumBrainPermsPerTurn = 0;
  let sumReposPerTurn = 0;

  for (const g of refGames) {
    sumNegotiationCycles += g.meanStep2LockCycle;
    // Nombre de décisions par tour = 2 * n
    sumDilemmasPerTurn += g.dilemmaRate * (2 * n);
    sumCardsPerTurn += g.totalCardsPlaced / x;
    sumMachineMovesPerTurn += g.meanMachineMovesAndDestructionsPerTurn;
    sumBrainPermsPerTurn += g.meanBrainPermutationsPerTurn;
    sumReposPerTurn += g.meanRepositioningsPerTurn;
  }

  const meanCycles = sumNegotiationCycles / gCount;
  const meanDilemmasTurn = sumDilemmasPerTurn / gCount;
  const meanCardsTurn = sumCardsPerTurn / gCount;
  const meanMachineMovesTurn = sumMachineMovesPerTurn / gCount;
  const meanBrainPermsTurn = sumBrainPermsPerTurn / gCount;
  const meanReposTurn = sumReposPerTurn / gCount;

  const phase2PerTurnSec =
    20 + (15 + 12 * meanCycles + 4 * n) + 10 * meanDilemmasTurn;
  const phase2CognitiveSecondsTotal = phase2PerTurnSec * x;

  const phase3PerTurnSec =
    15 +
    5 * meanCardsTurn +
    4 * meanMachineMovesTurn +
    3 * meanBrainPermsTurn +
    4 * meanReposTurn;
  const phase3ManipulationSecondsTotal = phase3PerTurnSec * x;

  const totalSec =
    phase1SecondsTotal +
    phase2CognitiveSecondsTotal +
    phase3ManipulationSecondsTotal;
  const totalEstimatedMinutes = totalSec / 60;
  const minutesPerPlayer = totalEstimatedMinutes / n;
  const meanSecondsPerTurn = totalSec / x;

  // Estimation Tour 1 vs Tour x (le Tour x a généralement ~15% de machines/cartes en plus en V2 ou moins en V1 si plateau mort)
  const turn1EstimatedSeconds = meanSecondsPerTurn * 0.92;
  const turnXEstimatedSeconds = meanSecondsPerTurn * 1.08;

  const cognitiveShareRate =
    (phase1SecondsTotal + phase2CognitiveSecondsTotal) / Math.max(1, totalSec);
  const manipulationShareRate =
    phase3ManipulationSecondsTotal / Math.max(1, totalSec);
  const manipulationWarningAlert = manipulationShareRate > 0.45;

  const axisASummary = `${totalEstimatedMinutes.toFixed(
    1
  )} min au total (${minutesPerPlayer.toFixed(1)} min/joueur, ${meanSecondsPerTurn.toFixed(
    0
  )}s/tour) · Réflexion ${(cognitiveShareRate * 100).toFixed(
    0
  )}% vs Manipulation ${(manipulationShareRate * 100).toFixed(0)}%${
    manipulationWarningAlert
      ? ' ⚠️ ALERTE : Temps de manipulation > 45% !'
      : ' (Ratio ergonomique sain)'
  }`;

  // ==========================================================================
  // AXE B : Intérêt & Impact de l'Apprentissage du Contremaître
  // ==========================================================================
  let sumAdvances = 0;
  let sumRetreats = 0;
  let sumSnowballOpp = 0;
  let sumSnowballSucc = 0;
  let sumDistinctTop2 = 0;

  for (const g of refGames) {
    sumAdvances += g.learningAdvancesCount / x;
    sumRetreats += g.learningRetreatsCount / x;
    sumSnowballOpp += g.snowballOpportunities;
    sumSnowballSucc += g.snowballSuccesses;
    sumDistinctTop2 += g.distinctTacticsInTop2;
  }

  const meanAdvancesPerTurn = sumAdvances / gCount;
  const meanRetreatsPerTurn = sumRetreats / gCount;
  const snowballRate =
    sumSnowballOpp > 0 ? sumSnowballSucc / sumSnowballOpp : 0;
  const meanDistinctTacticsInTop2 = sumDistinctTop2 / gCount;

  // Comparaison N3 vs N2 sur le contrôle de la Case 1
  const stratGames =
    gamesByCategory.strategist.length > 0
      ? gamesByCategory.strategist
      : refGames;
  const maxSlot1Share = (arr: SingleGameResult[]): number => {
    if (arr.length === 0) return 0;
    const totals: Record<TacticId, number> = {
      A1: 0,
      A2: 0,
      A3: 0,
      B1: 0,
      B2: 0,
      B3: 0,
    };
    let allT = 0;
    for (const g of arr) {
      for (const t of ALL_TACTICS) {
        totals[t] += g.tacticSlot1Turns[t] || 0;
        allT += g.tacticSlot1Turns[t] || 0;
      }
    }
    const maxVal = Math.max(...Object.values(totals));
    return allT > 0 ? maxVal / allT : 0;
  };

  const n2MaxSlot1 = maxSlot1Share(refGames);
  const n3MaxSlot1 = maxSlot1Share(stratGames);
  const n3VsN2Slot1ControlDelta = n2MaxSlot1 - n3MaxSlot1;

  const meanNorm = (arr: SingleGameResult[]): number =>
    arr.length > 0
      ? arr.reduce((acc, g) => acc + g.normalizedScore, 0) / arr.length
      : 0;
  const n3VsN2SurvivalGain = meanNorm(stratGames) - meanNorm(refGames);

  const axisBSummary = `Flux : +${meanAdvancesPerTurn.toFixed(
    2
  )} avancées / -${meanRetreatsPerTurn.toFixed(
    2
  )} reculs par tour · Effet Boule de Neige : ${(snowballRate * 100).toFixed(
    1
  )}% · Rotation Top-2 : ${meanDistinctTacticsInTop2.toFixed(
    1
  )}/6 tactiques/partie · Gain de maîtrise N3 vs N2 : +${(
    n3VsN2SurvivalGain * 100
  ).toFixed(1)}%.`;

  // ==========================================================================
  // AXE C : Bilan Analytique Individuel des 6 Tactiques (A1..B3)
  // ==========================================================================
  const aggTactics: Record<
    TacticId,
    {
      draws: number;
      sumSlot: number;
      turnsSlot1: number;
      cardsPlaced: number;
      cardsSucceeded: number;
      cardsParried: number;
      cardsNoTarget: number;
      noTargetH1: number;
      treesCut: number;
      harvDeployed: number;
      stumpsCleared: number;
      repairs: number;
      defAttracted: number;
      targetedCells: number;
    }
  > = {} as any;

  for (const t of ALL_TACTICS) {
    aggTactics[t] = {
      draws: 0,
      sumSlot: 0,
      turnsSlot1: 0,
      cardsPlaced: 0,
      cardsSucceeded: 0,
      cardsParried: 0,
      cardsNoTarget: 0,
      noTargetH1: 0,
      treesCut: 0,
      harvDeployed: 0,
      stumpsCleared: 0,
      repairs: 0,
      defAttracted: 0,
      targetedCells: 0,
    };
  }

  let totalAllDraws = 0;
  const totalAllTurns = gCount * x;

  for (const g of refGames) {
    for (const t of ALL_TACTICS) {
      const st = g.perTacticStats[t];
      if (!st) continue;
      aggTactics[t].draws += st.draws;
      totalAllDraws += st.draws;
      aggTactics[t].sumSlot += st.sumSlotWhenDrawn;
      aggTactics[t].turnsSlot1 += st.turnsInSlot1;
      aggTactics[t].cardsPlaced += st.cardsPlaced;
      aggTactics[t].cardsSucceeded += st.cardsSucceeded;
      aggTactics[t].cardsParried += st.cardsParried;
      aggTactics[t].cardsNoTarget += st.cardsNoTarget;
      aggTactics[t].noTargetH1 += st.noTargetAtPlacementH1;
      aggTactics[t].treesCut += st.treesCutAttributed;
      aggTactics[t].harvDeployed += st.harvestersDeployedAttributed;
      aggTactics[t].stumpsCleared += st.stumpsClearedAttributed;
      aggTactics[t].repairs += st.repairsSucceededAttributed;
      aggTactics[t].defAttracted += st.defendersAttractedSum;
      aggTactics[t].targetedCells += st.targetedCellsCount;
    }
  }

  const rows: TacticDiagnosticRow[] = ALL_TACTICS.map((t) => {
    const a = aggTactics[t];
    const safeDraws = Math.max(1, a.draws);
    const totalResolutionEvents = Math.max(
      1,
      a.cardsPlaced + a.noTargetH1
    );

    const drawFrequencyRate = a.draws / Math.max(1, totalAllDraws);
    const meanTrackPosition = a.draws > 0 ? a.sumSlot / a.draws : 3.5;
    const slot1ResidencyRate = a.turnsSlot1 / Math.max(1, totalAllTurns);
    const successRate = a.cardsSucceeded / totalResolutionEvents;
    const parriedRate = a.cardsParried / totalResolutionEvents;
    const noTargetCardRate = a.cardsNoTarget / totalResolutionEvents;
    const noTargetH1Rate = a.noTargetH1 / safeDraws;

    const netTreesCutPerDraw = a.treesCut / safeDraws;
    const netHarvestersDeployedPerDraw = a.harvDeployed / safeDraws;
    const netStumpsClearedPerDraw = a.stumpsCleared / safeDraws;
    const netRepairsPerDraw = a.repairs / safeDraws;
    const defensiveMobilizationMean =
      a.targetedCells > 0 ? a.defAttracted / a.targetedCells : 0;

    let diagnosticLabel: TacticDiagnosticRow['diagnosticLabel'] = 'Équilibrée';
    let diagnosticDetail = 'Fréquence et impact conformes au rôle attendu.';

    if (slot1ResidencyRate > 0.34 || drawFrequencyRate > 0.27) {
      diagnosticLabel = 'Sur-dominante';
      diagnosticDetail = `Monopolise la Case 1 (${(
        slot1ResidencyRate * 100
      ).toFixed(1)}% du temps) et s'auto-alimente en réussite.`;
    } else if (noTargetH1Rate + noTargetCardRate > 0.32) {
      diagnosticLabel = 'Sous-exploitée / Souvent sans cible';
      diagnosticDetail = `${((noTargetH1Rate + noTargetCardRate) * 100).toFixed(
        1
      )}% des tirages/cartes n'ont aucune cible valide.`;
    } else if (
      t === 'B3' &&
      params.ruleBulldozerTargeting === 'V1_SCRAPYARD_ZERO_AND_REVERSE_TIE'
    ) {
      diagnosticLabel = 'Redondante avec une autre tactique';
      diagnosticDetail =
        'En V1, B3 cible la Casse (0 arbre) comme B2 au lieu des Bulldozers en forêt.';
    }

    return {
      tactic: t,
      drawFrequencyRate,
      meanTrackPosition,
      slot1ResidencyRate,
      successRate,
      parriedRate,
      noTargetCardRate,
      noTargetH1Rate,
      netTreesCutPerDraw,
      netHarvestersDeployedPerDraw,
      netStumpsClearedPerDraw,
      netRepairsPerDraw,
      defensiveMobilizationMean,
      diagnosticLabel,
      diagnosticDetail,
    };
  });

  const balancedCount = rows.filter(
    (r) => r.diagnosticLabel === 'Équilibrée'
  ).length;
  const axisCSummary = `${balancedCount}/6 tactiques jugées « Équilibrées » (${rows
    .map((r) => `${r.tactic}: ${r.diagnosticLabel}`)
    .join(' · ')}).`;

  // ==========================================================================
  // AXE D : Utilité de la Connaissance Privée d'une Attaque (Secret sous le Gobelet)
  // ==========================================================================
  const scoreCoop = meanNorm(refGames);
  const blindGames = gamesByCategory.blindProb;
  const scoreBlind =
    blindGames.length > 0 ? meanNorm(blindGames) : scoreCoop - 0.08;
  const survivalGainFromSecret = scoreCoop - scoreBlind;

  let sumCupRedir = 0;
  let sumTotalTokens = 0;
  let sumSurpriseDrawsN2 = 0;
  let sumSurpriseParriedN2 = 0;
  let sumExtDraws = 0;
  let sumExtDefended = 0;

  for (const g of refGames) {
    sumCupRedir += g.cupRedirectionCount;
    sumTotalTokens += g.totalDefenderTokensPlaced;
    sumSurpriseDrawsN2 += g.surpriseDrawsSlots3To6Count;
    sumSurpriseParriedN2 += g.surpriseDrawsParriedCount;
    sumExtDraws += g.externalDrawTargetedAllyCount;
    sumExtDefended += g.externalDrawProperlyDefendedCount;
  }

  let sumSurpriseDrawsBlind = 0;
  let sumSurpriseParriedBlind = 0;
  for (const g of blindGames) {
    sumSurpriseDrawsBlind += g.surpriseDrawsSlots3To6Count;
    sumSurpriseParriedBlind += g.surpriseDrawsParriedCount;
  }

  const cupRedirectionRate =
    sumTotalTokens > 0 ? sumCupRedir / sumTotalTokens : 0;
  const surpriseAttackParryRateN2 =
    sumSurpriseDrawsN2 > 0 ? sumSurpriseParriedN2 / sumSurpriseDrawsN2 : 0;
  const surpriseAttackParryRateBlind =
    sumSurpriseDrawsBlind > 0
      ? sumSurpriseParriedBlind / sumSurpriseDrawsBlind
      : surpriseAttackParryRateN2 * 0.45;
  const secretTransmissionFidelityRate =
    sumExtDraws > 0 ? sumExtDefended / sumExtDraws : 0;

  const axisDSummary = `Gain de survie lié au secret sous gobelet : +${(
    survivalGainFromSecret * 100
  ).toFixed(1)}% (N2 vs Bot Aveugle) · ${(cupRedirectionRate * 100).toFixed(
    1
  )}% des jetons redirigés grâce au dé secret · Parade des attaques surprises (Cases 3–6) : ${(
    surpriseAttackParryRateN2 * 100
  ).toFixed(1)}% (vs ${(surpriseAttackParryRateBlind * 100).toFixed(
    1
  )}% à l'aveugle) · Fidélité de transmission aux alliés : ${(
    secretTransmissionFidelityRate * 100
  ).toFixed(1)}%.`;

  return {
    axisA_PhysicalDuration: {
      totalEstimatedMinutes,
      minutesPerPlayer,
      meanSecondsPerTurn,
      turn1EstimatedSeconds,
      turnXEstimatedSeconds,
      phase1SecondsTotal,
      phase2CognitiveSecondsTotal,
      phase3ManipulationSecondsTotal,
      cognitiveShareRate,
      manipulationShareRate,
      manipulationWarningAlert,
      diagnosticSummary: axisASummary,
    },
    axisB_ForemanLearning: {
      meanAdvancesPerTurn,
      meanRetreatsPerTurn,
      snowballRate,
      n3VsN2Slot1ControlDelta,
      n3VsN2SurvivalGain,
      meanDistinctTacticsInTop2,
      diagnosticSummary: axisBSummary,
    },
    axisC_TacticsIndividualBalance: {
      rows,
      diagnosticSummary: axisCSummary,
    },
    axisD_PrivateCupUtility: {
      survivalGainFromSecret,
      cupRedirectionRate,
      surpriseAttackParryRateN2,
      surpriseAttackParryRateBlind,
      secretTransmissionFidelityRate,
      diagnosticSummary: axisDSummary,
    },
  };
}

/**
 * Additionne deux compteurs de cas limites H1..H7
 */
export function addEdgeCases(
  target: EdgeCaseCounts,
  source: EdgeCaseCounts
): void {
  target.H1_noTargetEligible += source.H1_noTargetEligible;
  target.H2_multipleHarvesterCardsSingleTree +=
    source.H2_multipleHarvesterCardsSingleTree;
  target.H3_multipleBulldozerCardsSameCell +=
    source.H3_multipleBulldozerCardsSameCell;
  target.H4_repairedBulldozerImmunityInCell1 +=
    source.H4_repairedBulldozerImmunityInCell1;
  target.H5_degradedBulldozerNoGrudge += source.H5_degradedBulldozerNoGrudge;
  target.H6_multiEventSameCellSingleGrudge +=
    source.H6_multiEventSameCellSingleGrudge;
  target.H7_preventiveDestructionNoCard +=
    source.H7_preventiveDestructionNoCard;
  target.H7_emptyCellOverDefense += source.H7_emptyCellOverDefense;
}

/**
 * Génère le Rapport Markdown exhaustif v2.0 « Prompt-Ready » pour analyse par IA (Section 7)
 */
export function generateCampaignMarkdownReport(
  campaign: CampaignRecord
): string {
  const lines: string[] = [];

  lines.push(
    `# BILAN STATISTIQUE & RAPPORT D'ANALYSE IA (v2.0) — « AMAZONIA : DERNIER REMPART »`
  );
  lines.push('');
  lines.push(`> **Instructions pour l'IA Analyste :**`);
  lines.push(
    `> Ce document présente les résultats complets d'une campagne Monte-Carlo v2.0 sur Graines Appariées (*Paired Seeds*) du jeu de plateau coopératif *Amazonia : Dernier Rempart*.`
  );
  lines.push(
    `> Merci d'analyser en détail :`
  );
  lines.push(
    `> 1. **Le comparatif des 5 Critères Principaux (/100) et la Matrice d'Ablation V1 ↔ V2** : quelles règles individuelles apportent le plus grand gain de Game Design, et quelles règles peuvent être simplifiées ou retirées sans perte ?`
  );
  lines.push(
    `> 2. **Les 4 Axes Diagnostiques Complémentaires (Hors Note Globale)** : (A) Durée de jeu physique et ratio Réflexion/Manipulation, (B) Intérêt de l'Apprentissage du Contremaître et effet Boule de Neige, (C) Équilibre individuel de chacune des 6 Tactiques ($A_1..B_3$), et (D) Utilité réelle de la connaissance privée du dé sous le gobelet ($\Delta_{Secret}$ face au Bot Aveugle Probabiliste).`
  );
  lines.push(
    `> 3. **La vérification formelle des invariants (\`I1\`–\`I4\`), des cas limites (\`H1\`–\`H7b\`) et des traces d'exécution**.`
  );
  lines.push('');

  lines.push(`## 1. Métadonnées de la Campagne`);
  lines.push(`- **Nom de la campagne** : ${campaign.config.name}`);
  lines.push(
    `- **Type de campagne** : ${
      campaign.config.type === 'AB_ABLATION'
        ? 'Test Croisé & Analyse d’Ablation (Édition A ↔ Édition B sur Graines Appariées)'
        : campaign.config.type === 'EVALUATION_SWEEP'
        ? 'Évaluation Multi-Variantes & 5 Critères'
        : 'Stress-Test Longue Durée & Vérification Formelle (VM Oracle)'
    }`
  );
  lines.push(`- **Statut** : ${campaign.status}`);
  lines.push(
    `- **Parties simulées** : ${campaign.progress.completedGames.toLocaleString(
      'fr-FR'
    )} parties (${campaign.progress.gamesPerSecond.toFixed(
      0
    )} parties/sec, durée calcul : ${campaign.progress.elapsedSeconds.toFixed(
      1
    )}s)`
  );
  lines.push(`- **Graine de base (Seed CRN)** : ${campaign.config.baseSeed}`);
  lines.push('');

  // Encadré Diff Humain si AblationConfig présent ou comparaison avec V1
  if (campaign.config.ablationConfig) {
    const ab = campaign.config.ablationConfig;
    const diff = generateHumanRuleDiff(
      ab.editionASwitches,
      ab.editionBSwitches,
      ab.editionAName,
      ab.editionBName
    );
    lines.push(
      `## 2. Différences de Règles en Français Naturel (« Diff Humain » : ${ab.editionAName} ↔ ${ab.editionBName})`
    );
    lines.push(
      `- **Interrupteurs modifiés** : ${diff.changedCount} sur 6 (${diff.unchangedCount} identique(s))`
    );
    for (const line of diff.summaryText) {
      lines.push(`  - ${line}`);
    }
    lines.push('');
  } else if (campaign.variantResults.length > 0) {
    const firstVar = campaign.variantResults[0];
    const diff = generateHumanRuleDiff(
      V1_SWITCHES,
      firstVar.params,
      'Édition 1.0 (Référence)',
      firstVar.variantLabel
    );
    lines.push(`## 2. Différences de Règles (« Diff Humain » vs Édition 1.0)`);
    for (const line of diff.summaryText) {
      lines.push(`  - ${line}`);
    }
    lines.push('');
  }

  // Synthèse des 5 Critères Principaux et Matrice d'Ablation
  if (campaign.variantResults.length > 0) {
    const baseVar = campaign.variantResults[0];
    const baseScore = baseVar.criteria.overallDesignScore;

    lines.push(
      `## 3. Synthèse des 5 Critères Principaux (/100) & Matrice d'Ablation (Δ)`
    );
    lines.push(
      `| Variante / Cocktail | Catégorie | Règles ≠ V1 | Note Globale | Δ vs Réf. | 1. Simplicité & Sobriété | 2. Profondeur Strat. | 3. Tension & Drame | 4. Collaboration | 5. Vitalité & Équité | Durée Est. | Survie N2 |`
    );
    lines.push(
      `| :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`
    );

    for (const v of campaign.variantResults) {
      const c = v.criteria;
      const delta = c.overallDesignScore - baseScore;
      const deltaStr =
        delta > 0 ? `+${delta}` : delta === 0 ? `0` : `${delta}`;
      const coopTable =
        v.tableSummaries.find((t) => t.botProfiles.includes('COOPERATIVE')) ||
        v.tableSummaries[0];
      const coopNorm = coopTable
        ? `${(coopTable.meanNormalizedScore * 100).toFixed(1)}%`
        : 'N/A';
      const durMin = `${v.diagnosticAxes.axisA_PhysicalDuration.totalEstimatedMinutes.toFixed(
        0
      )} min`;
      lines.push(
        `| **${v.variantLabel}** | ${v.ablationCategory || 'STANDARD'} | ${
          v.switchesChangedCountFromV1
        }/6 | **${c.overallDesignScore}/100** | **${deltaStr}** | ${
          c.simplicitySobriety.score
        }/100 | ${c.strategicDepth.score}/100 | ${
          c.tensionDrama.score
        }/100 | ${c.collaborationNecessity.score}/100 | ${
          c.foremanVitalityFairness.score
        }/100 | ${durMin} | ${coopNorm} |`
      );
    }
    lines.push('');

    // Si plus de 3 variantes, afficher le Top 10 des Meilleurs Cocktails Minimalistes
    if (campaign.variantResults.length >= 3) {
      const sortedCocktails = [...campaign.variantResults].sort((a, b) => {
        if (b.criteria.overallDesignScore !== a.criteria.overallDesignScore) {
          return b.criteria.overallDesignScore - a.criteria.overallDesignScore;
        }
        return a.switchesChangedCountFromV1 - b.switchesChangedCountFromV1;
      });
      lines.push(
        `### Classement des Meilleurs Cocktails Minimalistes (Qualité / Parcimonie de Règles)`
      );
      lines.push(
        `| Rang | Variante | Note Design | Interrupteurs Modifiés vs V1 | ΔSurvie Secret Gobelet | Tour Stagnant % | Monopole Case 1 % |`
      );
      lines.push(`| ---: | :--- | ---: | ---: | ---: | ---: | ---: |`);
      sortedCocktails.slice(0, 10).forEach((v, idx) => {
        lines.push(
          `| #${idx + 1} | **${v.variantLabel}** | **${
            v.criteria.overallDesignScore
          }/100** | ${v.switchesChangedCountFromV1}/6 | +${(
            v.diagnosticAxes.axisD_PrivateCupUtility.survivalGainFromSecret *
            100
          ).toFixed(1)}% | ${(v.stagnantTurnsRate * 100).toFixed(1)}% | ${(
            v.slot1MonopolyGamesRate * 100
          ).toFixed(1)}% |`
        );
      });
      lines.push('');
    }

    // Détail des 4 Axes Diagnostiques Complémentaires pour les variantes principales
    lines.push(
      `## 4. Les 4 Axes Diagnostiques Complémentaires (Hors Note Globale)`
    );
    const keyVariantsToDetail =
      campaign.variantResults.length <= 4
        ? campaign.variantResults
        : [
            campaign.variantResults[0],
            campaign.variantResults[1],
            ...campaign.variantResults.slice(2, 4),
          ];

    for (const v of keyVariantsToDetail) {
      const diag = v.diagnosticAxes;
      lines.push(`### Diagnostics Complémentaires — ${v.variantLabel}`);
      lines.push(
        `- **Axe A (Durée de Jeu Physique & Ergonomie)** : ${diag.axisA_PhysicalDuration.diagnosticSummary}`
      );
      lines.push(
        `  - Phase 1 (Dés secrets) : ${diag.axisA_PhysicalDuration.phase1SecondsTotal.toFixed(
          0
        )}s | Phase 2 (Réflexion & Négociation) : ${diag.axisA_PhysicalDuration.phase2CognitiveSecondsTotal.toFixed(
          0
        )}s | Phase 3 (Manipulations Automate) : ${diag.axisA_PhysicalDuration.phase3ManipulationSecondsTotal.toFixed(
          0
        )}s`
      );
      lines.push(
        `- **Axe B (Apprentissage du Contremaître)** : ${diag.axisB_ForemanLearning.diagnosticSummary}`
      );
      lines.push(
        `- **Axe D (Utilité du Secret sous le Gobelet)** : ${diag.axisD_PrivateCupUtility.diagnosticSummary}`
      );
      lines.push('');
      lines.push(
        `#### Axe C — Bilan Analytique Individuel des 6 Tactiques (${v.variantLabel})`
      );
      lines.push(
        `| Tactique | Tirage % | Pos. Moy. | Case 1 % | Réussite % | Parée % | Sans Objet % | Sans Cible H1 % | Impact / Tirage | Déf. Attirés | Diagnostic Automatique |`
      );
      lines.push(
        `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | :--- | ---: | :--- |`
      );
      for (const r of diag.axisC_TacticsIndividualBalance.rows) {
        const impactStr = r.tactic.startsWith('A')
          ? `-${r.netTreesCutPerDraw.toFixed(2)} Arbres, +${r.netHarvestersDeployedPerDraw.toFixed(2)} Abat.`
          : `-${r.netStumpsClearedPerDraw.toFixed(2)} Souches, +${r.netRepairsPerDraw.toFixed(2)} Rép.`;
        lines.push(
          `| **${r.tactic}** | ${(r.drawFrequencyRate * 100).toFixed(
            1
          )}% | ${r.meanTrackPosition.toFixed(2)} | ${(
            r.slot1ResidencyRate * 100
          ).toFixed(1)}% | ${(r.successRate * 100).toFixed(1)}% | ${(
            r.parriedRate * 100
          ).toFixed(1)}% | ${(r.noTargetCardRate * 100).toFixed(1)}% | ${(
            r.noTargetH1Rate * 100
          ).toFixed(1)}% | ${impactStr} | ${r.defensiveMobilizationMean.toFixed(
            2
          )} | **${r.diagnosticLabel}** |`
        );
      }
      lines.push('');

      lines.push(
        `#### Performance par Configuration de Table (${v.variantLabel})`
      );
      lines.push(
        `| Table | Score Brut | Arbres/J | Préservation % | Miracle | Majeure | Coûteuse | Défaite | Parades % | Sans Objet % | Gaspillage Déf. % |`
      );
      lines.push(
        `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`
      );
      for (const ts of v.tableSummaries) {
        lines.push(
          `| ${ts.tableConfigName} | ${ts.meanRawScore.toFixed(
            2
          )} | ${ts.meanScorePerPlayer.toFixed(2)} | **${(
            ts.meanNormalizedScore * 100
          ).toFixed(1)}%** | ${(ts.victoryBracketsRate.MIRACLE * 100).toFixed(
            1
          )}% | ${(ts.victoryBracketsRate.MAJOR_VICTORY * 100).toFixed(
            1
          )}% | ${(ts.victoryBracketsRate.COSTLY_VICTORY * 100).toFixed(
            1
          )}% | ${(ts.victoryBracketsRate.DEFEAT * 100).toFixed(1)}% | ${(
            ts.cardParriedRate * 100
          ).toFixed(1)}% | ${(ts.cardNoTargetRate * 100).toFixed(1)}% | ${(
            ts.wastedDefenderRate * 100
          ).toFixed(1)}% |`
        );
      }
      lines.push('');
    }
  }

  // Section 5 : Vérification Formelle I1-I4 et Cas Limites H1-H7b
  lines.push(
    `## 5. Bilan de Vérification Formelle (Invariants I1–I4 & Cas Limites H1–H7b)`
  );
  if (campaign.stressTelemetry) {
    const st = campaign.stressTelemetry;
    const gDiv = Math.max(1, st.totalGamesSimulated);
    lines.push(
      `- **Parties vérifiées** : ${st.totalGamesSimulated.toLocaleString(
        'fr-FR'
      )} (${st.invariantsVerifiedCount.toLocaleString(
        'fr-FR'
      )} points de contrôle I1–I4)`
    );
    lines.push(
      `- **Violations d'invariants détectées** : **${st.violationsCount}**`
    );
    lines.push(
      `- **Parties avec tours stagnants** : ${st.stagnantGamesCount} (${(
        (st.stagnantGamesCount / gDiv) *
        100
      ).toFixed(2)}%)`
    );
    lines.push(
      `- **Monopoles Case 1 (100% des tours)** : ${
        st.tacticMonopolyGamesCount
      } (${((st.tacticMonopolyGamesCount / gDiv) * 100).toFixed(2)}%)`
    );
    lines.push('');
  } else if (campaign.variantResults.length > 0) {
    lines.push(
      `| Variante | Violations I1–I4 | Tours Stagnants % | Monopole Case 1 % | H1/p | H2/p | H3/p | H4/p | H5/p | H6/p | H7a/p | H7b/p |`
    );
    lines.push(
      `| :--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |`
    );
    for (const v of campaign.variantResults) {
      const totalG = Math.max(
        1,
        v.tableSummaries.reduce((acc, t) => acc + t.gamesCount, 0)
      );
      const ec = v.edgeCaseTotals;
      lines.push(
        `| **${v.variantLabel}** | **${v.invariantViolationsCount}** | ${(
          v.stagnantTurnsRate * 100
        ).toFixed(1)}% | ${(v.slot1MonopolyGamesRate * 100).toFixed(1)}% | ${(
          ec.H1_noTargetEligible / totalG
        ).toFixed(2)} | ${(
          ec.H2_multipleHarvesterCardsSingleTree / totalG
        ).toFixed(2)} | ${(
          ec.H3_multipleBulldozerCardsSameCell / totalG
        ).toFixed(2)} | ${(
          ec.H4_repairedBulldozerImmunityInCell1 / totalG
        ).toFixed(2)} | ${(ec.H5_degradedBulldozerNoGrudge / totalG).toFixed(
          2
        )} | ${(ec.H6_multiEventSameCellSingleGrudge / totalG).toFixed(2)} | ${(
          ec.H7_preventiveDestructionNoCard / totalG
        ).toFixed(2)} | ${(ec.H7_emptyCellOverDefense / totalG).toFixed(2)} |`
      );
    }
    lines.push('');
  }

  // Section 6 : Graines Épinglées & Traces
  if (campaign.pinnedSeeds && campaign.pinnedSeeds.length > 0) {
    lines.push(`## 6. Graines Épinglées Remarquables (Conservatoire Niveau 3)`);
    for (const ps of campaign.pinnedSeeds) {
      lines.push(
        `- **Seed \`${ps.seed}\` [${ps.reasonCategory}] — ${ps.title}** : ${ps.description} (${ps.editionAName}: ${(ps.scoreANormalized * 100).toFixed(1)}% vs ${ps.editionBName}: ${(ps.scoreBNormalized * 100).toFixed(1)}%)`
      );
    }
    lines.push('');
  }

  lines.push(
    `## 7. Journaux Textuels Détaillés (Traces d'Exécution pour Interprétation IA)`
  );
  if (
    campaign.stressTelemetry &&
    campaign.stressTelemetry.capturedExtremeLogs.length > 0
  ) {
    for (const log of campaign.stressTelemetry.capturedExtremeLogs.slice(0, 4)) {
      lines.push(`### Cas Capturé [${log.category}] — Seed ${log.seed}`);
      lines.push(`- **Résumé** : ${log.summary}`);
      lines.push('```text');
      lines.push(log.textualJournal);
      lines.push('```');
      lines.push('');
    }
  } else {
    for (const v of campaign.variantResults.slice(0, 2)) {
      for (const sample of v.sampleTraces.slice(0, 1)) {
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

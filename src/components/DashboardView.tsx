import React, { useState } from 'react';
import {
  CampaignRecord,
  ThemeVocabularyMode,
  VariantEvaluationResult,
} from '../sim/types';
import { SWITCH_KEYS, SWITCH_META, TACTIC_DESCRIPTIONS } from '../sim/i18n';
import {
  downloadCampaignJson,
  downloadCampaignMarkdown,
  saveEditionPreset,
} from '../api';
import {
  AlertTriangle,
  BookmarkPlus,
  Clock,
  Download,
  Pause,
  Play,
  Square,
  Trash2,
} from 'lucide-react';

interface DashboardViewProps {
  campaigns: CampaignRecord[];
  selectedCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  onControlCampaign: (id: string, action: 'pause' | 'resume' | 'stop') => void;
  onDeleteCampaign: (id: string) => void;
  onNavigateTab: (
    tab: 'dashboard' | 'builder' | 'conservatory' | 'stress' | 'journals'
  ) => void;
  onEditionSaved?: () => Promise<void>;
  vocabulary: ThemeVocabularyMode;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  campaigns,
  selectedCampaign,
  onSelectCampaign,
  onControlCampaign,
  onDeleteCampaign,
  onNavigateTab,
  onEditionSaved,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    null
  );
  const [savingAsEdition, setSavingAsEdition] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  if (!selectedCampaign) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-8 text-center space-y-4">
        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Aucune campagne sélectionnée
        </h2>
        <p className="text-xs text-slate-500">
          Lancez un nouveau Test Croisé / Ablation A/B ou consultez le Conservatoire.
        </p>
        <button
          onClick={() => onNavigateTab('builder')}
          className="px-4 py-2 text-xs font-semibold text-white bg-emerald-700 rounded-md"
        >
          Configurer un Test Croisé
        </button>
      </div>
    );
  }

  const variants = selectedCampaign.variantResults || [];
  const activeVariant: VariantEvaluationResult | null =
    variants.find((v) => v.variantId === selectedVariantId) ||
    variants[0] ||
    null;

  // Variantes triées par note globale décroissante
  const sortedVariants = [...variants].sort(
    (a, b) => b.criteria.overallDesignScore - a.criteria.overallDesignScore
  );

  // Top 10 des "Cocktails Minimalistes" (peu d'interrupteurs modifiés mais fort gain)
  const baseVariantA = variants.find(
    (v) => v.ablationCategory === 'BASE_EDITION_A'
  );
  const baseScoreA = baseVariantA
    ? baseVariantA.criteria.overallDesignScore
    : sortedVariants[sortedVariants.length - 1]?.criteria.overallDesignScore || 0;

  const handleSaveVariantAsEdition = async (variant: VariantEvaluationResult) => {
    setSavingAsEdition(true);
    setSavedNotice(null);
    try {
      await saveEditionPreset({
        name: `Édition issue de ${variant.variantLabel}`,
        version: '2.1.0',
        description: `Enregistrée depuis la campagne « ${selectedCampaign.config.name} » (Note Globale : ${variant.criteria.overallDesignScore.toFixed(1)}/100).`,
        switches: {
          ruleNoTargetH1: variant.params.ruleNoTargetH1,
          ruleParryMode: variant.params.ruleParryMode,
          rulePreventiveDestruction: variant.params.rulePreventiveDestruction,
          ruleBulldozerTargeting: variant.params.ruleBulldozerTargeting,
          ruleScrapyardExit: variant.params.ruleScrapyardExit,
          ruleInitialSetup: variant.params.ruleInitialSetup,
        },
        defaultParams: variant.params,
      });
      if (onEditionSaved) await onEditionSaved();
      setSavedNotice(`Variante « ${variant.variantLabel} » enregistrée dans le Conservatoire (Niveau 1).`);
    } finally {
      setSavingAsEdition(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Sélecteur de Campagne & Barre de Progression / Export */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Campagne active :
            </label>
            <select
              value={selectedCampaign.id}
              onChange={(e) => {
                onSelectCampaign(e.target.value);
                setSelectedVariantId(null);
              }}
              className="px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
            >
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.config.name} ({c.status} · {c.progress.completedGames} parties)
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs">
            {selectedCampaign.status === 'RUNNING' && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'pause')}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-amber-100 text-amber-800 rounded-md"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}
            {selectedCampaign.status === 'PAUSED' && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'resume')}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-emerald-100 text-emerald-800 rounded-md"
              >
                <Play className="w-3.5 h-3.5" />
                Reprendre
              </button>
            )}
            {(selectedCampaign.status === 'RUNNING' ||
              selectedCampaign.status === 'PAUSED') && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'stop')}
                className="inline-flex items-center gap-1 px-3 py-1.5 font-medium bg-red-100 text-red-800 rounded-md"
              >
                <Square className="w-3.5 h-3.5" />
                Arrêter
              </button>
            )}

            <button
              type="button"
              onClick={() => downloadCampaignMarkdown(selectedCampaign)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Rapport Markdown IA (.md)
            </button>
            <button
              type="button"
              onClick={() => downloadCampaignJson(selectedCampaign)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              JSON Complet
            </button>
            <button
              onClick={() => onDeleteCampaign(selectedCampaign.id)}
              className="p-1.5 text-slate-400 hover:text-red-600"
              title="Supprimer cette campagne"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barre de progression temps réel */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            <span>{selectedCampaign.progress.currentPhaseLabel}</span>
            <span>
              {selectedCampaign.progress.completedGames.toLocaleString('fr-FR')} /{' '}
              {selectedCampaign.progress.totalTargetGames.toLocaleString('fr-FR')} parties ·{' '}
              {selectedCampaign.progress.gamesPerSecond.toFixed(1)} parties/s ·{' '}
              {selectedCampaign.progress.elapsedSeconds.toFixed(1)}s
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-300"
              style={{
                width: `${Math.min(
                  100,
                  (selectedCampaign.progress.completedGames /
                    Math.max(1, selectedCampaign.progress.totalTargetGames)) *
                    100
                )}%`,
              }}
            />
          </div>
        </div>

        {savedNotice && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded text-xs text-emerald-800 dark:text-emerald-200">
            {savedNotice}
          </div>
        )}
      </div>

      {/* Si la campagne contient des variantes (Evaluation Sweep ou AB Ablation) */}
      {activeVariant && (
        <>
          {/* Table Comparative des Variantes / Ablation Croisée (Paired Seeds) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Classement Comparatif & Matrice d’Ablation sur Graines Appariées ({variants.length} variante(s))
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cliquez sur une ligne pour inspecter ses 5 Critères Principaux (/100), ses 4 Axes Diagnostiques Complémentaires et ses capteurs H1–H7b.
                </p>
              </div>
              <button
                onClick={() => handleSaveVariantAsEdition(activeVariant)}
                disabled={savingAsEdition}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded hover:bg-emerald-100"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                Enregistrer la variante sélectionnée comme Édition
              </button>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 text-slate-500 font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="py-2.5 px-3">Variante / Cocktail</th>
                    <th className="py-2.5 px-2 text-right">Modifs /V1</th>
                    <th className="py-2.5 px-2 text-right">Note /100</th>
                    <th className="py-2.5 px-2 text-right">Δ vs Base</th>
                    <th className="py-2.5 px-2 text-right">1. Sobriété</th>
                    <th className="py-2.5 px-2 text-right">2. Stratégie</th>
                    <th className="py-2.5 px-2 text-right">3. Tension</th>
                    <th className="py-2.5 px-2 text-right">4. Collab.</th>
                    <th className="py-2.5 px-2 text-right">5. Vitalité</th>
                    <th className="py-2.5 px-2 text-right">Durée (A)</th>
                    <th className="py-2.5 px-3 text-right">ΔGobelet (D)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {sortedVariants.map((v) => {
                    const isSelected = v.variantId === activeVariant.variantId;
                    const deltaBase = v.criteria.overallDesignScore - baseScoreA;
                    return (
                      <tr
                        key={v.variantId}
                        onClick={() => setSelectedVariantId(v.variantId)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-emerald-50/70 dark:bg-emerald-950/40 font-semibold'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-sans">
                          <div className="text-slate-900 dark:text-slate-100 font-medium">
                            {v.variantLabel}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            n={v.params.n}, q={v.params.q}, a={v.params.a}, x={v.params.x} · {v.params.modeTirageDes}
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.switchesChangedCountFromV1}/6
                        </td>
                        <td className="py-2.5 px-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                          {v.criteria.overallDesignScore.toFixed(1)}
                        </td>
                        <td
                          className={`py-2.5 px-2 text-right ${
                            deltaBase > 0
                              ? 'text-emerald-600'
                              : deltaBase < 0
                              ? 'text-red-600'
                              : 'text-slate-400'
                          }`}
                        >
                          {deltaBase >= 0 ? `+${deltaBase.toFixed(1)}` : deltaBase.toFixed(1)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.criteria.simplicitySobriety.score.toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.criteria.strategicDepth.score.toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.criteria.tensionDrama.score.toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.criteria.collaborationNecessity.score.toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.criteria.foremanVitalityFairness.score.toFixed(0)}
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          {v.diagnosticAxes.axisA_PhysicalDuration.totalEstimatedMinutes.toFixed(0)} min
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          {(v.diagnosticAxes.axisD_PrivateCupUtility.survivalGainFromSecret * 100).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SECTION 5 : LES 5 CRITÈRES PRINCIPAUX D'ÉVALUATION (/100)       */}
          {/* =============================================================== */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Les 5 Critères Principaux d’Évaluation (/100) — {activeVariant.variantLabel}
              </h2>
              <span className="text-sm font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                Note Globale Pondérée : {activeVariant.criteria.overallDesignScore.toFixed(1)} / 100
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {/* Critère 1 : Simplicité, Fluidité & Sobriété */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    1. Simplicité & Sobriété
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {activeVariant.criteria.simplicitySobriety.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <div>
                      Actions utiles :{' '}
                      {activeVariant.criteria.simplicitySobriety.effectiveActionRateScore.toFixed(1)}/40 ({(activeVariant.criteria.simplicitySobriety.effectiveActionRate * 100).toFixed(0)}%)
                    </div>
                    <div>
                      Manip./tour actif :{' '}
                      {activeVariant.criteria.simplicitySobriety.activeTurnManipulationScore.toFixed(1)}/30 ({activeVariant.criteria.simplicitySobriety.manipulationsPerActiveTurn.toFixed(1)})
                    </div>
                    <div>
                      Sobriété livret :{' '}
                      {activeVariant.criteria.simplicitySobriety.rulebookConceptualSobrietyScore.toFixed(1)}/30
                    </div>
                  </div>
                </div>
                <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  {activeVariant.criteria.simplicitySobriety.interpretation}
                </p>
              </div>

              {/* Critère 2 : Profondeur Stratégique */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    2. Profondeur Stratégique
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {activeVariant.criteria.strategicDepth.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <div>
                      N1 vs N0 (Plancher) :{' '}
                      {activeVariant.criteria.strategicDepth.coherenceN1VsRandomScore.toFixed(1)}/15 (+{(activeVariant.criteria.strategicDepth.deltaN1VsRandom * 100).toFixed(1)}%)
                    </div>
                    <div>
                      N2 vs N1 (Tactique) :{' '}
                      {activeVariant.criteria.strategicDepth.tacticalMasteryN2VsN1Score.toFixed(1)}/40 (+{(activeVariant.criteria.strategicDepth.deltaN2VsN1 * 100).toFixed(1)}%)
                    </div>
                    <div>
                      N3 vs N2 (Méta) :{' '}
                      {activeVariant.criteria.strategicDepth.metaMasteryN3VsN2Score.toFixed(1)}/45 (+{(activeVariant.criteria.strategicDepth.deltaN3VsN2 * 100).toFixed(1)}%)
                    </div>
                  </div>
                </div>
                <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  {activeVariant.criteria.strategicDepth.interpretation}
                </p>
              </div>

              {/* Critère 3 : Tension & Courbe Dramatique */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    3. Tension & Dramaturgie
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {activeVariant.criteria.tensionDrama.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <div>
                      Proximité cible :{' '}
                      {activeVariant.criteria.tensionDrama.bracketDistributionProximityScore.toFixed(1)}/50
                    </div>
                    <div>
                      Attrition av. régén. :{' '}
                      {activeVariant.criteria.tensionDrama.activeAttritionScore.toFixed(1)}/30 ({(activeVariant.criteria.tensionDrama.meanAttritionBeforeRegen * 100).toFixed(0)}%)
                    </div>
                    <div>
                      Dilemmes :{' '}
                      {activeVariant.criteria.tensionDrama.dilemmaFrequencyScore.toFixed(1)}/20 ({(activeVariant.criteria.tensionDrama.dilemmaFrequency * 100).toFixed(0)}%)
                    </div>
                  </div>
                </div>
                <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  {activeVariant.criteria.tensionDrama.interpretation}
                </p>
              </div>

              {/* Critère 4 : Nécessité de Collaborer */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    4. Nécessité de Collaborer
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {activeVariant.criteria.collaborationNecessity.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <div>
                      Gain N2 vs N1 :{' '}
                      {activeVariant.criteria.collaborationNecessity.netCommunicationGainScore.toFixed(1)}/50 (+{(activeVariant.criteria.collaborationNecessity.deltaCoopVsSelfish * 100).toFixed(1)}%)
                    </div>
                    <div>
                      Sauvetages Étape 2 :{' '}
                      {activeVariant.criteria.collaborationNecessity.microCycleRescueImpactScore.toFixed(1)}/30 ({activeVariant.criteria.collaborationNecessity.step2RescueRatePerTurn.toFixed(2)}/t)
                    </div>
                    <div>
                      Conv. Omniscient :{' '}
                      {activeVariant.criteria.collaborationNecessity.omniscientConvergenceScore.toFixed(1)}/20
                    </div>
                  </div>
                </div>
                <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  {activeVariant.criteria.collaborationNecessity.interpretation}
                </p>
              </div>

              {/* Critère 5 : Vitalité du Contremaître & Équité des Rangs */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-500">
                    5. Vitalité & Équité Rangs
                  </div>
                  <div className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                    {activeVariant.criteria.foremanVitalityFairness.score.toFixed(1)}
                    <span className="text-xs font-normal text-slate-400"> /100</span>
                  </div>
                  <div className="mt-3 space-y-1 text-[11px] font-mono text-slate-600 dark:text-slate-400">
                    <div>
                      Activité continue :{' '}
                      {activeVariant.criteria.foremanVitalityFairness.continuousActivityScore.toFixed(1)}/35 ({(activeVariant.criteria.foremanVitalityFairness.nonStagnantTurnRate * 100).toFixed(0)}%)
                    </div>
                    <div>
                      Renouv. Case 1 :{' '}
                      {activeVariant.criteria.foremanVitalityFairness.tacticsRenewalScore.toFixed(1)}/35 (H={activeVariant.criteria.foremanVitalityFairness.tacticSlot1Entropy.toFixed(2)})
                    </div>
                    <div>
                      Équité Rang 1 :{' '}
                      {activeVariant.criteria.foremanVitalityFairness.initialEyeFairnessScore.toFixed(1)}/30 (Écart {(activeVariant.criteria.foremanVitalityFairness.rank1VsOthersGap * 100).toFixed(1)}%)
                    </div>
                  </div>
                </div>
                <p className="mt-3 pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                  {activeVariant.criteria.foremanVitalityFairness.interpretation}
                </p>
              </div>
            </div>
          </div>

          {/* =============================================================== */}
          {/* SECTION 6 : LES 4 AXES DIAGNOSTIQUES COMPLÉMENTAIRES            */}
          {/* =============================================================== */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              Les 4 Axes Diagnostiques Complémentaires (Hors Note Globale)
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Axe A : Durée de Jeu Physique & Ratio Réflexion/Manipulation */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Axe A — Durée de Jeu Physique Estimée
                  </span>
                  <Clock className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {activeVariant.diagnosticAxes.axisA_PhysicalDuration.totalEstimatedMinutes.toFixed(1)} min{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({activeVariant.diagnosticAxes.axisA_PhysicalDuration.minutesPerPlayer.toFixed(1)} min/joueur)
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Temps cognitif (Phase 2) :{' '}
                    {(activeVariant.diagnosticAxes.axisA_PhysicalDuration.cognitiveShareRate * 100).toFixed(0)}% ({(activeVariant.diagnosticAxes.axisA_PhysicalDuration.phase2CognitiveSecondsTotal / 60).toFixed(1)} min)
                  </div>
                  <div>
                    Manipulation (Phase 3) :{' '}
                    {(activeVariant.diagnosticAxes.axisA_PhysicalDuration.manipulationShareRate * 100).toFixed(0)}% ({(activeVariant.diagnosticAxes.axisA_PhysicalDuration.phase3ManipulationSecondsTotal / 60).toFixed(1)} min)
                  </div>
                  <div>
                    Rythme : Tour 1 ≈ {activeVariant.diagnosticAxes.axisA_PhysicalDuration.turn1EstimatedSeconds.toFixed(0)}s → Tour {activeVariant.params.x} ≈ {activeVariant.diagnosticAxes.axisA_PhysicalDuration.turnXEstimatedSeconds.toFixed(0)}s
                  </div>
                </div>
                {activeVariant.diagnosticAxes.axisA_PhysicalDuration.manipulationWarningAlert && (
                  <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Alerte : le temps de manipulation dépasse 45% du temps total.
                  </div>
                )}
                <p className="text-[11px] text-slate-500 pt-1">
                  {activeVariant.diagnosticAxes.axisA_PhysicalDuration.diagnosticSummary}
                </p>
              </div>

              {/* Axe B : Intérêt de l'Apprentissage du Contremaître */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Axe B — Intérêt de l’Apprentissage du Contremaître
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                  {(activeVariant.diagnosticAxes.axisB_ForemanLearning.snowballRate * 100).toFixed(1)}%{' '}
                  <span className="text-xs font-normal text-slate-500">
                    Effet Boule de Neige P(t+1|t)
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Mouvements Piste/tour : +{activeVariant.diagnosticAxes.axisB_ForemanLearning.meanAdvancesPerTurn.toFixed(2)} av. / -{activeVariant.diagnosticAxes.axisB_ForemanLearning.meanRetreatsPerTurn.toFixed(2)} reculs
                  </div>
                  <div>
                    Contrôle Case 1 (N3 vs N2) : {(activeVariant.diagnosticAxes.axisB_ForemanLearning.n3VsN2Slot1ControlDelta * 100).toFixed(1)}%
                  </div>
                  <div>
                    Diversité Top 2 (Cases 1–2) : {activeVariant.diagnosticAxes.axisB_ForemanLearning.meanDistinctTacticsInTop2.toFixed(2)} / 6 tuiles
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  {activeVariant.diagnosticAxes.axisB_ForemanLearning.diagnosticSummary}
                </p>
              </div>

              {/* Axe D : Utilité de la Connaissance Privée sous le Gobelet */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-2">
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  Axe D — Utilité du Secret sous le Gobelet (N2 vs Aveugle)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  +{(activeVariant.diagnosticAxes.axisD_PrivateCupUtility.survivalGainFromSecret * 100).toFixed(1)}%{' '}
                  <span className="text-xs font-normal text-slate-500">
                    Gain de survie lié au Gobelet (ΔSecret)
                  </span>
                </div>
                <div className="text-xs font-mono text-slate-600 dark:text-slate-400 space-y-0.5">
                  <div>
                    Inflexion locale (jetons redirigés) : {(activeVariant.diagnosticAxes.axisD_PrivateCupUtility.cupRedirectionRate * 100).toFixed(1)}%
                  </div>
                  <div>
                    Parade surprises (Cases 3–6) : N2 {(activeVariant.diagnosticAxes.axisD_PrivateCupUtility.surpriseAttackParryRateN2 * 100).toFixed(0)}% vs Aveugle {(activeVariant.diagnosticAxes.axisD_PrivateCupUtility.surpriseAttackParryRateBlind * 100).toFixed(0)}%
                  </div>
                  <div>
                    Transmission fidèle du secret (Étape 2) : {(activeVariant.diagnosticAxes.axisD_PrivateCupUtility.secretTransmissionFidelityRate * 100).toFixed(0)}%
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  {activeVariant.diagnosticAxes.axisD_PrivateCupUtility.diagnosticSummary}
                </p>
              </div>
            </div>

            {/* Axe C : Tableau Analytique Individuel des 6 Tactiques (A1..B3) */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-slate-100">
                  Axe C — Bilan Analytique Individuel des 6 Tactiques (A1, A2, A3, B1, B2, B3)
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeVariant.diagnosticAxes.axisC_TacticsIndividualBalance.diagnosticSummary}
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold">
                      <th className="py-2 px-3">Tactique</th>
                      <th className="py-2 px-2 text-right">Fréq. Tirage</th>
                      <th className="py-2 px-2 text-right">Rang Moyen</th>
                      <th className="py-2 px-2 text-right">% Case 1</th>
                      <th className="py-2 px-2 text-right">% Réussite</th>
                      <th className="py-2 px-2 text-right">% Parée</th>
                      <th className="py-2 px-2 text-right">% Sans Cible (H1)</th>
                      <th className="py-2 px-2 text-right">Impact / Tirage</th>
                      <th className="py-2 px-2 text-right">Déf. Attirés</th>
                      <th className="py-2 px-3">Diagnostic Automatique</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {activeVariant.diagnosticAxes.axisC_TacticsIndividualBalance.rows.map(
                      (row) => (
                        <tr key={row.tactic}>
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900 dark:text-slate-100">
                            {TACTIC_DESCRIPTIONS[row.tactic].name}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(row.drawFrequencyRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {row.meanTrackPosition.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(row.slot1ResidencyRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right text-amber-700 dark:text-amber-400">
                            {(row.successRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right text-emerald-700 dark:text-emerald-400">
                            {(row.parriedRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(row.noTargetH1Rate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {row.tactic.startsWith('A')
                              ? `${row.netTreesCutPerDraw.toFixed(2)} T / +${row.netHarvestersDeployedPerDraw.toFixed(2)} Ab.`
                              : `${row.netStumpsClearedPerDraw.toFixed(2)} S / +${row.netRepairsPerDraw.toFixed(2)} Rép.`}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {row.defensiveMobilizationMean.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-3 font-sans">
                            <span
                              className={`font-semibold ${
                                row.diagnosticLabel === 'Équilibrée'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {row.diagnosticLabel}
                            </span>
                            <div className="text-[11px] text-slate-500">
                              {row.diagnosticDetail}
                            </div>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Capteurs Stress-Test intégrés (H1 à H7b & Interrupteurs de la variante) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Configuration des 6 Interrupteurs Mécaniques ({activeVariant.variantLabel})
              </h3>
              <div className="space-y-1.5 text-xs">
                {SWITCH_KEYS.map((key) => {
                  const meta = SWITCH_META[key];
                  const val = activeVariant.params[key];
                  const isV2 = val === meta.v2Value;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 py-1 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <span className="text-slate-600 dark:text-slate-400">
                        {meta.title}
                      </span>
                      <span
                        className={`font-mono font-semibold ${
                          isV2
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-amber-700 dark:text-amber-400'
                        }`}
                      >
                        {isV2 ? meta.v2Label : meta.v1Label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Capteurs de Cas Limites (H1 à H7b) & Santé Règles
              </h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H1 (Tactique sans cible) :{' '}
                  <strong>{activeVariant.edgeCaseTotals.H1_noTargetEligible}</strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H2 (Cartes A empilées/1 arbre) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H2_multipleHarvesterCardsSingleTree}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H3 (Cartes B empilées) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H3_multipleBulldozerCardsSameCell}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H4 (Immunité Bull. réparé) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H4_repairedBulldozerImmunityInCell1}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H5 (Terrassement dégradé) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H5_degradedBulldozerNoGrudge}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H6 (Rancune groupée/case) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H6_multiEventSameCellSingleGrudge}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H7a (Destr. préventive 0 carte) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H7_preventiveDestructionNoCard}
                  </strong>
                </div>
                <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50">
                  H7b (Gaspillage Défenseurs) :{' '}
                  <strong>
                    {activeVariant.edgeCaseTotals.H7_emptyCellOverDefense}
                  </strong>
                </div>
              </div>
              <div className="text-xs font-mono text-slate-600 dark:text-slate-400 pt-1">
                Tours stagnants : {(activeVariant.stagnantTurnsRate * 100).toFixed(1)}% · Monopole Case 1 (&gt;85%) : {(activeVariant.slot1MonopolyGamesRate * 100).toFixed(1)}% · Violations d’invariants (I1–I4) :{' '}
                <strong
                  className={
                    activeVariant.invariantViolationsCount === 0
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }
                >
                  {activeVariant.invariantViolationsCount}
                </strong>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

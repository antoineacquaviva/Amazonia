import React, { useState } from 'react';
import {
  CampaignRecord,
  TacticId,
  ThemeVocabularyMode,
  VariantEvaluationResult,
} from '../sim/types';
import { DICTIONARIES, TACTIC_DESCRIPTIONS } from '../sim/i18n';
import { getJsonExportUrl, getMarkdownExportUrl } from '../api';
import {
  Download,
  Pause,
  Play,
  Square,
  Trash2,
  FileText,
  ArrowUpRight,
  Sliders,
} from 'lucide-react';

interface DashboardViewProps {
  campaigns: CampaignRecord[];
  selectedCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  onControlCampaign: (id: string, action: 'pause' | 'resume' | 'stop') => void;
  onDeleteCampaign: (id: string) => void;
  onNavigateTab: (
    tab: 'dashboard' | 'builder' | 'stress' | 'journals' | 'reference'
  ) => void;
  vocabulary: ThemeVocabularyMode;
}

const ALL_TACTICS: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

function formatCriterionStatus(score: number): { label: string; colorClass: string } {
  if (score >= 75) {
    return {
      label: 'Optimal',
      colorClass: 'text-emerald-700 dark:text-emerald-400 font-semibold',
    };
  }
  if (score >= 55) {
    return {
      label: 'Équilibré',
      colorClass: 'text-amber-700 dark:text-amber-400 font-semibold',
    };
  }
  return {
    label: 'À ajuster',
    colorClass: 'text-red-700 dark:text-red-400 font-semibold',
  };
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  campaigns,
  selectedCampaign,
  onSelectCampaign,
  onControlCampaign,
  onDeleteCampaign,
  onNavigateTab,
  vocabulary,
}) => {
  const dict = DICTIONARIES[vocabulary];
  const [selectedVariantIdx, setSelectedVariantIdx] = useState<number>(0);
  const [selectedTableIdx, setSelectedTableIdx] = useState<number>(0);

  if (!selectedCampaign) {
    return (
      <div className="p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Aucune campagne sélectionnée
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-xl mx-auto">
          Lancez une nouvelle campagne multi-variantes ou un stress-test asynchrone pour analyser l’équilibrage du jeu.
        </p>
        <button
          onClick={() => onNavigateTab('builder')}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
        >
          Configurer une campagne
        </button>
      </div>
    );
  }

  const variants: VariantEvaluationResult[] = selectedCampaign.variantResults || [];
  const safeVarIdx =
    selectedVariantIdx < variants.length ? selectedVariantIdx : 0;
  const activeVariant = variants[safeVarIdx] || null;

  const tables = activeVariant ? activeVariant.tableSummaries : [];
  const safeTableIdx =
    selectedTableIdx < tables.length ? selectedTableIdx : 0;
  const activeTable = tables[safeTableIdx] || null;

  const pct =
    selectedCampaign.progress.totalTargetGames > 0
      ? Math.min(
          100,
          (selectedCampaign.progress.completedGames /
            selectedCampaign.progress.totalTargetGames) *
            100
        )
      : 100;

  return (
    <div className="space-y-8">
      {/* Barre de Sélection et Supervision de la Campagne Active */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>
                {selectedCampaign.config.type === 'EVALUATION_SWEEP'
                  ? 'Campagne Multi-Variantes & 4 Critères'
                  : 'Stress-Test & Vérification Formelle (VM Oracle)'}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Seed de base : {selectedCampaign.config.baseSeed}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                Statut : {selectedCampaign.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label htmlFor="campaign-select" className="sr-only">
                Choisir une campagne
              </label>
              <select
                id="campaign-select"
                value={selectedCampaign.id}
                onChange={(e) => {
                  setSelectedVariantIdx(0);
                  setSelectedTableIdx(0);
                  onSelectCampaign(e.target.value);
                }}
                className="text-base font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-600"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.config.name} ({c.progress.completedGames.toLocaleString('fr-FR')} parties — {c.status})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {selectedCampaign.status === 'RUNNING' && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'pause')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-md hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Pause className="w-3.5 h-3.5" />
                Mettre en pause
              </button>
            )}
            {selectedCampaign.status === 'PAUSED' && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'resume')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-md hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
              >
                <Play className="w-3.5 h-3.5" />
                Reprendre
              </button>
            )}
            {(selectedCampaign.status === 'RUNNING' ||
              selectedCampaign.status === 'PAUSED') && (
              <button
                onClick={() => onControlCampaign(selectedCampaign.id, 'stop')}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-200 transition-colors whitespace-nowrap shrink-0"
              >
                <Square className="w-3.5 h-3.5" />
                Arrêter et consolider
              </button>
            )}

            <a
              href={getMarkdownExportUrl(selectedCampaign.id)}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <FileText className="w-3.5 h-3.5" />
              Rapport IA (.md)
            </a>
            <a
              href={getJsonExportUrl(selectedCampaign.id)}
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </a>
            {campaigns.length > 1 && (
              <button
                onClick={() => onDeleteCampaign(selectedCampaign.id)}
                title="Supprimer cette campagne"
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 border border-transparent hover:border-red-200 rounded-md transition-colors whitespace-nowrap shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Supprimer
              </button>
            )}
          </div>
        </div>

        {/* Barre de progression et télémétrie d'exécution */}
        <div className="pt-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>{selectedCampaign.progress.currentPhaseLabel}</span>
            <div className="flex items-center gap-3 font-mono tabular-nums">
              <span>
                {selectedCampaign.progress.completedGames.toLocaleString('fr-FR')} /{' '}
                {selectedCampaign.progress.totalTargetGames.toLocaleString('fr-FR')} parties ({pct.toFixed(1)}%)
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {selectedCampaign.progress.gamesPerSecond.toFixed(0)} parties/s
              </span>
              <span aria-hidden="true">·</span>
              <span>{selectedCampaign.progress.elapsedSeconds.toFixed(1)}s</span>
            </div>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
            <div
              className="h-full bg-emerald-600 transition-all duration-200"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </section>

      {/* Si c'est une campagne Stress-Test uniquement sans variantes d'évaluation, proposer un raccourci */}
      {selectedCampaign.config.type === 'ORACLE_STRESS_TEST' &&
        variants.length === 0 && (
          <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Campagne de Stress-Test & Vérification Formelle sélectionnée
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                Consultez l’onglet Stress-Test VM Oracle pour inspecter les invariants (I1–I4) et les occurrences des cas limites (H1–H7).
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('stress')}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Ouvrir la console Stress-Test
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </section>
        )}

      {/* Comparateur de toutes les Variantes de la Campagne */}
      {variants.length > 0 && (
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                01. Comparaison Multi-Variantes & Synthèse des 4 Critères
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Cliquez sur une ligne de variante pour inspecter ses distributions par configuration de table et l’équilibre de {dict['board.villain.eye']}.
              </p>
            </div>
            <button
              onClick={() => onNavigateTab('builder')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              <Sliders className="w-3.5 h-3.5" />
              Tester d'autres variantes
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Variante testée</th>
                  <th className="py-2.5 px-3 font-medium text-right">Note Globale</th>
                  <th className="py-2.5 px-3 font-medium text-right">1. Simplicité & Ergo</th>
                  <th className="py-2.5 px-3 font-medium text-right">2. Intérêt Stratégique</th>
                  <th className="py-2.5 px-3 font-medium text-right">3. Tension & Choix</th>
                  <th className="py-2.5 px-3 font-medium text-right">4. Collaboration</th>
                  <th className="py-2.5 px-3 font-medium text-right">Survie (Coop N2)</th>
                  <th className="py-2.5 pl-3 font-medium text-right">Écart Stratège - Égoïste</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {variants.map((v, idx) => {
                  const isSelected = idx === safeVarIdx;
                  const coopSummary =
                    v.tableSummaries.find((t) =>
                      t.botProfiles.includes('COOPERATIVE')
                    ) || v.tableSummaries[0];
                  return (
                    <tr
                      key={v.variantId}
                      onClick={() => {
                        setSelectedVariantIdx(idx);
                        setSelectedTableIdx(0);
                      }}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100 font-medium'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-sans">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">
                            {v.variantLabel}
                          </span>
                          {isSelected && (
                            <span className="text-[11px] text-emerald-700 dark:text-emerald-400">
                              [Active]
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                        {v.criteria.overallDesignScore}/100
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {v.criteria.simplicityErgonomics.score}/100
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {v.criteria.strategicInterest.score}/100
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {v.criteria.tensionToughChoices.score}/100
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {v.criteria.collaborationInterest.score}/100
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {coopSummary
                          ? `${(coopSummary.meanNormalizedScore * 100).toFixed(1)}%`
                          : '—'}
                      </td>
                      <td className="py-2.5 pl-3 text-right text-emerald-700 dark:text-emerald-400">
                        +{(v.criteria.strategicInterest.skillGapStrategistVsSelfish * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Évaluation Détaillée des 4 Critères pour la Variante Active */}
      {activeVariant && (
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              02. Évaluation Analytique des 4 Critères — {activeVariant.variantLabel}
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Note globale de conception :{' '}
              <strong className="text-slate-900 dark:text-slate-100">
                {activeVariant.criteria.overallDesignScore}/100
              </strong>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Critère 1 : Simplicité et Ergonomie */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Critère 1 · Fluidité & Charge Cognitive
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Simplicité et Ergonomie
                  </h3>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeVariant.criteria.simplicityErgonomics.score}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                  <div
                    className={`text-xs font-sans ${
                      formatCriterionStatus(
                        activeVariant.criteria.simplicityErgonomics.score
                      ).colorClass
                    }`}
                  >
                    {
                      formatCriterionStatus(
                        activeVariant.criteria.simplicityErgonomics.score
                      ).label
                    }
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeVariant.criteria.simplicityErgonomics.interpretation}
              </p>

              <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Cartes à effet direct
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.simplicityErgonomics
                        .directResolutionRate * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Manipulations / tour
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeVariant.criteria.simplicityErgonomics.meanManipulationsPerTurn.toFixed(
                      2
                    )}{' '}
                    mvts
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Verrouillage Étape 2
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeVariant.criteria.simplicityErgonomics.meanNegotiationCycles.toFixed(
                      2
                    )}{' '}
                    cycles
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Cas limites H1–H6 / partie
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeVariant.criteria.simplicityErgonomics.edgeCaseFrequencyPerGame.toFixed(
                      2
                    )}
                  </dd>
                </div>
              </dl>
            </div>

            {/* Critère 2 : Intérêt Stratégique */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Critère 2 · Impact de la Compétence & Équité
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Intérêt Stratégique
                  </h3>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeVariant.criteria.strategicInterest.score}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                  <div
                    className={`text-xs font-sans ${
                      formatCriterionStatus(
                        activeVariant.criteria.strategicInterest.score
                      ).colorClass
                    }`}
                  >
                    {
                      formatCriterionStatus(
                        activeVariant.criteria.strategicInterest.score
                      ).label
                    }
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeVariant.criteria.strategicInterest.interpretation}
              </p>

              <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Gain Stratège (N3) vs Égoïste (N1)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    +
                    {(
                      activeVariant.criteria.strategicInterest
                        .skillGapStrategistVsSelfish * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Gain Égoïste (N1) vs Aléatoire
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    +
                    {(
                      activeVariant.criteria.strategicInterest
                        .skillGapSelfishVsRandom * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Entropie Tactiques (Case 1)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.strategicInterest
                        .tacticSlot1Entropy * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Indice d’équité des Rangs Œil
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.strategicInterest
                        .initialRankFairnessIndex * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
              </dl>
            </div>

            {/* Critère 3 : Tension et Choix difficiles */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Critère 3 · Dilemmes & Courbe Dramatique
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Tension (Choix Difficiles)
                  </h3>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeVariant.criteria.tensionToughChoices.score}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                  <div
                    className={`text-xs font-sans ${
                      formatCriterionStatus(
                        activeVariant.criteria.tensionToughChoices.score
                      ).colorClass
                    }`}
                  >
                    {
                      formatCriterionStatus(
                        activeVariant.criteria.tensionToughChoices.score
                      ).label
                    }
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeVariant.criteria.tensionToughChoices.interpretation}
              </p>

              <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Fréquence de dilemmes (&lt;15% écart)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.tensionToughChoices
                        .dilemmaFrequency * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Ratio Menaces / Défenseurs
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeVariant.criteria.tensionToughChoices.pressureToDefenseRatio.toFixed(
                      2
                    )}{' '}
                    cibles/jeton
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Parties serrées (45%–82%)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.tensionToughChoices.closeGameRate *
                      100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Proximité zone idéale (68%)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.tensionToughChoices
                        .survivalSweetSpotProximity * 100
                    ).toFixed(0)}
                    %
                  </dd>
                </div>
              </dl>
            </div>

            {/* Critère 4 : Intérêt à Collaborer Efficacement */}
            <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Critère 4 · Signalisation Muette & Seuils D=2 / D=3
                  </div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    Intérêt à Collaborer Efficacement
                  </h3>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                    {activeVariant.criteria.collaborationInterest.score}
                    <span className="text-xs font-normal text-slate-400">/100</span>
                  </div>
                  <div
                    className={`text-xs font-sans ${
                      formatCriterionStatus(
                        activeVariant.criteria.collaborationInterest.score
                      ).colorClass
                    }`}
                  >
                    {
                      formatCriterionStatus(
                        activeVariant.criteria.collaborationInterest.score
                      ).label
                    }
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                {activeVariant.criteria.collaborationInterest.interpretation}
              </p>

              <dl className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Gain Communication (N2 vs N1)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    +
                    {(
                      activeVariant.criteria.collaborationInterest
                        .communicationGainCoopVsSelfish * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Destructions coordonnées / tour
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {activeVariant.criteria.collaborationInterest.coordinatedDestructionRate.toFixed(
                      2
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Évitement d’overkill (Étape 2)
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.collaborationInterest
                        .overkillReductionEfficiency * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">
                    Efficacité vs Borne Omnisciente
                  </dt>
                  <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {(
                      activeVariant.criteria.collaborationInterest
                        .informationEfficiencyVsOmniscient * 100
                    ).toFixed(1)}
                    %
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </section>
      )}

      {/* Résultats par Configuration de Table sur la Variante Active */}
      {activeVariant && tables.length > 0 && (
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                03. Résultats par Configuration de Table — {activeVariant.variantLabel}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Comparaison des compositions d'équipes de bots sur les mêmes graines aléatoires (capacité totale :{' '}
                {activeVariant.params.n * activeVariant.params.q * activeVariant.params.a} arbres, soit{' '}
                {activeVariant.params.q * activeVariant.params.a} arbres par {dict['board.player.sector']}).
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-2.5 pr-4 font-medium">Configuration de Table</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Score Brut</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Arbres / J</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Préservation</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Écart-Type</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Miracle (100%)</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Majeure (≥75%)</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Coûteuse (≥50%)</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Défaite (&lt;50%)</th>
                  <th className="py-2.5 px-2.5 font-medium text-right">Parades %</th>
                  <th className="py-2.5 pl-2.5 font-medium text-right">Gaspillage Déf.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {tables.map((t, idx) => {
                  const isSel = idx === safeTableIdx;
                  return (
                    <tr
                      key={t.tableConfigId}
                      onClick={() => setSelectedTableIdx(idx)}
                      className={`cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-emerald-50/70 dark:bg-emerald-950/30 text-slate-900 dark:text-slate-100 font-medium'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <td className="py-2.5 pr-4 font-sans">
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          {t.tableConfigName}
                        </span>
                      </td>
                      <td className="py-2.5 px-2.5 text-right">{t.meanRawScore.toFixed(2)}</td>
                      <td className="py-2.5 px-2.5 text-right">{t.meanScorePerPlayer.toFixed(2)}</td>
                      <td className="py-2.5 px-2.5 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                        {(t.meanNormalizedScore * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        ±{(t.stdDevNormalizedScore * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {(t.victoryBracketsRate.MIRACLE * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {(t.victoryBracketsRate.MAJOR_VICTORY * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {(t.victoryBracketsRate.COSTLY_VICTORY * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right text-red-700 dark:text-red-400">
                        {(t.victoryBracketsRate.DEFEAT * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-2.5 text-right">
                        {(t.cardParriedRate * 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 pl-2.5 text-right">
                        {(t.wastedDefenderRate * 100).toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Détail Approfondi : Asymétrie Rang sur l'Œil & Stabilité de la Piste des Tactiques */}
      {activeVariant && activeTable && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Asymétrie liée au Rang initial sur l'Œil du Contremaître */}
          <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                04. Asymétrie selon le Rang Initial sur {dict['board.villain.eye']}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Table sélectionnée : <strong>{activeTable.tableConfigName}</strong> · Vérifie si le {dict['entity.faction.name']} placé au Rang 1 ou Rang 2 lors de la mise en place est pénalisé.
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {activeTable.perInitialRankMeanTrees.map((treesSaved, rIdx) => {
                const maxSectorTrees =
                  activeVariant.params.q * activeVariant.params.a;
                const ratio =
                  maxSectorTrees > 0 ? (treesSaved / maxSectorTrees) * 100 : 0;
                const setupDesc =
                  rIdx === 0
                    ? 'Départ : 1 Souche + 1 Abatteuse (p=1) + Bulldozer actif (p=1)'
                    : rIdx === 1
                    ? 'Départ : 1 Abatteuse avancée (p=2) + Bulldozer en Casse'
                    : rIdx === 2
                    ? 'Départ : Aucune Abatteuse + Bulldozer en Casse'
                    : 'Départ : 1 Abatteuse (p=1) + Bulldozer en Casse';

                return (
                  <div key={rIdx} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <div>
                        <span className="font-semibold text-slate-900 dark:text-slate-100">
                          Rang {rIdx + 1} sur l’Œil
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 ml-2">
                          · {setupDesc}
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {treesSaved.toFixed(2)} / {maxSectorTrees} ({ratio.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                      <div
                        className="h-full bg-emerald-600"
                        style={{ width: `${Math.min(100, ratio)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  {dict['machine.harvester']}s actives/t
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeTable.meanHarvestersActive.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Générées (Setup + A3)
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeTable.meanHarvestersSpawned.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  {dict['machine.harvester']}s détruites
                </div>
                <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {activeTable.meanHarvestersDestroyed.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Envois Casse {dict['machine.bulldozer']}
                </div>
                <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {activeTable.meanBulldozerTripsToScrap.toFixed(2)}
                </div>
              </div>
            </div>
          </section>

          {/* Stabilité de la Piste des Tactiques & Seuils Défensifs */}
          <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                05. Stabilité de la {dict['board.villain.tactics']} (Présence en Case 1)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Fréquence à laquelle chaque tuile Tactique occupe l’emplacement n°1 (probabilité de tirage maximale 11/36 en min(2d6)).
              </p>
            </div>

            <div className="space-y-3 pt-2">
              {ALL_TACTICS.map((tac) => {
                const freq =
                  (activeTable.tacticSlot1Distribution[tac] || 0) * 100;
                return (
                  <div key={tac} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {TACTIC_DESCRIPTIONS[tac].name}
                      </span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                        {freq.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
                      <div
                        className={`h-full ${
                          freq > 32 ? 'bg-amber-600' : 'bg-slate-600 dark:bg-slate-400'
                        }`}
                        style={{ width: `${Math.min(100, freq * 2)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Seuil D=1 (Parade simple)
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {(activeTable.d1Rate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Seuil D=2 (Embuscade)
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {(activeTable.d2Rate * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">
                  Seuil D≥3 (Assaut massif)
                </div>
                <div className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                  {(activeTable.d3PlusRate * 100).toFixed(1)}%
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import {
  CampaignRecord,
  TableConfigSummary,
  VariantEvaluationResult,
} from '../sim/types';
import {
  computeEvilEyeProbabilities,
  VICTORY_BRACKET_LABELS,
} from '../sim/i18n';
import {
  downloadCampaignJson,
  downloadCampaignMarkdown,
} from '../api';

interface DashboardViewProps {
  campaigns: CampaignRecord[];
  activeCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  onControlCampaign: (id: string, action: 'pause' | 'resume' | 'stop') => void;
  onDeleteCampaign: (id: string) => void;
  onNavigateToBuilder: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  campaigns,
  activeCampaign,
  onSelectCampaign,
  onControlCampaign,
  onDeleteCampaign,
  onNavigateToBuilder,
}) => {
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  const [selectedTableId, setSelectedTableId] = useState<string>('TABLE_COORD');

  const evaluationCampaigns = useMemo(
    () => campaigns.filter((c) => c.config.type !== 'ORACLE_STRESS_TEST'),
    [campaigns]
  );

  const currentCampaign = useMemo(() => {
    if (activeCampaign && activeCampaign.config.type !== 'ORACLE_STRESS_TEST') {
      return activeCampaign;
    }
    return evaluationCampaigns[0] || null;
  }, [activeCampaign, evaluationCampaigns]);

  const sortedVariants = useMemo(() => {
    if (!currentCampaign) return [];
    return [...currentCampaign.variantResults].sort(
      (a, b) => b.criteria.overallDesignScore - a.criteria.overallDesignScore
    );
  }, [
    currentCampaign,
    currentCampaign?.variantResults.length,
    currentCampaign?.updatedAt,
  ]);

  const selectedVariant: VariantEvaluationResult | null = useMemo(() => {
    if (sortedVariants.length === 0) return null;
    if (selectedVariantId) {
      const found = sortedVariants.find((v) => v.variantId === selectedVariantId);
      if (found) return found;
    }
    return sortedVariants[0];
  }, [sortedVariants, selectedVariantId]);

  const activeTableSummary: TableConfigSummary | null = useMemo(() => {
    if (!selectedVariant || selectedVariant.tableSummaries.length === 0) return null;
    const found = selectedVariant.tableSummaries.find(
      (t) => t.tableConfigId === selectedTableId
    );
    return (
      found ||
      selectedVariant.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ||
      selectedVariant.tableSummaries[0]
    );
  }, [selectedVariant, selectedTableId]);

  const evilEyeProbs = useMemo(() => {
    if (!selectedVariant) return [];
    return computeEvilEyeProbabilities(selectedVariant.params.numPlayers);
  }, [selectedVariant]);

  if (!currentCampaign) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Aucune campagne Monte-Carlo v3.3 disponible
        </h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
          Configurez et lancez une campagne de simulation v3.3 sur les 7 profils de Bots orthogonaux et la synergie Mise HS.
        </p>
        <button
          onClick={onNavigateToBuilder}
          className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-medium rounded-md transition-colors cursor-pointer"
        >
          Configurer une Campagne Monte-Carlo v3.3
        </button>
      </div>
    );
  }

  const pctProgress =
    currentCampaign.progress.totalTargetGames > 0
      ? Math.min(
          100,
          Math.round(
            (currentCampaign.progress.completedGames /
              currentCampaign.progress.totalTargetGames) *
              100
          )
        )
      : 0;

  return (
    <div className="space-y-6">
      {/* Barre de sélection et contrôle de campagne */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3 mb-1">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Campagne active :
              </label>
              <select
                value={currentCampaign.id}
                onChange={(e) => onSelectCampaign(e.target.value)}
                className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1.5 text-sm font-medium text-slate-900 dark:text-slate-100"
              >
                {evaluationCampaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.config.name} ({c.progress.completedGames.toLocaleString('fr-FR')} parties — {c.status})
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {currentCampaign.progress.currentPhaseLabel} ·{' '}
              {currentCampaign.progress.completedGames.toLocaleString('fr-FR')} /{' '}
              {currentCampaign.progress.totalTargetGames.toLocaleString('fr-FR')} parties (
              {pctProgress}%) · Vélocité :{' '}
              <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                {currentCampaign.progress.gamesPerSecond.toFixed(0)} parties/s
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {currentCampaign.status === 'RUNNING' && (
              <button
                onClick={() => onControlCampaign(currentCampaign.id, 'pause')}
                className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded cursor-pointer"
              >
                Pause
              </button>
            )}
            {currentCampaign.status === 'PAUSED' && (
              <button
                onClick={() => onControlCampaign(currentCampaign.id, 'resume')}
                className="px-3 py-1.5 text-xs font-medium bg-emerald-700 hover:bg-emerald-800 text-white rounded cursor-pointer"
              >
                Reprendre
              </button>
            )}
            {(currentCampaign.status === 'RUNNING' ||
              currentCampaign.status === 'PAUSED') && (
              <button
                onClick={() => onControlCampaign(currentCampaign.id, 'stop')}
                className="px-3 py-1.5 text-xs font-medium bg-rose-700 hover:bg-rose-800 text-white rounded cursor-pointer"
              >
                Arrêter
              </button>
            )}

            <button
              onClick={() => downloadCampaignMarkdown(currentCampaign)}
              className="px-3 py-1.5 text-xs font-medium border border-emerald-700 text-emerald-800 dark:text-emerald-300 dark:border-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 rounded cursor-pointer"
            >
              Exporter Rapport IA (.md)
            </button>
            <button
              onClick={() => downloadCampaignJson(currentCampaign)}
              className="px-3 py-1.5 text-xs font-medium border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded cursor-pointer"
            >
              Export JSON
            </button>
            {evaluationCampaigns.length > 1 && (
              <button
                onClick={() => onDeleteCampaign(currentCampaign.id)}
                className="px-2.5 py-1.5 text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>

        {currentCampaign.status === 'RUNNING' && (
          <div className="mt-3 w-full bg-slate-200 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-emerald-600 h-full transition-all duration-300"
              style={{ width: `${pctProgress}%` }}
            />
          </div>
        )}
      </div>

      {/* SECTION 1 : TABLEAU COMPARATIF DES VARIANTES v3.3 (7 PROFILS DE BOTS & 5 GAINS DÉCISIONNELS) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              1. Classement des Variantes v3.3 — 7 Bots Orthogonaux (I1, I2, I3) & 5 Gains Décisionnels
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Invariants v3.3 figés par défaut : a=2, ASSAULT_LOW, Bull0=-1Arb, StumpC2=Oui. Fenêtre de survie valide : 45 % – 82 % (Plateau optimal : 50 % – 80 %). Cliquez sur une ligne pour l'inspecter.
            </p>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {sortedVariants.length} variante(s) évaluée(s)
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 font-semibold">
                <th className="py-2.5 px-2.5">ID</th>
                <th className="py-2.5 px-2.5">Variante & Leviers v3.3</th>
                <th className="py-2.5 px-2 text-right">Note</th>
                <th className="py-2.5 px-2 text-right" title="1. Bot Aveugle (0 info)">1.Aveugle</th>
                <th className="py-2.5 px-2 text-right" title="2. Bot Lecteur Probabiliste (I2 seule)">2.Prob(I2)</th>
                <th className="py-2.5 px-2 text-right" title="3. Bot Solo Bayésien (I1+I2)">3.Solo</th>
                <th className="py-2.5 px-2 text-right" title="4. Bot Coordonné Sans Dé (I2+I3, sans I1)">4.SansDé</th>
                <th className="py-2.5 px-2 text-right" title="5. Bot Coordonné 1-Passe (I1+I2+I3 sans révision 2.2)">5.Coord1P</th>
                <th className="py-2.5 px-2 text-right" title="6. Bot Coordonné Révisable (I1+I2+I3 avec boucle 2.2)">6.CoordRév</th>
                <th className="py-2.5 px-2 text-right" title="7. Bot Omniscient (Plafond table ouverte)">7.Omni</th>
                <th className="py-2.5 px-2 text-right" title="Gain I2 = Prob - Aveugle">Gain I2</th>
                <th className="py-2.5 px-2 text-right" title="Gain I1 Équipe = CoordRév - CoordSansDé">Gain I1 Éq.</th>
                <th className="py-2.5 px-2 text-right" title="Gain Coord 1-Passe = Coord1P - Solo">Gain Coord1P</th>
                <th className="py-2.5 px-2 text-right" title="Gain Boucle 2.2 = CoordRév - Coord1P">Gain B.2.2</th>
                <th className="py-2.5 px-2 text-right" title="Révisions 2.2 / Signaux complétés / Corrélation r">Rév.2.2 / r</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 tabular-nums">
              {sortedVariants.map((v) => {
                const isSelected = selectedVariant?.variantId === v.variantId;
                const mainTable =
                  v.tableSummaries.find((t) => t.tableConfigId === 'TABLE_COORD') ||
                  v.tableSummaries[0];

                if (!mainTable) return null;
                const ic = v.criteria.infoAndCoordMetrics;
                const capStr = v.params.tacticalDefenderCap >= 99 ? '∞' : String(v.params.tacticalDefenderCap);
                const shiftStr = `+${v.params.combatThresholdShift}`;
                const parryRule = v.params.parryHsRule ?? 'SYNERGY_TRAP_SAB';
                const parryStr = parryRule === 'SYNERGY_TRAP_SAB' ? 'SynergieHS' : 'StandardS3';
                const bullStr = v.params.bulldozerZeroStumpAction === 'DESTROY_TREE' ? '-1Arb' : '0';
                const pStr = v.params.tacticsTrackPreset === 'ASSAULT_HIGH' ? 'A3B3↑' : 'A1B1↑';

                return (
                  <tr
                    key={v.variantId}
                    onClick={() => setSelectedVariantId(v.variantId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 font-medium'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="py-2.5 px-2.5 font-mono font-semibold text-emerald-800 dark:text-emerald-400">
                      {v.variantId}
                    </td>
                    <td className="py-2.5 px-2.5">
                      <div className="font-semibold text-slate-900 dark:text-slate-100">
                        N={v.params.numPlayers} · X={v.params.numTurns}t · a={v.params.initialTreesPerCell}
                      </div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                          Cap:{capStr}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                          Shift:{shiftStr}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${
                            parryRule === 'SYNERGY_TRAP_SAB'
                              ? 'bg-emerald-100/80 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700'
                          }`}
                        >
                          {parryStr}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-amber-100/70 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700">
                          Bull0:{bullStr}
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700">
                          {pStr}
                        </span>
                        {v.params.initialStumpCell2 && (
                          <span className="px-1.5 py-0.5 text-[10px] font-mono rounded border bg-sky-100/70 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border-sky-300 dark:border-sky-700">
                            StumpC2
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-slate-900 dark:text-slate-100">
                      {v.criteria.overallDesignScore}/100
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-500">
                      {(ic.survBlind * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">
                      {((ic.survProbOnly ?? ic.survBlind) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-sky-700 dark:text-sky-400">
                      {(ic.survSolo * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-indigo-700 dark:text-indigo-400">
                      {((ic.survCoordNoDice ?? ic.survSolo) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-teal-700 dark:text-teal-400">
                      {((ic.survCoordOneShot ?? ic.survCoord) * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold text-emerald-700 dark:text-emerald-400">
                      {(ic.survCoord * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right text-slate-600 dark:text-slate-300">
                      {(ic.survOmni * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                      {(ic.probabilisticReadingGainPct ?? 0) >= 0 ? '+' : ''}
                      {((ic.probabilisticReadingGainPct ?? 0) * 100).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-sky-700 dark:text-sky-400">
                      {(ic.privateInfoTeamGainPct ?? 0) >= 0 ? '+' : ''}
                      {((ic.privateInfoTeamGainPct ?? 0) * 100).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-teal-700 dark:text-teal-400">
                      {(ic.coordinationOneShotGainPct ?? 0) >= 0 ? '+' : ''}
                      {((ic.coordinationOneShotGainPct ?? 0) * 100).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                      {(ic.step2RevisionLoopGainPct ?? 0) >= 0 ? '+' : ''}
                      {((ic.step2RevisionLoopGainPct ?? 0) * 100).toFixed(1)}
                    </td>
                    <td className="py-2.5 px-2 text-right font-mono text-[11px]">
                      <span className="text-emerald-700 dark:text-emerald-400 font-semibold">
                        {(mainTable.meanStep2Revisions ?? 0).toFixed(1)}r
                      </span>{' '}
                      /{' '}
                      <span className="text-sky-700 dark:text-sky-400">
                        r={(mainTable.choiceToSurvivalCorrelation ?? 0).toFixed(2)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2 : INSPECTEUR DÉTAILLÉ DE LA VARIANTE SÉLECTIONNÉE */}
      {selectedVariant && activeTableSummary && (
        <div className="space-y-6">
          {/* En-tête de la variante + Sélecteur de profil de Bot */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs font-mono uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Inspection Détaillée — Variante {selectedVariant.variantId}
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {selectedVariant.variantLabel}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Piste des Tactiques :{' '}
                  <span className="font-mono font-semibold">
                    [{selectedVariant.params.tacticsTrackSetup.join(', ')}]
                  </span>{' '}
                  · Synergie Mise HS :{' '}
                  <span className="font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                    {selectedVariant.params.parryHsRule ?? 'SYNERGY_TRAP_SAB'}
                  </span>{' '}
                  · Horizon :{' '}
                  <span className="font-mono font-semibold">
                    N×X×a = {selectedVariant.params.numPlayers * selectedVariant.params.numTurns * selectedVariant.params.initialTreesPerCell} arbres
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 mr-1">
                  Profil d'IA observé :
                </span>
                {selectedVariant.tableSummaries.map((ts) => (
                  <button
                    key={ts.tableConfigId}
                    onClick={() => setSelectedTableId(ts.tableConfigId)}
                    className={`px-2.5 py-1 text-xs font-medium rounded border transition-colors cursor-pointer ${
                      activeTableSummary.tableConfigId === ts.tableConfigId
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {ts.tableConfigName.replace('Table ', '')} ({(ts.meanSurvivalRateHorizon * 100).toFixed(1)}%)
                  </button>
                ))}
              </div>
            </div>

            {/* BANDEAU 1 : LES 7 PROFILS GRADUÉS ORTHOGONAUX (DÉCOMPOSITION SHAPLEY) */}
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Échelle des 7 Profils de Bots Orthogonaux (Sources d'Information I1, I2, I3)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 tabular-nums">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">1. Aveugle (0 info)</div>
                  <div className="text-sm font-bold font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.survBlind * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">2. Probabiliste (I2)</div>
                  <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {((selectedVariant.criteria.infoAndCoordMetrics.survProbOnly ?? 0) * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-800">
                  <div className="text-[11px] text-sky-800 dark:text-sky-300">3. Solo (I1+I2)</div>
                  <div className="text-sm font-bold font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.survSolo * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[11px] text-indigo-800 dark:text-indigo-300">4. Coord Sans Dé (I2+I3)</div>
                  <div className="text-sm font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-0.5">
                    {((selectedVariant.criteria.infoAndCoordMetrics.survCoordNoDice ?? 0) * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-teal-50/60 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-800">
                  <div className="text-[11px] text-teal-800 dark:text-teal-300">5. Coord 1-Passe</div>
                  <div className="text-sm font-bold font-mono text-teal-700 dark:text-teal-400 mt-0.5">
                    {((selectedVariant.criteria.infoAndCoordMetrics.survCoordOneShot ?? 0) * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700">
                  <div className="text-[11px] font-semibold text-emerald-900 dark:text-emerald-300">
                    6. Coord Révisable (Réf)
                  </div>
                  <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.survCoord * 100).toFixed(1)} %
                  </div>
                </div>
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">7. Omniscient (Plafond)</div>
                  <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.survOmni * 100).toFixed(1)} %
                  </div>
                </div>
              </div>
            </div>

            {/* BANDEAU 2 : LES 5 GAINS DÉCISIONNELS & MÉTRIQUES DE BOUCLE 2.2 */}
            <div className="mt-4">
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                Les 5 Gains Décisionnels (I1, I2, I3) & Boucle Systémique de Révision 2.2
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 tabular-nums">
                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">1. Gain Lecture Prob (I2)</div>
                  <div className="text-sm font-bold font-mono text-slate-800 dark:text-slate-200 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.probabilisticReadingGainPct ?? 0) >= 0 ? '+' : ''}
                    {((selectedVariant.criteria.infoAndCoordMetrics.probabilisticReadingGainPct ?? 0) * 100).toFixed(1)} pts
                  </div>
                  <div className="text-[10px] text-slate-400">Prob − Aveugle</div>
                </div>

                <div className="p-2.5 rounded bg-sky-50/50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800">
                  <div className="text-[11px] text-sky-800 dark:text-sky-300">2. Gain Dé Privé Solo (I1)</div>
                  <div className="text-sm font-bold font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.privateInfoSoloGainPct ?? 0) >= 0 ? '+' : ''}
                    {((selectedVariant.criteria.infoAndCoordMetrics.privateInfoSoloGainPct ?? 0) * 100).toFixed(1)} pts
                  </div>
                  <div className="text-[10px] text-slate-400">Solo − Prob</div>
                </div>

                <div className="p-2.5 rounded bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800">
                  <div className="text-[11px] text-indigo-800 dark:text-indigo-300">3. Vrai Gain I1 en Équipe</div>
                  <div className="text-sm font-bold font-mono text-indigo-700 dark:text-indigo-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.privateInfoTeamGainPct ?? 0) >= 0 ? '+' : ''}
                    {((selectedVariant.criteria.infoAndCoordMetrics.privateInfoTeamGainPct ?? 0) * 100).toFixed(1)} pts
                  </div>
                  <div className="text-[10px] text-slate-400">CoordRév − CoordSansDé</div>
                </div>

                <div className="p-2.5 rounded bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
                  <div className="text-[11px] text-teal-800 dark:text-teal-300">4. Gain Coord 1-Passe (2.1)</div>
                  <div className="text-sm font-bold font-mono text-teal-700 dark:text-teal-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.coordinationOneShotGainPct ?? 0) >= 0 ? '+' : ''}
                    {((selectedVariant.criteria.infoAndCoordMetrics.coordinationOneShotGainPct ?? 0) * 100).toFixed(1)} pts
                  </div>
                  <div className="text-[10px] text-slate-400">Coord1P − Solo</div>
                </div>

                <div className="p-2.5 rounded bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
                  <div className="text-[11px] text-emerald-800 dark:text-emerald-300">5. Gain Boucle Révision 2.2</div>
                  <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {(selectedVariant.criteria.infoAndCoordMetrics.step2RevisionLoopGainPct ?? 0) >= 0 ? '+' : ''}
                    {((selectedVariant.criteria.infoAndCoordMetrics.step2RevisionLoopGainPct ?? 0) * 100).toFixed(1)} pts
                  </div>
                  <div className="text-[10px] text-slate-400">CoordRév − Coord1P</div>
                </div>

                <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-[11px] text-slate-500">Révisions 2.2 / Corrélation r</div>
                  <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                    {(activeTableSummary.meanStep2Revisions ?? 0).toFixed(1)} rév. · r={(activeTableSummary.choiceToSurvivalCorrelation ?? 0).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-slate-400">
                    Signaux complétés : {(activeTableSummary.meanSuccessfulSignalCompletions ?? 0).toFixed(1)}/p.
                  </div>
                </div>
              </div>
            </div>

            {/* Les 4 Critères d'Équilibrage Game Design (/100) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    1. Richesse Informationnelle (I1 + I2)
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {selectedVariant.criteria.privateInfoValue.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedVariant.criteria.privateInfoValue.interpretation}
                </p>
              </div>

              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    2. Tension & Fenêtre [45% – 82%]
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {selectedVariant.criteria.tensionAndAttrition.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedVariant.criteria.tensionAndAttrition.interpretation}
                </p>
              </div>

              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    3. Coordination & Boucle Révisable 2.2
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {selectedVariant.criteria.coordinationEfficiency.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedVariant.criteria.coordinationEfficiency.interpretation}
                </p>
              </div>

              <div className="p-3.5 rounded-md bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    4. Équité d'Exposition (J1..JN)
                  </span>
                  <span className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                    {selectedVariant.criteria.evilEyeFairness.score}/100
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedVariant.criteria.evilEyeFairness.interpretation}
                </p>
              </div>
            </div>
          </div>

          {/* GRILLE PRINCIPALE DES INDICATEURS STATISTIQUES */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* A. Arbres perdus par Tour (t = 1..X) : Moyenne & Écart-type */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                A. Arbres Perdus par Tour (Tours 1 à {selectedVariant.params.numTurns}) — Moyenne ± Écart-Type (σ)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Profil : <span className="font-semibold">{activeTableSummary.tableConfigName}</span> · Total perdu :{' '}
                <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                  {activeTableSummary.meanTreesLostTotal.toFixed(2)} ± {activeTableSummary.stdDevTreesLostTotal.toFixed(2)} arbres
                </span>
              </p>

              <div className="space-y-2.5 tabular-nums">
                {activeTableSummary.meanTreesLostPerTurn.map((meanVal, idx) => {
                  const stdVal = activeTableSummary.stdDevTreesLostPerTurn[idx] ?? 0;
                  const maxTurnMean = Math.max(
                    2,
                    ...activeTableSummary.meanTreesLostPerTurn
                  );
                  const widthPct = Math.min(100, Math.round((meanVal / maxTurnMean) * 100));

                  return (
                    <div key={idx} className="flex items-center gap-3 text-xs">
                      <span className="w-14 font-mono font-medium text-slate-600 dark:text-slate-400">
                        Tour {idx + 1}
                      </span>
                      <div className="flex-1 bg-slate-100 dark:bg-slate-800 h-4 rounded overflow-hidden">
                        <div
                          className="bg-amber-600 dark:bg-amber-500 h-full transition-all"
                          style={{ width: `${widthPct}%` }}
                        />
                      </div>
                      <span className="w-32 text-right font-mono text-slate-800 dark:text-slate-200">
                        <strong>{meanVal.toFixed(2)}</strong>{' '}
                        <span className="text-slate-400">± {stdVal.toFixed(2)}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* B. Arbres perdus par Joueur (J1..JN) : Moyenne & Écart-type vs Pression 2D6 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
                B. Arbres Perdus par Joueur (J1 à J{selectedVariant.params.numPlayers}) — Moyenne ± Écart-Type (σ)
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                Comparaison entre la probabilité théorique de ciblage sur l'Œil du Malfaiteur (2D6) et les pertes réelles après défense.
              </p>

              <div className="space-y-3 tabular-nums">
                {activeTableSummary.meanTreesLostPerPlayer.map((meanVal, pIdx) => {
                  const stdVal = activeTableSummary.stdDevTreesLostPerPlayer[pIdx] ?? 0;
                  const maxPlayerMean = Math.max(
                    2,
                    ...activeTableSummary.meanTreesLostPerPlayer
                  );
                  const widthPct = Math.min(100, Math.round((meanVal / maxPlayerMean) * 100));
                  const eyeProb = evilEyeProbs[pIdx];

                  return (
                    <div
                      key={pIdx}
                      className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800"
                    >
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          Joueur J{pIdx + 1} (Rang {pIdx + 1} sur l'Œil)
                        </span>
                        <span className="font-mono text-slate-500 dark:text-slate-400">
                          Ciblage 2D6 : {eyeProb?.casesOn36 ?? 0}/36 ({((eyeProb?.probability ?? 0) * 100).toFixed(1)}%)
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <div className="flex-1 bg-slate-200 dark:bg-slate-700 h-3.5 rounded overflow-hidden">
                          <div
                            className="bg-emerald-600 dark:bg-emerald-500 h-full"
                            style={{ width: `${widthPct}%` }}
                          />
                        </div>
                        <span className="w-36 text-right font-mono text-slate-900 dark:text-slate-100">
                          <strong>{meanVal.toFixed(2)}</strong>{' '}
                          <span className="text-slate-400">± {stdVal.toFixed(2)} arb.</span>
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Paliers de victoire observés */}
              <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Distribution des Issues de Partie ({activeTableSummary.gamesCount} parties)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
                  {(['MIRACLE', 'MAJOR_VICTORY', 'COSTLY_VICTORY', 'DEFEAT'] as const).map(
                    (b) => (
                      <div
                        key={b}
                        className="p-2 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                      >
                        <div className={`font-semibold ${VICTORY_BRACKET_LABELS[b].color}`}>
                          {(activeTableSummary.victoryBracketsRate[b] * 100).toFixed(1)} %
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {VICTORY_BRACKET_LABELS[b].label}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* C. Fréquence moyenne des événements de Combat, Furtivité & Leviers v3.3 */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              C. Fréquence Moyenne par Partie des Événements de Combat, Furtivité & Boucle 2.2 (v3.3)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Mesures moyennes par partie sur {activeTableSummary.gamesCount} simulations ({activeTableSummary.tableConfigName}).
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 tabular-nums">
              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Abattages (Arbres détruits Bull0)
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeTableSummary.meanCuts.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                    ({(activeTableSummary.meanBulldozerDestroyedTrees ?? 0).toFixed(2)} détr.)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Terrassements (Souches rasées)
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeTableSummary.meanClearings.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    ({activeTableSummary.meanStumpsCleared.toFixed(1)} s.)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Surchauffes A2/B2 (Pions retirés)
                </div>
                <div className="text-base font-bold font-mono text-amber-700 dark:text-amber-400 mt-0.5">
                  {activeTableSummary.meanOverheats.toFixed(2)}{' '}
                  <span className="text-xs font-normal text-slate-500">
                    (-{activeTableSummary.meanOverheatTreesRemoved.toFixed(1)} p.)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Assauts A3/B3 (Seuil S +1)
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                  {activeTableSummary.meanAssaults.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Parades Simples (S = 2+k+shift)
                </div>
                <div className="text-base font-bold font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                  {activeTableSummary.meanSimpleParries.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mises HS ({selectedVariant.params.parryHsRule === 'STANDARD_S3' ? 'Standard S≥3' : 'Synergie Piège/Sab'})
                </div>
                <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {activeTableSummary.meanParryAndHS.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Explosions (A2+A3 ou B2+B3)
                </div>
                <div className="text-base font-bold font-mono text-rose-700 dark:text-rose-400 mt-0.5">
                  {activeTableSummary.meanExplosions.toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pièges & Sabotages (Bloqués MaxN)
                </div>
                <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {(activeTableSummary.meanTrapsPlaced + activeTableSummary.meanSabotagesPlaced).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-amber-600 dark:text-amber-400">
                    ({(activeTableSummary.meanStealthBlockedByLimit ?? 0).toFixed(2)} bloq.)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Furtivité Orpheline (1 jeton perdu)
                </div>
                <div className="text-base font-bold font-mono text-amber-700 dark:text-amber-400 mt-0.5">
                  {(activeTableSummary.meanOrphanStealthTokens ?? 0).toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Overkill Tactique (Jetons en surplus)
                </div>
                <div className="text-base font-bold font-mono text-slate-700 dark:text-slate-300 mt-0.5">
                  {(activeTableSummary.meanTacticalOverkillTokens ?? 0).toFixed(2)}
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Révisions 2.2 / Signaux Complétés
                </div>
                <div className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                  {(activeTableSummary.meanStep2Revisions ?? 0).toFixed(2)}{' '}
                  <span className="text-xs font-normal text-sky-700 dark:text-sky-400">
                    ({(activeTableSummary.meanSuccessfulSignalCompletions ?? 0).toFixed(2)} sig.)
                  </span>
                </div>
              </div>

              <div className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pertinence Poses & Corrélation r
                </div>
                <div className="text-base font-bold font-mono text-sky-700 dark:text-sky-400 mt-0.5">
                  {((activeTableSummary.meanPlacementRelevanceScore ?? 0) * 100).toFixed(1)}%{' '}
                  <span className="text-xs font-normal text-emerald-700 dark:text-emerald-400">
                    (r={(activeTableSummary.choiceToSurvivalCorrelation ?? 0).toFixed(2)})
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

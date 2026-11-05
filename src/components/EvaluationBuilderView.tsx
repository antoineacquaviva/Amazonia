import React, { useMemo, useState } from 'react';
import {
  CampaignConfig,
  ParameterSweepInput,
  TableConfig,
  TacticType,
} from '../sim/types';
import {
  DEFAULT_SWEEP_INPUT,
  DEFAULT_TABLE_CONFIGS,
  FIVE_LEVERS_META,
} from '../sim/i18n';
import { expandParameterSweep } from '../sim/evaluator';

interface EvaluationBuilderViewProps {
  onStartCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  isSubmitting: boolean;
}

type SweepBoolKey =
  | 'staggeredInitialSetupValues'
  | 'limitStealthTokensToNValues'
  | 'repairClearsSabotageValues'
  | 'bulldozerOverflowAbattageValues'
  | 'activeRepairOnMultiHitValues'
  | 'shuffleTacticsTrackValues';

const TACTIC_PRESETS: Array<{ label: string; setup: TacticType[] }> = [
  {
    label: 'Standard Alterné [A1, B1, A2, B2, A3, B3]',
    setup: ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'],
  },
  {
    label: 'Abatteuses en tête [A1, A2, A3, B1, B2, B3]',
    setup: ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'],
  },
  {
    label: 'Bulldozers en tête [B1, B2, B3, A1, A2, A3]',
    setup: ['B1', 'B2', 'B3', 'A1', 'A2', 'A3'],
  },
  {
    label: 'Haute Intensité en tête [A3, B3, A2, B2, A1, B1]',
    setup: ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'],
  },
];

export const EvaluationBuilderView: React.FC<EvaluationBuilderViewProps> = ({
  onStartCampaign,
  isSubmitting,
}) => {
  const [mode, setMode] = useState<'FIVE_LEVERS_ABLATION' | 'MONTE_CARLO_SWEEP'>(
    'MONTE_CARLO_SWEEP'
  );
  const [campaignName, setCampaignName] = useState<string>(
    'Campagne Monte-Carlo v3.1 — Étalonnage des 5 Leviers'
  );
  const [gamesPerVariant, setGamesPerVariant] = useState<number>(200);
  const [baseSeed, setBaseSeed] = useState<number>(42000);

  const [sweep, setSweep] = useState<ParameterSweepInput>({
    ...DEFAULT_SWEEP_INPUT,
  });

  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(
    DEFAULT_TABLE_CONFIGS.map((t) => t.id)
  );

  const toggleNumberValue = (
    key: 'numPlayersValues' | 'numTurnsValues' | 'initialTreesPerCellValues',
    val: number
  ) => {
    setSweep((prev) => {
      const exists = prev[key].includes(val);
      const next = exists
        ? prev[key].filter((x) => x !== val)
        : [...prev[key], val].sort((a, b) => a - b);
      return { ...prev, [key]: next.length > 0 ? next : [val] };
    });
  };

  const setBoolSelection = (key: SweepBoolKey, values: boolean[]) => {
    setSweep((prev) => ({
      ...prev,
      [key]: values,
    }));
  };

  const applyAllLeversPreset = (modePreset: 'ALL_TRUE' | 'ALL_FALSE' | 'SWEEP_ALL_32') => {
    const valArr =
      modePreset === 'ALL_TRUE'
        ? [true]
        : modePreset === 'ALL_FALSE'
        ? [false]
        : [false, true];
    setSweep((prev) => ({
      ...prev,
      staggeredInitialSetupValues: [...valArr],
      limitStealthTokensToNValues: [...valArr],
      repairClearsSabotageValues: [...valArr],
      bulldozerOverflowAbattageValues: [...valArr],
      activeRepairOnMultiHitValues: [...valArr],
    }));
    if (modePreset === 'SWEEP_ALL_32') {
      setMode('FIVE_LEVERS_ABLATION');
      setCampaignName('Ablation Croisée Complète des 5 Leviers (2^5 = 32 variantes)');
    }
  };

  const toggleTableConfig = (id: string) => {
    setSelectedTableIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length > 0 ? next : [id];
    });
  };

  const expandedVariants = useMemo(
    () => expandParameterSweep(sweep),
    [sweep]
  );

  const totalSimulationsCount =
    expandedVariants.length * selectedTableIds.length * gamesPerVariant;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTables: TableConfig[] = DEFAULT_TABLE_CONFIGS.filter((t) =>
      selectedTableIds.includes(t.id)
    );
    await onStartCampaign({
      name: campaignName.trim() || 'Campagne Monte-Carlo v3.1',
      type: mode,
      gamesPerVariantAndTable: gamesPerVariant,
      sweep,
      selectedTableConfigs: selectedTables,
      includeCalibrationTables: true,
      baseSeed,
    });
  };

  return (
    <form onSubmit={handleLaunch} className="space-y-6">
      {/* En-tête et Règles Figées v3.1 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Configurateur de Campagne Monte-Carlo v3.1 (Graines Appariées)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Suite à la 1ère campagne, l'espace de recherche est resserré autour des options D2-Double figées et des 5 nouveaux leviers d'équilibrage.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ D2-Double figé (A2/B2 & A3/B3 incluent base)
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ CumulA2 = true
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ Régénération = true
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-1">
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nom de la campagne
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Parties par variante & par profil de Bot
            </label>
            <input
              type="number"
              min={10}
              max={10000}
              step={50}
              value={gamesPerVariant}
              onChange={(e) => setGamesPerVariant(Math.max(10, Number(e.target.value) || 100))}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Graine de base (Paired Seeds)
            </label>
            <input
              type="number"
              value={baseSeed}
              onChange={(e) => setBaseSeed(Number(e.target.value) || 42000)}
              className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
            />
          </div>
        </div>
      </div>

      {/* SECTION PRINCIPALE : PARAMÈTRES DE TABLE & LES 5 NOUVEAUX LEVIERS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche (5 cols) : Paramètres de Table (N, X, a in {2,3}) & Piste des Tactiques */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
            1. Paramètres Structurels (N, X, a ∈ 2..3) & Piste des Tactiques
          </h3>

          {/* N joueurs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de joueurs (N = 3, 4, 5 ou 6)
            </label>
            <div className="flex flex-wrap gap-2">
              {[3, 4, 5, 6].map((n) => {
                const active = sweep.numPlayersValues.includes(n);
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => toggleNumberValue('numPlayersValues', n)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold rounded border cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    N = {n} joueurs
                  </button>
                );
              })}
            </div>
          </div>

          {/* X tours */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de tours de la partie (X)
            </label>
            <div className="flex flex-wrap gap-2">
              {[6, 7, 8, 9, 10, 12].map((x) => {
                const active = sweep.numTurnsValues.includes(x);
                return (
                  <button
                    key={x}
                    type="button"
                    onClick={() => toggleNumberValue('numTurnsValues', x)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold rounded border cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    X = {x} tours
                  </button>
                );
              })}
            </div>
          </div>

          {/* a arbres par case (limité à 2 et 3, défaut 2) */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Arbres debout initiaux par case (a = 2 par défaut, ou a = 3 ; a = 4 retiré)
            </label>
            <div className="flex flex-wrap gap-2">
              {[2, 3].map((a) => {
                const active = sweep.initialTreesPerCellValues.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleNumberValue('initialTreesPerCellValues', a)}
                    className={`px-3 py-1.5 text-xs font-mono font-semibold rounded border cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    a = {a} arbres/case {a === 2 ? '(Défaut)' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Piste des Tactiques */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Ordre initial de la Piste des Tactiques (Cases 1 à 6 : M = min(d1, d2))
            </label>
            <select
              value={sweep.tacticsTrackSetup.join(',')}
              onChange={(e) => {
                const parts = e.target.value.split(',') as TacticType[];
                if (parts.length === 6) {
                  setSweep((prev) => ({ ...prev, tacticsTrackSetup: parts }));
                }
              }}
              className="w-full px-3 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
            >
              {TACTIC_PRESETS.map((pr) => (
                <option key={pr.label} value={pr.setup.join(',')}>
                  {pr.label}
                </option>
              ))}
            </select>
          </div>

          {/* Mélange aléatoire de la piste */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Mélange de la Piste des Tactiques (<code>shuffleTacticsTrack</code>)
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Ordre Fixe (Non)', vals: [false] },
                { label: 'Mélangée (Oui)', vals: [true] },
                { label: 'Tester les 2 (Sweep)', vals: [false, true] },
              ].map((opt) => {
                const active =
                  sweep.shuffleTacticsTrackValues.length === opt.vals.length &&
                  opt.vals.every((v) => sweep.shuffleTacticsTrackValues.includes(v));
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setBoolSelection('shuffleTacticsTrackValues', opt.vals)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Colonne Droite (7 cols) : Les 5 Nouvelles Variables d'Équilibrage */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                2. Les 5 Variables d'Équilibrage v3.1 (Configurables & Balayables)
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Choisissez pour chaque levier : Activé (défaut true), Désactivé (false), ou Tester les 2 (Ablation A/B).
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => applyAllLeversPreset('ALL_TRUE')}
                className="px-2.5 py-1 text-[11px] font-medium bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 rounded cursor-pointer hover:bg-emerald-100"
              >
                Tout Activer (Défaut)
              </button>
              <button
                type="button"
                onClick={() => applyAllLeversPreset('ALL_FALSE')}
                className="px-2.5 py-1 text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded cursor-pointer hover:bg-slate-200"
              >
                Tout Désactiver (Classique)
              </button>
              <button
                type="button"
                onClick={() => applyAllLeversPreset('SWEEP_ALL_32')}
                className="px-2.5 py-1 text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded cursor-pointer hover:bg-amber-100"
              >
                Balayer les 2^5 = 32 Combinaisons
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {FIVE_LEVERS_META.map((lever) => {
              const sweepKey = `${lever.key}Values` as SweepBoolKey;
              const currentVals = sweep[sweepKey];

              return (
                <div
                  key={lever.key}
                  className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                        {lever.shortCode}
                      </span>
                      <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                        {lever.title}
                      </span>
                      <code className="text-[11px] text-slate-400 hidden xl:inline">
                        ({lever.key})
                      </code>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {lever.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {[
                      { label: 'Oui (true)', vals: [true] },
                      { label: 'Non (false)', vals: [false] },
                      { label: 'Les 2 (Sweep)', vals: [false, true] },
                    ].map((opt) => {
                      const isSel =
                        currentVals.length === opt.vals.length &&
                        opt.vals.every((v) => currentVals.includes(v));
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setBoolSelection(sweepKey, opt.vals)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded border cursor-pointer transition-colors ${
                            isSel
                              ? opt.vals.length === 2
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-emerald-700 text-white border-emerald-700'
                              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* SÉLECTION DES PROFILS D'IA & LANCEMENT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          3. Profils de Bots à Évaluer (Phase 2 — Placement des 2 Jetons Défenseurs)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {DEFAULT_TABLE_CONFIGS.map((tc) => {
            const checked = selectedTableIds.includes(tc.id);
            return (
              <div
                key={tc.id}
                onClick={() => toggleTableConfig(tc.id)}
                className={`p-3 rounded-md border cursor-pointer transition-colors ${
                  checked
                    ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 opacity-60'
                }`}
              >
                <div className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {tc.name}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {tc.description}
                </p>
              </div>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            Volume total :{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {expandedVariants.length} variante(s)
            </strong>{' '}
            ×{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {selectedTableIds.length} table(s) de Bots
            </strong>{' '}
            ×{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {gamesPerVariant} parties
            </strong>{' '}
            ={' '}
            <span className="font-mono font-bold text-emerald-700 dark:text-emerald-400">
              {totalSimulationsCount.toLocaleString('fr-FR')} parties à simuler
            </span>
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-sm font-semibold rounded-md transition-colors cursor-pointer"
          >
            {isSubmitting
              ? 'Démarrage en cours...'
              : `Lancer la Campagne (${totalSimulationsCount.toLocaleString('fr-FR')} parties)`}
          </button>
        </div>
      </div>
    </form>
  );
};

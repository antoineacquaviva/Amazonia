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
} from '../sim/i18n';
import { expandParameterSweep } from '../sim/evaluator';

interface EvaluationBuilderViewProps {
  onStartCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  isSubmitting: boolean;
}

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
    setup: ['B1', 'B2', 'B3', A1_FALLBACK(), 'A2', 'A3'],
  },
  {
    label: 'Haute Intensité en tête [A3, B3, A2, B2, A1, B1]',
    setup: ['A3', 'B3', 'A2', 'B2', 'A1', 'B1'],
  },
];

function A1_FALLBACK(): TacticType {
  return 'A1';
}

export const EvaluationBuilderView: React.FC<EvaluationBuilderViewProps> = ({
  onStartCampaign,
  isSubmitting,
}) => {
  const [mode, setMode] = useState<'D1_D2_COMPARISON' | 'MONTE_CARLO_SWEEP'>(
    'D1_D2_COMPARISON'
  );
  const [campaignName, setCampaignName] = useState<string>(
    'Comparaison Directe Options D1 vs D2 (Surchauffe × Assaut)'
  );
  const [gamesPerVariant, setGamesPerVariant] = useState<number>(200);
  const [baseSeed, setBaseSeed] = useState<number>(42000);

  const [sweep, setSweep] = useState<ParameterSweepInput>({
    ...DEFAULT_SWEEP_INPUT,
    overheatIncludesBaseActionValues: [false, true],
    assaultIncludesBaseActionValues: [false, true],
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

  const toggleBoolValue = (
    key:
      | 'overheatIncludesBaseActionValues'
      | 'assaultIncludesBaseActionValues'
      | 'overheatStacksTreeRemovalValues'
      | 'endOfGameRegenerationValues'
      | 'shuffleTacticsTrackValues',
    val: boolean
  ) => {
    setSweep((prev) => {
      const exists = prev[key].includes(val);
      const next = exists ? prev[key].filter((x) => x !== val) : [...prev[key], val];
      return { ...prev, [key]: next.length > 0 ? next : [val] };
    });
  };

  const toggleTableConfig = (id: string) => {
    setSelectedTableIds((prev) => {
      const exists = prev.includes(id);
      const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length > 0 ? next : [id];
    });
  };

  const effectiveSweep: ParameterSweepInput = useMemo(() => {
    if (mode === 'D1_D2_COMPARISON') {
      return {
        ...sweep,
        overheatIncludesBaseActionValues: [false, true],
        assaultIncludesBaseActionValues: [false, true],
      };
    }
    return sweep;
  }, [mode, sweep]);

  const expandedVariants = useMemo(
    () => expandParameterSweep(effectiveSweep),
    [effectiveSweep]
  );

  const totalSimulationsCount =
    expandedVariants.length * selectedTableIds.length * gamesPerVariant;

  const handleLaunch = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedTables: TableConfig[] = DEFAULT_TABLE_CONFIGS.filter((t) =>
      selectedTableIds.includes(t.id)
    );
    await onStartCampaign({
      name: campaignName.trim() || 'Campagne Monte-Carlo',
      type: mode,
      gamesPerVariantAndTable: gamesPerVariant,
      sweep: effectiveSweep,
      selectedTableConfigs: selectedTables,
      includeCalibrationTables: true,
      baseSeed,
    });
  };

  return (
    <form onSubmit={handleLaunch} className="space-y-6">
      {/* Choix du mode de campagne */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-1">
          Configuration d'une Campagne de Simulation Monte-Carlo
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Toutes les variantes sont évaluées sur les mêmes graines aléatoires appariées (Paired Seeds) pour isoler l'impact exact de chaque paramètre.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
          <button
            type="button"
            onClick={() => {
              setMode('D1_D2_COMPARISON');
              setCampaignName(
                'Comparaison Directe Options D1 vs D2 (Surchauffe × Assaut)'
              );
            }}
            className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
              mode === 'D1_D2_COMPARISON'
                ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Mode 1 — Comparaison Directe Options D1 vs D2 (2×2)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Croise automatiquement les 4 combinaisons de{' '}
              <code>overheatIncludesBaseAction</code> (D1/D2) et{' '}
              <code>assaultIncludesBaseAction</code> (D1/D2) à paramètres fixes ou balayés.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setMode('MONTE_CARLO_SWEEP');
              setCampaignName('Balayage Paramétrique Monte-Carlo Personnalisé');
            }}
            className={`text-left p-4 rounded-lg border transition-colors cursor-pointer ${
              mode === 'MONTE_CARLO_SWEEP'
                ? 'border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/30'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
            }`}
          >
            <div className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Mode 2 — Balayage Paramétrique Complet (Variables A, B, C, D)
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
              Sélectionnez librement les valeurs de $N$, $X$, $a$, l'ordre de la Piste des Tactiques, l'état initial des machines et les règles spéciales.
            </p>
          </button>
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

      {/* SECTION VARIABLES A, B, C, D DE LA SPÉCIFICATION (§2) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Variables A & B : Structure & Piste des Tactiques */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
            2.1 & 2.2 — Paramètres de Table ($N, X, a$) & Piste des Tactiques
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
              Nombre de tours de la partie ($X$)
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

          {/* a arbres par case */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Arbres debout initiaux par case ($a$)
            </label>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4].map((a) => {
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
                    a = {a} arbres/case
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
              Mélange de la Piste des Tactiques en début de partie (<code>shuffleTacticsTrack</code>)
            </label>
            <div className="flex gap-2">
              {[false, true].map((val) => {
                const active = sweep.shuffleTacticsTrackValues.includes(val);
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() => toggleBoolValue('shuffleTacticsTrackValues', val)}
                    className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {val ? 'Mélangée (Aléatoire)' : 'Ordre Fixe'}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Variables C & D : État initial des machines & Arbitrages Surchauffe / Assaut */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
            2.3 & 2.4 — État Initial des Machines & Arbitrages des Règles (D1 vs D2)
          </h3>

          {/* État initial Abatteuse & Bulldozer */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Statut initial Abatteuse (Case 1)
              </label>
              <select
                value={sweep.initialHarvesterStatus}
                onChange={(e) =>
                  setSweep((prev) => ({
                    ...prev,
                    initialHarvesterStatus: e.target.value as 'NORMAL' | 'HS',
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="NORMAL">NORMAL (Prête)</option>
                <option value="HS">HS (Hors Service)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Statut initial Bulldozer (Case 1)
              </label>
              <select
                value={sweep.initialBulldozerStatus}
                onChange={(e) =>
                  setSweep((prev) => ({
                    ...prev,
                    initialBulldozerStatus: e.target.value as 'NORMAL' | 'HS',
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value="NORMAL">NORMAL (Prêt)</option>
                <option value="HS">HS (Hors Service)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Souches initiales en Case 1
              </label>
              <input
                type="number"
                min={0}
                max={4}
                value={sweep.initialStumpsCell1}
                onChange={(e) =>
                  setSweep((prev) => ({
                    ...prev,
                    initialStumpsCell1: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              />
            </div>
          </div>

          {/* Option D : Surchauffe A2/B2 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Surchauffe A2/B2 inclut l'action de base (<code>overheatIncludesBaseAction</code>)
            </label>
            {mode === 'D1_D2_COMPARISON' ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ Balayage automatique [D1 (false) + D2 (true)] activé par le Mode 1
              </div>
            ) : (
              <div className="flex gap-2">
                {[false, true].map((val) => {
                  const active = sweep.overheatIncludesBaseActionValues.includes(val);
                  return (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => toggleBoolValue('overheatIncludesBaseActionValues', val)}
                      className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {val ? 'D2 : Oui (Base + Surchauffe)' : 'D1 : Non (Surchauffe seule)'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Option D : Assaut A3/B3 */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Assaut A3/B3 inclut l'action de base (<code>assaultIncludesBaseAction</code>)
            </label>
            {mode === 'D1_D2_COMPARISON' ? (
              <div className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
                ✓ Balayage automatique [D1 (false) + D2 (true)] activé par le Mode 1
              </div>
            ) : (
              <div className="flex gap-2">
                {[false, true].map((val) => {
                  const active = sweep.assaultIncludesBaseActionValues.includes(val);
                  return (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => toggleBoolValue('assaultIncludesBaseActionValues', val)}
                      className={`px-3 py-1.5 text-xs font-medium rounded border cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {val ? 'D2 : Oui (Base + Assaut)' : 'D1 : Non (Assaut seul)'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Cumul de Surchauffes & Régénération */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Cumul de Surchauffes (<code>overheatStacksTreeRemoval</code>)
              </label>
              <div className="flex gap-2">
                {[true, false].map((val) => {
                  const active = sweep.overheatStacksTreeRemovalValues.includes(val);
                  return (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => toggleBoolValue('overheatStacksTreeRemovalValues', val)}
                      className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {val ? 'Oui (k pions)' : 'Non (1 pion)'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Régénération Fin de Partie (<code>endOfGameRegeneration</code>)
              </label>
              <div className="flex gap-2">
                {[true, false].map((val) => {
                  const active = sweep.endOfGameRegenerationValues.includes(val);
                  return (
                    <button
                      key={String(val)}
                      type="button"
                      onClick={() => toggleBoolValue('endOfGameRegenerationValues', val)}
                      className={`px-2.5 py-1 text-xs font-medium rounded border cursor-pointer ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                      }`}
                    >
                      {val ? 'Activée (+1 arbre/case)' : 'Désactivée'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SÉLECTION DES PROFILS D'IA & LANCEMENT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
          Profils de Bots à Évaluer (Phase 2 — Placement des 2 Jetons Défenseurs)
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

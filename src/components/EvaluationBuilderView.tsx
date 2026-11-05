import React, { useMemo, useState } from 'react';
import {
  BulldozerZeroStumpAction,
  CampaignConfig,
  CombatThresholdShift,
  ParameterSweepInput,
  TableConfig,
  TacticalDefenderCap,
  TacticsTrackPreset,
} from '../sim/types';
import {
  DEFAULT_SWEEP_INPUT,
  DEFAULT_TABLE_CONFIGS,
  TACTICS_TRACK_PRESETS,
} from '../sim/i18n';
import { expandParameterSweep } from '../sim/evaluator';

interface EvaluationBuilderViewProps {
  onStartCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  isSubmitting: boolean;
}

export const EvaluationBuilderView: React.FC<EvaluationBuilderViewProps> = ({
  onStartCampaign,
  isSubmitting,
}) => {
  const [mode, setMode] = useState<'FIVE_LEVERS_ABLATION' | 'MONTE_CARLO_SWEEP'>(
    'MONTE_CARLO_SWEEP'
  );
  const [campaignName, setCampaignName] = useState<string>(
    'Campagne Monte-Carlo v3.2 — Balayage Exhaustif (Connaissance Privée, Coordination & Nouveaux Leviers)'
  );
  // Par défaut, palier élevé d'itérations pour la VM Oracle multi-cœurs
  const [gamesPerVariant, setGamesPerVariant] = useState<number>(1000);
  const [baseSeed, setBaseSeed] = useState<number>(42000);

  // Par défaut, toutes les options ambitieuses de la v3.2 sont pré-cochées (2 304 variantes)
  const [sweep, setSweep] = useState<ParameterSweepInput>({
    ...DEFAULT_SWEEP_INPUT,
  });

  // Par défaut, les 4 tables graduées (Coord, Solo, Aveugle, Omniscient) sont activées
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

  const toggleCapValue = (val: TacticalDefenderCap) => {
    setSweep((prev) => {
      const exists = prev.tacticalDefenderCapValues.includes(val);
      const next = exists
        ? prev.tacticalDefenderCapValues.filter((x) => x !== val)
        : [...prev.tacticalDefenderCapValues, val];
      return {
        ...prev,
        tacticalDefenderCapValues: next.length > 0 ? next : [val],
      };
    });
  };

  const toggleShiftValue = (val: CombatThresholdShift) => {
    setSweep((prev) => {
      const exists = prev.combatThresholdShiftValues.includes(val);
      const next = exists
        ? prev.combatThresholdShiftValues.filter((x) => x !== val)
        : [...prev.combatThresholdShiftValues, val];
      return {
        ...prev,
        combatThresholdShiftValues: next.length > 0 ? next : [val],
      };
    });
  };

  const toggleBullActionValue = (val: BulldozerZeroStumpAction) => {
    setSweep((prev) => {
      const exists = prev.bulldozerZeroStumpActionValues.includes(val);
      const next = exists
        ? prev.bulldozerZeroStumpActionValues.filter((x) => x !== val)
        : [...prev.bulldozerZeroStumpActionValues, val];
      return {
        ...prev,
        bulldozerZeroStumpActionValues: next.length > 0 ? next : [val],
      };
    });
  };

  const toggleInitialStumpCell2 = (val: boolean) => {
    setSweep((prev) => {
      const exists = prev.initialStumpCell2Values.includes(val);
      const next = exists
        ? prev.initialStumpCell2Values.filter((x) => x !== val)
        : [...prev.initialStumpCell2Values, val];
      return {
        ...prev,
        initialStumpCell2Values: next.length > 0 ? next : [val],
      };
    });
  };

  const togglePresetValue = (val: TacticsTrackPreset) => {
    setSweep((prev) => {
      const exists = prev.tacticsTrackPresetValues.includes(val);
      const next = exists
        ? prev.tacticsTrackPresetValues.filter((x) => x !== val)
        : [...prev.tacticsTrackPresetValues, val];
      return {
        ...prev,
        tacticsTrackPresetValues: next.length > 0 ? next : [val],
      };
    });
  };

  const applyCampaignPreset = (
    preset: 'EXHAUSTIVE_VM' | 'FAST_CALIBRATION_4P8T' | 'HARDCORE_LEVERS'
  ) => {
    if (preset === 'EXHAUSTIVE_VM') {
      setSweep({ ...DEFAULT_SWEEP_INPUT });
      setGamesPerVariant(1000);
      setMode('MONTE_CARLO_SWEEP');
      setCampaignName(
        'Campagne Monte-Carlo v3.2 — Balayage Exhaustif (2 304 variantes × 4 Bots)'
      );
    } else if (preset === 'FAST_CALIBRATION_4P8T') {
      setSweep({
        numPlayersValues: [4, 5],
        numTurnsValues: [8, 9],
        initialTreesPerCellValues: [2],
        tacticalDefenderCapValues: [99, 2, 1],
        combatThresholdShiftValues: [0, 1],
        bulldozerZeroStumpActionValues: ['NONE', 'DESTROY_TREE'],
        initialStumpCell2Values: [false, true],
        tacticsTrackPresetValues: ['ASSAULT_HIGH', 'ASSAULT_LOW'],
        shuffleTacticsTrackValues: [false],
      });
      setGamesPerVariant(300);
      setMode('FIVE_LEVERS_ABLATION');
      setCampaignName('Ablation Ciblée v3.2 (N∈{4,5}, X∈{8,9}, a=2 — 192 variantes)');
    } else {
      setSweep({
        numPlayersValues: [3, 4, 5, 6],
        numTurnsValues: [7, 8, 9, 10],
        initialTreesPerCellValues: [2],
        tacticalDefenderCapValues: [2, 1],
        combatThresholdShiftValues: [0, 1],
        bulldozerZeroStumpActionValues: ['DESTROY_TREE'],
        initialStumpCell2Values: [false, true],
        tacticsTrackPresetValues: ['ASSAULT_HIGH'],
        shuffleTacticsTrackValues: [false],
      });
      setGamesPerVariant(500);
      setMode('MONTE_CARLO_SWEEP');
      setCampaignName('Focus Haute Tension v3.2 (ASSAULT_HIGH + Bull0=-1Arb + Cap≤2)');
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
      name: campaignName.trim() || 'Campagne Monte-Carlo v3.2',
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
      {/* En-tête et Règles Figées v3.2 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Configurateur de Campagne Monte-Carlo v3.2 (Connaissance Privée, Coordination & Leviers de Difficulté)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Par défaut, toutes les tailles de table, durées, densités et nouveaux leviers v3.2 sont sélectionnés pour exploiter à 100 % les workers multi-cœurs de la VM Oracle.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ D2-Double & CumulA2 & Régén
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ ActRep (3.1) & PurgeSab & MaxN
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ Départ synchrone Case 1
            </span>
          </div>
        </div>

        {/* Boutons de pré-configuration rapide */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Préréglages de campagne :
          </span>
          <button
            type="button"
            onClick={() => applyCampaignPreset('EXHAUSTIVE_VM')}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded cursor-pointer hover:bg-emerald-800"
          >
            ★ Balayage Exhaustif VM (2 304 variantes × 4 Bots × 1 000 p.)
          </button>
          <button
            type="button"
            onClick={() => applyCampaignPreset('FAST_CALIBRATION_4P8T')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded cursor-pointer hover:bg-slate-200"
          >
            Ablation Rapide N∈4..5, X∈8..9 (192 variantes × 300 p.)
          </button>
          <button
            type="button"
            onClick={() => applyCampaignPreset('HARDCORE_LEVERS')}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded cursor-pointer hover:bg-amber-100"
          >
            Focus Haute Tension (ASSAULT_HIGH + Bull0=-1Arb)
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
            <div className="flex gap-2">
              <input
                type="number"
                min={10}
                max={25000}
                step={50}
                value={gamesPerVariant}
                onChange={(e) =>
                  setGamesPerVariant(Math.max(10, Number(e.target.value) || 1000))
                }
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
              />
              <div className="flex gap-1 shrink-0">
                {[200, 1000, 2500, 5000].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setGamesPerVariant(v)}
                    className={`px-2 py-1 text-xs font-mono rounded border cursor-pointer ${
                      gamesPerVariant === v
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
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

      {/* SECTION PRINCIPALE : PARAMÈTRES DE TABLE & LES 5 NOUVEAUX LEVIERS v3.2 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche (5 cols) : Paramètres Structurels (N, X, a) & Piste des Tactiques */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
            1. Paramètres Structurels (N, X, a ∈ 2..3) & Presets de Piste
          </h3>

          {/* N joueurs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de joueurs (N = 3, 4, 5, 6 — tous cochés par défaut)
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
              Nombre de tours de la partie (X ∈ 6..12 — tous cochés par défaut)
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
              Densité initiale d'arbres par case (a ∈ 2..3)
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
                    a = {a} arbres/case
                  </button>
                );
              })}
            </div>
          </div>

          {/* Presets de la Piste des Tactiques */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              5. Configuration de la Piste des Tactiques (<code>tacticsTrackPreset</code>)
            </label>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2">
              La case M=1 tombe 11/36 fois (30.6 %) et M=2 tombe 9/36 fois (25.0 %). Placer A3/B3 en M=1,2 inverse radicalement la pression d'Assaut.
            </p>
            <div className="space-y-2">
              {(['ASSAULT_HIGH', 'ASSAULT_LOW'] as TacticsTrackPreset[]).map((presetKey) => {
                const meta = TACTICS_TRACK_PRESETS[presetKey];
                const active = sweep.tacticsTrackPresetValues.includes(presetKey);
                return (
                  <div
                    key={presetKey}
                    onClick={() => togglePresetValue(presetKey)}
                    className={`p-2.5 rounded border cursor-pointer transition-colors ${
                      active
                        ? 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-600'
                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 opacity-65'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                        {meta.label}
                      </span>
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-emerald-700 text-white">
                        {active ? 'Inclus au Sweep' : 'Exclu'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {meta.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Colonne Droite (7 cols) : Les 4 Nouveaux Leviers de Difficulté v3.2 */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Les 4 Nouveaux Leviers de Difficulté v3.2 (Pour ramener la survie dans la cible 70 % – 82 %)
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cliquez sur les valeurs à inclure dans le balayage paramétrique (toutes les valeurs sont cochées par défaut).
            </p>
          </div>

          <div className="space-y-3.5">
            {/* Levier 1 : tacticalDefenderCap */}
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                      Cap
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      1. Plafond d'Empilement Tactique par Case (<code>tacticalDefenderCap</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Nombre max de jetons Défenseurs posables sur la Piste Tactique d'une même case par tour. Avec Cap=1, atteindre S ≥ 3 exige obligatoirement un Piège ou un Sabotage préalable.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(
                    [
                      { val: 99 as TacticalDefenderCap, label: '99 (Illimité)' },
                      { val: 2 as TacticalDefenderCap, label: 'Max 2 / case' },
                      { val: 1 as TacticalDefenderCap, label: 'Max 1 / case' },
                    ] as const
                  ).map((opt) => {
                    const active = sweep.tacticalDefenderCapValues.includes(opt.val);
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => toggleCapValue(opt.val)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded border cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Levier 2 : combatThresholdShift */}
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                      Shift
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      2. Durcissement des Seuils de Combat S (<code>combatThresholdShift</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Décalage +shift : Attaque réussie si S ≤ 1+k+shift · Parade simple si S = 2+k+shift · Parade + Mise HS si S ≥ 3+k+shift.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(
                    [
                      { val: 0 as CombatThresholdShift, label: 'Shift +0 (Standard 1/2/3)' },
                      { val: 1 as CombatThresholdShift, label: 'Shift +1 (Durci 2/3/4)' },
                    ] as const
                  ).map((opt) => {
                    const active = sweep.combatThresholdShiftValues.includes(opt.val);
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => toggleShiftValue(opt.val)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded border cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Levier 3 : bulldozerZeroStumpAction */}
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                      Bull0
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      3. Action du Bulldozer sur Case Sans Souche (<code>bulldozerZeroStumpAction</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Si le Bulldozer attaque une case où stumps &gt; 0, il rase toutes les souches. Si et seulement si stumps == 0 au 1er Terrassement : soit aucun effet (NONE), soit il détruit définitivement 1 arbre debout sans laisser de souche (DESTROY_TREE).
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(
                    [
                      { val: 'NONE' as BulldozerZeroStumpAction, label: 'NONE (Aucun effet)' },
                      { val: 'DESTROY_TREE' as BulldozerZeroStumpAction, label: 'DESTROY_TREE (-1 Arbre)' },
                    ] as const
                  ).map((opt) => {
                    const active = sweep.bulldozerZeroStumpActionValues.includes(opt.val);
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => toggleBullActionValue(opt.val)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded border cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Levier 4 : initialStumpCell2 */}
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                      StumpC2
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      4. Souche Initiale en Case 2 sur J1 et J2 (<code>initialStumpCell2</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Les deux machines démarrent toujours en case 1. Si true, la case 2 de J1 et J2 démarre avec 1 souche et a-1 arbre debout (potentiel écologique initial identique après régénération).
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {[
                    { val: false, label: 'Non (false)' },
                    { val: true, label: 'Oui (true)' },
                  ].map((opt) => {
                    const active = sweep.initialStumpCell2Values.includes(opt.val);
                    return (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => toggleInitialStumpCell2(opt.val)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded border cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SÉLECTION DES 4 PROFILS GRADUÉS DE BOTS & LANCEMENT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
          3. Les 4 Profils Gradués d'IA (Mesure du Gain d'Info Privée & du Gain de Coordination)
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          Conservez les 4 tables activées pour calculer sur les mêmes graines : Gain Info Privée (Solo − Aveugle), Gain Coordination (Coord − Solo) et Coût du Brouillard (Omni − Coord).
        </p>
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
            Volume total configuré :{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {expandedVariants.length.toLocaleString('fr-FR')} variante(s)
            </strong>{' '}
            ×{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {selectedTableIds.length} table(s) de Bots
            </strong>{' '}
            ×{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {gamesPerVariant.toLocaleString('fr-FR')} parties
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

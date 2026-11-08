import type {ProtocolConfig} from '../scientific/protocol';
import React, { useMemo, useState } from 'react';
import {
  BulldozerZeroStumpAction,
  CampaignConfig,
  CombatThresholdShift,
  ParameterSweepInput,
  ParryHsRule,
  TableConfig,
  TacticalDefenderCap,
  TacticsTrackPreset,
} from '../sim/types';
import {
  DEFAULT_SWEEP_INPUT,
  DEFAULT_TABLE_CONFIGS,
  PARRY_HS_RULE_META,
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
  const [protocol, setProtocol] = useState<'HISTORICAL_V33'|'SCIENTIFIC_V1'>('HISTORICAL_V33');
  const [independent, setIndependent] = useState(false);
  const scientificIds=['TABLE_BLIND','TABLE_PROB','TABLE_SOLO','TABLE_COORD_ONE_SHOT','TABLE_OMNI'];
  const [mode, setMode] = useState<'FIVE_LEVERS_ABLATION' | 'MONTE_CARLO_SWEEP'>(
    'MONTE_CARLO_SWEEP'
  );
  const [campaignName, setCampaignName] = useState<string>(
    'Campagne Monte-Carlo v3.3 — Invariants v3.2 Figés, Synergie Mise HS & Décomposition Shapley (7 Bots)'
  );
  const [gamesPerVariant, setGamesPerVariant] = useState<number>(500);
  const [baseSeed, setBaseSeed] = useState<number>(42000);

  // Par défaut, invariants v3.3 figés (a=2, ASSAULT_LOW, DESTROY_TREE, initialStumpCell2=true) + balayage Cap/Shift/ParryHS
  const [sweep, setSweep] = useState<ParameterSweepInput>({
    ...DEFAULT_SWEEP_INPUT,
  });

  // Par défaut, les 7 tables graduées orthogonales sont activées
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

  const toggleParryHsRuleValue = (val: ParryHsRule) => {
    setSweep((prev) => {
      const current = prev.parryHsRuleValues ?? ['SYNERGY_TRAP_SAB', 'STANDARD_S3'];
      const exists = current.includes(val);
      const next = exists ? current.filter((x) => x !== val) : [...current, val];
      return {
        ...prev,
        parryHsRuleValues: next.length > 0 ? next : [val],
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
    preset: 'V33_DEFAULT_SWEEP' | 'FAST_CALIBRATION_4P8T' | 'FULL_CROSS_ABLATION'
  ) => {
    if (preset === 'V33_DEFAULT_SWEEP') {
      setSweep({ ...DEFAULT_SWEEP_INPUT });
      setGamesPerVariant(500);
      setMode('MONTE_CARLO_SWEEP');
      setCampaignName(
        'Campagne Monte-Carlo v3.3 — Invariants v3.2 Figés & Balayage Cap/Shift/SynergieHS (288 variantes × 7 Bots)'
      );
    } else if (preset === 'FAST_CALIBRATION_4P8T') {
      setSweep({
        numPlayersValues: [4, 5],
        numTurnsValues: [8, 9],
        initialTreesPerCellValues: [2],
        tacticalDefenderCapValues: [99, 2, 1],
        combatThresholdShiftValues: [0, 1],
        parryHsRuleValues: ['SYNERGY_TRAP_SAB', 'STANDARD_S3'],
        bulldozerZeroStumpActionValues: ['DESTROY_TREE'],
        initialStumpCell2Values: [true],
        tacticsTrackPresetValues: ['ASSAULT_LOW'],
        shuffleTacticsTrackValues: [false],
      });
      setGamesPerVariant(300);
      setMode('FIVE_LEVERS_ABLATION');
      setCampaignName('Ablation Fine v3.3 (N∈{4,5}, X∈{8,9}, Invariants Figés — 48 variantes × 7 Bots)');
    } else {
      setSweep({
        numPlayersValues: [3, 4, 5, 6],
        numTurnsValues: [7, 8, 9, 10],
        initialTreesPerCellValues: [2],
        tacticalDefenderCapValues: [2, 1],
        combatThresholdShiftValues: [0, 1],
        parryHsRuleValues: ['SYNERGY_TRAP_SAB', 'STANDARD_S3'],
        bulldozerZeroStumpActionValues: ['DESTROY_TREE'],
        initialStumpCell2Values: [true],
        tacticsTrackPresetValues: ['ASSAULT_LOW', 'ASSAULT_HIGH'],
        shuffleTacticsTrackValues: [false],
      });
      setGamesPerVariant(400);
      setMode('MONTE_CARLO_SWEEP');
      setCampaignName('Comparaison ASSAULT_LOW vs ASSAULT_HIGH + Synergie Mise HS v3.3');
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
      selectedTableIds.includes(t.id) && (protocol==='HISTORICAL_V33'||scientificIds.includes(t.id))
    );
    const payload: Partial<ProtocolConfig> = {
      name: protocol==='SCIENTIFIC_V1' ? 'SCIENTIFIC_V1 — '+(campaignName.trim().startsWith('Campagne Monte-Carlo v3.3')?'comparaison de politiques pilotes':campaignName.trim()) : campaignName.trim() || 'Campagne Monte-Carlo v3.3',
      type: mode,
      gamesPerVariantAndTable: gamesPerVariant,
      sweep,
      selectedTableConfigs: selectedTables,
      includeCalibrationTables: protocol==='HISTORICAL_V33',
      baseSeed,
      protocol,
      ...(protocol==='SCIENTIFIC_V1'?{science:{experimentSeed:baseSeed,environmentSeed:1,policySeed:2,assumptions:{independentGames:independent,fixedSampleSize:true,analysis:'EXPLORATORY' as const}}}:{}),
    };
    await onStartCampaign(payload);
  };

  return (
    <form onSubmit={handleLaunch} className="space-y-6">
      <fieldset className="p-4 border rounded"><legend>Protocole expérimental</legend>
      <select aria-label="Protocole" value={protocol} onChange={e=>{const next=e.target.value as typeof protocol;setProtocol(next);if(next==='SCIENTIFIC_V1')setSelectedTableIds(prev=>{const ids=prev.filter(id=>scientificIds.includes(id));return ids.length?ids:['TABLE_BLIND'];});}}><option value="HISTORICAL_V33">HISTORICAL_V33 — référence historique</option><option value="SCIENTIFIC_V1">SCIENTIFIC_V1 — politiques pilotes sans révisions</option></select>
      {protocol==='SCIENTIFIC_V1'&&<div><p>Le jeu de règles v3.3 est conservé. Les politiques scientifiques ont leurs propres versions : second jeton au siège suivant, tactique uniquement, sans révisions. COORD_NO_DICE et COORD_HYBRID sont indisponibles. Le contrôle privilégié reste heuristique. La graine de base identifie l’expérience ; flux environnement 1 et politiques 2, enregistrés dans le manifeste.</p><label><input type="checkbox" checked={independent} onChange={e=>setIndependent(e.target.checked)}/>Déclarer les parties indépendantes sous le modèle pseudo-aléatoire. Sans cette hypothèse, aucun intervalle n’est affiché.</label></div>}
      </fieldset>
      {/* En-tête et Invariants Figés v3.3 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        {protocol==='HISTORICAL_V33' && <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Configurateur de Campagne Monte-Carlo v3.3 (Invariants v3.2 Figés, Synergie Mise HS & 7 Bots Orthogonaux)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Invariants v3.3 figés par défaut : a = 2 arbres/case, ASSAULT_LOW [A1,B1,A2,B2,A3,B3], Bull0 = DESTROY_TREE, Souche C2 = Oui. Fenêtre de survie valide : 45 % – 82 %.
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 text-[11px] font-mono">
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ a=2 & ASSAULT_LOW figés
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ Bull0=-1Arb & StumpC2=Oui
            </span>
            <span className="px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              ✓ 7 Bots & Boucle 2.2 (4 rondes)
            </span>
          </div>
        </div>

        }
        {/* Boutons de pré-configuration rapide */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
            Préréglages de campagne v3.3 :
          </span>
          <button
            type="button"
            onClick={() => applyCampaignPreset('V33_DEFAULT_SWEEP')}
            className="px-3 py-1.5 text-xs font-semibold bg-emerald-700 text-white rounded cursor-pointer hover:bg-emerald-800"
          >
            ★ Balayage Référence v3.3 (288 variantes × 7 Bots × 500 p.)
          </button>
          <button
            type="button"
            onClick={() => applyCampaignPreset('FAST_CALIBRATION_4P8T')}
            className="px-3 py-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded cursor-pointer hover:bg-slate-200"
          >
            Ablation Rapide N∈4..5, X∈8..9 (48 variantes × 7 Bots × 300 p.)
          </button>
          <button
            type="button"
            onClick={() => applyCampaignPreset('FULL_CROSS_ABLATION')}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded cursor-pointer hover:bg-amber-100"
          >
            Croisement ASSAULT_LOW vs ASSAULT_HIGH + Synergie HS
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
                  setGamesPerVariant(Math.max(10, Number(e.target.value) || 500))
                }
                className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100"
              />
              <div className="flex gap-1 shrink-0">
                {[100, 500, 1000, 2500].map((v) => (
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

      {/* SECTION PRINCIPALE : PARAMÈTRES STRUCTURELS & LEVIERS v3.3 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Colonne Gauche (5 cols) : Paramètres Structurels & Invariants v3.2 figés */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-slate-800 pb-2">
            1. Paramètres Structurels (N, X) & Invariants v3.2 Figés par Défaut
          </h3>

          {/* N joueurs */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de joueurs (N = 3, 4, 5, 6)
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
              Nombre de tours de la partie (X ∈ 6..12)
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
              Densité initiale d'arbres par case (a = 2 figé par défaut en v3.3)
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
                    a = {a} arbres/case {a === 2 ? '(Défaut v3.3)' : ''}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Presets de la Piste des Tactiques */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Configuration de la Piste des Tactiques (<code>ASSAULT_LOW</code> figé par défaut)
            </label>
            <div className="space-y-2">
              {(['ASSAULT_LOW', 'ASSAULT_HIGH'] as TacticsTrackPreset[]).map((presetKey) => {
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
                        {meta.label} {presetKey === 'ASSAULT_LOW' ? '★ Défaut v3.3' : ''}
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

        {/* Colonne Droite (7 cols) : Le Nouveau Levier v3.3 (parryHsRule) & Leviers Tactiques */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="border-b border-slate-200 dark:border-slate-800 pb-2.5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              2. Levier Fin v3.3 de Synergie Mise HS (<code>parryHsRule</code>) & Leviers de Combat
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Testez l'impact de la règle Synergie Piège/Sabotage (Mise HS dès S ≥ 2+k+shift si au moins un Piège ou Sabotage actif participe) face au seuil classique S ≥ 3+k+shift.
            </p>
          </div>

          <div className="space-y-3.5">
            {/* NOUVEAU LEVIER v3.3 : parryHsRule */}
            <div className="p-3.5 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-300 dark:border-emerald-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-700 text-white rounded">
                      NOUVEAU v3.3
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Règle de Mise HS au Combat (<code>parryHsRule</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                    <strong>SYNERGY_TRAP_SAB (Défaut)</strong> : Si S ≥ 2+k+shift ET (S ≥ 3+k+shift OU Piège+Sabotage ≥ 1), la Parade déclenche immédiatement la Mise HS des machines engagées ! Valorise fortement la Furtivité sous Cap=1 ou Shift=+1.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {(['SYNERGY_TRAP_SAB', 'STANDARD_S3'] as ParryHsRule[]).map((ruleKey) => {
                    const current = sweep.parryHsRuleValues ?? ['SYNERGY_TRAP_SAB', 'STANDARD_S3'];
                    const active = current.includes(ruleKey);
                    return (
                      <button
                        key={ruleKey}
                        type="button"
                        onClick={() => toggleParryHsRuleValue(ruleKey)}
                        className={`px-2.5 py-1.5 text-xs font-mono font-medium rounded border cursor-pointer ${
                          active
                            ? 'bg-emerald-700 text-white border-emerald-700'
                            : 'bg-white dark:bg-slate-900 text-slate-600 border-slate-300 dark:border-slate-700'
                        }`}
                        title={PARRY_HS_RULE_META[ruleKey].description}
                      >
                        {PARRY_HS_RULE_META[ruleKey].shortLabel}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Levier 1 : tacticalDefenderCap */}
            <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded">
                      Cap
                    </span>
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                      Plafond d'Empilement Tactique par Case (<code>tacticalDefenderCap</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Nombre max de jetons Défenseurs posables sur la Piste Tactique d'une même case par tour (99, 2 ou 1).
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
                      Durcissement des Seuils de Combat S (<code>combatThresholdShift</code>)
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    Décalage +shift : Attaque réussie si S ≤ 1+k+shift · Parade si S ≥ 2+k+shift.
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

            {/* Invariants figés par défaut : Bull0 & StumpC2 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Bulldozer 0 Souche (Figé : <code>DESTROY_TREE</code>)
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {(
                    [
                      { val: 'DESTROY_TREE' as BulldozerZeroStumpAction, label: 'DESTROY_TREE (-1 Arbre)' },
                      { val: 'NONE' as BulldozerZeroStumpAction, label: 'NONE' },
                    ] as const
                  ).map((opt) => {
                    const active = sweep.bulldozerZeroStumpActionValues.includes(opt.val);
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => toggleBullActionValue(opt.val)}
                        className={`px-2 py-1 text-xs font-mono font-medium rounded border cursor-pointer ${
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

              <div className="p-3 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
                <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Souche C2 J1/J2 (Figé : <code>true</code>)
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  {[
                    { val: true, label: 'Oui (true — Défaut v3.3)' },
                    { val: false, label: 'Non (false)' },
                  ].map((opt) => {
                    const active = sweep.initialStumpCell2Values.includes(opt.val);
                    return (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => toggleInitialStumpCell2(opt.val)}
                        className={`px-2 py-1 text-xs font-mono font-medium rounded border cursor-pointer ${
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

      {/* SÉLECTION DES 7 PROFILS GRADUÉS DE BOTS & LANCEMENT */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
          {protocol==='SCIENTIFIC_V1' ? '3. Politiques scientifiques versionnées (révisions indisponibles)' : "3. Panel historique des sept profils — comparaisons descriptives"}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
          {protocol==='SCIENTIFIC_V1' ? 'La première table sélectionnée sert de référence aux contrastes appariés. Aucun profil absent ne sera remplacé par un autre résultat.' : 'Panel historique : les différences entre politiques ne constituent pas des effets causaux isolés des informations I1/I2/I3.'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          {DEFAULT_TABLE_CONFIGS.filter(tc=>protocol==='HISTORICAL_V33'||scientificIds.includes(tc.id)).map((tc) => {
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
                  {protocol==='SCIENTIFIC_V1' ? tc.botProfiles[0]+' — politique SCI V1' : tc.name}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                  {protocol==='SCIENTIFIC_V1' ? 'Politique pilote : pose tactique, soutien au siège suivant, sans révision. OMNISCIENT est un contrôle heuristique à information privilégiée.' : tc.description}
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

import React, { useState } from 'react';
import {
  CampaignConfig,
  DiceDrawMode,
  EditionPreset,
  MechanicalSwitches,
  ParameterSweepInput,
  TableConfig,
  ThemeVocabularyMode,
} from '../sim/types';
import {
  DEFAULT_TABLE_CONFIGS,
  generateHumanRuleDiff,
  SWITCH_KEYS,
  SWITCH_META,
  V1_SWITCHES,
  V2_SWITCHES,
} from '../sim/i18n';
import { GitCompare, Layers, Play } from 'lucide-react';

interface EvaluationBuilderViewProps {
  editions: EditionPreset[];
  onLaunchCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  vocabulary: ThemeVocabularyMode;
}

export const EvaluationBuilderView: React.FC<EvaluationBuilderViewProps> = ({
  editions,
  onLaunchCampaign,
}) => {
  const [mode, setMode] = useState<'AB_ABLATION' | 'EVALUATION_SWEEP'>(
    'AB_ABLATION'
  );
  const [name, setName] = useState(
    'Ablation Croisée Édition 1.0 vs Édition 2.0 (Graines Appariées)'
  );
  const [gamesPerVariantAndTable, setGamesPerVariantAndTable] = useState(60);
  const [baseSeed, setBaseSeed] = useState(90210);

  // Configuration Ablation A/B
  const [editionAId, setEditionAId] = useState<string>(
    editions[0]?.id || 'ed-v1-original'
  );
  const [editionBId, setEditionBId] = useState<string>(
    editions[1]?.id || 'ed-v2-refonte'
  );
  const [includeLayer2SingleAdditions, setIncludeLayer2SingleAdditions] =
    useState(true);
  const [includeLayer3SingleAblations, setIncludeLayer3SingleAblations] =
    useState(true);
  const [includeLayer4FullFactorial, setIncludeLayer4FullFactorial] =
    useState(false);

  // Paramètres structurels communs ou balayés
  const [nValues, setNValues] = useState<number[]>([4]);
  const [qValues, setQValues] = useState<number[]>([6]);
  const [aValues, setAValues] = useState<number[]>([2]);
  const [xValues, setXValues] = useState<number[]>([8]);
  const [nbRegenValues, setNbRegenValues] = useState<number[]>([1]);
  const [diceModes, setDiceModes] = useState<DiceDrawMode[]>(['MIN_2D6']);

  // En mode EVALUATION_SWEEP : sélection des valeurs V1 / V2 pour chaque interrupteur
  const [sweepSwitches, setSweepSwitches] = useState<
    Record<keyof MechanicalSwitches, string[]>
  >({
    ruleNoTargetH1: [V2_SWITCHES.ruleNoTargetH1],
    ruleParryMode: [V2_SWITCHES.ruleParryMode],
    rulePreventiveDestruction: [V2_SWITCHES.rulePreventiveDestruction],
    ruleBulldozerTargeting: [V2_SWITCHES.ruleBulldozerTargeting],
    ruleScrapyardExit: [V2_SWITCHES.ruleScrapyardExit],
    ruleInitialSetup: [V2_SWITCHES.ruleInitialSetup],
  });

  const [selectedTableIds, setSelectedTableIds] = useState<string[]>(
    DEFAULT_TABLE_CONFIGS.map((t) => t.id)
  );
  const [launching, setLaunching] = useState(false);

  const edA = editions.find((e) => e.id === editionAId) || editions[0];
  const edB =
    editions.find((e) => e.id === editionBId) || editions[1] || editions[0];

  const diffPreview =
    edA && edB
      ? generateHumanRuleDiff(edA.switches, edB.switches, edA.name, edB.name)
      : null;

  const toggleNumberInList = (
    list: number[],
    setter: (v: number[]) => void,
    val: number
  ) => {
    if (list.includes(val)) {
      if (list.length > 1) setter(list.filter((x) => x !== val));
    } else {
      setter([...list, val].sort((a, b) => a - b));
    }
  };

  const toggleSwitchSweepValue = (
    key: keyof MechanicalSwitches,
    val: string
  ) => {
    setSweepSwitches((prev) => {
      const current = prev[key] || [];
      if (current.includes(val)) {
        if (current.length <= 1) return prev;
        return { ...prev, [key]: current.filter((v) => v !== val) };
      }
      return { ...prev, [key]: [...current, val] };
    });
  };

  // Estimation du nombre de variantes
  const differingCount = diffPreview ? diffPreview.changedCount : 6;
  let estimatedVariantsCount = 1;
  if (mode === 'AB_ABLATION') {
    if (includeLayer4FullFactorial) {
      estimatedVariantsCount = Math.pow(2, differingCount);
    } else {
      estimatedVariantsCount =
        2 +
        (includeLayer2SingleAdditions ? differingCount : 0) +
        (includeLayer3SingleAblations ? differingCount : 0);
    }
  } else {
    const structCount =
      nValues.length *
      qValues.length *
      aValues.length *
      xValues.length *
      nbRegenValues.length *
      diceModes.length;
    const swCount = SWITCH_KEYS.reduce(
      (acc, k) => acc * (sweepSwitches[k]?.length || 1),
      1
    );
    estimatedVariantsCount = structCount * swCount;
  }

  const selectedTables: TableConfig[] = DEFAULT_TABLE_CONFIGS.filter((t) =>
    selectedTableIds.includes(t.id)
  );

  const totalEstimatedGames =
    estimatedVariantsCount *
    Math.max(1, selectedTables.length) *
    gamesPerVariantAndTable;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaunching(true);
    try {
      const sweep: ParameterSweepInput = {
        nValues,
        qValues,
        aValues,
        xValues,
        stockAbatteusesValues: [null],
        modeTirageDesValues: diceModes,
        modeResolutionParcelleValues: ['TRANSACTION_FIGEE'],
        ordreCasseValues: ['AVANT_PARCELLE_1'],
        immobiliteReparationValues: [true],
        ordreMajTactiquesValues: ['ORDRE_PISTE_TAC'],
        rancuneTerrassementDegradeValues: [false],
        granulariteRancuneValues: ['PAR_CASE'],
        nbRegenerationValues: nbRegenValues,
        ruleNoTargetH1Values: sweepSwitches.ruleNoTargetH1 as any,
        ruleParryModeValues: sweepSwitches.ruleParryMode as any,
        rulePreventiveDestructionValues:
          sweepSwitches.rulePreventiveDestruction as any,
        ruleBulldozerTargetingValues:
          sweepSwitches.ruleBulldozerTargeting as any,
        ruleScrapyardExitValues: sweepSwitches.ruleScrapyardExit as any,
        ruleInitialSetupValues: sweepSwitches.ruleInitialSetup as any,
      };

      await onLaunchCampaign({
        name,
        type: mode,
        gamesPerVariantAndTable,
        baseSeed,
        sweep,
        selectedTableConfigs: selectedTables,
        includeCalibrationTables: true,
        ablationConfig:
          mode === 'AB_ABLATION' && edA && edB
            ? {
                editionAId: edA.id,
                editionBId: edB.id,
                editionASwitches: edA.switches,
                editionBSwitches: edB.switches,
                editionAName: edA.name,
                editionBName: edB.name,
                includeLayer2SingleAdditions,
                includeLayer3SingleAblations,
                includeLayer4FullFactorial,
              }
            : undefined,
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Choix du Mode de Campagne */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Configurateur de Test Croisé (Ablation A/B sur Graines Appariées) & Balayage de Variantes
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Évaluez la contribution nette de chacun des 6 interrupteurs mécaniques V1↔V2 sur les mêmes séquences de dés (Paired Seeds) ou balayez les paramètres structurels.
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setMode('AB_ABLATION');
                setName(
                  'Ablation Croisée Édition 1.0 vs Édition 2.0 (Graines Appariées)'
                );
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'AB_ABLATION'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <GitCompare className="w-3.5 h-3.5" />
              1. Test Croisé & Ablation A/B (Paired Seeds)
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('EVALUATION_SWEEP');
                setName('Balayage Paramétrique Multi-Variantes');
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                mode === 'EVALUATION_SWEEP'
                  ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              2. Balayage Paramétrique Libre
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
          <div className="md:col-span-1">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nom de la Campagne
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              required
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Parties par (Variante × Table)
            </label>
            <input
              type="number"
              min={10}
              max={2000}
              value={gamesPerVariantAndTable}
              onChange={(e) =>
                setGamesPerVariantAndTable(
                  Math.max(10, Number(e.target.value) || 50)
                )
              }
              className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Graine de Départ (Paired Base Seed)
            </label>
            <input
              type="number"
              value={baseSeed}
              onChange={(e) => setBaseSeed(Number(e.target.value) || 42000)}
              className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* MODE 1 : PROTOCOLE D'ABLATION CROISÉE SUR GRAINES APPARIÉES         */}
      {/* =================================================================== */}
      {mode === 'AB_ABLATION' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            Protocole d’Ablation Croisée entre l’Édition A (Base) et l’Édition B (Cible)
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Édition de Référence A (Point de départ)
              </label>
              <select
                value={editionAId}
                onChange={(e) => setEditionAId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
              >
                {editions.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.name} (v{ed.version})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Édition Cible B (Nouvelle proposition)
              </label>
              <select
                value={editionBId}
                onChange={(e) => setEditionBId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
              >
                {editions.map((ed) => (
                  <option key={ed.id} value={ed.id}>
                    {ed.name} (v{ed.version})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Couches d'ablation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs pt-2">
            <label className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLayer2SingleAdditions}
                onChange={(e) =>
                  setIncludeLayer2SingleAdditions(e.target.checked)
                }
                disabled={includeLayer4FullFactorial}
                className="mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Couche 2 — Ajout Unitaire (A + 1 règle de B)
                </div>
                <p className="text-slate-500 mt-0.5">
                  Active un seul interrupteur de B à la fois sur la base A pour mesurer quel changement isolé apporte le plus fort gain.
                </p>
              </div>
            </label>

            <label className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLayer3SingleAblations}
                onChange={(e) =>
                  setIncludeLayer3SingleAblations(e.target.checked)
                }
                disabled={includeLayer4FullFactorial}
                className="mt-0.5"
              />
              <div>
                <div className="font-bold text-slate-900 dark:text-slate-100">
                  Couche 3 — Ablation Unitaire (B − 1 règle de B)
                </div>
                <p className="text-slate-500 mt-0.5">
                  Retire un seul interrupteur de B à la fois pour identifier les règles indispensables vs cosmétiques.
                </p>
              </div>
            </label>

            <label className="p-3 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/30 dark:bg-emerald-950/20 flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeLayer4FullFactorial}
                onChange={(e) => setIncludeLayer4FullFactorial(e.target.checked)}
                className="mt-0.5"
              />
              <div>
                <div className="font-bold text-emerald-800 dark:text-emerald-300">
                  Couche 4 — Plan Factoriel Complet (2^k = {Math.pow(2, differingCount)} cocktails)
                </div>
                <p className="text-slate-500 mt-0.5">
                  Teste toutes les combinaisons hybrides possibles entre A et B pour extraire le Top 10 des « Cocktails Minimalistes ».
                </p>
              </div>
            </label>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODE 2 : BALAYAGE DES 6 INTERRUPTEURS EN MODE EVALUATION_SWEEP      */}
      {/* =================================================================== */}
      {mode === 'EVALUATION_SWEEP' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Sélection des 6 Interrupteurs Mécaniques (Cochez V1 et/ou V2 pour balayer)
              </h2>
              <p className="text-xs text-slate-500">
                Cochez les deux états d’un interrupteur pour inclure les deux variantes dans le produit cartésien.
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                onClick={() =>
                  setSweepSwitches({
                    ruleNoTargetH1: [V1_SWITCHES.ruleNoTargetH1],
                    ruleParryMode: [V1_SWITCHES.ruleParryMode],
                    rulePreventiveDestruction: [
                      V1_SWITCHES.rulePreventiveDestruction,
                    ],
                    ruleBulldozerTargeting: [V1_SWITCHES.ruleBulldozerTargeting],
                    ruleScrapyardExit: [V1_SWITCHES.ruleScrapyardExit],
                    ruleInitialSetup: [V1_SWITCHES.ruleInitialSetup],
                  })
                }
                className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 rounded"
              >
                Tout fixer en V1
              </button>
              <button
                type="button"
                onClick={() =>
                  setSweepSwitches({
                    ruleNoTargetH1: [V2_SWITCHES.ruleNoTargetH1],
                    ruleParryMode: [V2_SWITCHES.ruleParryMode],
                    rulePreventiveDestruction: [
                      V2_SWITCHES.rulePreventiveDestruction,
                    ],
                    ruleBulldozerTargeting: [V2_SWITCHES.ruleBulldozerTargeting],
                    ruleScrapyardExit: [V2_SWITCHES.ruleScrapyardExit],
                    ruleInitialSetup: [V2_SWITCHES.ruleInitialSetup],
                  })
                }
                className="px-2.5 py-1 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded"
              >
                Tout fixer en V2
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            {SWITCH_KEYS.map((key) => {
              const meta = SWITCH_META[key];
              const selected = sweepSwitches[key] || [];
              return (
                <div
                  key={key}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1.5"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {meta.title}
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(meta.v1Value)}
                      onChange={() => toggleSwitchSweepValue(key, meta.v1Value)}
                    />
                    <span>{meta.v1Label}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.includes(meta.v2Value)}
                      onChange={() => toggleSwitchSweepValue(key, meta.v2Value)}
                    />
                    <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {meta.v2Label}
                    </span>
                  </label>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Paramètres Structurels du Plateau */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Paramètres Structurels de Plateau (n, q, a, x, Régénération, Loi de Dés)
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de Joueurs / Secteurs (n)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[3, 4, 5, 6].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleNumberInList(nValues, setNValues, val)}
                  className={`px-3 py-1 font-mono rounded border ${
                    nValues.includes(val)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  n={val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Parcelles par Piste (q)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[5, 6, 7, 8].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleNumberInList(qValues, setQValues, val)}
                  className={`px-3 py-1 font-mono rounded border ${
                    qValues.includes(val)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  q={val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Arbres par Parcelle (a)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleNumberInList(aValues, setAValues, val)}
                  className={`px-3 py-1 font-mono rounded border ${
                    aValues.includes(val)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  a={val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nombre de Tours (x)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[6, 7, 8, 9, 10].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => toggleNumberInList(xValues, setXValues, val)}
                  className={`px-3 py-1 font-mono rounded border ${
                    xValues.includes(val)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  x={val}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Régénération Finale (NbRegeneration)
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2].map((val) => (
                <button
                  key={val}
                  type="button"
                  onClick={() =>
                    toggleNumberInList(nbRegenValues, setNbRegenValues, val)
                  }
                  className={`px-3 py-1 font-mono rounded border ${
                    nbRegenValues.includes(val)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  +{val} arbre/secteur
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="block font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Loi de Tirage des Dés
            </span>
            <div className="flex flex-wrap gap-1.5">
              {(['MIN_2D6', '1D6', 'MAX_2D6'] as DiceDrawMode[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => {
                    if (diceModes.includes(d)) {
                      if (diceModes.length > 1)
                        setDiceModes(diceModes.filter((m) => m !== d));
                    } else {
                      setDiceModes([...diceModes, d]);
                    }
                  }}
                  className={`px-2.5 py-1 font-mono rounded border ${
                    diceModes.includes(d)
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-slate-50 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Configurations de Tables de Bots (incluant BLIND_PROB pour l'Axe D) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
          Configurations de Tables de Bots (Incluant le Bot Aveugle Probabiliste pour l’Axe D)
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5 text-xs">
          {DEFAULT_TABLE_CONFIGS.map((table) => {
            const checked = selectedTableIds.includes(table.id);
            return (
              <label
                key={table.id}
                className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 flex items-start gap-2.5 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    if (checked) {
                      if (selectedTableIds.length > 1) {
                        setSelectedTableIds(
                          selectedTableIds.filter((id) => id !== table.id)
                        );
                      }
                    } else {
                      setSelectedTableIds([...selectedTableIds, table.id]);
                    }
                  }}
                  className="mt-0.5"
                />
                <div>
                  <div className="font-semibold text-slate-900 dark:text-slate-100">
                    {table.name}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {table.description}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Barre de lancement */}
      <div className="bg-emerald-950 text-white rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="text-xs space-y-0.5">
          <div className="font-bold text-sm">
            Prêt à lancer : {estimatedVariantsCount} variante(s) × {selectedTables.length} table(s) × {gamesPerVariantAndTable} parties ={' '}
            <span className="font-mono text-emerald-300">
              {totalEstimatedGames.toLocaleString('fr-FR')} parties sur Graines Appariées
            </span>
          </div>
          <div className="text-emerald-200/80">
            Calcul automatique des 5 Critères Principaux (/100), des 4 Axes Diagnostiques Complémentaires et des capteurs H1–H7b.
          </div>
        </div>

        <button
          type="submit"
          disabled={launching}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-md transition-colors"
        >
          <Play className="w-4 h-4" />
          {launching
            ? 'Démarrage en cours...'
            : 'Lancer la Campagne sur Graines Appariées'}
        </button>
      </div>
    </form>
  );
};

import React, { useState } from 'react';
import {
  BotProfileId,
  CampaignConfig,
  CellResolutionMode,
  DiceDrawMode,
  GrudgeGranularityMode,
  ParameterSweepInput,
  ScrapyardOrderMode,
  TableConfig,
  TacticUpdateOrderMode,
  ThemeVocabularyMode,
} from '../sim/types';
import { BOT_PROFILE_META, DEFAULT_TABLE_CONFIGS, DICTIONARIES } from '../sim/i18n';
import { expandParameterSweep } from '../sim/evaluator';
import { Play, Plus, RotateCcw } from 'lucide-react';

interface EvaluationBuilderViewProps {
  onLaunchCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  vocabulary: ThemeVocabularyMode;
}

const DEFAULT_SWEEP: ParameterSweepInput = {
  nValues: [4],
  qValues: [6],
  aValues: [2],
  xValues: [8],
  stockAbatteusesValues: [null],
  modeTirageDesValues: ['MIN_2D6'],
  modeResolutionParcelleValues: ['TRANSACTION_FIGEE'],
  ordreCasseValues: ['AVANT_PARCELLE_1'],
  immobiliteReparationValues: [true],
  ordreMajTactiquesValues: ['ORDRE_PISTE_TAC'],
  rancuneTerrassementDegradeValues: [false],
  granulariteRancuneValues: ['PAR_CASE'],
  nbRegenerationValues: [1],
};

function toggleArrayItem<T>(arr: T[], item: T): T[] {
  if (arr.includes(item)) {
    if (arr.length <= 1) return arr; // Toujours garder au moins 1 valeur
    return arr.filter((v) => v !== item);
  }
  return [...arr, item];
}

export const EvaluationBuilderView: React.FC<EvaluationBuilderViewProps> = ({
  onLaunchCampaign,
  vocabulary,
}) => {
  const dict = DICTIONARIES[vocabulary];

  const [campaignName, setCampaignName] = useState<string>(
    'Étude Multi-Variantes — Équilibrage Amazonia'
  );
  const [gamesPerVariant, setGamesPerVariant] = useState<number>(100);
  const [baseSeed, setBaseSeed] = useState<number>(50000);
  const [includeCalibration, setIncludeCalibration] = useState<boolean>(true);
  const [sweep, setSweep] = useState<ParameterSweepInput>(DEFAULT_SWEEP);

  const [availableTables, setAvailableTables] =
    useState<TableConfig[]>(DEFAULT_TABLE_CONFIGS);
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([
    'table_coop_n2',
    'table_strategist_n3',
    'table_selfish_n1',
    'table_mixed_heterogeneous',
    'table_omniscient',
  ]);

  // Constructeur de table personnalisée
  const [customTableName, setCustomTableName] = useState<string>(
    'Table Personnalisée (2 Stratèges + 2 Égoïstes)'
  );
  const [customSeats, setCustomSeats] = useState<BotProfileId[]>([
    'STRATEGIST',
    'STRATEGIST',
    'SELFISH',
    'SELFISH',
  ]);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const expandedVariants = expandParameterSweep(sweep);
  const selectedTables = availableTables.filter((t) =>
    selectedTableIds.includes(t.id)
  );
  const totalTablesPerVariant = includeCalibration
    ? Math.max(5, selectedTables.length + 2)
    : selectedTables.length;
  const estimatedTotalGames =
    expandedVariants.length * totalTablesPerVariant * gamesPerVariant;

  const applyPreset = (presetId: string) => {
    if (presetId === 'official') {
      setCampaignName('Étalonnage Règles Officielles (n=4, q=6, a=2, x=8)');
      setSweep(DEFAULT_SWEEP);
    } else if (presetId === 'player_scaling') {
      setCampaignName('Étude d’Échelle — Comparaison 3, 4, 5 et 6 Joueurs');
      setSweep({
        ...DEFAULT_SWEEP,
        nValues: [3, 4, 5, 6],
      });
    } else if (presetId === 'dice_and_grudge') {
      setCampaignName('Croisement Loi de Tirage (min 2d6 vs 1d6) × Granularité Rancune');
      setSweep({
        ...DEFAULT_SWEEP,
        modeTirageDesValues: ['MIN_2D6', '1D6'],
        granulariteRancuneValues: ['PAR_CASE', 'PAR_EVENEMENT', 'CARTE_ET_DESTRUCTION'],
      });
    } else if (presetId === 'resolution_and_regen') {
      setCampaignName('Comparaison Transaction Figée vs Séquentiel × Régénération (0, 1, 2)');
      setSweep({
        ...DEFAULT_SWEEP,
        modeResolutionParcelleValues: ['TRANSACTION_FIGEE', 'SEQUENTIEL'],
        nbRegenerationValues: [0, 1, 2],
      });
    }
  };

  const handleAddCustomTable = () => {
    if (!customTableName.trim()) return;
    const newId = `custom_table_${Date.now()}`;
    const newTable: TableConfig = {
      id: newId,
      name: customTableName.trim(),
      description: `Sièges : ${customSeats.join(', ')}`,
      botProfiles: [...customSeats],
    };
    setAvailableTables((prev) => [...prev, newTable]);
    setSelectedTableIds((prev) => [...prev, newId]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onLaunchCampaign({
        name: campaignName,
        type: 'EVALUATION_SWEEP',
        gamesPerVariantAndTable: gamesPerVariant,
        sweep,
        selectedTableConfigs: selectedTables,
        includeCalibrationTables: includeCalibration,
        baseSeed,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* En-tête et Préréglages Rapides d'Expérimentation */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Configurateur de Campagne d’Équilibrage Multi-Variantes
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sélectionnez une ou plusieurs valeurs par paramètre pour générer automatiquement une grille de variantes (produit cartésien) et évaluer les 4 critères.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => applyPreset('official')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Règles Officielles (1 var.)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('player_scaling')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Échelle 3 à 6 Joueurs (4 var.)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('dice_and_grudge')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Dés × Rancune (6 var.)
            </button>
            <button
              type="button"
              onClick={() => applyPreset('resolution_and_regen')}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0"
            >
              Résolution × Régénération (6 var.)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nom de la campagne
            </label>
            <input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Parties par variante & par table
            </label>
            <input
              type="number"
              min={10}
              max={5000}
              step={10}
              value={gamesPerVariant}
              onChange={(e) => setGamesPerVariant(Number(e.target.value) || 50)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Graine aléatoire initiale (Seed CRN)
            </label>
            <input
              type="number"
              value={baseSeed}
              onChange={(e) => setBaseSeed(Number(e.target.value) || 10000)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
        </div>
      </section>

      {/* Grille des 13 Paramètres Variabilisables */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              01. Variables du Moteur de Jeu (Section 3 de la Spécification)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Cliquez sur plusieurs valeurs d’un même paramètre pour les comparer au sein de la même campagne.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSweep(DEFAULT_SWEEP)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 rounded-md"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Réinitialiser aux valeurs par défaut
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Nombre de joueurs n */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              n — Nombre de joueurs / {dict['board.player.sector']}s (défaut : 4)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[3, 4, 5, 6].map((val) => {
                const active = sweep.nValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        nValues: toggleArrayItem(s.nValues, val),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    n = {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Nombre de parcelles q */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              q — {dict['board.player.cell']}s par piste hors Casse (défaut : 6)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[4, 5, 6, 7, 8].map((val) => {
                const active = sweep.qValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        qValues: toggleArrayItem(s.qValues, val),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    q = {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Arbres initiaux par parcelle a */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              a — Arbres debout initiaux par {dict['board.player.cell']} (défaut : 2)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3].map((val) => {
                const active = sweep.aValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        aValues: toggleArrayItem(s.aValues, val),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    a = {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Nombre de tours x */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              x — Nombre total de tours d’une partie (défaut : 8)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[6, 7, 8, 9, 10].map((val) => {
                const active = sweep.xValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        xValues: toggleArrayItem(s.xValues, val),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    x = {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 5. StockAbatteuses */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              StockAbatteuses — Limite matérielle en jeu (défaut : ∞)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {([null, 4, 6, 8, 10] as Array<number | null>).map((val) => {
                const active = sweep.stockAbatteusesValues.includes(val);
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        stockAbatteusesValues: toggleArrayItem(
                          s.stockAbatteusesValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val === null ? '∞ (Illimité)' : `Max ${val}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 6. ModeTirageDes */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              ModeTirageDes — Loi de tirage des tactiques (défaut : min(2d6))
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['MIN_2D6', '1D6', 'MAX_2D6'] as DiceDrawMode[]).map((val) => {
                const active = sweep.modeTirageDesValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        modeTirageDesValues: toggleArrayItem(
                          s.modeTirageDesValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 7. ModeResolutionParcelle */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              ModeResolutionParcelle — Évaluation Étape 3
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                ['TRANSACTION_FIGEE', 'SEQUENTIEL'] as CellResolutionMode[]
              ).map((val) => {
                const active = sweep.modeResolutionParcelleValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        modeResolutionParcelleValues: toggleArrayItem(
                          s.modeResolutionParcelleValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 8. GranulariteRancune */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              GranulariteRancune — Incrément sur {dict['board.villain.eye']}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  'PAR_CASE',
                  'PAR_EVENEMENT',
                  'CARTE_ET_DESTRUCTION',
                ] as GrudgeGranularityMode[]
              ).map((val) => {
                const active = sweep.granulariteRancuneValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        granulariteRancuneValues: toggleArrayItem(
                          s.granulariteRancuneValues,
                          val
                        ),
                      }))
                    }
                    className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 9. NbRegeneration */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              NbRegeneration — Souches régénérées / parcelle en fin de partie
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[0, 1, 2].map((val) => {
                const active = sweep.nbRegenerationValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        nbRegenerationValues: toggleArrayItem(
                          s.nbRegenerationValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono tabular-nums rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    +{val} arbre/parcelle
                  </button>
                );
              })}
            </div>
          </div>

          {/* 10. RancuneTerrassementDegrade */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              RancuneTerrassementDegrade — Rancune si D=1 face au Bulldozer (H5)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[false, true].map((val) => {
                const active =
                  sweep.rancuneTerrassementDegradeValues.includes(val);
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        rancuneTerrassementDegradeValues: toggleArrayItem(
                          s.rancuneTerrassementDegradeValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val ? 'Vrai (+Rancune)' : 'Faux (Règle H5)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 11. ImmobiliteReparation */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              ImmobiliteReparation — Immunité en Parcelle 1 après réparation (H4)
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[true, false].map((val) => {
                const active = sweep.immobiliteReparationValues.includes(val);
                return (
                  <button
                    key={String(val)}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        immobiliteReparationValues: toggleArrayItem(
                          s.immobiliteReparationValues,
                          val
                        ),
                      }))
                    }
                    className={`px-3 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val ? 'Vrai (Image figée H4)' : 'Faux (Destructible en p=1)'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 12. OrdreCasse & 13. OrdreMajTactiques */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
              OrdreCasse & OrdreMajTactiques
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(
                ['AVANT_PARCELLE_1', 'APRES_PARCELLE_Q'] as ScrapyardOrderMode[]
              ).map((val) => {
                const active = sweep.ordreCasseValues.includes(val);
                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() =>
                      setSweep((s) => ({
                        ...s,
                        ordreCasseValues: toggleArrayItem(
                          s.ordreCasseValues,
                          val
                        ),
                      }))
                    }
                    className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                      active
                        ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {val}
                  </button>
                );
              })}
              {(['ORDRE_PISTE_TAC', 'FIXE'] as TacticUpdateOrderMode[]).map(
                (val) => {
                  const active = sweep.ordreMajTactiquesValues.includes(val);
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() =>
                        setSweep((s) => ({
                          ...s,
                          ordreMajTactiquesValues: toggleArrayItem(
                            s.ordreMajTactiquesValues,
                            val
                          ),
                        }))
                      }
                      className={`px-2.5 py-1.5 text-xs font-mono rounded-md border transition-colors ${
                        active
                          ? 'bg-emerald-700 text-white border-emerald-700 font-semibold'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {val}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Configurations de Table et Profils de Bots */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              02. Configurations de Table & Profils Stratégiques des Bots
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sélectionnez les compositions d'équipes de joueurs virtuels à confronter sur chaque variante.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={includeCalibration}
              onChange={(e) => setIncludeCalibration(e.target.checked)}
              className="rounded border-slate-300 text-emerald-700 focus:ring-emerald-600"
            />
            <span>
              Inclure automatiquement les séries d'étalonnage (N0, N1, N2, N3, Omniscient) pour la précision des 4 critères
            </span>
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {availableTables.map((t) => {
            const checked = selectedTableIds.includes(t.id);
            return (
              <div
                key={t.id}
                onClick={() =>
                  setSelectedTableIds((prev) => toggleArrayItem(prev, t.id))
                }
                className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                  checked
                    ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-600 dark:border-emerald-600'
                    : 'bg-slate-50/50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {t.name}
                  </div>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {}}
                    className="mt-0.5 rounded border-slate-300 text-emerald-700"
                  />
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {t.description}
                </p>
                <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 mt-2">
                  Profils : [{t.botProfiles.join(', ')}]
                </div>
              </div>
            );
          })}
        </div>

        {/* Constructeur de Table Personnalisée */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Ajouter une configuration de table personnalisée (siège par siège)
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-end">
            <div className="lg:col-span-4">
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Nom de la table
              </label>
              <input
                type="text"
                value={customTableName}
                onChange={(e) => setCustomTableName(e.target.value)}
                className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            {[0, 1, 2, 3].map((seatIdx) => (
              <div key={seatIdx} className="lg:col-span-1.5">
                <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                  Joueur {seatIdx + 1}
                </label>
                <select
                  value={customSeats[seatIdx]}
                  onChange={(e) => {
                    const copy = [...customSeats];
                    copy[seatIdx] = e.target.value as BotProfileId;
                    setCustomSeats(copy);
                  }}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
                >
                  {(Object.keys(BOT_PROFILE_META) as BotProfileId[]).map((bId) => (
                    <option key={bId} value={bId}>
                      {BOT_PROFILE_META[bId].shortLabel}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <div className="lg:col-span-2">
              <button
                type="button"
                onClick={handleAddCustomTable}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter Table
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Résumé du Plan d'Expérience & Bouton de Lancement */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Synthèse de la campagne prête à démarrer
          </div>
          <div className="text-xs text-slate-600 dark:text-slate-400 font-mono tabular-nums">
            {expandedVariants.length} variante(s) × {selectedTables.length} table(s) sélectionnée(s) ×{' '}
            {gamesPerVariant} parties ≈{' '}
            <strong className="text-slate-900 dark:text-slate-100">
              {estimatedTotalGames.toLocaleString('fr-FR')} parties à simuler
            </strong>
          </div>
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Play className="w-4 h-4" />
          {submitting
            ? 'Démarrage en cours...'
            : 'Lancer la Campagne Multi-Variantes'}
        </button>
      </section>
    </form>
  );
};

import React, { useState } from 'react';
import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  ThemeVocabularyMode,
} from '../sim/types';
import { BOT_PROFILE_META, DEFAULT_TABLE_CONFIGS } from '../sim/i18n';
import { getJsonExportUrl, getMarkdownExportUrl } from '../api';
import {
  Play,
  Pause,
  Square,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface StressTestViewProps {
  campaigns: CampaignRecord[];
  selectedCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  onLaunchCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  onControlCampaign: (id: string, action: 'pause' | 'resume' | 'stop') => void;
  onInspectJournal: () => void;
  vocabulary: ThemeVocabularyMode;
}

export const StressTestView: React.FC<StressTestViewProps> = ({
  campaigns,
  selectedCampaign,
  onSelectCampaign,
  onLaunchCampaign,
  onControlCampaign,
  onInspectJournal,
}) => {
  const [stressName, setStressName] = useState<string>(
    'Exploration Intensive VM Oracle — Fuzzing Invariants & Cas Limites'
  );
  const [maxTotalGames, setMaxTotalGames] = useState<number>(50000);
  const [targetDurationMinutes, setTargetDurationMinutes] = useState<number>(60);
  const [useDurationLimit, setUseDurationLimit] = useState<boolean>(true);
  const [randomizeParams, setRandomizeParams] = useState<boolean>(true);
  const [baseSeed, setBaseSeed] = useState<number>(950000);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const stressCampaigns = campaigns.filter(
    (c) => c.config.type === 'ORACLE_STRESS_TEST'
  );
  const activeStress =
    selectedCampaign && selectedCampaign.config.type === 'ORACLE_STRESS_TEST'
      ? selectedCampaign
      : stressCampaigns[0] || null;

  const handleLaunchStress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await onLaunchCampaign({
        name: stressName,
        type: 'ORACLE_STRESS_TEST',
        maxTotalGames,
        targetDurationSeconds: useDurationLimit
          ? targetDurationMinutes * 60
          : null,
        randomizeParametersInStress: randomizeParams,
        baseSeed,
        selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
        includeCalibrationTables: true,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const st = activeStress?.stressTelemetry;
  const gDiv = Math.max(1, st?.totalGamesSimulated || 1);

  return (
    <div className="space-y-8">
      {/* Lancement d'une Nouvelle Campagne de Stress-Test Asynchrone (VM Oracle) */}
      <form
        onSubmit={handleLaunchStress}
        className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-5"
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Campagne de Vérification Exhaustive & Stress-Test Asynchrone (VM Oracle)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Exécute en tâche de fond sur le serveur Node.js des milliers ou millions de parties pour vérifier qu’aucune combinaison ne mène à une violation d’invariant, une boucle infinie ou une situation inextricable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setStressName('Vérification Rapide (5 000 parties)');
                setMaxTotalGames(5000);
                setUseDurationLimit(false);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              5 000 parties (~2s)
            </button>
            <button
              type="button"
              onClick={() => {
                setStressName('Exploration Intensive (100 000 parties)');
                setMaxTotalGames(100000);
                setUseDurationLimit(false);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              100 000 parties
            </button>
            <button
              type="button"
              onClick={() => {
                setStressName('Endurance VM Oracle — 2 Heures de Fuzzing Continu');
                setMaxTotalGames(50000000);
                setTargetDurationMinutes(120);
                setUseDurationLimit(true);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              Endurance 2 Heures (VM)
            </button>
            <button
              type="button"
              onClick={() => {
                setStressName('Nuit Complète VM Oracle — 8 Heures de Fuzzing Continu');
                setMaxTotalGames(200000000);
                setTargetDurationMinutes(480);
                setUseDurationLimit(true);
              }}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-md transition-colors whitespace-nowrap"
            >
              Endurance 8 Heures (VM)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Nom de la campagne de vérification
            </label>
            <input
              type="text"
              value={stressName}
              onChange={(e) => setStressName(e.target.value)}
              required
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Plafond du nombre de parties
            </label>
            <input
              type="number"
              min={500}
              max={500000000}
              step={1000}
              value={maxTotalGames}
              onChange={(e) => setMaxTotalGames(Number(e.target.value) || 10000)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Graine de départ (Seed)
            </label>
            <input
              type="number"
              value={baseSeed}
              onChange={(e) => setBaseSeed(Number(e.target.value) || 900000)}
              className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md"
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
          <div className="flex flex-wrap items-center gap-6 text-xs text-slate-700 dark:text-slate-300">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeParams}
                onChange={(e) => setRandomizeParams(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700"
              />
              <span>
                Fuzzing multi-paramètres aléatoire (explore n∈[3..6], q∈[4..8], a∈[1..3], x∈[6..10] et toutes les options de règles)
              </span>
            </label>

            <div className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={useDurationLimit}
                onChange={(e) => setUseDurationLimit(e.target.checked)}
                className="rounded border-slate-300 text-emerald-700"
              />
              <span>Durée max (min) :</span>
              <input
                type="number"
                min={1}
                max={1440}
                disabled={!useDurationLimit}
                value={targetDurationMinutes}
                onChange={(e) =>
                  setTargetDurationMinutes(Number(e.target.value) || 60)
                }
                className="w-20 px-2 py-1 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded disabled:opacity-50"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" />
            {submitting
              ? 'Démarrage...'
              : 'Démarrer le Stress-Test en Arrière-Plan'}
          </button>
        </div>
      </form>

      {/* Console de Supervision de la Campagne Stress-Test Active */}
      {activeStress && st && (
        <div className="space-y-6">
          <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Console de Supervision Temps Réel · Sauvegarde automatique JSON sur disque
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <select
                    value={activeStress.id}
                    onChange={(e) => onSelectCampaign(e.target.value)}
                    className="text-base font-semibold bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-1.5"
                  >
                    {stressCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.config.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {activeStress.status === 'RUNNING' && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'pause')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 whitespace-nowrap"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    Pause
                  </button>
                )}
                {activeStress.status === 'PAUSED' && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'resume')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-md hover:bg-emerald-100 whitespace-nowrap"
                  >
                    <Play className="w-3.5 h-3.5" />
                    Reprendre
                  </button>
                )}
                {(activeStress.status === 'RUNNING' ||
                  activeStress.status === 'PAUSED') && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'stop')}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 border border-slate-300 rounded-md hover:bg-slate-200 whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5" />
                    Arrêter et consolider
                  </button>
                )}
                <a
                  href={getMarkdownExportUrl(activeStress.id)}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Bilan IA (.md)
                </a>
                <a
                  href={getJsonExportUrl(activeStress.id)}
                  download
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5" />
                  JSON
                </a>
              </div>
            </div>

            {/* Grille des Compteurs d'Invariants et de Stabilité */}
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Parties vérifiées
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {st.totalGamesSimulated.toLocaleString('fr-FR')}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                  {st.gamesPerSecond.toFixed(0)} parties/s
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Invariants testés (I1–I4)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {st.invariantsVerifiedCount.toLocaleString('fr-FR')}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                  {st.totalTurnsSimulated.toLocaleString('fr-FR')} tours
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Violations de règle
                </div>
                <div
                  className={`text-xl font-bold font-mono tabular-nums mt-1 flex items-center gap-1.5 ${
                    st.violationsCount === 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {st.violationsCount === 0 ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <AlertTriangle className="w-5 h-5" />
                  )}
                  {st.violationsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  {st.violationsCount === 0
                    ? '100% conforme'
                    : 'Anomalie détectée'}
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Parties avec stagnation
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {st.stagnantGamesCount}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                  {((st.stagnantGamesCount / gDiv) * 100).toFixed(2)}% des parties
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Monopole Case 1 (100% t)
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {st.tacticMonopolyGamesCount}
                </div>
                <div className="text-[11px] font-mono tabular-nums text-slate-500 mt-0.5">
                  {((st.tacticMonopolyGamesCount / gDiv) * 100).toFixed(2)}% des parties
                </div>
              </div>

              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 rounded-md">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Défaites Bot Omniscient
                </div>
                <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100 mt-1">
                  {st.omniscientUnwinnableSeedsCount}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  Graines sans issue (&lt;50%)
                </div>
              </div>
            </div>
          </section>

          {/* Tableau de couverture des Cas Limites H1 à H7 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Couverture des Cas Limites & Règles d’Exception (Annexe H1 à H7)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Fréquence d’activation de chaque règle spécifique au cours du stress-test.
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Hypothèse</th>
                      <th className="py-2 px-3 font-medium">Description du cas limite</th>
                      <th className="py-2 px-3 font-medium text-right">Total</th>
                      <th className="py-2 pl-3 font-medium text-right">Moy. / Partie</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H1</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Tactique A1/A2/A3 sans cible éligible (ou Abatteuse en p=q)
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H1_noTargetEligible.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H1_noTargetEligible / gDiv).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H2</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Superposition ≥2 cartes Abattage sur 1 seul Arbre debout
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H2_multipleHarvesterCardsSingleTree.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H2_multipleHarvesterCardsSingleTree / gDiv).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H3</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Superposition ≥2 cartes Bulldozer sur un même emplacement
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H3_multipleBulldozerCardsSameCell.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H3_multipleBulldozerCardsSameCell / gDiv).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H4</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Bulldozer réparé en p=0 immunisé contre D≥3 en Parcelle 1
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H4_repairedBulldozerImmunityInCell1.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H4_repairedBulldozerImmunityInCell1 / gDiv).toFixed(3)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H5</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Terrassement dégradé (D=1 face au Bulldozer) sans Rancune
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H5_degradedBulldozerNoGrudge.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H5_degradedBulldozerNoGrudge / gDiv).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H6</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Multi-parades / destructions sur la même case (Rancune unitaire)
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H6_multiEventSameCellSingleGrudge.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H6_multiEventSameCellSingleGrudge / gDiv).toFixed(2)}
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2 pr-3 font-semibold text-slate-900 dark:text-slate-100">H7</td>
                      <td className="py-2 px-3 font-sans text-slate-600 dark:text-slate-300">
                        Destruction préventive de machine (D≥2 ou D≥3) sans carte Manœuvre
                      </td>
                      <td className="py-2 px-3 text-right">
                        {st.edgeCaseOccurrences.H7_preventiveDestructionNoCard.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-2 pl-3 text-right">
                        {(st.edgeCaseOccurrences.H7_preventiveDestructionNoCard / gDiv).toFixed(2)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Distribution par Profil de Bot */}
            <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Hiérarchie de Performance des 5 Profils de Bots
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Vérifie la croissance monotone du score de Aléatoire (N0) jusqu’à Omniscient (Borne Haute).
                  </p>
                </div>
                <button
                  onClick={onInspectJournal}
                  className="px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline whitespace-nowrap"
                >
                  Inspecter les traces ({st.capturedExtremeLogs.length})
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 pr-3 font-medium">Profil de Bot</th>
                      <th className="py-2 px-2 font-medium text-right">Parties</th>
                      <th className="py-2 px-2 font-medium text-right">Survie Moy.</th>
                      <th className="py-2 px-2 font-medium text-right">Min</th>
                      <th className="py-2 px-2 font-medium text-right">Max</th>
                      <th className="py-2 px-2 font-medium text-right">Miracle %</th>
                      <th className="py-2 pl-2 font-medium text-right">Défaite %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                    {(
                      [
                        'RANDOM',
                        'SELFISH',
                        'COOPERATIVE',
                        'STRATEGIST',
                        'OMNISCIENT',
                      ] as BotProfileId[]
                    ).map((bId) => {
                      const stat = st.scoreDistributionByBotLevel[bId];
                      if (!stat || stat.games === 0) return null;
                      return (
                        <tr key={bId}>
                          <td className="py-2.5 pr-3 font-sans font-medium text-slate-900 dark:text-slate-100">
                            {BOT_PROFILE_META[bId].shortLabel}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {stat.games.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2.5 px-2 text-right font-semibold text-emerald-700 dark:text-emerald-400">
                            {(stat.meanNormalized * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(stat.minNormalized * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(stat.maxNormalized * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {(stat.miracleRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 pl-2 text-right text-red-700 dark:text-red-400">
                            {(stat.defeatRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
};

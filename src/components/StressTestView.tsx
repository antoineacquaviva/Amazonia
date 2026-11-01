import React, { useState } from 'react';
import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  ThemeVocabularyMode,
} from '../sim/types';
import {
  BOT_PROFILE_META,
  DEFAULT_TABLE_CONFIGS,
  V2_SWITCHES,
} from '../sim/i18n';
import { getJsonExportUrl, getMarkdownExportUrl } from '../api';
import {
  AlertOctagon,
  CheckCircle2,
  Cpu,
  Download,
  Pause,
  Play,
  Square,
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
  const [name, setName] = useState(
    'Campagne Stress-Test VM Oracle — Exploration 64 Hybrides V1↔V2'
  );
  const [maxTotalGames, setMaxTotalGames] = useState<number>(25000);
  const [targetDurationMinutes, setTargetDurationMinutes] =
    useState<number>(30);
  const [randomizeParametersInStress, setRandomizeParametersInStress] =
    useState<boolean>(true);
  const [launching, setLaunching] = useState(false);

  const stressCampaigns = campaigns.filter(
    (c) => c.config.type === 'ORACLE_STRESS_TEST'
  );
  const activeStress =
    selectedCampaign?.config.type === 'ORACLE_STRESS_TEST'
      ? selectedCampaign
      : stressCampaigns[0] || selectedCampaign;

  const telemetry = activeStress?.stressTelemetry;

  const handleLaunchStress = async (e: React.FormEvent) => {
    e.preventDefault();
    setLaunching(true);
    try {
      await onLaunchCampaign({
        name,
        type: 'ORACLE_STRESS_TEST',
        maxTotalGames,
        targetDurationSeconds: targetDurationMinutes * 60,
        randomizeParametersInStress,
        baseSeed: Math.floor(Math.random() * 900000) + 100000,
        selectedTableConfigs: DEFAULT_TABLE_CONFIGS,
        sweep: {
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
          ruleNoTargetH1Values: [V2_SWITCHES.ruleNoTargetH1],
          ruleParryModeValues: [V2_SWITCHES.ruleParryMode],
          rulePreventiveDestructionValues: [
            V2_SWITCHES.rulePreventiveDestruction,
          ],
          ruleBulldozerTargetingValues: [V2_SWITCHES.ruleBulldozerTargeting],
          ruleScrapyardExitValues: [V2_SWITCHES.ruleScrapyardExit],
          ruleInitialSetupValues: [V2_SWITCHES.ruleInitialSetup],
        },
      });
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Lanceur de Stress-Test Asynchrone VM Oracle */}
      <form
        onSubmit={handleLaunchStress}
        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Superviseur de Stress-Test Longue Durée (VM Oracle) & Traqueur d’Invariants I1–I4
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Explore en arrière-plan des dizaines de milliers de parties sur les 64 combinaisons d’interrupteurs V1↔V2 (en excluant MAX_2D6 du tirage aléatoire par défaut).
            </p>
          </div>
          <Cpu className="w-6 h-6 text-emerald-600" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="md:col-span-2">
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Nom de la Session Stress-Test
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
              Cible max de parties
            </label>
            <input
              type="number"
              min={500}
              max={1000000}
              step={500}
              value={maxTotalGames}
              onChange={(e) => setMaxTotalGames(Number(e.target.value) || 10000)}
              className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Durée max (minutes)
            </label>
            <input
              type="number"
              min={1}
              max={720}
              value={targetDurationMinutes}
              onChange={(e) =>
                setTargetDurationMinutes(Number(e.target.value) || 30)
              }
              className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={randomizeParametersInStress}
              onChange={(e) =>
                setRandomizeParametersInStress(e.target.checked)
              }
            />
            <span className="text-slate-700 dark:text-slate-300">
              Varier aléatoirement (n, q, a, x) et les 6 interrupteurs V1↔V2 à chaque partie (MAX_2D6 exclu conformément à la spécification v2.0)
            </span>
          </label>

          <button
            type="submit"
            disabled={launching}
            className="inline-flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md"
          >
            <Play className="w-3.5 h-3.5" />
            {launching ? 'Lancement...' : 'Démarrer le Stress-Test en Arrière-Plan'}
          </button>
        </div>
      </form>

      {/* Télémétrie de la campagne sélectionnée */}
      {activeStress && telemetry && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-500">
                  Session inspectée :
                </span>
                <select
                  value={activeStress.id}
                  onChange={(e) => onSelectCampaign(e.target.value)}
                  className="px-3 py-1.5 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.config.name} ({c.status} · {c.progress.completedGames} parties)
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {activeStress.status === 'RUNNING' && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'pause')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-100 text-amber-800 rounded"
                  >
                    <Pause className="w-3.5 h-3.5" /> Pause
                  </button>
                )}
                {activeStress.status === 'PAUSED' && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'resume')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded"
                  >
                    <Play className="w-3.5 h-3.5" /> Reprendre
                  </button>
                )}
                {(activeStress.status === 'RUNNING' ||
                  activeStress.status === 'PAUSED') && (
                  <button
                    onClick={() => onControlCampaign(activeStress.id, 'stop')}
                    className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-800 rounded"
                  >
                    <Square className="w-3.5 h-3.5" /> Arrêter
                  </button>
                )}
                <a
                  href={getMarkdownExportUrl(activeStress.id)}
                  download
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-white bg-emerald-700 rounded"
                >
                  <Download className="w-3.5 h-3.5" /> Export .md
                </a>
                <a
                  href={getJsonExportUrl(activeStress.id)}
                  download
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded"
                >
                  <Download className="w-3.5 h-3.5" /> .json
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono tabular-nums">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-sans text-slate-500">
                  Parties Simulées
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {telemetry.totalGamesSimulated.toLocaleString('fr-FR')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-sans text-slate-500">
                  Cadence Moyenne
                </div>
                <div className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                  {telemetry.gamesPerSecond.toFixed(1)} p/s
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-sans text-slate-500">
                  Invariants Vérifiés
                </div>
                <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {telemetry.invariantsVerifiedCount.toLocaleString('fr-FR')}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-sans text-slate-500">
                  Violations (I1–I4)
                </div>
                <div
                  className={`text-lg font-bold ${
                    telemetry.violationsCount === 0
                      ? 'text-emerald-600'
                      : 'text-red-600'
                  }`}
                >
                  {telemetry.violationsCount}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                <div className="text-[11px] font-sans text-slate-500">
                  Stagnations / Monopoles
                </div>
                <div className="text-lg font-bold text-amber-600">
                  {telemetry.stagnantGamesCount} / {telemetry.tacticMonopolyGamesCount}
                </div>
              </div>
            </div>
          </div>

          {/* Journal détaillé des Violations d'Invariants (si > 0) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Traqueur Détaillé de Violations des Invariants (I1 Conservation Arbres, I2 Bornes Machines, I3 Permutation Cerveau, I4 Légalité Défenseurs)
              </h2>
              {telemetry.violationsCount === 0 ? (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="w-4 h-4" /> Aucune violation détectée
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                  <AlertOctagon className="w-4 h-4" /> {telemetry.violationsCount} violation(s) enregistrée(s)
                </span>
              )}
            </div>

            {telemetry.violationsLog.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <th className="py-2 px-3">Code Invariant</th>
                      <th className="py-2 px-2">Seed</th>
                      <th className="py-2 px-2">Tour / Phase</th>
                      <th className="py-2 px-3">Message & Diagnostic</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {telemetry.violationsLog.map((v, i) => (
                      <tr key={i} className="bg-red-50/40 dark:bg-red-950/20">
                        <td className="py-2 px-3 font-bold text-red-700 dark:text-red-400">
                          {v.code}
                        </td>
                        <td className="py-2 px-2">#{v.seed}</td>
                        <td className="py-2 px-2">
                          T{v.turn} · {v.phase}
                        </td>
                        <td className="py-2 px-3 font-sans">{v.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Distribution par Niveau de Bot (incluant BLIND_PROB) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Performance Comparée des 6 Profils de Bots en Stress-Test
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                    <th className="py-2 px-4">Profil de Bot</th>
                    <th className="py-2 px-3 text-right">Parties</th>
                    <th className="py-2 px-3 text-right">Survie Moyenne</th>
                    <th className="py-2 px-3 text-right">% Défaites (&lt;50%)</th>
                    <th className="py-2 px-3 text-right">% Miracles (100%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                  {(Object.keys(BOT_PROFILE_META) as BotProfileId[]).map(
                    (botId) => {
                      const row = telemetry.scoreDistributionByBotLevel[botId];
                      if (!row) return null;
                      return (
                        <tr key={botId}>
                          <td className="py-2.5 px-4 font-sans font-semibold text-slate-900 dark:text-slate-100">
                            {BOT_PROFILE_META[botId].label}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {row.games.toLocaleString('fr-FR')}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                            {(row.meanNormalized * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {(row.defeatRate * 100).toFixed(1)}%
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {(row.miracleRate * 100).toFixed(1)}%
                          </td>
                        </tr>
                      );
                    }
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Journaux extrêmes capturés */}
          {telemetry.capturedExtremeLogs.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Parties Extrêmes Capturées ({telemetry.capturedExtremeLogs.length})
                </h2>
                <button
                  onClick={onInspectJournal}
                  className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                >
                  Ouvrir l’inspecteur de journaux →
                </button>
              </div>
              <div className="space-y-2">
                {telemetry.capturedExtremeLogs.slice(0, 6).map((log, i) => (
                  <div
                    key={i}
                    className="p-3 rounded border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-xs flex items-center justify-between gap-4"
                  >
                    <div>
                      <span className="font-mono font-bold text-amber-700 dark:text-amber-400">
                        [{log.category}] Seed #{log.seed}
                      </span>{' '}
                      — <span>{log.summary}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

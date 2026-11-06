import React, { useMemo, useState } from 'react';
import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
} from '../sim/types';
import {
  BOT_PROFILE_META,
  DEFAULT_SWEEP_INPUT,
} from '../sim/i18n';
import {
  downloadCampaignJson,
  downloadCampaignMarkdown,
} from '../api';

interface StressTestViewProps {
  campaigns: CampaignRecord[];
  activeCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  onStartCampaign: (config: Partial<CampaignConfig>) => Promise<void>;
  onControlCampaign: (id: string, action: 'pause' | 'resume' | 'stop') => void;
  onDeleteCampaign: (id: string) => void;
  isSubmitting: boolean;
}

export const StressTestView: React.FC<StressTestViewProps> = ({
  campaigns,
  activeCampaign,
  onSelectCampaign,
  onStartCampaign,
  onControlCampaign,
  onDeleteCampaign,
  isSubmitting,
}) => {
  const [maxGames, setMaxGames] = useState<number>(100000);
  const [randomizeParams, setRandomizeParams] = useState<boolean>(true);
  const [selectedLogIdx, setSelectedLogIdx] = useState<number>(0);

  const stressCampaigns = useMemo(
    () => campaigns.filter((c) => c.config.type === 'ORACLE_STRESS_TEST'),
    [campaigns]
  );

  const currentStress = useMemo(() => {
    if (activeCampaign && activeCampaign.config.type === 'ORACLE_STRESS_TEST') {
      return activeCampaign;
    }
    return stressCampaigns[0] || null;
  }, [activeCampaign, stressCampaigns]);

  const handleLaunchStress = async () => {
    await onStartCampaign({
      name: `Stress-Test Multi-Cœurs v3.3 (${maxGames.toLocaleString('fr-FR')} parties)`,
      type: 'ORACLE_STRESS_TEST',
      maxTotalGames: maxGames,
      randomizeParametersInStress: randomizeParams,
      sweep: DEFAULT_SWEEP_INPUT,
      baseSeed: Math.floor(Math.random() * 900000) + 100000,
    });
  };

  const telemetry = currentStress?.stressTelemetry;
  const botKeys: BotProfileId[] = [
    'BLIND',
    'PROB_ONLY',
    'SOLO_INFORMED',
    'COORD_NO_DICE',
    'COORD_ONE_SHOT',
    'COORD_HYBRID',
    'OMNISCIENT',
  ];

  return (
    <div className="space-y-6">
      {/* Lancement d'un Stress-Test */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Stress-Test Multi-Cœurs v3.3 & Vérificateur d'Invariants (I1..I4)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Exécute des centaines de milliers de parties en parallèle sur les workers de la VM Oracle avec fuzzing des leviers v3.3 (Cap, Shift, SynergieHS, Bull0, StumpC2, Piste) et comparaison des 7 profils d'IA.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Volume :
              </label>
              <select
                value={maxGames}
                onChange={(e) => setMaxGames(Number(e.target.value))}
                className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                <option value={25000}>25 000 parties</option>
                <option value={100000}>100 000 parties</option>
                <option value={250000}>250 000 parties</option>
                <option value={500000}>500 000 parties</option>
                <option value={1000000}>1 000 000 parties</option>
              </select>
            </div>

            <label className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={randomizeParams}
                onChange={(e) => setRandomizeParams(e.target.checked)}
                className="rounded border-slate-300"
              />
              Fuzzing aléatoire (N, X, a, Cap, Shift, Bull0, Piste)
            </label>

            <button
              onClick={handleLaunchStress}
              disabled={isSubmitting}
              className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 text-white text-xs font-semibold rounded cursor-pointer"
            >
              {isSubmitting ? 'Lancement...' : 'Lancer Stress-Test VM'}
            </button>
          </div>
        </div>
      </div>

      {!currentStress || !telemetry ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-10 text-center">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Aucun Stress-Test enregistré. Cliquez sur « Lancer Stress-Test VM » ci-dessus pour démarrer la vérification.
          </p>
        </div>
      ) : (
        <>
          {/* Barre d'état du Stress-Test actif */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <select
                    value={currentStress.id}
                    onChange={(e) => onSelectCampaign(e.target.value)}
                    className="bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-3 py-1 text-xs font-semibold"
                  >
                    {stressCampaigns.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.config.name} ({c.status})
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                  {currentStress.progress.currentPhaseLabel}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {currentStress.status === 'RUNNING' && (
                  <button
                    onClick={() => onControlCampaign(currentStress.id, 'pause')}
                    className="px-3 py-1 text-xs font-medium bg-amber-600 text-white rounded cursor-pointer"
                  >
                    Pause
                  </button>
                )}
                {currentStress.status === 'PAUSED' && (
                  <button
                    onClick={() => onControlCampaign(currentStress.id, 'resume')}
                    className="px-3 py-1 text-xs font-medium bg-emerald-700 text-white rounded cursor-pointer"
                  >
                    Reprendre
                  </button>
                )}
                {(currentStress.status === 'RUNNING' ||
                  currentStress.status === 'PAUSED') && (
                  <button
                    onClick={() => onControlCampaign(currentStress.id, 'stop')}
                    className="px-3 py-1 text-xs font-medium bg-rose-700 text-white rounded cursor-pointer"
                  >
                    Arrêter
                  </button>
                )}
                <button
                  onClick={() => downloadCampaignMarkdown(currentStress)}
                  className="px-3 py-1 text-xs font-medium border border-emerald-700 text-emerald-800 dark:text-emerald-300 rounded cursor-pointer"
                >
                  Export Markdown
                </button>
                <button
                  onClick={() => downloadCampaignJson(currentStress)}
                  className="px-3 py-1 text-xs font-medium border border-slate-300 dark:border-slate-700 rounded cursor-pointer"
                >
                  Export JSON
                </button>
                <button
                  onClick={() => onDeleteCampaign(currentStress.id)}
                  className="px-2.5 py-1 text-xs text-rose-600 hover:underline cursor-pointer"
                >
                  Supprimer
                </button>
              </div>
            </div>

            {/* Compteurs principaux */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 tabular-nums">
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Parties simulées</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {telemetry.totalGamesSimulated.toLocaleString('fr-FR')}
                </div>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Vélocité multi-cœurs</div>
                <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {telemetry.gamesPerSecond.toFixed(0)} p/s
                </div>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Assertions I1..I4 vérifiées</div>
                <div className="text-lg font-bold font-mono text-slate-900 dark:text-slate-100">
                  {telemetry.invariantsVerifiedCount.toLocaleString('fr-FR')}
                </div>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Violations d'Invariants</div>
                <div
                  className={`text-lg font-bold font-mono ${
                    telemetry.violationsCount === 0
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-rose-600'
                  }`}
                >
                  {telemetry.violationsCount}
                </div>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Explosions observées</div>
                <div className="text-lg font-bold font-mono text-rose-700 dark:text-rose-400">
                  {telemetry.totalExplosionsObserved.toLocaleString('fr-FR')}
                </div>
              </div>
              <div className="p-3 rounded bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                <div className="text-[11px] text-slate-500">Pièges & Sabotages posés</div>
                <div className="text-lg font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {telemetry.totalTrapsAndSabotagesObserved.toLocaleString('fr-FR')}
                </div>
              </div>
            </div>
          </div>

          {/* Distribution par niveau de Bot */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
              Performance Comparée des 4 Profils Gradués de Bots sous Stress-Test
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs tabular-nums">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-2 px-3">Profil de Bot</th>
                    <th className="py-2 px-3 text-right">Parties</th>
                    <th className="py-2 px-3 text-right">Survie Moyenne</th>
                    <th className="py-2 px-3 text-right">Arbres Perdus Moy.</th>
                    <th className="py-2 px-3 text-right">Explosions / Partie</th>
                    <th className="py-2 px-3 text-right">Taux Miracle (≥85%)</th>
                    <th className="py-2 px-3 text-right">Taux Défaite (&lt;45%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {botKeys.map((bKey) => {
                    const st = telemetry.scoreDistributionByBotLevel[bKey];
                    if (!st) return null;
                    return (
                      <tr key={bKey}>
                        <td className="py-2.5 px-3 font-semibold text-slate-900 dark:text-slate-100">
                          {BOT_PROFILE_META[bKey].name}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {st.games.toLocaleString('fr-FR')}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 dark:text-emerald-400">
                          {(st.meanSurvivalHorizon * 100).toFixed(1)} %
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {st.meanTreesLost.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {st.meanExplosions.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-emerald-700 dark:text-emerald-400">
                          {(st.miracleRate * 100).toFixed(1)} %
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-rose-700 dark:text-rose-400">
                          {(st.defeatRate * 100).toFixed(1)} %
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Parties extrêmes capturées avec Combat Log */}
          {telemetry.capturedExtremeLogs.length > 0 && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                Parties Extrêmes Capturées ({telemetry.capturedExtremeLogs.length})
              </h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {telemetry.capturedExtremeLogs.map((log, idx) => (
                  <button
                    key={`${log.seed}-${idx}`}
                    onClick={() => setSelectedLogIdx(idx)}
                    className={`px-3 py-1.5 text-xs font-mono rounded border cursor-pointer ${
                      selectedLogIdx === idx
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                    }`}
                  >
                    #{log.seed} · {log.category}
                  </button>
                ))}
              </div>

              {telemetry.capturedExtremeLogs[selectedLogIdx] && (
                <div>
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                    {telemetry.capturedExtremeLogs[selectedLogIdx].summary}
                  </div>
                  <pre className="p-4 rounded bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-96 leading-relaxed">
                    {telemetry.capturedExtremeLogs[selectedLogIdx].textualJournal ||
                      'Journal détaillé disponible via le simulateur unitaire.'}
                  </pre>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

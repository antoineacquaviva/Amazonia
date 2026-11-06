import React, { useEffect, useState } from 'react';
import {
  BotProfileId,
  BulldozerZeroStumpAction,
  CampaignRecord,
  CombatThresholdShift,
  ParryHsRule,
  SimulationConfig,
  SingleGameResult,
  TacticalDefenderCap,
  TacticsTrackPreset,
} from '../sim/types';
import {
  BOT_PROFILE_META,
  computeEvilEyeProbabilities,
  DEFAULT_SIMULATION_CONFIG,
  MASTER_MATRIX_6X6,
  PARRY_HS_RULE_META,
  resolveTargetPlayerRank1Based,
  TACTIC_META,
  TACTICS_TRACK_PRESETS,
} from '../sim/i18n';
import { simulateSingleGameTrace } from '../api';

interface JournalsAndExportViewProps {
  activeCampaign: CampaignRecord | null;
}

export const JournalsAndExportView: React.FC<JournalsAndExportViewProps> = ({
  activeCampaign: _activeCampaign,
}) => {
  const [seed, setSeed] = useState<number>(42001);
  const [numPlayers, setNumPlayers] = useState<number>(4);
  const [numTurns, setNumTurns] = useState<number>(8);
  const [initialTrees, setInitialTrees] = useState<number>(2);
  const [tacticalCap, setTacticalCap] = useState<TacticalDefenderCap>(2);
  const [combatShift, setCombatShift] = useState<CombatThresholdShift>(0);
  const [parryHsRule, setParryHsRule] = useState<ParryHsRule>('SYNERGY_TRAP_SAB');
  const [bullZeroAction, setBullZeroAction] = useState<BulldozerZeroStumpAction>('DESTROY_TREE');
  const [initialStumpC2, setInitialStumpC2] = useState<boolean>(true);
  const [trackPreset, setTrackPreset] = useState<TacticsTrackPreset>('ASSAULT_LOW');
  const [botProfile, setBotProfile] = useState<BotProfileId>('COORD_HYBRID');

  const [simResult, setSimResult] = useState<SingleGameResult | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [matrixPlayersPreview, setMatrixPlayersPreview] = useState<number>(4);

  const runSimulation = async () => {
    setLoading(true);
    try {
      const params: SimulationConfig = {
        ...DEFAULT_SIMULATION_CONFIG,
        numPlayers,
        numTurns,
        initialTreesPerCell: initialTrees,
        tacticsTrackPreset: trackPreset,
        tacticsTrackSetup: [...TACTICS_TRACK_PRESETS[trackPreset].setup],
        tacticalDefenderCap: tacticalCap,
        combatThresholdShift: combatShift,
        parryHsRule,
        bulldozerZeroStumpAction: bullZeroAction,
        initialStumpCell2: initialStumpC2,
        initialMachinesState: undefined,
      };
      const res = await simulateSingleGameTrace({
        seed,
        params,
        botProfiles: [botProfile],
      });
      setSimResult(res);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void runSimulation();
  }, []);

  const eyeProbs = computeEvilEyeProbabilities(matrixPlayersPreview);
  const min2D6Odds = [
    { m: 1, cases: 11, pct: (11 / 36) * 100 },
    { m: 2, cases: 9, pct: (9 / 36) * 100 },
    { m: 3, cases: 7, pct: (7 / 36) * 100 },
    { m: 4, cases: 5, pct: (5 / 36) * 100 },
    { m: 5, cases: 3, pct: (3 / 36) * 100 },
    { m: 6, cases: 1, pct: (1 / 36) * 100 },
  ];

  const activeTrackCards = TACTICS_TRACK_PRESETS[trackPreset].setup;

  return (
    <div className="space-y-6">
      {/* SECTION 1 : SIMULATEUR UNITAIRE & COMBAT LOG COMPLET v3.3 */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              1. Inspecteur de Partie Unitaire & Journal de Combat (« Combat Log » v3.3)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Simulez une graine précise avec les 7 profils gradués (Aveugle, Probabiliste I2, Solo, Coord Sans Dé, Coord 1-Passe, Coord Révisable 2.2, Omniscient) et la règle Synergie Mise HS.
            </p>
          </div>

          <button
            onClick={() => void runSimulation()}
            disabled={loading}
            className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded cursor-pointer"
          >
            {loading ? 'Simulation...' : 'Exécuter & Générer le Combat Log'}
          </button>
        </div>

        {/* Contrôles rapides de la partie unitaire */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Graine (Seed)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 1)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Joueurs (N)
            </label>
            <select
              value={numPlayers}
              onChange={(e) => setNumPlayers(Number(e.target.value))}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              {[3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  N = {n}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Tours (X)
            </label>
            <input
              type="number"
              min={1}
              max={20}
              value={numTurns}
              onChange={(e) => setNumTurns(Math.max(1, Number(e.target.value) || 8))}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Arbres/Case (a)
            </label>
            <select
              value={initialTrees}
              onChange={(e) => setInitialTrees(Number(e.target.value) || 2)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value={2}>a = 2 (Figé v3.3)</option>
              <option value={3}>a = 3</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Profil Gradué de Bot (1..7)
            </label>
            <select
              value={botProfile}
              onChange={(e) => setBotProfile(e.target.value as BotProfileId)}
              className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              {(
                [
                  'COORD_HYBRID',
                  'COORD_ONE_SHOT',
                  'COORD_NO_DICE',
                  'SOLO_INFORMED',
                  'PROB_ONLY',
                  'BLIND',
                  'OMNISCIENT',
                ] as const
              ).map((b) => (
                <option key={b} value={b}>
                  {BOT_PROFILE_META[b].shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Contrôles des leviers v3.3 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 mt-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Règle Mise HS (v3.3)
            </label>
            <select
              value={parryHsRule}
              onChange={(e) => setParryHsRule(e.target.value as ParryHsRule)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-400 dark:border-emerald-700 rounded"
            >
              <option value="SYNERGY_TRAP_SAB">
                {PARRY_HS_RULE_META.SYNERGY_TRAP_SAB.shortLabel}
              </option>
              <option value="STANDARD_S3">
                {PARRY_HS_RULE_META.STANDARD_S3.shortLabel}
              </option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Plafond Tactique (Cap)
            </label>
            <select
              value={tacticalCap}
              onChange={(e) => setTacticalCap(Number(e.target.value) as TacticalDefenderCap)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value={99}>Cap = 99 (Illimité)</option>
              <option value={2}>Cap = 2 (Max 2/case)</option>
              <option value={1}>Cap = 1 (Max 1/case)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Durcissement Seuils (Shift)
            </label>
            <select
              value={combatShift}
              onChange={(e) => setCombatShift(Number(e.target.value) as CombatThresholdShift)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value={0}>Shift +0 (Seuils 1/2/3)</option>
              <option value={1}>Shift +1 (Seuils 2/3/4)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Bulldozer 0 Souche (Bull0)
            </label>
            <select
              value={bullZeroAction}
              onChange={(e) =>
                setBullZeroAction(e.target.value as BulldozerZeroStumpAction)
              }
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value="DESTROY_TREE">DESTROY_TREE (-1 Arbre)</option>
              <option value="NONE">NONE (Aucun effet)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
              Preset Piste des Tactiques
            </label>
            <select
              value={trackPreset}
              onChange={(e) => setTrackPreset(e.target.value as TacticsTrackPreset)}
              className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value="ASSAULT_LOW">ASSAULT_LOW [A1,B1,A2,B2,A3,B3]</option>
              <option value="ASSAULT_HIGH">ASSAULT_HIGH [A3,B3,A2,B2,A1,B1]</option>
            </select>
          </div>

          <div className="flex items-end">
            <label className="w-full flex items-center justify-between px-3 py-1.5 rounded border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer text-xs">
              <span className="font-medium text-slate-800 dark:text-slate-200">
                Souche C2 J1/J2 (<code>StumpC2</code>)
              </span>
              <input
                type="checkbox"
                checked={initialStumpC2}
                onChange={(e) => setInitialStumpC2(e.target.checked)}
                className="rounded border-slate-300 ml-2"
              />
            </label>
          </div>
        </div>

        {/* Résumé chiffré + Journal de Combat */}
        {simResult && (
          <div className="mt-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5 text-xs tabular-nums">
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Survie Horizon</div>
                <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {(simResult.survivalRateHorizon * 100).toFixed(1)} %
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Arbres Perdus</div>
                <div className="text-sm font-bold font-mono text-rose-700 dark:text-rose-400">
                  {simResult.totalTreesLost} / {simResult.referenceHorizonTrees}
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Parades / Mises HS</div>
                <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {simResult.simpleParriesCount} / {simResult.parryAndHSCount}
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Révisions 2.2 / Signaux</div>
                <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {simResult.step2RevisionsCount} rév. / {simResult.successfulSignalCompletionsCount} sig.
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Pertinence des Choix</div>
                <div className="text-sm font-bold font-mono text-sky-700 dark:text-sky-400">
                  {(simResult.placementRelevanceScore * 100).toFixed(1)} %
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Furt. Orpheline / Overkill</div>
                <div className="text-sm font-bold font-mono text-amber-700 dark:text-amber-400">
                  {simResult.orphanStealthTokensCount} / {simResult.tacticalOverkillTokensCount}
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Pièges / Sabotages</div>
                <div className="text-sm font-bold font-mono text-emerald-700 dark:text-emerald-400">
                  {simResult.trapsPlacedCount}P / {simResult.sabotagesPlacedCount}S
                </div>
              </div>
              <div className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <div className="text-[11px] text-slate-500">Réparations (Act. 3.1)</div>
                <div className="text-sm font-bold font-mono text-sky-700 dark:text-sky-400">
                  {simResult.repairsCount} ({simResult.activeRepairsStep31Count})
                </div>
              </div>
            </div>

            <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-[520px] leading-relaxed border border-slate-800">
              {simResult.textualJournal}
            </pre>
          </div>
        )}
      </div>

      {/* SECTION 2 : MATRICE MAÎTRESSE 2D6 (6x6) & RÉFÉRENCE DES 6 TACTIQUES */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              2. Référence Formelle : Matrice Maîtresse 2D6 (6 × 6) & Piste des Tactiques
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Chaque cellule indique les 4 valeurs <code>[A] / [B] / [C] / [D]</code> correspondant à N=3, 4, 5, 6 joueurs, ainsi que la Tactique M = min(d1, d2).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-600 dark:text-slate-400">
              Mettre en évidence pour :
            </span>
            {[3, 4, 5, 6].map((n) => (
              <button
                key={n}
                onClick={() => setMatrixPlayersPreview(n)}
                className={`px-2.5 py-1 text-xs font-mono font-semibold rounded border cursor-pointer ${
                  matrixPlayersPreview === n
                    ? 'bg-emerald-700 text-white border-emerald-700'
                    : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                N={n} ([{n === 3 ? 'A' : n === 4 ? 'B' : n === 5 ? 'C' : 'D'}])
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto mb-6">
          <table className="w-full border-collapse text-xs font-mono">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                <th className="border border-slate-300 dark:border-slate-700 p-2 text-left">
                  d1 (Majeur) \ d2 (Mineur)
                </th>
                {[1, 2, 3, 4, 5, 6].map((d2) => (
                  <th
                    key={d2}
                    className="border border-slate-300 dark:border-slate-700 p-2 text-center"
                  >
                    Colonne d2 = {d2}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6].map((d1) => (
                <tr key={d1}>
                  <td className="border border-slate-300 dark:border-slate-700 p-2 font-bold bg-slate-50 dark:bg-slate-800/60">
                    Ligne d1 = {d1}
                  </td>
                  {[1, 2, 3, 4, 5, 6].map((d2) => {
                    const symbol = MASTER_MATRIX_6X6[d1 - 1][d2 - 1];
                    const activePlayer = resolveTargetPlayerRank1Based(
                      d1,
                      d2,
                      matrixPlayersPreview
                    );
                    const mVal = Math.min(d1, d2);
                    return (
                      <td
                        key={d2}
                        className="border border-slate-300 dark:border-slate-700 p-2 text-center"
                      >
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Symbole Matrice : <strong>{symbol}</strong>
                        </div>
                        <div className="mt-1 font-bold text-emerald-700 dark:text-emerald-400">
                          Cible J{activePlayer} · M={mVal}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Probabilités exactes */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Distribution sur l'Œil du Malfaiteur pour N = {matrixPlayersPreview} joueurs
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums text-xs">
              {eyeProbs.map((ep) => (
                <div
                  key={ep.rank}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    Joueur J{ep.rank}
                  </div>
                  <div className="font-mono text-emerald-700 dark:text-emerald-400">
                    {ep.casesOn36} / 36 ({(ep.probability * 100).toFixed(2)} %)
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Distribution de la Piste des Tactiques M = min(d1, d2) ({trackPreset})
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 tabular-nums text-xs">
              {min2D6Odds.map((od) => {
                const tac = activeTrackCards[od.m - 1];
                return (
                  <div
                    key={od.m}
                    className="p-2.5 rounded bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
                  >
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      Case M={od.m} ({tac} — {TACTIC_META[tac].name})
                    </div>
                    <div className="font-mono text-amber-700 dark:text-amber-400">
                      {od.cases} / 36 ({od.pct.toFixed(2)} %)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

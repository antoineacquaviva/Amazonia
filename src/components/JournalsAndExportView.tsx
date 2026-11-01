import React, { useState } from 'react';
import {
  BotProfileId,
  CampaignRecord,
  EditionPreset,
  SingleGameResult,
  ThemeVocabularyMode,
} from '../sim/types';
import {
  BOT_PROFILE_META,
  DEFAULT_GAME_PARAMETERS,
  DICTIONARIES,
  SWITCH_KEYS,
  SWITCH_META,
  TACTIC_DESCRIPTIONS,
} from '../sim/i18n';
import {
  downloadCampaignJson,
  downloadCampaignMarkdown,
  simulateSingleGameTrace,
} from '../api';
import { Copy, Download, FileText, Play } from 'lucide-react';

interface JournalsAndExportViewProps {
  campaigns: CampaignRecord[];
  editions: EditionPreset[];
  selectedCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  vocabulary: ThemeVocabularyMode;
  onChangeVocabulary: (v: ThemeVocabularyMode) => void;
}

export const JournalsAndExportView: React.FC<JournalsAndExportViewProps> = ({
  campaigns,
  editions,
  selectedCampaign,
  onSelectCampaign,
  vocabulary,
  onChangeVocabulary,
}) => {
  const [seed, setSeed] = useState<number>(104209);
  const [selectedEditionId, setSelectedEditionId] = useState<string>(
    editions[1]?.id || 'ed-v2-refonte'
  );
  const [botProfile, setBotProfile] = useState<BotProfileId>('COOPERATIVE');
  const [singleResult, setSingleResult] = useState<SingleGameResult | null>(
    null
  );
  const [runningSingle, setRunningSingle] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleRunSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunningSingle(true);
    try {
      const ed =
        editions.find((x) => x.id === selectedEditionId) || editions[0];
      const params = {
        ...DEFAULT_GAME_PARAMETERS,
        ...(ed?.defaultParams || {}),
        ...(ed?.switches || {}),
      };
      const res = await simulateSingleGameTrace({
        seed,
        params,
        botProfiles: [botProfile],
        vocabulary,
      });
      setSingleResult(res);
    } finally {
      setRunningSingle(false);
    }
  };

  const sampleJournalText =
    singleResult?.textualJournal ||
    selectedCampaign?.variantResults?.[0]?.sampleTraces?.[0]?.textualJournal ||
    selectedCampaign?.stressTelemetry?.capturedExtremeLogs?.[0]
      ?.textualJournal ||
    'Lancez une simulation unitaire ci-dessus ou sélectionnez une campagne pour afficher un journal textuel complet.';

  return (
    <div className="space-y-6">
      {/* Export IA & Générateur de Journal Textuel Unitaire */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Journaux Textuels Pas-à-Pas, Export Prompt IA & Référentiel v2.0
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Simulez une partie sur la graine et l’Édition de votre choix ou téléchargez le bilan Markdown structuré prêt à être soumis à une IA.
            </p>
          </div>

          {selectedCampaign && (
            <div className="flex items-center gap-2 text-xs">
              <select
                value={selectedCampaign.id}
                onChange={(e) => onSelectCampaign(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.config.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => downloadCampaignMarkdown(selectedCampaign)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger Prompt IA (.md)
              </button>
              <button
                type="button"
                onClick={() => downloadCampaignJson(selectedCampaign)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded"
              >
                <Download className="w-3.5 h-3.5" />
                JSON
              </button>
            </div>
          )}
        </div>

        {/* Simulateur de partie unitaire */}
        <form
          onSubmit={handleRunSingle}
          className="flex flex-wrap items-end gap-3 text-xs"
        >
          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Graine (Seed)
            </label>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 1)}
              className="w-32 px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            />
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Édition (Ensemble d’Interrupteurs)
            </label>
            <select
              value={selectedEditionId}
              onChange={(e) => setSelectedEditionId(e.target.value)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              {editions.map((ed) => (
                <option key={ed.id} value={ed.id}>
                  {ed.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Profil des Bots
            </label>
            <select
              value={botProfile}
              onChange={(e) => setBotProfile(e.target.value as BotProfileId)}
              className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              {(Object.keys(BOT_PROFILE_META) as BotProfileId[]).map((b) => (
                <option key={b} value={b}>
                  {BOT_PROFILE_META[b].label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={runningSingle}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded"
          >
            <Play className="w-3.5 h-3.5" />
            {runningSingle
              ? 'Génération...'
              : 'Générer le Journal Textuel Complet'}
          </button>

          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(sampleJournalText);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"
          >
            <Copy className="w-3.5 h-3.5" />
            {copied ? 'Copié !' : 'Copier le journal'}
          </button>
        </form>

        {/* Affichage du Journal Textuel */}
        <div className="relative">
          <pre className="p-4 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto max-h-[480px] leading-relaxed whitespace-pre-wrap">
            {sampleJournalText}
          </pre>
        </div>
      </div>

      {/* Référentiel des 6 Interrupteurs V1↔V2, 6 Tactiques et Dictionnaire Bilingue */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Référentiel des 6 Interrupteurs Mécaniques (Édition 1.0 ↔ Édition 2.0)
            </h2>
          </div>
          <div className="space-y-2.5 text-xs">
            {SWITCH_KEYS.map((key) => {
              const meta = SWITCH_META[key];
              return (
                <div
                  key={key}
                  className="p-3 rounded border border-slate-200 dark:border-slate-800 space-y-1"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {meta.title} ({meta.shortCode})
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    <strong className="text-amber-700 dark:text-amber-400">
                      {meta.v1Label} :
                    </strong>{' '}
                    {meta.v1HumanDesc}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400">
                    <strong className="text-emerald-700 dark:text-emerald-400">
                      {meta.v2Label} :
                    </strong>{' '}
                    {meta.v2HumanDesc}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-6">
          {/* Les 6 Tactiques */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Les 6 Tuiles Tactiques du Contremaître (A1..B3)
            </h2>
            <div className="space-y-2 text-xs">
              {Object.entries(TACTIC_DESCRIPTIONS).map(([id, t]) => (
                <div
                  key={id}
                  className="p-2.5 rounded bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800"
                >
                  <div className="font-bold text-slate-900 dark:text-slate-100">
                    {t.name}
                  </div>
                  <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                    {t.ruleSummary}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Dictionnaire Thématique i18n */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Table de Correspondance i18n (Amazonia ↔ Abstrait)
              </h2>
              <button
                onClick={() =>
                  onChangeVocabulary(
                    vocabulary === 'AMAZONIA' ? 'ABSTRACT' : 'AMAZONIA'
                  )
                }
                className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
              >
                Basculer ({vocabulary})
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                    <th className="py-1.5 px-2">Clé</th>
                    <th className="py-1.5 px-2">Thème Amazonia</th>
                    <th className="py-1.5 px-2">Notes Techniques</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                  {(
                    Object.keys(DICTIONARIES.AMAZONIA) as Array<
                      keyof typeof DICTIONARIES.AMAZONIA
                    >
                  ).map((k) => {
                    const vAmz = DICTIONARIES.AMAZONIA[k];
                    const vAbs = DICTIONARIES.ABSTRACT[k];
                    return (
                      <tr key={k}>
                        <td className="py-1.5 px-2 font-mono text-[11px] text-slate-500">
                          {k}
                        </td>
                        <td className="py-1.5 px-2 font-medium">
                          {Array.isArray(vAmz) ? vAmz.join(', ') : vAmz}
                        </td>
                        <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">
                          {Array.isArray(vAbs) ? vAbs.join(', ') : vAbs}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

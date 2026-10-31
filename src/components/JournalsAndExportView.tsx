import React, { useState, useEffect } from 'react';
import {
  BotProfileId,
  CampaignRecord,
  ThemeVocabularyMode,
} from '../sim/types';
import { BOT_PROFILE_META, DEFAULT_GAME_PARAMETERS } from '../sim/i18n';
import { generateCampaignMarkdownReport } from '../sim/evaluator';
import {
  getJsonExportUrl,
  getMarkdownExportUrl,
  simulateSingleGameTrace,
} from '../api';
import { Copy, Check, Download, FileText, Play } from 'lucide-react';

interface JournalsAndExportViewProps {
  campaigns: CampaignRecord[];
  selectedCampaign: CampaignRecord | null;
  onSelectCampaign: (id: string) => void;
  vocabulary: ThemeVocabularyMode;
}

export const JournalsAndExportView: React.FC<JournalsAndExportViewProps> = ({
  campaigns,
  selectedCampaign,
  onSelectCampaign,
  vocabulary,
}) => {
  const [activeSubMode, setActiveSubMode] = useState<'report' | 'traces' | 'single'>('report');
  const [copiedReport, setCopiedReport] = useState<boolean>(false);
  const [copiedTrace, setCopiedTrace] = useState<boolean>(false);

  // Simulation unitaire à la demande
  const [customSeed, setCustomSeed] = useState<number>(42001);
  const [customN, setCustomN] = useState<number>(4);
  const [customQ, setCustomQ] = useState<number>(6);
  const [customA, setCustomA] = useState<number>(2);
  const [customX, setCustomX] = useState<number>(8);
  const [customBot, setCustomBot] = useState<BotProfileId>('COOPERATIVE');
  const [singleJournal, setSingleJournal] = useState<string>('');
  const [loadingSingle, setLoadingSingle] = useState<boolean>(false);

  // Collecter toutes les traces disponibles dans la campagne active
  const availableTraces: Array<{
    id: string;
    label: string;
    seed: number;
    journal: string;
  }> = [];

  if (selectedCampaign) {
    if (selectedCampaign.stressTelemetry) {
      for (const ext of selectedCampaign.stressTelemetry.capturedExtremeLogs) {
        availableTraces.push({
          id: `stress_${ext.seed}_${ext.category}`,
          label: `[${ext.category}] Seed ${ext.seed} — ${ext.summary}`,
          seed: ext.seed,
          journal: ext.textualJournal,
        });
      }
    }
    for (const v of selectedCampaign.variantResults) {
      for (const s of v.sampleTraces) {
        availableTraces.push({
          id: `${v.variantId}_${s.tableConfigName}_${s.seed}`,
          label: `[${s.tag}] ${v.variantLabel} · ${s.tableConfigName} (Seed ${s.seed} — Score ${s.rawScore}, ${(s.normalizedScore * 100).toFixed(0)}%)`,
          seed: s.seed,
          journal: s.textualJournal,
        });
      }
    }
  }

  const [selectedTraceIdx, setSelectedTraceIdx] = useState<number>(0);
  const safeTraceIdx =
    selectedTraceIdx < availableTraces.length ? selectedTraceIdx : 0;
  const activeTrace = availableTraces[safeTraceIdx] || null;

  const markdownReport = selectedCampaign
    ? generateCampaignMarkdownReport(selectedCampaign)
    : '';

  const handleRunSingle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setLoadingSingle(true);
    try {
      const res = await simulateSingleGameTrace({
        seed: customSeed,
        params: {
          ...DEFAULT_GAME_PARAMETERS,
          n: customN,
          q: customQ,
          a: customA,
          x: customX,
        },
        botProfiles: [customBot],
        vocabulary,
      });
      setSingleJournal(res.textualJournal || '');
    } finally {
      setLoadingSingle(false);
    }
  };

  useEffect(() => {
    if (activeSubMode === 'single' && !singleJournal) {
      handleRunSingle();
    }
  }, [activeSubMode, vocabulary]);

  const copyToClipboard = (text: string, isReport: boolean) => {
    navigator.clipboard.writeText(text);
    if (isReport) {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    } else {
      setCopiedTrace(true);
      setTimeout(() => setCopiedTrace(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Barre supérieure de sélection de campagne et d'export direct */}
      <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Journaux Textuels d’Exécution & Bilan Téléchargeable pour IA
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Conçu pour fournir à un grand modèle de langage l’intégralité des distributions statistiques, les 4 critères et les traces tour par tour.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {selectedCampaign && (
            <>
              <select
                value={selectedCampaign.id}
                onChange={(e) => {
                  setSelectedTraceIdx(0);
                  onSelectCampaign(e.target.value);
                }}
                className="text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.config.name}
                  </option>
                ))}
              </select>

              <a
                href={getMarkdownExportUrl(selectedCampaign.id)}
                download
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap"
              >
                <FileText className="w-3.5 h-3.5" />
                Télécharger Bilan IA (.md)
              </a>

              <a
                href={getJsonExportUrl(selectedCampaign.id)}
                download
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Télécharger JSON Complet
              </a>
            </>
          )}
        </div>
      </section>

      {/* Sélecteur de sous-mode */}
      <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800 rounded-lg w-fit">
        <button
          onClick={() => setActiveSubMode('report')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSubMode === 'report'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Rapport Structuré Prompt-Ready (.md)
        </button>
        <button
          onClick={() => setActiveSubMode('traces')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSubMode === 'traces'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Journaux Capturés ({availableTraces.length})
        </button>
        <button
          onClick={() => setActiveSubMode('single')}
          className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
            activeSubMode === 'single'
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          Générateur de Trace par Graine (Seed)
        </button>
      </div>

      {/* Sous-mode 1 : Rapport Markdown complet pour IA */}
      {activeSubMode === 'report' && selectedCampaign && (
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Aperçu du Rapport Markdown Structuré pour Analyse IA
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Copiez ce bloc ou téléchargez le fichier .md pour le soumettre directement à une IA.
              </p>
            </div>
            <button
              onClick={() => copyToClipboard(markdownReport, true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap"
            >
              {copiedReport ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  Copié dans le presse-papiers
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copier le Prompt Markdown
                </>
              )}
            </button>
          </div>

          <pre className="p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed rounded-lg overflow-x-auto max-h-[640px] overflow-y-auto border border-slate-800">
            {markdownReport}
          </pre>
        </section>
      )}

      {/* Sous-mode 2 : Inspecteur des traces capturées */}
      {activeSubMode === 'traces' && (
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Choisir un journal d’exécution capturé durant la campagne
              </label>
              <select
                value={safeTraceIdx}
                onChange={(e) => setSelectedTraceIdx(Number(e.target.value))}
                className="w-full text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-300 dark:border-slate-700 rounded-md px-3 py-2"
              >
                {availableTraces.map((tr, idx) => (
                  <option key={tr.id} value={idx}>
                    {tr.label}
                  </option>
                ))}
              </select>
            </div>
            {activeTrace && (
              <button
                onClick={() => copyToClipboard(activeTrace.journal, false)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 border border-slate-300 dark:border-slate-700 rounded-md transition-colors whitespace-nowrap shrink-0 mt-5"
              >
                {copiedTrace ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Journal copié
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copier ce journal
                  </>
                )}
              </button>
            )}
          </div>

          {activeTrace ? (
            <pre className="p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed rounded-lg overflow-x-auto max-h-[640px] overflow-y-auto border border-slate-800">
              {activeTrace.journal}
            </pre>
          ) : (
            <p className="text-xs text-slate-500 py-8 text-center">
              Aucune trace disponible pour cette campagne.
            </p>
          )}
        </section>
      )}

      {/* Sous-mode 3 : Générateur de trace unitaire par Seed */}
      {activeSubMode === 'single' && (
        <section className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg space-y-5">
          <form
            onSubmit={handleRunSingle}
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 items-end pb-4 border-b border-slate-200 dark:border-slate-800"
          >
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Seed aléatoire
              </label>
              <input
                type="number"
                value={customSeed}
                onChange={(e) => setCustomSeed(Number(e.target.value) || 1)}
                className="w-full px-2.5 py-1.5 text-xs font-mono tabular-nums bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Joueurs (n)
              </label>
              <select
                value={customN}
                onChange={(e) => setCustomN(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[3, 4, 5, 6].map((v) => (
                  <option key={v} value={v}>
                    n = {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Parcelles (q)
              </label>
              <select
                value={customQ}
                onChange={(e) => setCustomQ(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[4, 5, 6, 7, 8].map((v) => (
                  <option key={v} value={v}>
                    q = {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Arbres (a)
              </label>
              <select
                value={customA}
                onChange={(e) => setCustomA(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[1, 2, 3].map((v) => (
                  <option key={v} value={v}>
                    a = {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Tours (x)
              </label>
              <select
                value={customX}
                onChange={(e) => setCustomX(Number(e.target.value))}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {[6, 7, 8, 9, 10].map((v) => (
                  <option key={v} value={v}>
                    x = {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                Profil des Bots
              </label>
              <select
                value={customBot}
                onChange={(e) => setCustomBot(e.target.value as BotProfileId)}
                className="w-full px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md"
              >
                {(Object.keys(BOT_PROFILE_META) as BotProfileId[]).map((bId) => (
                  <option key={bId} value={bId}>
                    {BOT_PROFILE_META[bId].shortLabel}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <button
                type="submit"
                disabled={loadingSingle}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Générer Trace
              </button>
            </div>
          </form>

          <pre className="p-4 bg-slate-950 text-slate-100 font-mono text-xs leading-relaxed rounded-lg overflow-x-auto max-h-[640px] overflow-y-auto border border-slate-800">
            {singleJournal || 'Génération du journal en cours...'}
          </pre>
        </section>
      )}
    </div>
  );
};

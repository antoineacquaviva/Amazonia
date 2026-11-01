import React, { useState, useEffect } from 'react';
import {
  BotProfileId,
  CampaignRecord,
  EditionPreset,
  MechanicalSwitches,
  PinnedSeed,
  SideBySideComparisonResult,
  ThemeVocabularyMode,
} from '../sim/types';
import {
  BOT_PROFILE_META,
  DEFAULT_GAME_PARAMETERS,
  generateHumanRuleDiff,
  SWITCH_KEYS,
  SWITCH_META,
  V1_SWITCHES,
  V2_SWITCHES,
} from '../sim/i18n';
import {
  compareSeedSideBySide,
  downloadCampaignJson,
  downloadCampaignMarkdown,
  removeEditionPreset,
  removePinnedSeedApi,
  saveEditionPreset,
  savePinnedSeedApi,
} from '../api';
import {
  BookOpen,
  Copy,
  Download,
  ExternalLink,
  GitCompare,
  Layers,
  Pin,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';

interface ConservatoryViewProps {
  editions: EditionPreset[];
  pinnedSeeds: PinnedSeed[];
  campaigns: CampaignRecord[];
  onRefreshConservatory: () => Promise<void>;
  onSelectCampaignAndOpenDashboard: (id: string) => void;
  onDeleteCampaign: (id: string) => void;
  vocabulary: ThemeVocabularyMode;
}

export const ConservatoryView: React.FC<ConservatoryViewProps> = ({
  editions,
  pinnedSeeds,
  campaigns,
  onRefreshConservatory,
  onSelectCampaignAndOpenDashboard,
  onDeleteCampaign,
  vocabulary,
}) => {
  const [subTab, setSubTab] = useState<'editions' | 'benches' | 'seeds'>('editions');

  // Niveau 1 : Créateur / Comparateur d'Éditions
  const [diffEditionAId, setDiffEditionAId] = useState<string>(
    editions[0]?.id || 'ed-v1-original'
  );
  const [diffEditionBId, setDiffEditionBId] = useState<string>(
    editions[1]?.id || 'ed-v2-refonte'
  );
  const [newEditionName, setNewEditionName] = useState('Édition 2.1 — Hybride Personnalisée');
  const [newEditionVersion, setNewEditionVersion] = useState('2.1.0');
  const [newEditionDesc, setNewEditionDesc] = useState(
    'Variante hybride enregistrée dans le Conservatoire pour tests d’ablation.'
  );
  const [customSwitches, setCustomSwitches] = useState<MechanicalSwitches>({
    ...V2_SWITCHES,
  });
  const [savingEdition, setSavingEdition] = useState(false);

  // Niveau 3 : Inspecteur de Rejeu Côte-à-Côte sur Graine
  const [replaySeed, setReplaySeed] = useState<number>(
    pinnedSeeds[0]?.seed || 104209
  );
  const [replayEditionAId, setReplayEditionAId] = useState<string>(
    editions[0]?.id || 'ed-v1-original'
  );
  const [replayEditionBId, setReplayEditionBId] = useState<string>(
    editions[1]?.id || 'ed-v2-refonte'
  );
  const [replayBotProfile, setReplayBotProfile] =
    useState<BotProfileId>('COOPERATIVE');
  const [comparison, setComparison] =
    useState<SideBySideComparisonResult | null>(null);
  const [runningCompare, setRunningCompare] = useState(false);
  const [pinTitle, setPinTitle] = useState('');
  const [pinReason, setPinReason] =
    useState<PinnedSeed['reasonCategory']>('USER_PINNED');

  const edA =
    editions.find((e) => e.id === diffEditionAId) || editions[0];
  const edB =
    editions.find((e) => e.id === diffEditionBId) ||
    editions[1] ||
    editions[0];

  const humanDiff =
    edA && edB
      ? generateHumanRuleDiff(edA.switches, edB.switches, edA.name, edB.name)
      : null;

  const handleSaveNewEdition = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEditionName.trim()) return;
    setSavingEdition(true);
    try {
      await saveEditionPreset({
        name: newEditionName.trim(),
        version: newEditionVersion.trim() || '2.1.0',
        description: newEditionDesc.trim(),
        switches: customSwitches,
        defaultParams: { ...DEFAULT_GAME_PARAMETERS, ...customSwitches },
      });
      await onRefreshConservatory();
    } finally {
      setSavingEdition(false);
    }
  };

  const handleRunComparison = async (
    seedOverride?: number,
    edAIdOverride?: string,
    edBIdOverride?: string,
    botOverride?: BotProfileId
  ) => {
    setRunningCompare(true);
    try {
      const targetSeed = seedOverride ?? replaySeed;
      const aId = edAIdOverride ?? replayEditionAId;
      const bId = edBIdOverride ?? replayEditionBId;
      const bot = botOverride ?? replayBotProfile;
      const res = await compareSeedSideBySide({
        seed: targetSeed,
        editionAId: aId,
        editionBId: bId,
        botProfile: bot,
        vocabulary,
      });
      setComparison(res);
    } finally {
      setRunningCompare(false);
    }
  };

  useEffect(() => {
    if (subTab === 'seeds' && !comparison) {
      handleRunComparison();
    }
  }, [subTab]);

  const handlePinCurrentSeed = async () => {
    if (!comparison) return;
    const title =
      pinTitle.trim() ||
      `Graine #${comparison.seed} (${comparison.editionAName} vs ${comparison.editionBName})`;
    await savePinnedSeedApi({
      seed: comparison.seed,
      title,
      reasonCategory: pinReason,
      description: `Delta de survie : ${(comparison.gameA.normalizedScore * 100).toFixed(1)}% (${comparison.editionAName}) vs ${(comparison.gameB.normalizedScore * 100).toFixed(1)}% (${comparison.editionBName}) avec profil ${comparison.botProfile}.`,
      defaultParamsA: comparison.gameA.params,
      defaultParamsB: comparison.gameB.params,
      editionAName: comparison.editionAName,
      editionBName: comparison.editionBName,
      botProfile: comparison.botProfile,
      scoreANormalized: comparison.gameA.normalizedScore,
      scoreBNormalized: comparison.gameB.normalizedScore,
    });
    setPinTitle('');
    await onRefreshConservatory();
  };

  return (
    <div className="space-y-6">
      {/* En-tête du Conservatoire à 3 Niveaux */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Conservatoire à 3 Niveaux — Mémoire de Conception & Rejeu Comparatif
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Niveau 1 : Les Éditions (Règles nommées & Diff Humain) · Niveau 2 : Les Bancs d’Essai (Historique des campagnes) · Niveau 3 : Les Graines Épinglées (Rejeu Côte-à-Côte sur même Seed)
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
          <button
            onClick={() => setSubTab('editions')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'editions'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            1. Éditions ({editions.length})
          </button>
          <button
            onClick={() => setSubTab('benches')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'benches'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            2. Bancs d’Essai ({campaigns.length})
          </button>
          <button
            onClick={() => setSubTab('seeds')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
              subTab === 'seeds'
                ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            3. Graines Épinglées & Rejeu ({pinnedSeeds.length})
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* NIVEAU 1 : LES ÉDITIONS & LE DIFF HUMAIN EN FRANÇAIS NATUREL        */}
      {/* =================================================================== */}
      {subTab === 'editions' && (
        <div className="space-y-6">
          {/* Liste des Éditions enregistrées */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {editions.map((ed) => {
              const v2Count = SWITCH_KEYS.filter(
                (k) => ed.switches[k] === V2_SWITCHES[k]
              ).length;
              return (
                <div
                  key={ed.id}
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 font-semibold">
                          v{ed.version} · {v2Count}/6 interrupteurs V2
                        </span>
                        <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                          {ed.name}
                        </h2>
                      </div>
                      {!ed.isBuiltIn && (
                        <button
                          onClick={async () => {
                            await removeEditionPreset(ed.id);
                            await onRefreshConservatory();
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 transition-colors"
                          title="Supprimer cette édition"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-400 mt-2 leading-relaxed">
                      {ed.description}
                    </p>

                    <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs">
                      {SWITCH_KEYS.map((key) => {
                        const meta = SWITCH_META[key];
                        const isV2 = ed.switches[key] === meta.v2Value;
                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-slate-50 dark:bg-slate-800/50"
                          >
                            <span className="text-slate-500 dark:text-slate-400 truncate">
                              {meta.shortCode}
                            </span>
                            <span
                              className={`font-mono font-semibold ${
                                isV2
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {isV2 ? 'V2' : 'V1'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>ID : {ed.id}</span>
                    <button
                      onClick={() => {
                        setCustomSwitches({ ...ed.switches });
                        setNewEditionName(`${ed.name} (Copie)`);
                      }}
                      className="inline-flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Cloner dans l’éditeur
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Générateur automatique de « Diff Humain » entre deux Éditions */}
          {humanDiff && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    Comparateur d’Éditions — « Diff Humain » Automatique en Français Naturel
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Synthèse lisible des différences de règles entre deux Éditions du Conservatoire ({humanDiff.changedCount} modifiée(s), {humanDiff.unchangedCount} identique(s))
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select
                    value={diffEditionAId}
                    onChange={(e) => setDiffEditionAId(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
                  >
                    {editions.map((e) => (
                      <option key={e.id} value={e.id}>
                        A : {e.name}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400">↔</span>
                  <select
                    value={diffEditionBId}
                    onChange={(e) => setDiffEditionBId(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-medium"
                  >
                    {editions.map((e) => (
                      <option key={e.id} value={e.id}>
                        B : {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                {humanDiff.diffItems.map((item) => (
                  <div
                    key={item.key}
                    className={`p-3 rounded-md border text-xs ${
                      item.changed
                        ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                        : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 font-semibold text-slate-900 dark:text-slate-100">
                      <span>{item.title}</span>
                      <span
                        className={`font-mono ${
                          item.changed
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {item.changed
                          ? `${item.labelA}  →  ${item.labelB}`
                          : `Identique (${item.labelA})`}
                      </span>
                    </div>
                    {item.changed && (
                      <p className="mt-1 text-slate-600 dark:text-slate-300">
                        {item.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulaire de création d'une nouvelle Édition nommée */}
          <form
            onSubmit={handleSaveNewEdition}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Enregistrer une Nouvelle Édition dans le Conservatoire (Niveau 1)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Combinez librement les 6 interrupteurs V1/V2 et figez cette variante comme référence persistante sur disque JSON.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCustomSwitches({ ...V1_SWITCHES })}
                  className="px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"
                >
                  Charger Tout V1
                </button>
                <button
                  type="button"
                  onClick={() => setCustomSwitches({ ...V2_SWITCHES })}
                  className="px-2.5 py-1 text-xs font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 rounded hover:bg-emerald-200"
                >
                  Charger Tout V2
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="md:col-span-2">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Nom de l’Édition
                </label>
                <input
                  type="text"
                  value={newEditionName}
                  onChange={(e) => setNewEditionName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  required
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Numéro de Version
                </label>
                <input
                  type="text"
                  value={newEditionVersion}
                  onChange={(e) => setNewEditionVersion(e.target.value)}
                  className="w-full px-3 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
              <div className="md:col-span-3">
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Description / Intention de Game Design
                </label>
                <input
                  type="text"
                  value={newEditionDesc}
                  onChange={(e) => setNewEditionDesc(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              {SWITCH_KEYS.map((key) => {
                const meta = SWITCH_META[key];
                const currentVal = customSwitches[key];
                return (
                  <div
                    key={key}
                    className="p-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 space-y-2"
                  >
                    <div className="font-semibold text-slate-900 dark:text-slate-100">
                      {meta.title}
                    </div>
                    <div className="grid grid-cols-1 gap-1.5">
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={currentVal === meta.v1Value}
                          onChange={() =>
                            setCustomSwitches((prev) => ({
                              ...prev,
                              [key]: meta.v1Value as any,
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <strong className="text-amber-700 dark:text-amber-400">
                            {meta.v1Label}
                          </strong>{' '}
                          — <span className="text-slate-500">{meta.v1HumanDesc}</span>
                        </span>
                      </label>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="radio"
                          checked={currentVal === meta.v2Value}
                          onChange={() =>
                            setCustomSwitches((prev) => ({
                              ...prev,
                              [key]: meta.v2Value as any,
                            }))
                          }
                          className="mt-0.5"
                        />
                        <span>
                          <strong className="text-emerald-700 dark:text-emerald-400">
                            {meta.v2Label}
                          </strong>{' '}
                          — <span className="text-slate-500">{meta.v2HumanDesc}</span>
                        </span>
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={savingEdition}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-md transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                {savingEdition
                  ? 'Enregistrement...'
                  : 'Enregistrer cette Édition dans le Conservatoire'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* NIVEAU 2 : LES BANCS D'ESSAI (HISTORIQUE DES CAMPAGNES)             */}
      {/* =================================================================== */}
      {subTab === 'benches' && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Niveau 2 : Historique des Bancs d’Essai & Campagnes Persistées (`data/campaigns/`)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Consultez, rouvrez dans le tableau de bord ou téléchargez directement les rapports Markdown IA et JSON de chaque campagne.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold">
                  <th className="py-2.5 px-4">Campagne / Banc d’Essai</th>
                  <th className="py-2.5 px-3">Type</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3 text-right">Parties</th>
                  <th className="py-2.5 px-3 text-right">Variantes</th>
                  <th className="py-2.5 px-3 text-right">Meilleure Note /100</th>
                  <th className="py-2.5 px-4 text-right">Actions Directes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 font-mono tabular-nums">
                {campaigns.map((c) => {
                  const bestScore =
                    c.variantResults.length > 0
                      ? Math.max(
                          ...c.variantResults.map(
                            (v) => v.criteria.overallDesignScore
                          )
                        )
                      : null;
                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      <td className="py-3 px-4 font-sans">
                        <div className="font-semibold text-slate-900 dark:text-slate-100">
                          {c.config.name}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Graine de base #{c.config.baseSeed} · Créée le{' '}
                          {new Date(c.startedAt).toLocaleString('fr-FR')}
                        </div>
                      </td>
                      <td className="py-3 px-3 font-sans text-slate-600 dark:text-slate-300">
                        {c.config.type === 'AB_ABLATION'
                          ? 'Ablation A/B (Paired Seeds)'
                          : c.config.type === 'ORACLE_STRESS_TEST'
                          ? 'Stress-Test VM'
                          : 'Balayage Variantes'}
                      </td>
                      <td className="py-3 px-3 font-sans font-semibold">
                        <span
                          className={
                            c.status === 'COMPLETED'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : c.status === 'RUNNING'
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-500'
                          }
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right">
                        {c.progress.completedGames.toLocaleString('fr-FR')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {c.variantResults.length}
                      </td>
                      <td className="py-3 px-3 text-right font-bold text-emerald-700 dark:text-emerald-400">
                        {bestScore !== null ? `${bestScore.toFixed(1)}/100` : '—'}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <div className="inline-flex items-center gap-2">
                          <button
                            onClick={() => onSelectCampaignAndOpenDashboard(c.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 rounded hover:bg-emerald-100"
                          >
                            <ExternalLink className="w-3 h-3" />
                            Ouvrir
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCampaignMarkdown(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"
                            title="Télécharger le bilan Markdown structuré pour IA"
                          >
                            <Download className="w-3 h-3" />
                            .md
                          </button>
                          <button
                            type="button"
                            onClick={() => downloadCampaignJson(c)}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded hover:bg-slate-200"
                            title="Télécharger l'archive JSON complète"
                          >
                            <Download className="w-3 h-3" />
                            .json
                          </button>
                          <button
                            onClick={() => onDeleteCampaign(c.id)}
                            className="p-1 text-slate-400 hover:text-red-600"
                            title="Supprimer la campagne"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* NIVEAU 3 : GRAINES ÉPINGLÉES & INSPECTEUR DE REJEU CÔTE-À-CÔTE      */}
      {/* =================================================================== */}
      {subTab === 'seeds' && (
        <div className="space-y-6">
          {/* Bibliothèque des Graines Épinglées */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  Bibliothèque des Graines Épinglées (`data/seeds/`)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Cliquez sur une graine remarquable pour rejouer instantanément la même séquence de dés côte-à-côte entre deux Éditions.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {pinnedSeeds.map((ps) => (
                <div
                  key={ps.id}
                  className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                        Seed #{ps.seed} · {ps.reasonCategory}
                      </span>
                      <button
                        onClick={async () => {
                          await removePinnedSeedApi(ps.id);
                          await onRefreshConservatory();
                        }}
                        className="text-slate-400 hover:text-red-600"
                        title="Supprimer cette graine épinglée"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 mt-1">
                      {ps.title}
                    </h3>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                      {ps.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-700/60 text-xs">
                    <span className="font-mono tabular-nums text-[11px]">
                      A: {(ps.scoreANormalized * 100).toFixed(1)}% ↔ B:{' '}
                      {(ps.scoreBNormalized * 100).toFixed(1)}%
                    </span>
                    <button
                      onClick={() => {
                        setReplaySeed(ps.seed);
                        setReplayBotProfile(ps.botProfile);
                        handleRunComparison(
                          ps.seed,
                          replayEditionAId,
                          replayEditionBId,
                          ps.botProfile
                        );
                      }}
                      className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                    >
                      <Play className="w-3 h-3" />
                      Charger & Comparer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Barre de contrôle du Rejeu Côte-à-Côte (SideBySideSeedRunner) */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Graine Aléatoire (Seed)
                  </label>
                  <input
                    type="number"
                    value={replaySeed}
                    onChange={(e) => setReplaySeed(Number(e.target.value) || 1)}
                    className="w-32 px-2.5 py-1.5 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Colonne Gauche (Édition A)
                  </label>
                  <select
                    value={replayEditionAId}
                    onChange={(e) => setReplayEditionAId(e.target.value)}
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
                    Colonne Droite (Édition B)
                  </label>
                  <select
                    value={replayEditionBId}
                    onChange={(e) => setReplayEditionBId(e.target.value)}
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
                    Profil d’Équipe (Bots)
                  </label>
                  <select
                    value={replayBotProfile}
                    onChange={(e) =>
                      setReplayBotProfile(e.target.value as BotProfileId)
                    }
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                  >
                    {(Object.keys(BOT_PROFILE_META) as BotProfileId[]).map(
                      (b) => (
                        <option key={b} value={b}>
                          {BOT_PROFILE_META[b].shortLabel}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <button
                  onClick={() => handleRunComparison()}
                  disabled={runningCompare}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded transition-colors"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  {runningCompare ? 'Calcul...' : 'Rejouer Côte-à-Côte'}
                </button>
              </div>

              {/* Épingler cette graine */}
              <div className="flex items-end gap-2 text-xs">
                <input
                  type="text"
                  placeholder="Titre pour épingler cette graine..."
                  value={pinTitle}
                  onChange={(e) => setPinTitle(e.target.value)}
                  className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded w-52"
                />
                <select
                  value={pinReason}
                  onChange={(e) =>
                    setPinReason(
                      e.target.value as PinnedSeed['reasonCategory']
                    )
                  }
                  className="px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
                >
                  <option value="USER_PINNED">Épinglée manuellement</option>
                  <option value="MAX_DELTA_V1_V2">Écart Max V1↔V2</option>
                  <option value="MAX_SECRET_CUP_IMPACT">Impact Gobelet</option>
                  <option value="CRITICAL_DEFEAT">Défaite Critique</option>
                  <option value="ANOMALY_OR_EDGE_CASE">Cas Limite H1..H7</option>
                </select>
                <button
                  onClick={handlePinCurrentSeed}
                  className="inline-flex items-center gap-1 px-3 py-1.5 font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded hover:bg-emerald-100"
                >
                  <Pin className="w-3.5 h-3.5" />
                  Épingler
                </button>
              </div>
            </div>

            {/* Résultat du Rejeu Comparatif Côte-à-Côte */}
            {comparison && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-500">
                      COLONNE A — {comparison.editionAName}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {(comparison.gameA.normalizedScore * 100).toFixed(1)}% Arbres sauvés ({comparison.gameA.rawScore} T)
                      </span>
                      <span className="text-xs font-mono font-semibold text-amber-700 dark:text-amber-400">
                        {comparison.gameA.victoryBracket}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 font-mono">
                      Cartes posées : {comparison.gameA.totalCardsPlaced} (Parées : {comparison.gameA.totalCardsParried}, Sans cible : {comparison.gameA.totalCardsNoTarget}) · Abatteuses détruites : {comparison.gameA.totalHarvestersDestroyed}
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-emerald-50/40 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/50">
                    <div className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      COLONNE B — {comparison.editionBName}
                    </div>
                    <div className="mt-1 flex items-baseline justify-between">
                      <span className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                        {(comparison.gameB.normalizedScore * 100).toFixed(1)}% Arbres sauvés ({comparison.gameB.rawScore} T)
                      </span>
                      <span className="text-xs font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                        {comparison.gameB.victoryBracket}
                      </span>
                    </div>
                    <div className="mt-2 text-xs text-slate-600 dark:text-slate-400 font-mono">
                      Cartes posées : {comparison.gameB.totalCardsPlaced} (Parées : {comparison.gameB.totalCardsParried}, Sans cible : {comparison.gameB.totalCardsNoTarget}) · Abatteuses détruites : {comparison.gameB.totalHarvestersDestroyed}
                    </div>
                  </div>
                </div>

                {/* Tableau Tour par Tour des divergences */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Comparaison Tour par Tour (Même Graine #{comparison.seed})
                  </h3>
                  {comparison.turnComparisons.map((tc) => (
                    <div
                      key={tc.turn}
                      className={`p-3.5 rounded-lg border text-xs ${
                        tc.hasDivergence
                          ? 'bg-amber-50/40 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/60'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/70 dark:border-slate-800">
                        <span className="font-bold text-slate-900 dark:text-slate-100">
                          Tour {tc.turn}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          Dés tirés (identiques au Tour 1) :{' '}
                          {tc.traceA.diceRolls
                            .map((d) => `J${d.playerIndex + 1}:${d.chosenSlot}`)
                            .join(' · ')}
                        </span>
                      </div>

                      {tc.divergenceSummary.length > 0 && (
                        <div className="my-2 p-2 rounded bg-amber-100/70 dark:bg-amber-900/30 text-amber-900 dark:text-amber-200 font-mono text-[11px] space-y-0.5">
                          {tc.divergenceSummary.map((line, idx) => (
                            <div key={idx}>⚡ {line}</div>
                          ))}
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 font-mono text-[11px]">
                        <div>
                          <div className="font-semibold text-slate-700 dark:text-slate-300">
                            [A] Piste Tactiques : [{tc.traceA.tacticsTrackStart.join(', ')}] → [{tc.traceA.tacticsTrackEnd.join(', ')}]
                          </div>
                          <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                            Fin Tour {tc.turn} : {tc.traceA.standingTreesEnd} Arbres (T), {tc.traceA.stumpsEnd} Souches (S), {tc.traceA.clearedEnd} Rasés (E) · {tc.traceA.activeHarvestersEnd} Abatt. actives
                          </div>
                        </div>

                        <div>
                          <div className="font-semibold text-emerald-800 dark:text-emerald-300">
                            [B] Piste Tactiques : [{tc.traceB.tacticsTrackStart.join(', ')}] → [{tc.traceB.tacticsTrackEnd.join(', ')}]
                          </div>
                          <div className="text-slate-600 dark:text-slate-400 mt-0.5">
                            Fin Tour {tc.turn} : {tc.traceB.standingTreesEnd} Arbres (T), {tc.traceB.stumpsEnd} Souches (S), {tc.traceB.clearedEnd} Rasés (E) · {tc.traceB.activeHarvestersEnd} Abatt. actives
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

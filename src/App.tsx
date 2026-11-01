import React, { useState, useEffect, useCallback } from 'react';
import {
  CampaignConfig,
  CampaignRecord,
  EditionPreset,
  PinnedSeed,
  ThemeVocabularyMode,
} from './sim/types';
import { BUILTIN_EDITIONS, DICTIONARIES } from './sim/i18n';
import {
  controlCampaign,
  createCampaign,
  fetchCampaigns,
  fetchEditions,
  fetchPinnedSeeds,
  removeCampaign,
} from './api';
import { DashboardView } from './components/DashboardView';
import { EvaluationBuilderView } from './components/EvaluationBuilderView';
import { ConservatoryView } from './components/ConservatoryView';
import { StressTestView } from './components/StressTestView';
import { JournalsAndExportView } from './components/JournalsAndExportView';
import { Sun, Moon } from 'lucide-react';

type ActiveTab = 'dashboard' | 'builder' | 'conservatory' | 'stress' | 'journals';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [vocabulary, setVocabulary] = useState<ThemeVocabularyMode>('AMAZONIA');
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [editions, setEditions] = useState<EditionPreset[]>(BUILTIN_EDITIONS);
  const [pinnedSeeds, setPinnedSeeds] = useState<PinnedSeed[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  const loadCampaigns = useCallback(async () => {
    try {
      const list = await fetchCampaigns();
      setCampaigns(list);
      setSelectedCampaignId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err: any) {
      setErrorBanner(err?.message || 'Erreur réseau');
    }
  }, []);

  const loadConservatory = useCallback(async () => {
    try {
      const [eds, seeds] = await Promise.all([
        fetchEditions(),
        fetchPinnedSeeds(),
      ]);
      setEditions(eds);
      setPinnedSeeds(seeds);
    } catch (err: any) {
      console.error('Erreur chargement conservatoire :', err);
    }
  }, []);

  useEffect(() => {
    loadCampaigns();
    loadConservatory();
  }, [loadCampaigns, loadConservatory]);

  // Rafraîchissement automatique rapide tant qu'au moins une campagne tourne en arrière-plan
  useEffect(() => {
    const anyRunning = campaigns.some((c) => c.status === 'RUNNING');
    const intervalMs = anyRunning ? 900 : 5000;
    const timer = setInterval(() => {
      loadCampaigns();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [campaigns, loadCampaigns]);

  const handleLaunchCampaign = async (config: Partial<CampaignConfig>) => {
    setErrorBanner(null);
    try {
      const created = await createCampaign(config);
      await loadCampaigns();
      setSelectedCampaignId(created.id);
      if (config.type === 'ORACLE_STRESS_TEST') {
        setActiveTab('stress');
      } else {
        setActiveTab('dashboard');
      }
    } catch (err: any) {
      setErrorBanner(err?.message || 'Erreur lors du lancement de la campagne');
    }
  };

  const handleControlCampaign = async (
    id: string,
    action: 'pause' | 'resume' | 'stop'
  ) => {
    try {
      await controlCampaign(id, action);
      await loadCampaigns();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Erreur de contrôle de la campagne');
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    try {
      await removeCampaign(id);
      await loadCampaigns();
    } catch (err: any) {
      setErrorBanner(err?.message || 'Erreur lors de la suppression');
    }
  };

  const selectedCampaign =
    campaigns.find((c) => c.id === selectedCampaignId) || campaigns[0] || null;
  const runningCount = campaigns.filter((c) => c.status === 'RUNNING').length;
  const dict = DICTIONARIES[vocabulary];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Bar Contract (3 zones séparées par gap-8) */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
        {/* Zone 1 : Single text element wordmark */}
        <a
          href="#dashboard"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('dashboard');
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap shrink-0"
        >
          {dict['game.title']}
        </a>

        {/* Zone 2 : 5 concise single-line text navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-400">
          <a
            href="#dashboard"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('dashboard');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'dashboard'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-8 decoration-2 decoration-emerald-600'
                : ''
            }`}
          >
            Tableau & Diagnostics
          </a>
          <a
            href="#builder"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('builder');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'builder'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-8 decoration-2 decoration-emerald-600'
                : ''
            }`}
          >
            Test Croisé & Variantes
          </a>
          <a
            href="#conservatory"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('conservatory');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'conservatory'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-8 decoration-2 decoration-emerald-600'
                : ''
            }`}
          >
            Conservatoire & Rejeu
          </a>
          <a
            href="#stress"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('stress');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'stress'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-8 decoration-2 decoration-emerald-600'
                : ''
            }`}
          >
            Stress-Test VM
          </a>
          <a
            href="#journals"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('journals');
            }}
            className={`hover:text-slate-900 dark:hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'journals'
                ? 'text-slate-900 dark:text-slate-100 underline underline-offset-8 decoration-2 decoration-emerald-600'
                : ''
            }`}
          >
            Journaux & Référence
          </a>
        </nav>

        {/* Zone 3 : 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('builder')}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Nouveau Test Croisé
          </button>
        </div>
      </header>

      {/* Barre d'Outils Contextuelle de l'Espace de Travail (Sous le pli du Header) */}
      <div className="px-6 py-2.5 bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-slate-600 dark:text-slate-400">
          <span>Portail Atelier Conception Jeu (v2.0)</span>
          <span aria-hidden="true">·</span>
          <span>6 Interrupteurs V1↔V2 (64 hybrides)</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {editions.length} éditions · {campaigns.length} campagnes · {pinnedSeeds.length} graines épinglées
            {runningCount > 0 ? ` (${runningCount} en cours)` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Navigation mobile le cas échéant */}
          <div className="flex md:hidden items-center gap-1">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value="dashboard">Tableau & Diagnostics</option>
              <option value="builder">Test Croisé & Variantes</option>
              <option value="conservatory">Conservatoire & Rejeu</option>
              <option value="stress">Stress-Test VM</option>
              <option value="journals">Journaux & Référence</option>
            </select>
          </div>

          {/* Sélecteur de vocabulaire i18n */}
          <div className="flex items-center gap-1 p-0.5 bg-slate-200/80 dark:bg-slate-800 rounded-md">
            <button
              onClick={() => setVocabulary('AMAZONIA')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                vocabulary === 'AMAZONIA'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Vocabulaire Amazonia
            </button>
            <button
              onClick={() => setVocabulary('ABSTRACT')}
              className={`px-2.5 py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
                vocabulary === 'ABSTRACT'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Notes Techniques
            </button>
          </div>

          {/* Bascule Clair / Sombre */}
          <button
            onClick={() => setDarkMode((d) => !d)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap"
          >
            {darkMode ? (
              <>
                <Sun className="w-3.5 h-3.5" />
                Mode Clair
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5" />
                Mode Sombre
              </>
            )}
          </button>
        </div>
      </div>

      {/* Bannière d'erreur éventuelle */}
      {errorBanner && (
        <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-md flex items-center justify-between text-xs text-red-800 dark:text-red-200">
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="font-semibold underline ml-4"
          >
            Fermer
          </button>
        </div>
      )}

      {/* Contenu Principal (Largeur 1440px max centrée) */}
      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 py-8">
        {activeTab === 'dashboard' && (
          <DashboardView
            campaigns={campaigns}
            selectedCampaign={selectedCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onControlCampaign={handleControlCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onNavigateTab={setActiveTab}
            onEditionSaved={loadConservatory}
            vocabulary={vocabulary}
          />
        )}

        {activeTab === 'builder' && (
          <EvaluationBuilderView
            editions={editions}
            onLaunchCampaign={handleLaunchCampaign}
            vocabulary={vocabulary}
          />
        )}

        {activeTab === 'conservatory' && (
          <ConservatoryView
            editions={editions}
            pinnedSeeds={pinnedSeeds}
            campaigns={campaigns}
            onRefreshConservatory={loadConservatory}
            onSelectCampaignAndOpenDashboard={(id) => {
              setSelectedCampaignId(id);
              setActiveTab('dashboard');
            }}
            onDeleteCampaign={handleDeleteCampaign}
            vocabulary={vocabulary}
          />
        )}

        {activeTab === 'stress' && (
          <StressTestView
            campaigns={campaigns}
            selectedCampaign={selectedCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onLaunchCampaign={handleLaunchCampaign}
            onControlCampaign={handleControlCampaign}
            onInspectJournal={() => setActiveTab('journals')}
            vocabulary={vocabulary}
          />
        )}

        {activeTab === 'journals' && (
          <JournalsAndExportView
            campaigns={campaigns}
            editions={editions}
            selectedCampaign={selectedCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            vocabulary={vocabulary}
            onChangeVocabulary={setVocabulary}
          />
        )}
      </main>

      {/* Pied de page sobre */}
      <footer className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-4">
        <div>
          Laboratoire de Simulation, d’Ablation Croisée & Conservatoire v2.0 — « {dict['game.title']} »
        </div>
        <div>
          Compatible Aperçu AI Studio & VM Oracle (Atelier Conception Jeu)
        </div>
      </footer>
    </div>
  );
}

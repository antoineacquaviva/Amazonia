import React, { useState, useEffect, useCallback } from 'react';
import {
  CampaignConfig,
  CampaignRecord,
} from './sim/types';
import {
  BackendDiagnosticInfo,
  controlCampaign,
  createCampaign,
  fetchCampaigns,
  fetchServerHealth,
  getLastBackendDiagnostic,
  isUsingBrowserFallback,
  removeCampaign,
  ServerHealthInfo,
  setUseBrowserFallback,
} from './api';
import { DashboardView } from './components/DashboardView';
import { EvaluationBuilderView } from './components/EvaluationBuilderView';
import { StressTestView } from './components/StressTestView';
import { JournalsAndExportView } from './components/JournalsAndExportView';
import { Sun, Moon, RefreshCw, Cpu, AlertTriangle } from 'lucide-react';

type ActiveTab = 'dashboard' | 'builder' | 'stress' | 'journals';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [darkMode, setDarkMode] = useState<boolean>(false);

  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(
    null
  );
  const [serverHealth, setServerHealth] = useState<ServerHealthInfo | null>(
    null
  );
  const [fallbackActive, setFallbackActive] = useState<boolean>(false);
  const [backendDiag, setBackendDiag] = useState<BackendDiagnosticInfo | null>(
    null
  );
  const [showVmHelp, setShowVmHelp] = useState<boolean>(false);
  const [retryingBackend, setRetryingBackend] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
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
      const [health, list] = await Promise.all([
        fetchServerHealth(false),
        fetchCampaigns(),
      ]);
      setServerHealth(health);
      setFallbackActive(isUsingBrowserFallback());
      setBackendDiag(getLastBackendDiagnostic());
      setCampaigns(list);
      setSelectedCampaignId((prev) => {
        if (prev && list.some((c) => c.id === prev)) return prev;
        return list.length > 0 ? list[0].id : null;
      });
    } catch (err: any) {
      setErrorBanner(err?.message || 'Erreur réseau');
    }
  }, []);

  const handleRetryBackend = useCallback(async () => {
    setRetryingBackend(true);
    setErrorBanner(null);
    try {
      setUseBrowserFallback(false);
      const health = await fetchServerHealth(true);
      setServerHealth(health);
      setFallbackActive(isUsingBrowserFallback());
      setBackendDiag(getLastBackendDiagnostic());
      await loadCampaigns();
    } finally {
      setRetryingBackend(false);
    }
  }, [loadCampaigns]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  // Rafraîchissement automatique tant qu'au moins une campagne tourne en arrière-plan
  useEffect(() => {
    const anyRunning = campaigns.some((c) => c.status === 'RUNNING');
    const intervalMs = anyRunning ? 900 : 5000;
    const timer = setInterval(() => {
      void loadCampaigns();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [campaigns, loadCampaigns]);

  const handleLaunchCampaign = async (config: Partial<CampaignConfig>) => {
    setErrorBanner(null);
    setIsSubmitting(true);
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
    } finally {
      setIsSubmitting(false);
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
          Amazonia : Dernier Rempart
        </a>

        {/* Zone 2 : 4 concise single-line text navigation links */}
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
            Tableau & Résultats
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
            Configurateur Monte-Carlo
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
            Combat Log & Matrice 2D6
          </a>
        </nav>

        {/* Zone 3 : 1 primary action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => setActiveTab('builder')}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Nouvelle Campagne
          </button>
        </div>
      </header>

      {/* Barre d'Outils Contextuelle de l'Espace de Travail */}
      <div className="px-6 py-2.5 bg-slate-100/80 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex flex-wrap items-center gap-2.5 text-slate-600 dark:text-slate-400">
          {!fallbackActive && serverHealth ? (
            <div className="inline-flex flex-wrap items-center gap-2 px-2.5 py-1 rounded-md bg-emerald-100/90 dark:bg-emerald-950/70 border border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300 font-semibold tabular-nums">
              <span className="w-2 h-2 rounded-full bg-emerald-600 dark:bg-emerald-400" />
              <Cpu className="w-3.5 h-3.5" />
              <span>
                Serveur VM Actif ({serverHealth.cpuCount} vCPU · {serverHealth.busyWorkers ?? 0}/{serverHealth.workersCount} workers actifs · CPU VM : {serverHealth.cpuPercent ?? 0}% · Load : {serverHealth.loadAvg1m ?? 0})
              </span>
            </div>
          ) : (
            <div className="inline-flex flex-wrap items-center gap-2">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-100/90 dark:bg-amber-950/70 border border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-300 font-semibold">
                <span className="w-2 h-2 rounded-full bg-amber-600 dark:bg-amber-400" />
                <span>Fallback Navigateur Local (PC utilisateur — VM à 0%)</span>
              </div>
              <button
                type="button"
                onClick={handleRetryBackend}
                disabled={retryingBackend}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 font-medium transition-colors cursor-pointer"
                title="Réinitialiser useBrowserFallback = false et tester /api/health sur le serveur VM"
              >
                <RefreshCw
                  className={`w-3 h-3 ${retryingBackend ? 'animate-spin' : ''}`}
                />
                {retryingBackend ? 'Connexion...' : 'Réessayer Backend'}
              </button>
              <button
                type="button"
                onClick={() => setShowVmHelp((s) => !s)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 hover:bg-amber-100 font-medium transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3 h-3" />
                {showVmHelp ? 'Masquer Diagnostic VM' : 'Pourquoi la VM est à 0% ?'}
              </button>
            </div>
          )}

          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">
            {campaigns.length} campagne(s)
            {runningCount > 0 ? ` (${runningCount} en cours)` : ''}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex md:hidden items-center gap-1">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value as ActiveTab)}
              className="px-2 py-1 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded"
            >
              <option value="dashboard">Tableau & Résultats</option>
              <option value="builder">Configurateur Monte-Carlo</option>
              <option value="stress">Stress-Test VM</option>
              <option value="journals">Combat Log & Matrice 2D6</option>
            </select>
          </div>

          <button
            onClick={() => setDarkMode((d) => !d)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-md hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
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

      {/* Panneau de Diagnostic VM lorsque le Fallback Navigateur est actif */}
      {fallbackActive && showVmHelp && (
        <div className="mx-6 mt-4 p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-lg text-xs text-amber-950 dark:text-amber-200 space-y-2">
          <div className="font-bold text-sm flex items-center justify-between">
            <span>
              Diagnostic d'Exécution : Pourquoi votre VM Oracle affiche 0% de CPU ?
            </span>
            <button
              onClick={() => setShowVmHelp(false)}
              className="underline font-normal cursor-pointer"
            >
              Fermer
            </button>
          </div>
          <p>
            Lorsque le badge orange <strong>« Fallback Navigateur Local »</strong> est affiché, les simulations tournent sur un seul cœur <strong>dans l'onglet de votre propre navigateur (sur votre ordinateur)</strong> et non sur la VM Oracle.
          </p>
          {backendDiag && (
            <div className="p-2.5 rounded bg-white/80 dark:bg-slate-900/80 border border-amber-200 dark:border-amber-800 font-mono text-[11px]">
              <div>• Dernière URL testée : <strong>{backendDiag.testedUrl}</strong></div>
              <div>
                • Code HTTP reçu : <strong>{backendDiag.httpStatus ?? 'Aucune réponse'}</strong>{' '}
                {backendDiag.serverHeader ? `(Serveur: ${backendDiag.serverHeader})` : ''}
              </div>
              <div>• Cause détectée : {backendDiag.reason}</div>
            </div>
          )}
          <div className="pt-1">
            <strong>Comment activer le moteur multi-cœurs sur votre VM Oracle :</strong>
            <ol className="list-decimal list-inside mt-1 space-y-1">
              <li>
                Sur le portail de déploiement de votre VM, le projet doit être configuré en <strong>Node.js / Express (AI Studio)</strong> (et non en <em>HTML/JS Statique</em>).
              </li>
              <li>
                La commande de démarrage (<code>ExecStart</code>) doit lancer le serveur Node : <code>npx tsx server.ts</code> (avec <code>npm install --legacy-peer-deps &amp;&amp; npm run build</code> en commande de build).
              </li>
              <li>
                Dès que le service Node tourne sur la VM, cliquez sur <strong>« Réessayer Backend »</strong> : le badge passera au vert <strong>« Serveur VM Actif (X vCPU) »</strong> et utilisera 100% des workers de la VM.
              </li>
            </ol>
          </div>
        </div>
      )}

      {/* Bannière d'erreur éventuelle */}
      {errorBanner && (
        <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 rounded-md flex items-center justify-between text-xs text-red-800 dark:text-red-200">
          <span>{errorBanner}</span>
          <button
            onClick={() => setErrorBanner(null)}
            className="font-semibold underline ml-4 cursor-pointer"
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
            activeCampaign={selectedCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onControlCampaign={handleControlCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            onNavigateToBuilder={() => setActiveTab('builder')}
          />
        )}

        {activeTab === 'builder' && (
          <EvaluationBuilderView
            onStartCampaign={handleLaunchCampaign}
            isSubmitting={isSubmitting}
          />
        )}

        {activeTab === 'stress' && (
          <StressTestView
            campaigns={campaigns}
            activeCampaign={selectedCampaign}
            onSelectCampaign={(id) => setSelectedCampaignId(id)}
            onStartCampaign={handleLaunchCampaign}
            onControlCampaign={handleControlCampaign}
            onDeleteCampaign={handleDeleteCampaign}
            isSubmitting={isSubmitting}
          />
        )}

        {activeTab === 'journals' && (
          <JournalsAndExportView activeCampaign={selectedCampaign} />
        )}
      </main>

      {/* Pied de page sobre */}
      <footer className="px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center justify-between gap-4">
        <div>
          Simulateur Monte-Carlo — « Amazonia : Dernier Rempart » (Nouvelle Architecture Combat & Furtivité)
        </div>
        <div>
          Exécution Multi-Cœurs (worker_threads) · Sauvegarde Asynchrone JSON
        </div>
      </footer>
    </div>
  );
}

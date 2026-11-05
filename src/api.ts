import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  SimulationConfig,
  SingleGameResult,
} from './sim/types';
import { runSingleGame } from './sim/engine';
import { generateCampaignMarkdownReport } from './sim/evaluator';
import { DEFAULT_SIMULATION_CONFIG } from './sim/i18n';
import { browserCampaignManager } from './browserFallback';

let useBrowserFallback = false;
let resolvedBasePrefix: string = '.';

export interface ServerHealthInfo {
  status: string;
  version: string;
  environment: string;
  port: number;
  cpuCount: number;
  workersCount: number;
  busyWorkers?: number;
  queuedTasks?: number;
  cpuPercent?: number;
  loadAvg1m?: number;
  rssMemoryMb?: number;
  activeCampaigns: number;
}

export interface BackendDiagnosticInfo {
  testedUrl: string;
  httpStatus: number | null;
  serverHeader: string | null;
  contentType: string | null;
  reason: string;
}

let lastDiagnostic: BackendDiagnosticInfo | null = null;

export function getLastBackendDiagnostic(): BackendDiagnosticInfo | null {
  return lastDiagnostic;
}

export function isUsingBrowserFallback(): boolean {
  return useBrowserFallback;
}

export function setUseBrowserFallback(value: boolean): void {
  useBrowserFallback = value;
}

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${resolvedBasePrefix}/${cleanEndpoint}`;
}

function getCandidatePrefixes(): string[] {
  const candidates: string[] = ['.'];
  if (typeof window !== 'undefined' && window.location?.pathname) {
    const cleanPath = window.location.pathname.replace(/\/index\.html$/, '').replace(/\/+$/, '');
    if (cleanPath && cleanPath !== '') {
      candidates.unshift(cleanPath);
    }
  }
  if (!candidates.includes('')) {
    candidates.push('');
  }
  return Array.from(new Set(candidates));
}

export async function fetchServerHealth(
  forceRetryBackend = false
): Promise<ServerHealthInfo | null> {
  if (forceRetryBackend) {
    useBrowserFallback = false;
  }
  if (useBrowserFallback) return null;

  const prefixes = getCandidatePrefixes();

  for (const prefix of prefixes) {
    const url = `${prefix}/api/health`;
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const contentType = res.headers.get('content-type') || '';
      const serverHeader = res.headers.get('server') || null;

      if (res.ok && contentType.includes('application/json')) {
        const data = (await res.json()) as ServerHealthInfo;
        if (data && data.status === 'ok') {
          resolvedBasePrefix = prefix;
          useBrowserFallback = false;
          lastDiagnostic = null;
          return data;
        }
      } else {
        lastDiagnostic = {
          testedUrl: url,
          httpStatus: res.status,
          serverHeader,
          contentType,
          reason:
            serverHeader && serverHeader.toLowerCase().includes('python')
              ? `Le serveur web (${serverHeader}) sert uniquement des fichiers statiques (HTML/JS) au lieu d'exécuter le backend Node.js (tsx server.ts).`
              : `Réponse HTTP ${res.status} (${contentType || 'non-JSON'}) sur ${url}. Le backend Node.js/Express n'est pas routé sur cette URL.`,
        };
      }
    } catch (err: any) {
      lastDiagnostic = {
        testedUrl: url,
        httpStatus: null,
        serverHeader: null,
        contentType: null,
        reason: `Erreur réseau lors de la connexion à ${url} (${err?.message || 'serveur injoignable'}).`,
      };
    }
  }

  useBrowserFallback = true;
  return null;
}

async function tryBackendJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T | null> {
  if (useBrowserFallback) return null;
  try {
    const res = await fetch(buildApiUrl(endpoint), {
      ...options,
      cache: 'no-store',
    });
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (
        res.status === 404 ||
        res.status === 405 ||
        res.status === 501 ||
        res.status === 502
      ) {
        useBrowserFallback = true;
      }
      return null;
    }
    return (await res.json()) as T;
  } catch {
    useBrowserFallback = true;
    return null;
  }
}

export async function fetchCampaigns(): Promise<CampaignRecord[]> {
  const data = await tryBackendJson<CampaignRecord[]>('api/campaigns');
  if (data !== null) return data;
  useBrowserFallback = true;
  return browserCampaignManager.listCampaigns();
}

export async function fetchCampaignById(id: string): Promise<CampaignRecord> {
  const data = await tryBackendJson<CampaignRecord>(
    `api/campaigns/${encodeURIComponent(id)}`
  );
  if (data !== null) return data;
  const local = browserCampaignManager.getCampaign(id);
  if (!local) throw new Error('Campagne introuvable');
  return local;
}

export async function createCampaign(
  config: Partial<CampaignConfig>
): Promise<CampaignRecord> {
  const data = await tryBackendJson<CampaignRecord>('api/campaigns', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (data !== null) return data;
  return browserCampaignManager.startCampaign(config);
}

export async function controlCampaign(
  id: string,
  action: 'pause' | 'resume' | 'stop'
): Promise<CampaignRecord> {
  const data = await tryBackendJson<CampaignRecord>(
    `api/campaigns/${encodeURIComponent(id)}/${action}`,
    { method: 'POST' }
  );
  if (data !== null) return data;
  return browserCampaignManager.controlCampaign(id, action);
}

export async function removeCampaign(id: string): Promise<void> {
  const data = await tryBackendJson<{ deleted: boolean }>(
    `api/campaigns/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (data !== null) return;
  browserCampaignManager.deleteCampaign(id);
}

export async function simulateSingleGameTrace(payload: {
  seed: number;
  params: SimulationConfig;
  botProfiles: BotProfileId[];
}): Promise<SingleGameResult> {
  const data = await tryBackendJson<SingleGameResult>('api/simulate-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data !== null) return data;
  return runSingleGame(
    { ...DEFAULT_SIMULATION_CONFIG, ...(payload.params || {}) },
    payload.botProfiles || ['HYBRID_STEALTH_COMBAT'],
    Number(payload.seed) || 42001,
    'custom_inspection',
    true
  );
}

export function downloadCampaignMarkdown(record: CampaignRecord): void {
  const md = generateCampaignMarkdownReport(record);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bilan-ia-${record.id}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCampaignJson(record: CampaignRecord): void {
  const json = JSON.stringify(record, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bilan-complet-${record.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

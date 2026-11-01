import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  EditionPreset,
  GameParameters,
  MechanicalSwitches,
  PinnedSeed,
  SideBySideComparisonResult,
  SingleGameResult,
  ThemeVocabularyMode,
} from './sim/types';
import { runSingleGame } from './sim/engine';
import { generateCampaignMarkdownReport } from './sim/evaluator';
import { DEFAULT_GAME_PARAMETERS } from './sim/i18n';
import { browserCampaignManager } from './browserFallback';

let useBrowserFallback = false;

export function isUsingBrowserFallback(): boolean {
  return useBrowserFallback;
}

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `./${cleanEndpoint}`;
}

async function tryBackendJson<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T | null> {
  if (useBrowserFallback) return null;
  try {
    const res = await fetch(buildApiUrl(endpoint), options);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok || !contentType.includes('application/json')) {
      if (res.status === 404 || res.status === 405 || res.status === 501 || res.status === 502) {
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
  params: GameParameters;
  botProfiles: BotProfileId[];
  vocabulary: ThemeVocabularyMode;
}): Promise<SingleGameResult> {
  const data = await tryBackendJson<SingleGameResult>('api/simulate-single', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data !== null) return data;
  return runSingleGame(
    Number(payload.seed) || 424242,
    { ...DEFAULT_GAME_PARAMETERS, ...(payload.params || {}) },
    'custom_inspection',
    payload.botProfiles || ['COOPERATIVE'],
    {
      recordTraces: true,
      vocabulary: payload.vocabulary || 'AMAZONIA',
    }
  );
}

// Niveau 1 du Conservatoire : Éditions
export async function fetchEditions(): Promise<EditionPreset[]> {
  const data = await tryBackendJson<EditionPreset[]>('api/editions');
  if (data !== null) return data;
  return browserCampaignManager.listEditions();
}

export async function saveEditionPreset(payload: {
  id?: string;
  name: string;
  version?: string;
  description?: string;
  switches: MechanicalSwitches;
  defaultParams?: Partial<GameParameters>;
}): Promise<EditionPreset> {
  const data = await tryBackendJson<EditionPreset>('api/editions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data !== null) return data;
  return browserCampaignManager.saveEdition(payload);
}

export async function removeEditionPreset(id: string): Promise<void> {
  const data = await tryBackendJson<{ deleted: boolean }>(
    `api/editions/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (data !== null) return;
  browserCampaignManager.deleteEdition(id);
}

// Niveau 3 du Conservatoire : Graines Épinglées & Rejeu Côte-à-Côte
export async function fetchPinnedSeeds(): Promise<PinnedSeed[]> {
  const data = await tryBackendJson<PinnedSeed[]>('api/seeds');
  if (data !== null) return data;
  return browserCampaignManager.listPinnedSeeds();
}

export async function savePinnedSeedApi(
  payload: Partial<PinnedSeed> & { seed: number; title: string }
): Promise<PinnedSeed> {
  const data = await tryBackendJson<PinnedSeed>('api/seeds', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data !== null) return data;
  return browserCampaignManager.savePinnedSeed(payload);
}

export async function removePinnedSeedApi(id: string): Promise<void> {
  const data = await tryBackendJson<{ deleted: boolean }>(
    `api/seeds/${encodeURIComponent(id)}`,
    { method: 'DELETE' }
  );
  if (data !== null) return;
  browserCampaignManager.deletePinnedSeed(id);
}

export async function compareSeedSideBySide(payload: {
  seed: number;
  editionAId?: string;
  editionBId?: string;
  paramsA?: GameParameters;
  paramsB?: GameParameters;
  editionAName?: string;
  editionBName?: string;
  botProfile?: BotProfileId;
  vocabulary?: ThemeVocabularyMode;
}): Promise<SideBySideComparisonResult> {
  const data = await tryBackendJson<SideBySideComparisonResult>(
    'api/compare-seed',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  if (data !== null) return data;
  return browserCampaignManager.compareSeed(payload);
}

export function getMarkdownExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/markdown`);
}

export function getJsonExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/json`);
}

export function downloadCampaignMarkdown(record: CampaignRecord): void {
  const md = generateCampaignMarkdownReport(record);
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bilan-ia-v2-${record.id}.md`;
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
  a.download = `bilan-complet-v2-${record.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

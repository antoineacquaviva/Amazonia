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

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `./${cleanEndpoint}`;
}

export async function fetchCampaigns(): Promise<CampaignRecord[]> {
  const res = await fetch(buildApiUrl('api/campaigns'));
  if (!res.ok) throw new Error('Erreur lors de la récupération des campagnes');
  return res.json();
}

export async function fetchCampaignById(id: string): Promise<CampaignRecord> {
  const res = await fetch(buildApiUrl(`api/campaigns/${encodeURIComponent(id)}`));
  if (!res.ok) throw new Error('Campagne introuvable');
  return res.json();
}

export async function createCampaign(
  config: Partial<CampaignConfig>
): Promise<CampaignRecord> {
  const res = await fetch(buildApiUrl('api/campaigns'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Impossible de lancer la campagne');
  }
  return res.json();
}

export async function controlCampaign(
  id: string,
  action: 'pause' | 'resume' | 'stop'
): Promise<CampaignRecord> {
  const res = await fetch(
    buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/${action}`),
    { method: 'POST' }
  );
  if (!res.ok) throw new Error(`Échec de l'action ${action}`);
  return res.json();
}

export async function removeCampaign(id: string): Promise<void> {
  const res = await fetch(buildApiUrl(`api/campaigns/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Échec de la suppression');
}

export async function simulateSingleGameTrace(payload: {
  seed: number;
  params: GameParameters;
  botProfiles: BotProfileId[];
  vocabulary: ThemeVocabularyMode;
}): Promise<SingleGameResult> {
  const res = await fetch(buildApiUrl('api/simulate-single'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Échec de la simulation unitaire');
  return res.json();
}

// Niveau 1 du Conservatoire : Éditions
export async function fetchEditions(): Promise<EditionPreset[]> {
  const res = await fetch(buildApiUrl('api/editions'));
  if (!res.ok) throw new Error('Erreur lors de la récupération des éditions');
  return res.json();
}

export async function saveEditionPreset(payload: {
  id?: string;
  name: string;
  version?: string;
  description?: string;
  switches: MechanicalSwitches;
  defaultParams?: Partial<GameParameters>;
}): Promise<EditionPreset> {
  const res = await fetch(buildApiUrl('api/editions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Erreur lors de la sauvegarde de l’édition');
  }
  return res.json();
}

export async function removeEditionPreset(id: string): Promise<void> {
  const res = await fetch(buildApiUrl(`api/editions/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Impossible de supprimer cette édition');
}

// Niveau 3 du Conservatoire : Graines Épinglées & Rejeu Côte-à-Côte
export async function fetchPinnedSeeds(): Promise<PinnedSeed[]> {
  const res = await fetch(buildApiUrl('api/seeds'));
  if (!res.ok) throw new Error('Erreur lors de la récupération des graines épinglées');
  return res.json();
}

export async function savePinnedSeedApi(
  payload: Partial<PinnedSeed> & { seed: number; title: string }
): Promise<PinnedSeed> {
  const res = await fetch(buildApiUrl('api/seeds'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Impossible d’épingler la graine');
  return res.json();
}

export async function removePinnedSeedApi(id: string): Promise<void> {
  const res = await fetch(buildApiUrl(`api/seeds/${encodeURIComponent(id)}`), {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Impossible de supprimer la graine');
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
  const res = await fetch(buildApiUrl('api/compare-seed'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Échec du rejeu comparatif côte-à-côte');
  return res.json();
}

export function getMarkdownExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/markdown`);
}

export function getJsonExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/json`);
}

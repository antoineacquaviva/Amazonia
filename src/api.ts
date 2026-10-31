import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  GameParameters,
  SingleGameResult,
  ThemeVocabularyMode,
} from './sim/types';

/**
 * Construit une URL d'API relative compatible à la fois avec l'aperçu AI Studio (/)
 * et le déploiement sur VM Oracle derrière Caddy (/<sous-chemin>/).
 */
export function buildApiUrl(endpoint: string): string {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint.slice(1) : endpoint;
  return `${normalizedBase}${cleanEndpoint}`;
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

export function getMarkdownExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/markdown`);
}

export function getJsonExportUrl(id: string): string {
  return buildApiUrl(`api/campaigns/${encodeURIComponent(id)}/export/json`);
}

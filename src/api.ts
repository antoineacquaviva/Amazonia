import {
  BotProfileId,
  CampaignConfig,
  CampaignRecord,
  SimulationConfig,
  SingleGameResult,
} from "./sim/types";

import { campaignReport } from "./campaignReport";

let useBrowserFallback = false;
let resolvedBasePrefix: string = ".";

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
  useBrowserFallback = false;
}

export function buildApiUrl(endpoint: string): string {
  const cleanEndpoint = endpoint.startsWith("/") ? endpoint.slice(1) : endpoint;
  return `${resolvedBasePrefix}/${cleanEndpoint}`;
}

function getCandidatePrefixes(): string[] {
  const candidates: string[] = ["."];
  if (typeof window !== "undefined" && window.location?.pathname) {
    const cleanPath = window.location.pathname
      .replace(/\/index\.html$/, "")
      .replace(/\/+$/, "");
    if (cleanPath && cleanPath !== "") {
      candidates.unshift(cleanPath);
    }
  }
  if (!candidates.includes("")) {
    candidates.push("");
  }
  return [candidates[0]]; // Never probe another tool or the portal root after a refusal.
}

export async function fetchServerHealth(
  forceRetryBackend = false,
): Promise<ServerHealthInfo | null> {
  if (forceRetryBackend) {
    useBrowserFallback = false;
  }
  if (useBrowserFallback) return null;

  const prefixes = getCandidatePrefixes();

  for (const prefix of prefixes) {
    const url = `${prefix}/api/health`;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const contentType = res.headers.get("content-type") || "";
      const serverHeader = res.headers.get("server") || null;

      if (res.ok && contentType.includes("application/json")) {
        const data = (await res.json()) as ServerHealthInfo;
        if (data && data.status === "ok") {
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
            [401,403,503].includes(res.status)
              ? `Accès au serveur refusé ou autorisation non configurée (HTTP ${res.status}). Contactez l’administrateur.`
              : serverHeader && serverHeader.toLowerCase().includes("python")
              ? `Le serveur web (${serverHeader}) sert uniquement des fichiers statiques (HTML/JS) au lieu d'exécuter le backend Node.js (tsx server.ts).`
              : `Réponse HTTP ${res.status} (${contentType || "non-JSON"}) sur ${url}. Le backend Node.js/Express n'est pas routé sur cette URL.`,
        };
      }
    } catch (err: any) {
      lastDiagnostic = {
        testedUrl: url,
        httpStatus: null,
        serverHeader: null,
        contentType: null,
        reason: `Erreur réseau lors de la connexion à ${url} (${err?.message || "serveur injoignable"}).`,
      };
    }
  }

  useBrowserFallback = false;
  return null;
}

async function backendJson<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(buildApiUrl(endpoint), {
    ...options,
    cache: "no-store",
  });
  if (
    !res.ok ||
    !(res.headers.get("content-type") || "").includes("application/json")
  ) {
    throw new Error(
      `Serveur indisponible ou requête refusée (HTTP ${res.status}). Aucune campagne locale créée. Vérifiez le serveur avant de réessayer une création.`,
    );
  }
  return res.json() as Promise<T>;
}
export function fetchCampaigns() {
  return backendJson<CampaignRecord[]>("api/campaigns");
}
export function fetchCampaignById(id: string) {
  return backendJson<CampaignRecord>(`api/campaigns/${encodeURIComponent(id)}`);
}
export function createCampaign(config: Partial<CampaignConfig>) {
  return backendJson<CampaignRecord>("api/campaigns", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
}
export function controlCampaign(
  id: string,
  action: "pause" | "resume" | "stop",
) {
  return backendJson<CampaignRecord>(
    `api/campaigns/${encodeURIComponent(id)}/${action}`,
    { method: "POST", headers: {"Content-Type":"application/json"}, body: "{}" },
  );
}
export async function removeCampaign(id: string) {
  await backendJson(`api/campaigns/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: {"Content-Type":"application/json"},
    body: "{}",
  });
}
export function simulateSingleGameTrace(payload: {
  seed: number;
  params: SimulationConfig;
  botProfiles: BotProfileId[];
}) {
  return backendJson<SingleGameResult>("api/simulate-single", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function downloadCampaignMarkdown(record: CampaignRecord): void {
  const md = campaignReport(record);
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bilan-ia-${record.id}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadCampaignJson(record: CampaignRecord): void {
  const json = JSON.stringify(record, null, 2);
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `bilan-complet-${record.id}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

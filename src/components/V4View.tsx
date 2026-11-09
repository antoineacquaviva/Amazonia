import React, { useEffect, useState } from "react";
import { buildApiUrl } from "../api";
import { DEFAULT_V4_CONFIG, type V4Config } from "../v4/types";
import { validateV4Config } from "../v4/config";
import type { V4Campaign } from "../v4/campaign";
async function request<T>(
  endpoint: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  const response = await fetch(buildApiUrl(`api/v4/campaigns${endpoint}`), {
    method: method ?? (body ? "POST" : "GET"),
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
  return data;
}
export function V4View() {
  const [config, setConfig] = useState<V4Config>(
      structuredClone(DEFAULT_V4_CONFIG),
    ),
    [eye, setEye] = useState("1,2,3"),
    [seeds, setSeeds] = useState("42001,42002,42003,42004"),
    [allVariants, setAll] = useState(false),
    [campaign, setCampaign] = useState<V4Campaign | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState<V4Campaign[]>([]);
  const effective = {
    ...config,
    initialEyeOrder: eye.split(",").map((v) => Number(v.trim()) - 1),
  };
  let invalid = "";
  try {
    validateV4Config(effective);
  } catch (e) {
    invalid = (e as Error).message;
  }
  const load = async () => {
    try {
      setSaved(await request<V4Campaign[]>(""));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (campaign?.status !== "RUNNING") return;
    const timer = setInterval(() => {
      request<V4Campaign>(`/${campaign.id}`)
        .then((c) => {
          setCampaign(c);
          if (c.status !== "RUNNING") void load();
        })
        .catch((e) => setError(e.message));
    }, 700);
    return () => clearInterval(timer);
  }, [campaign?.id, campaign?.status]);
  const launch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const c = await request<V4Campaign>("", {
        config: effective,
        seeds: seeds.split(",").map(Number),
        allVariants,
      });
      setCampaign(c);
      void load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "border rounded p-2 bg-white text-slate-900";
  return (
    <section aria-label="Simulation V4" className="space-y-5">
      <h1 className="text-2xl font-bold">Amazonia V4 — essai expérimental</h1>
      <p>
        Score : arbres debout après régénération. Aucun seuil de victoire. Bots
        à lancers privés, deux passes de révision des soutiens. Les huit
        combinaisons partagent les mêmes graines.
      </p>
      <form onSubmit={launch} className="border rounded p-4 space-y-4">
        <div className="grid sm:grid-cols-3 gap-4">
          {(
            [
              ["numPlayers", "Joueurs", 3, 6],
              ["numTurns", "Tours", 1, 12],
              ["trackLength", "Positions par piste", 2, 64],
            ] as const
          ).map(([key, label, min, max]) => (
            <label key={key} className="flex flex-col gap-1">
              {label}
              <input
                className={field}
                type="number"
                min={min}
                max={max}
                value={config[key]}
                onChange={(e) =>
                  setConfig({ ...config, [key]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label className="flex flex-col gap-1">
            Arbres par case
            <select
              className={field}
              value={config.initialTreesPerCell}
              onChange={(e) =>
                setConfig({
                  ...config,
                  initialTreesPerCell: Number(e.target.value) as 2 | 3,
                })
              }
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Ordre initial de l’Œil (joueurs)
            <input
              className={field}
              value={eye}
              onChange={(e) => setEye(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Graines distinctes, séparées par virgules
            <input
              className={field}
              value={seeds}
              onChange={(e) => setSeeds(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1">
            Prise de l’Œil
            <select
              className={field}
              value={config.eyeMode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  eyeMode: e.target.value as V4Config["eyeMode"],
                })
              }
            >
              <option>ONE_STEP</option>
              <option>FULL_CAPTURE</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Défenseurs par case furtive
            <select
              className={field}
              value={config.stealthCapacity}
              onChange={(e) =>
                setConfig({
                  ...config,
                  stealthCapacity: e.target
                    .value as V4Config["stealthCapacity"],
                })
              }
            >
              <option value="SINGLE">Un seul</option>
              <option value="MULTIPLE">Plusieurs</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Sabotage par défenseur
            <select
              className={field}
              value={config.sabotageMode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  sabotageMode: e.target.value as V4Config["sabotageMode"],
                })
              }
            >
              <option value="ONE_MACHINE">Une machine choisie</option>
              <option value="BOTH_MACHINES">Les deux machines immobiles</option>
            </select>
          </label>
        </div>
        <p>
          Exception initiale : la case 2 des deux premiers rangs contient un
          arbre de moins et une souche. Fin de piste ouverte : longueur ≥ tours
          + 1 obligatoire.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={allVariants}
            onChange={(e) => setAll(e.target.checked)}
          />
          Comparer les huit combinaisons (8 graines maximum)
        </label>
        {invalid && (
          <p role="alert" className="text-red-700">
            Configuration non prise en charge : {invalid}
          </p>
        )}
        <button
          className="bg-emerald-700 text-white px-4 py-2 rounded disabled:opacity-50"
          disabled={!!invalid || busy || campaign?.status === "RUNNING"}
        >
          {busy ? "Envoi…" : "Lancer la simulation V4"}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <p>
        64 parties au plus par campagne ; une campagne V4 active à la fois.
        Résultats conservés en mémoire (quatre campagnes) : exporter avant
        redémarrage.
      </p>
      {saved.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {saved.map((c) => (
            <button
              className="border rounded p-2"
              key={c.id}
              onClick={() =>
                request<V4Campaign>(`/${c.id}`)
                  .then(setCampaign)
                  .catch((e) => setError(e.message))
              }
            >
              {c.createdAt} · {c.status} · {c.completed}/{c.total}
            </button>
          ))}
        </div>
      )}
      {campaign && (
        <article className="space-y-3" aria-label="Résultats V4">
          <h2 className="text-xl font-semibold">
            {campaign.status} · {campaign.completed}/{campaign.total} parties
          </h2>
          <progress
            aria-label="Avancement V4"
            value={campaign.completed}
            max={campaign.total}
          />
          {campaign.error && <p role="alert">{campaign.error}</p>}
          <p>
            Règles : {campaign.rulesVersion} · Bots :{" "}
            {campaign.provenance.botVersion} · Code :{" "}
            {campaign.provenance.commit.slice(0, 12)}
            {campaign.provenance.dirty ? " (modifié)" : ""}
          </p>
          <p>
            Ordre enregistré :{" "}
            {campaign.input.config.initialEyeOrder
              .map((p) => `J${p + 1}`)
              .join("–")}{" "}
            · Graines : {campaign.input.seeds.join(", ")}
          </p>
          <div className="flex gap-4">
            <a
              className="underline"
              href={buildApiUrl(`api/v4/campaigns/${campaign.id}/export/json`)}
              download
            >
              Exporter JSON et traces
            </a>
            <a
              className="underline"
              href={buildApiUrl(
                `api/v4/campaigns/${campaign.id}/export/markdown`,
              )}
              download
            >
              Exporter le bilan Markdown
            </a>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr>
                  {[
                    "Œil",
                    "Furtivité",
                    "Sabotage",
                    "Parties",
                    "Arbres moyens",
                    "Pertes moyennes",
                  ].map((h) => (
                    <th key={h} className="p-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaign.configs.map((c, i) => {
                  const games = campaign.results.filter(
                    (r) =>
                      r.config.eyeMode === c.eyeMode &&
                      r.config.stealthCapacity === c.stealthCapacity &&
                      r.config.sabotageMode === c.sabotageMode,
                  );
                  const avg = (key: "finalStanding" | "ecologicalLoss") =>
                    games.length
                      ? (
                          games.reduce((sum, r) => sum + r[key], 0) /
                          games.length
                        ).toFixed(2)
                      : "—";
                  return (
                    <tr key={i}>
                      {[
                        c.eyeMode,
                        c.stealthCapacity,
                        c.sabotageMode,
                        games.length,
                        avg("finalStanding"),
                        avg("ecologicalLoss"),
                      ].map((v, j) => (
                        <td className="p-2 border-t" key={j}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p>
            Démo exploratoire ; ces effectifs ne permettent pas de conclure sur
            l’équilibrage.
          </p>
          {campaign.status !== "RUNNING" && (
            <button
              className="border rounded p-2"
              onClick={async () => {
                try {
                  await request(`/${campaign.id}`, {}, "DELETE");
                  setCampaign(null);
                  void load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Supprimer de la mémoire après export
            </button>
          )}
        </article>
      )}
    </section>
  );
}

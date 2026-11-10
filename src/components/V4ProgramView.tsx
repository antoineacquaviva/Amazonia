import React, { useEffect, useState } from "react";
import { buildApiUrl } from "../api";
import type { StudyManager } from "../v4science/manager";
import type { programReport } from "../v4science/programReport";
import type { Sample } from "../v4science/types";
type Summary = ReturnType<StudyManager["programSummary"]>;
type Report = ReturnType<typeof programReport>;
const base = "api/v4/studies/programs";
async function read<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(buildApiUrl(path), {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      `Réponse inattendue du portail (HTTP ${r.status}). Vérifier la connexion.`,
    );
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data;
}
const status = {
  RUNNING: "En cours",
  PAUSED: "En pause",
  STOPPED: "Arrêté",
  COMPLETED: "Terminé",
  ERROR: "Interrompu",
};
const btn = "border rounded px-3 py-2 disabled:opacity-50";
export function V4ProgramView() {
  const [repeats, depth] = useState(32),
    [list, history] = useState<Summary[]>([]),
    [id, select] = useState(""),
    [report, show] = useState<Report | null>(null),
    [variant, choose] = useState(""),
    [sample, replay] = useState<Sample | null>(null),
    [error, fail] = useState(""),
    [busy, lock] = useState(false),
    [revision, refresh] = useState(0);
  const selected = list.find((x) => x.id === id);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = await read<Summary[]>(base);
        if (active) {
          history(rows);
          select((old) => old || rows[0]?.id || "");
        }
      } catch (e) {
        if (active) fail((e as Error).message);
      }
    }
    void load();
    const timer = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [revision]);
  useEffect(() => {
    let active = true;
    show(null);
    replay(null);
    choose("");
    if (id)
      read<Report>(base + "/" + id + "/summary")
        .then((r) => {
          if (active) {
            show(r);
            choose(r.recommendation?.variant ?? r.cells[0].variant);
          }
        })
        .catch((e) => {
          if (active) fail(e.message);
        });
    return () => {
      active = false;
    };
  }, [id, selected?.status, revision]);
  async function act(fn: () => Promise<void>) {
    lock(true);
    fail("");
    try {
      await fn();
      refresh((n) => n + 1);
    } catch (e) {
      fail((e as Error).message);
    } finally {
      lock(false);
    }
  }
  async function start() {
    const key = "amazonia.v4.request." + repeats;
    const token = sessionStorage.getItem(key) ?? crypto.randomUUID();
    sessionStorage.setItem(key, token);
    const p = await read<Summary>(base, { id: token, repeats });
    sessionStorage.removeItem(key);
    select(p.id);
  }
  const cells = report?.cells.filter((c) => c.variant === variant) ?? [];
  const witness = cells.find(
    (c) => c.family === "COORD_HYBRID" && c.witness,
  )?.witness;
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">Évaluer les huit variantes V4</h1>
      <p>
        3 à 6 joueurs · 2 ou 3 arbres par case · 7 familles d’équipes homogènes.
        Chaque table joue 8 tours sur 16 positions, dans l’ordre initial J1 à
        JN.
      </p>
      <label>
        Parties par variante, table et famille{" "}
        <select
          className={btn}
          value={repeats}
          onChange={(e) => depth(Number(e.target.value))}
        >
          {[2, 32, 128].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <p>
        448 combinaisons · {(448 * repeats).toLocaleString("fr-FR")} parties.
        Effectif fixe. Les équipes mixtes, les rotations et la précision
        adaptative restent hors de ce protocole.
      </p>
      <button
        className={btn + " bg-emerald-800 text-white"}
        disabled={busy}
        onClick={() => act(start)}
      >
        Lancer la campagne comparative
      </button>
      {busy && <p role="status">Demande en cours…</p>}
      {error && <p role="alert">{error}</p>}
      {!!list.length && (
        <label className="block">
          Campagne{" "}
          <select
            value={id}
            className={btn}
            onChange={(e) => select(e.target.value)}
          >
            {list.map((x) => (
              <option key={x.id} value={x.id}>
                {new Date(x.created).toLocaleString("fr-FR")} ·{" "}
                {status[x.status]} · {x.repeats} parties par combinaison
              </option>
            ))}
          </select>
        </label>
      )}
      {selected && (
        <section className="space-y-3 border rounded p-4">
          <h2 className="font-bold">
            {status[selected.status]} ·{" "}
            {selected.completed.toLocaleString("fr-FR")} /{" "}
            {selected.total.toLocaleString("fr-FR")} parties
          </h2>
          <progress value={selected.completed} max={selected.total} />
          <p>
            {selected.table} {selected.reason}
          </p>
          {selected.status !== "COMPLETED" && (
            <button
              className={btn}
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await read(
                    base +
                      "/" +
                      id +
                      "/" +
                      (selected.status === "RUNNING" ? "pause" : "resume"),
                    {},
                  );
                })
              }
            >
              {selected.status === "RUNNING"
                ? "Suspendre le programme"
                : "Reprendre le programme"}
            </button>
          )}
          <a
            className="block underline"
            href={buildApiUrl(base + "/" + id + "/export")}
          >
            Télécharger le bilan IA{" "}
            {selected.status === "COMPLETED" ? "complet" : "intermédiaire"}{" "}
            (JSON)
          </a>
          <details>
            <summary>Données détaillées</summary>
            <a
              className="underline"
              href={buildApiUrl(base + "/" + id + "/export?detail=units")}
            >
              Télécharger toutes les mesures et traces (JSON volumineux)
            </a>
          </details>
        </section>
      )}
      {report && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Comprendre les variantes</h2>
          {report.recommendation && (
            <article>
              <h3>Proposition importée pour cette campagne</h3>
              <p>
                {
                  report.cells.find(
                    (c) => c.variant === report.recommendation?.variant,
                  )?.rules
                }
              </p>
              <p>{report.recommendation.rationale}</p>
              <p>Alternatives — {report.recommendation.alternatives}</p>
              <p>Réserves — {report.recommendation.limits}</p>
            </article>
          )}
          {selected?.status === "COMPLETED" && (
            <label>
              Importer la recommandation issue du bilan (JSON){" "}
              <input
                type="file"
                accept=".json"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f)
                    void act(async () => {
                      if (f.size > 100000)
                        throw new Error("Fichier trop volumineux");
                      await read(
                        base + "/" + id + "/recommendation",
                        JSON.parse(await f.text()),
                      );
                    });
                }}
              />
            </label>
          )}
          <select
            className={btn + " max-w-full"}
            aria-label="Variante à examiner"
            value={variant}
            onChange={(e) => {
              choose(e.target.value);
              replay(null);
            }}
          >
            {Array.from(
              new Map(report.cells.map((c) => [c.variant, c.rules])).entries(),
            ).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <p>{cells[0]?.rules}</p>
          <details>
            <summary>Résultats par table et famille au dernier bilan</summary>
            <table>
              <thead>
                <tr>
                  <th>Joueurs / arbres</th>
                  <th>Famille</th>
                  <th>Parties</th>
                  <th>Pertes moyennes</th>
                </tr>
              </thead>
              <tbody>
                {cells.map((c) => (
                  <tr
                    key={[
                      c.config.numPlayers,
                      c.config.initialTreesPerCell,
                      c.family,
                    ].join("/")}
                  >
                    <td>
                      {c.config.numPlayers} / {c.config.initialTreesPerCell}
                    </td>
                    <td>{c.family}</td>
                    <td>
                      {c.observed}/{c.planned}
                    </td>
                    <td>{c.meanLoss?.toFixed(2) ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
          <button className={btn} onClick={() => refresh((n) => n + 1)}>
            Actualiser le bilan
          </button>
          {witness && (
            <button
              className={btn}
              disabled={busy}
              onClick={async () => {
                try {
                  const data = await read<{ samples: Sample[] }>(
                    `api/v4/studies/${witness.study}/witness/${witness.index}`,
                  );
                  replay(data.samples[0]);
                } catch (e) {
                  fail((e as Error).message);
                }
              }}
            >
              Lire une partie témoin
            </button>
          )}
          {sample &&
            sample.config.eyeMode +
              "/" +
              sample.config.stealthCapacity +
              "/" +
              sample.config.sabotageMode ===
              variant && (
              <div>
                <h3>
                  Partie observée · graine {sample.seed} ·{" "}
                  {sample.config.numPlayers} joueurs
                </h3>
                <ol>
                  {sample.trace?.map((t) => (
                    <li key={t.turn}>
                      Tour {t.turn} · {t.placements.length} placements ·{" "}
                      {t.combats.filter((c) => c.parried).length} combats parés
                      sur {t.combats.length} · ordre final{" "}
                      {t.eyeAfter.map((n) => "J" + (n + 1)).join(", ")}
                    </li>
                  ))}
                </ol>
              </div>
            )}
        </section>
      )}
    </section>
  );
}

import React, { useEffect, useState } from "react";
import { buildApiUrl } from "../api";
import { DEFAULT_V4_CONFIG, type V4Config } from "../v4/types";
import {
  FAMILIES,
  PROTOCOL,
  type Family,
  type Plan,
  type Study,
} from "../v4science/types";
import type { studyReport } from "../v4science/statistics";
type Report = ReturnType<typeof studyReport>;
async function request<T>(endpoint: string, body?: unknown): Promise<T> {
  const r = await fetch(buildApiUrl(`api/v4/studies${endpoint}`), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? `HTTP ${r.status}`);
  return data;
}
function display(value: any) {
  if (value?.mean == null) return "indisponible";
  return `${value.mean.toFixed(3)} (n=${value.n}${value.ci95 ? `, IC95 [${value.ci95.map((n: number) => n.toFixed(2)).join(" ; ")}]` : ", IC indisponible"})`;
}
export function V4ScienceView() {
  const [configs, setConfigs] = useState<V4Config[]>([
      structuredClone(DEFAULT_V4_CONFIG),
    ]),
    [draft, setDraft] = useState<V4Config>(structuredClone(DEFAULT_V4_CONFIG)),
    [eye, setEye] = useState("1,2,3"),
    [families, setFamilies] = useState<Family[]>([...FAMILIES]),
    [count, setCount] = useState(2),
    [seed, setSeed] = useState(51001),
    [exp, setExp] = useState(17),
    [env, setEnv] = useState(23),
    [policy, setPolicy] = useState(29),
    [independent, setIndependent] = useState(false),
    [name, setName] = useState("Étude V4 ciblée"),
    [studies, setStudies] = useState<Study[]>([]),
    [selected, setSelected] = useState<Study | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [estimate, setEstimate] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState(""),
    [configText, setConfigText] = useState("");
  const plan: Plan = {
    protocol: PROTOCOL,
    name,
    configs,
    families,
    seeds: Array.from(
      { length: Math.min(20000, Math.max(0, count)) },
      (_, i) => seed + i,
    ),
    experimentSeed: exp,
    environmentSeed: env,
    policySeed: policy,
    independentGames: independent,
  };
  const load = async () => {
    try {
      const r = await request<{ studies: Study[] }>("");
      setStudies(r.studies);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const view = async (id: string) => {
    const [s, r] = await Promise.all([
      request<Study>(`/${id}`),
      request<Report>(`/${id}/report`),
    ]);
    setSelected(s);
    setReport(r);
  };
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    if (!selected || selected.status !== "RUNNING") return;
    const timer = setInterval(() => {
      void view(selected.id).catch((e) => setError(e.message));
      void load();
    }, 1500);
    return () => clearInterval(timer);
  }, [selected?.id, selected?.status]);
  const check = async () => {
    setError("");
    try {
      setEstimate(await request("/estimate", plan));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const s = await request<Study>("", plan);
      setSelected(s);
      setReport(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const control = async (action: "pause" | "resume" | "stop") => {
    if (!selected) return;
    setError("");
    try {
      const s = await request<Study>(`/${selected.id}/${action}`, {});
      setSelected(s);
      await load();
      await view(s.id);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const changed = () => { setEstimate(null); setFeedback(""); },
    field = "border rounded p-2 bg-white text-slate-900";
  return (
    <section aria-label="Étude scientifique V4" className="space-y-5">
      <h1 className="text-2xl font-bold">
        Campagne V4 durable — sept familles
      </h1>
      <p>
        Règles V4 conservées. Équipes homogènes, hasard exogène indexé commun,
        checkpoints serveur. Aucun seuil de victoire, note /100 ou optimum
        omniscient.
      </p>
      <div className="border rounded p-4 space-y-3">
        <h2 className="font-bold">Plan ciblé</h2>
        <label className="flex flex-col">
          Nom de l’étude
          <input
            className={field}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              changed();
            }}
          />
        </label>
        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              ["numPlayers", "Joueurs", 3, 6],
              ["numTurns", "Tours", 1, 12],
              ["trackLength", "Positions par piste", 2, 64],
            ] as const
          ).map(([k, label, min, max]) => (
            <label key={k} className="flex flex-col">
              {label}
              <input
                className={field}
                type="number"
                min={min}
                max={max}
                value={draft[k]}
                onChange={(e) =>
                  setDraft({ ...draft, [k]: Number(e.target.value) })
                }
              />
            </label>
          ))}
          <label className="flex flex-col">
            Ordre initial (J1, J2…){" "}
            <input
              className={field}
              value={eye}
              onChange={(e) => setEye(e.target.value)}
            />
          </label>
          <label className="flex flex-col">
            Arbres par case
            <select
              className={field}
              value={draft.initialTreesPerCell}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  initialTreesPerCell: Number(e.target.value) as 2 | 3,
                })
              }
            >
              <option value={2}>2</option>
              <option value={3}>3</option>
            </select>
          </label>
          <label className="flex flex-col">
            Œil
            <select
              className={field}
              value={draft.eyeMode}
              onChange={(e) =>
                setDraft({ ...draft, eyeMode: e.target.value as any })
              }
            >
              <option>ONE_STEP</option>
              <option>FULL_CAPTURE</option>
            </select>
          </label>
          <label className="flex flex-col">
            Capacité furtive
            <select
              className={field}
              value={draft.stealthCapacity}
              onChange={(e) =>
                setDraft({ ...draft, stealthCapacity: e.target.value as any })
              }
            >
              <option>SINGLE</option>
              <option>MULTIPLE</option>
            </select>
          </label>
          <label className="flex flex-col">
            Sabotage
            <select
              className={field}
              value={draft.sabotageMode}
              onChange={(e) =>
                setDraft({ ...draft, sabotageMode: e.target.value as any })
              }
            >
              <option>ONE_MACHINE</option>
              <option>BOTH_MACHINES</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="border rounded p-2"
            onClick={() => {
              setConfigs([
                {
                  ...draft,
                  initialEyeOrder: eye.split(",").map((v) => Number(v) - 1),
                },
              ]);
              changed();
              setFeedback("Configuration appliquée. Le plan contient cette seule configuration.");
            }}
          >
            Utiliser cette configuration seule
          </button>
          <button
            className="border rounded p-2"
            onClick={() => {
              setConfigs([
                ...configs,
                {
                  ...draft,
                  initialEyeOrder: eye.split(",").map((v) => Number(v) - 1),
                },
              ]);
              changed();
            }}
          >
            Ajouter au plan ciblé
          </button>
          <button
            className="border rounded p-2"
            onClick={() => {
              const base = {
                ...draft,
                initialEyeOrder: eye.split(",").map((v) => Number(v) - 1),
              };
              setConfigs(
                (["ONE_STEP", "FULL_CAPTURE"] as const).flatMap((eyeMode) =>
                  (["SINGLE", "MULTIPLE"] as const).flatMap((stealthCapacity) =>
                    (["ONE_MACHINE", "BOTH_MACHINES"] as const).map(
                      (sabotageMode) => ({
                        ...base,
                        eyeMode,
                        stealthCapacity,
                        sabotageMode,
                      }),
                    ),
                  ),
                ),
              );
              changed();
            }}
          >
            Préparer les huit variantes
          </button>
        </div>
        <p>
          <span role="status">{feedback} </span>Configurations retenues : {configs.length} (au plus 16). Longueur ≥
          tours + 1 obligatoire ; les brouillons ne s’appliquent qu’après ajout
          ou remplacement.
        </p>
        <details>
          <summary>Voir ou éditer le plan exact des configurations</summary>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(configs, null, 2)}
          </pre>
          <textarea
            aria-label="Configurations JSON"
            className={field + " w-full h-40"}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
          />
          <button
            className="border p-2"
            onClick={() => {
              try {
                const c = JSON.parse(configText);
                if (!Array.isArray(c)) throw new Error("Tableau JSON requis");
                setConfigs(c);
                changed();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Appliquer le JSON
          </button>
        </details>
        <fieldset>
          <legend>Familles étudiées (équipes homogènes)</legend>
          <div className="flex flex-wrap gap-3">
            {FAMILIES.map((f) => (
              <label key={f}>
                <input
                  type="checkbox"
                  checked={families.includes(f)}
                  onChange={(e) => {
                    setFamilies(
                      e.target.checked
                        ? [...families, f]
                        : families.filter((x) => x !== f),
                    );
                    changed();
                  }}
                />{" "}
                {f}
                {f === "OMNISCIENT" ? " — privilégié, heuristique" : ""}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="grid sm:grid-cols-3 gap-3">
          {(
            [
              ["Parties par configuration et famille", count, setCount],
              ["Première graine unitaire", seed, setSeed],
              ["Graine expérience", exp, setExp],
              ["Graine environnement", env, setEnv],
              ["Graine décisionnelle", policy, setPolicy],
            ] as const
          ).map(([label, v, set]) => (
            <label className="flex flex-col" key={label}>
              {label}
              <input
                className={field}
                type="number"
                min={1}
                max={label.startsWith("Parties") ? 20000 : 4294967295}
                value={v}
                onChange={(e) => {
                  set(Number(e.target.value));
                  changed();
                }}
              />
            </label>
          ))}
        </div>
        <label className="flex gap-2">
          <input
            type="checkbox"
            checked={independent}
            onChange={(e) => {
              setIndependent(e.target.checked);
              changed();
            }}
          />
          Déclarer les parties indépendantes pour les IC (modèle
          pseudo-aléatoire, effectif fixe)
        </label>
        <p>
          Effectif prévu : {configs.length * families.length * count} parties.
          L’estimation et les limites sont vérifiées côté serveur avant
          lancement.
        </p>
        <button className="border rounded p-2" onClick={check}>
          Estimer et vérifier le plan
        </button>
        {estimate && (
          <p role="status">
            {estimate.total} parties ; coût estimé{" "}
            {estimate.estimatedSeconds.toFixed(1)} s ({estimate.basis}). Limites
            : {estimate.limits.maxGames} parties, {estimate.limits.batchSize}{" "}
            par lot, {estimate.limits.maxActive} campagne active.{" "}
            {estimate.warning}
          </p>
        )}
        <button
          className="ml-3 bg-emerald-700 text-white rounded p-2 disabled:opacity-50"
          disabled={!estimate || busy}
          onClick={start}
        >
          {busy ? "Lancement en cours…" : "Lancer le plan fixe"}
        </button>
        {!estimate && <p>Estimer et vérifier le plan pour activer le lancement.</p>}
      </div>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <h2 className="text-xl font-semibold">Campagnes conservées</h2>
      <button className="border rounded p-2" onClick={load}>
        Actualiser les campagnes
      </button>
      <div className="flex flex-wrap gap-2">
        {studies.map((s) => (
          <button
            key={s.id}
            className="border rounded p-2"
            onClick={() => view(s.id).catch((e) => setError(e.message))}
          >
            {s.plan.name} · {s.status} · {s.completed}/{s.total}
          </button>
        ))}
      </div>
      {selected && (
        <article aria-label="Bilan scientifique V4" className="space-y-3">
          <h2 className="text-xl">
            {selected.status} · {selected.completed}/{selected.total} parties
          </h2>
          <progress
            aria-label="Checkpoint scientifique"
            value={selected.completed}
            max={selected.total}
          />
          <p>
            {selected.reason} {selected.lastError}
          </p>
          <div className="flex gap-3">
            {(["pause", "resume", "stop"] as const).map((a) => (
              <button
                key={a}
                className="border rounded p-2"
                disabled={selected.status === "COMPLETED"}
                onClick={() => control(a)}
              >
                {
                  {
                    pause: "Suspendre",
                    resume: "Reprendre explicitement",
                    stop: "Arrêter",
                  }[a]
                }
              </button>
            ))}
          </div>
          <p>
            Les calculs continuent sans navigateur. Après interruption serveur,
            reprise explicite requise. Sources :{" "}
            {selected.provenance.sourceHash.slice(0, 16)} ·{" "}
            {selected.provenance.commit.slice(0, 12)}.
          </p>
          <div className="flex gap-3">
            {["json", "markdown"].map((f) => (
              <a
                key={f}
                className="underline"
                download
                href={buildApiUrl(`api/v4/studies/${selected.id}/export/${f}`)}
              >
                Exporter{" "}
                {f === "json" ? "l’archive JSON autonome" : "le bilan Markdown"}
              </a>
            ))}
          </div>
          {report && (
            <>
              <p>{report.interpretation}</p>
              <p>
                Agrégation /100 : indisponible.{" "}
                {report.complete
                  ? "Plan complet"
                  : "Résultats partiels : aucun IC"}
              </p>
              <div className="overflow-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr>
                      {[
                        "Strate / famille",
                        "Difficulté : arbres",
                        "Pertes",
                        "Arbres hors d’atteinte",
                        "Horizon accessible : pertes",
                      ].map((h) => (
                        <th className="p-2" key={h}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.tables.map((t, i) => (
                      <tr key={i}>
                        {[
                          `${t.configId.slice(0, 8)} / ${t.family}`,
                          display(t.difficulty.standing),
                          display(t.difficulty.loss),
                          display(t.difficulty.unreachableStanding),
                          display(t.difficulty.reachableLoss),
                        ].map((v, j) => (
                          <td className="border-t p-2" key={j}>
                            {v}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <h3 className="font-bold">
                Information et coordination — contrastes appariés
              </h3>
              {report.policyContrasts.map((c, i) => (
                <p key={i}>
                  {c.configId.slice(0, 8)} · {c.left} − {c.right} :{" "}
                  {display(c.estimate)} ·{" "}
                  {c.estimate.reason ?? "appariement vérifié"}
                </p>
              ))}
              <details>
                <summary>
                  Comparaisons ciblées de variantes et rotations de l’Œil
                </summary>
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(report.ruleContrasts, null, 2)}
                </pre>
              </details>
              {report.tables.map((t, i) => (
                <details key={i}>
                  <summary>
                    {t.configId.slice(0, 8)} / {t.family} — distributions,
                    dynamique, efficience et équité
                  </summary>
                  <p>
                    Distribution du score :{" "}
                    {JSON.stringify(t.difficulty.distribution)} ; concentration
                    maximale : {display(t.concentration)}
                  </p>
                  <h4 className="font-bold">Efficience (compteurs séparés)</h4>
                  {Object.entries(t.efficiency).map(([k, v]) => (
                    <p key={k}>
                      {k} : {display(v)}
                    </p>
                  ))}
                  <h4 className="font-bold">Dynamique par tour</h4>
                  <div className="overflow-auto">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "Tour",
                            "Dégâts écologiques",
                            "Parades",
                            "Combats",
                            "Récupérations HS",
                            "Parades grâce aux jetons",
                          ].map((h) => (
                            <th className="p-2" key={h}>
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {t.dynamics.map((d: any) => (
                          <tr key={d.turn}>
                            {[
                              d.turn,
                              display(d.ecologicalDamage),
                              display(d.parries),
                              display(d.combats),
                              display(d.recoveries),
                              display(d.tokenEnabledParries),
                            ].map((v, j) => (
                              <td className="p-2" key={j}>
                                {v}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <h4 className="font-bold">
                    Équité par joueur et rang initial
                  </h4>
                  {t.fairness.map((p) => (
                    <p key={p.player}>
                      Joueur {p.player + 1}, rang initial {p.initialRank} :
                      pertes {display(p.loss)}, découvertes{" "}
                      {display(p.discoveries)}, rangs moyens{" "}
                      {p.rankTrajectory
                        .map((r) => r.mean?.toFixed(2) ?? "—")
                        .join(" → ")}
                    </p>
                  ))}
                </details>
              ))}
            </>
          )}
        </article>
      )}
    </section>
  );
}

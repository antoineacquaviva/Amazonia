import { digest } from "../scientific/random";
import { meanEstimate, type Estimate } from "../scientific/statistics";
import { environmentEvents } from "./runner";
import { compatible } from "./protocol";
import {
  PROTOCOL,
  POLICY_VERSIONS,
  type Sample,
  type Study,
  type Plan,
  type Family,
} from "./types";
export type ComparisonKind = "POLICY" | "RULE_VARIANT" | "EYE_ORDER";
const pairs: [Family, Family][] = [
  ["PROB_ONLY", "BLIND"],
  ["SOLO_INFORMED", "PROB_ONLY"],
  ["COORD_HYBRID", "COORD_NO_DICE"],
  ["COORD_ONE_SHOT", "SOLO_INFORMED"],
  ["COORD_HYBRID", "COORD_ONE_SHOT"],
  ["OMNISCIENT", "COORD_HYBRID"],
];
export function validateSample(s: Sample, plan: Plan) {
  const config = plan.configs.find((c) => digest(c) === s.configId);
  if (
    !config ||
    s.protocol !== PROTOCOL ||
    digest(config) !== digest(s.config) ||
    !plan.families.includes(s.family) ||
    !plan.seeds.includes(s.seed) ||
    s.unit !== `game:${s.seed}` ||
    s.violations.length ||
    s.privileged !== (s.family === "OMNISCIENT") ||
    digest(s.team) !== digest(Array(config.numPlayers).fill(s.family)) ||
    digest(s.policyVersions) !==
      digest(Array(config.numPlayers).fill(POLICY_VERSIONS[s.family]))
  )
    throw new Error("Échantillon incompatible ou invariant violé");
  const env = environmentEvents(plan, config, s.seed);
  if (
    s.environmentKey !== env.environmentKey ||
    digest(s.events) !== digest(env.events) ||
    s.eventFingerprint !== digest(env.events)
  )
    throw new Error("Événements exogènes non vérifiés");
  const expectedPairing = digest([
    PROTOCOL,
    s.provenance.sourceHash,
    s.provenance.runtime,
    env.environmentKey,
    config.numPlayers,
    config.numTurns,
    config.trackLength,
    config.initialTreesPerCell,
  ]);
  if (s.pairingKey !== expectedPairing)
    throw new Error("Clé d’appariement non vérifiée");
  const m = s.measures;
  if (
    !Number.isFinite(m.finalStanding) ||
    m.finalStanding < 0 ||
    m.finalStanding > m.initialStock ||
    m.initialStock !==
      config.numPlayers * config.trackLength * config.initialTreesPerCell ||
    m.ecologicalLoss !== m.initialStock - m.finalStanding ||
    m.byPlayer.length !== config.numPlayers ||
    m.byPlayer.reduce((n, p) => n + p.loss, 0) !== m.ecologicalLoss ||
    m.turns.length !== config.numTurns
  )
    throw new Error("Comptage écologique invalide");
}
function configurationKey(s: Sample, kind: ComparisonKind) {
  const c = { ...s.config } as Record<string, unknown>;
  if (kind === "RULE_VARIANT") {
    delete c.eyeMode;
    delete c.stealthCapacity;
    delete c.sabotageMode;
  }
  if (kind === "EYE_ORDER") delete c.initialEyeOrder;
  return digest(c);
}
export function pairedContrast(
  left: Sample[],
  right: Sample[],
  study: Study,
  kind: ComparisonKind = "POLICY",
) {
  const unavailable = (reason: string, n = 0, missing = 0) => ({
    status: "UNAVAILABLE" as const,
    paired: false,
    n,
    missing,
    mean: null,
    sampleSd: null,
    standardError: null,
    ci95: null,
    method: "NONE",
    reason,
  });
  const map = (rows: Sample[]) => {
    const m = new Map(rows.map((s) => [s.unit, s]));
    if (m.size !== rows.length)
      throw new Error("Unités expérimentales dupliquées");
    return m;
  };
  const l = map(left),
    r = map(right);
  if (!l.size || l.size !== r.size || [...l.keys()].some((k) => !r.has(k)))
    return unavailable(
      "MISSING_OR_UNMATCHED_UNITS",
      Math.min(l.size, r.size),
      Math.abs(l.size - r.size),
    );
  const delta: number[] = [];
  const homogeneous = (rows: Sample[]) =>
    rows.every(
      (s) =>
        s.family === rows[0].family &&
        s.configId === rows[0].configId &&
        digest(s.policyVersions) === digest(rows[0].policyVersions),
    );
  if (!homogeneous(left) || !homogeneous(right))
    return unavailable("MIXED_STRATA_OR_POLICIES");
  for (const [unit, a] of l) {
    const b = r.get(unit)!;
    try {
      validateSample(a, study.plan);
      validateSample(b, study.plan);
    } catch {
      return unavailable("INVALID_SAMPLE_OR_EVENTS");
    }
    if (
      !compatible(a.provenance, b.provenance) ||
      !compatible(a.provenance, study.provenance) ||
      a.pairingKey !== b.pairingKey ||
      a.eventFingerprint !== b.eventFingerprint ||
      a.environmentKey !== b.environmentKey ||
      configurationKey(a, kind) !== configurationKey(b, kind) ||
      (kind !== "POLICY" && a.family !== b.family)
    )
      return unavailable("INCOMPATIBLE_PAIRING");
    delta.push(a.measures.finalStanding - b.measures.finalStanding);
  }
  const total = left[0].measures.initialStock;
  const complete =
    study.status === "COMPLETED" &&
    left.length === study.plan.seeds.length &&
    right.length === study.plan.seeds.length;
  return {
    ...meanEstimate(
      delta,
      [-total, total],
      {
        independentGames: study.plan.independentGames,
        fixedSampleSize: true,
        analysis: "EXPLORATORY",
      },
      complete,
    ),
    paired: true,
  };
}
export function distribution(values: number[]) {
  const a = [...values].sort((x, y) => x - y),
    q = (p: number) => (a.length ? a[Math.floor((a.length - 1) * p)] : null);
  return {
    n: a.length,
    min: q(0),
    q25: q(0.25),
    median: q(0.5),
    q75: q(0.75),
    max: q(1),
  };
}
export function studyReport(
  study: Study,
  input: Sample[] | ((configId: string, family: Family) => Sample[]),
  observedCount?: number,
) {
  const samples = Array.isArray(input) ? input : [];
  const sampleCount = Array.isArray(input)
    ? input.length
    : (observedCount ?? study.completed);
  const load = (configId: string, family: Family) => {
    const rows = Array.isArray(input)
      ? input.filter((s) => s.configId === configId && s.family === family)
      : input(configId, family);
    const seen = new Set<string>();
    for (const s of rows) {
      if (seen.has(s.unit)) throw new Error("Unités dupliquées");
      seen.add(s.unit);
      validateSample(s, study.plan);
      if (
        !compatible(s.provenance, study.provenance) ||
        s.configId !== configId ||
        s.family !== family
      )
        throw new Error("Versions ou strates mélangées");
    }
    return rows;
  };
  const seen = new Set<string>();
  for (const s of samples) {
    const key = `${s.configId}:${s.family}:${s.unit}`;
    if (seen.has(key)) throw new Error("Échantillon dupliqué");
    seen.add(key);
    validateSample(s, study.plan);
    if (!compatible(s.provenance, study.provenance))
      throw new Error("Versions mélangées");
  }
  const complete = study.status === "COMPLETED" && sampleCount === study.total,
    assumptions = {
      independentGames: study.plan.independentGames,
      fixedSampleSize: true,
      analysis: "EXPLORATORY" as const,
    };
  const tables = study.plan.configs.flatMap((config) =>
    study.plan.families.map((family) => {
      const rows = load(digest(config), family),
        stock =
          config.numPlayers * config.trackLength * config.initialTreesPerCell;
      const est = (values: number[], bounds: [number, number] = [0, stock]) =>
        meanEstimate(
          [
            ...values,
            ...Array(Math.max(0, study.plan.seeds.length - values.length)).fill(
              null,
            ),
          ],
          bounds,
          assumptions,
          complete,
        );
      const avg = (fn: (s: Sample) => number, bounds: [number, number]) =>
        est(rows.map(fn), bounds);
      const total = (
        s: Sample,
        key: keyof Sample["measures"]["turns"][number],
      ) => s.measures.turns.reduce((n, t) => n + Number(t[key]), 0);
      return {
        configId: digest(config),
        config,
        family,
        n: rows.length,
        expected: study.plan.seeds.length,
        difficulty: {
          standing: est(rows.map((s) => s.measures.finalStanding)),
          loss: est(rows.map((s) => s.measures.ecologicalLoss)),
          distribution: distribution(rows.map((s) => s.measures.finalStanding)),
          reachableStanding: est(
            rows.map((s) => s.measures.reachableFinalStanding),
          ),
          reachableLoss: est(rows.map((s) => s.measures.reachableLoss)),
          reachedLoss: est(rows.map((s) => s.measures.reachedLoss)),
          unreachableStanding: est(
            rows.map((s) => s.measures.unreachableStanding),
          ),
          reachedCells: avg(
            (s) => s.measures.reachedCells,
            [0, config.numPlayers * config.trackLength],
          ),
          attackedCells: avg(
            (s) => s.measures.attackedCells,
            [0, config.numPlayers * config.trackLength],
          ),
          unreachableCells:
            config.numPlayers * (config.trackLength - config.numTurns - 1),
        },
        dynamics: Array.from({ length: config.numTurns }, (_, i) => ({
          turn: i + 1,
          ...Object.fromEntries(
            [
              "ecologicalLoss",
              "ecologicalDamage",
              "hsMachinesEnd",
              "cuts",
              "cleared",
              "parries",
              "combats",
              "activated",
              "recoveries",
              "trapConsumed",
              "sabotageConsumed",
              "tokenEnabledParries",
              "trapsPlaced",
              "sabotagesPlaced",
            ].map((key) => [
              key,
              avg(
                (s) => Number((s.measures.turns[i] as any)[key]),
                [
                  0,
                  config.numPlayers *
                    config.trackLength *
                    config.initialTreesPerCell +
                    config.numPlayers * 4,
                ],
              ),
            ]),
          ),
        })),
        efficiency: Object.fromEntries(
          [
            "combatDefenders",
            "pivotalCombatDefenders",
            "unengagedDefenders",
            "stealthNoEffect",
            "discoveries",
            "blindPlayers",
            "revisions",
            "revisionChanges",
            "tokenEnabledParries",
          ].map((key) => [
            key,
            avg(
              (s) => total(s, key as any),
              [0, config.numTurns * config.numPlayers * 6],
            ),
          ]),
        ),
        concentration: avg(
          (s) => Math.max(0, ...s.measures.turns.map((t) => t.concentration)),
          [0, 2 * config.numPlayers],
        ),
        fairness: config.initialEyeOrder.map((player, rank) => ({
          player,
          initialRank: rank + 1,
          loss: est(
            rows.map((s) => s.measures.byPlayer[player].loss),
            [0, config.trackLength * config.initialTreesPerCell],
          ),
          discoveries: avg(
            (s) => s.measures.byPlayer[player].discoveries,
            [0, config.numTurns],
          ),
          rankTrajectory: Array.from({ length: config.numTurns + 1 }, (_, t) =>
            avg(
              (s) => s.measures.byPlayer[player].rankTrajectory[t],
              [0, config.numPlayers],
            ),
          ),
        })),
      };
    }),
  );
  const policyContrasts = study.plan.configs.flatMap((config) =>
    pairs.map(([left, right]) => ({
      configId: digest(config),
      left,
      right,
      estimate: pairedContrast(
        load(digest(config), left),
        load(digest(config), right),
        study,
      ),
    })),
  );
  const ruleContrasts: unknown[] = [];
  // Targeted comparisons to the FIRST config only; never an automatic all-pairs combinatorial product.
  for (const config of study.plan.configs.slice(1))
    for (const family of study.plan.families) {
      const left = load(digest(config), family),
        right = load(digest(study.plan.configs[0]), family);
      const base = study.plan.configs[0];
      const kind: ComparisonKind =
        digest({ ...config, initialEyeOrder: base.initialEyeOrder }) ===
        digest(base)
          ? "EYE_ORDER"
          : "RULE_VARIANT";
      ruleContrasts.push({
        leftConfig: digest(config),
        rightConfig: digest(base),
        family,
        kind,
        estimate: pairedContrast(left, right, study, kind),
      });
    }
  return {
    protocol: PROTOCOL,
    complete,
    n: sampleCount,
    expected: study.total,
    tables,
    policyContrasts,
    ruleContrasts,
    globalScore: { status: "UNAVAILABLE", reason: "NO_VALIDATED_AGGREGATION" },
    interpretation:
      "Différences entre politiques ; positif = davantage d’arbres préservés. IC95 marginaux conservateurs de Hoeffding, sans correction multiple ni classement global. Pas de causalité, de Shapley, de charge cognitive humaine ou d’optimum omniscient.",
  };
}
export function markdownReport(
  study: Study,
  report: ReturnType<typeof studyReport>,
) {
  const lines = [
    `# Amazonia ${PROTOCOL} — ${study.plan.name}`,
    `Statut ${study.status} ; ${study.completed}/${study.total}.`,
    `Sources : ${study.provenance.commit} ; SHA256 ${study.provenance.sourceHash}.`,
    report.interpretation,
    "",
    "| Configuration | Famille | n | Arbres après régénération | Pertes | Arbres hors d’atteinte |",
    "|---|---|---:|---:|---:|---:|",
  ];
  for (const t of report.tables)
    lines.push(
      `| ${t.configId.slice(0, 8)} | ${t.family} | ${t.n} | ${t.difficulty.standing.mean ?? "—"} | ${t.difficulty.loss.mean ?? "—"} | ${t.difficulty.unreachableStanding.mean ?? "—"} |`,
    );
  lines.push("", "## Contrastes (arbres préservés, gauche − droite)", "");
  for (const c of report.policyContrasts)
    lines.push(
      `- ${c.configId.slice(0, 8)} ${c.left} − ${c.right} : ${c.estimate.mean ?? "indisponible"} ; n=${c.estimate.n} ; IC95=${JSON.stringify(c.estimate.ci95)} ; ${c.estimate.reason ?? "appariement vérifié"}`,
    );
  lines.push(
    "",
    "Les axes, unités, distributions, trajectoires et mesures par tour sont dans le JSON autonome ; documents figés et échantillons inclus. Une campagne partielle ne fournit aucun intervalle. Aucune note globale validée.",
  );
  return lines.join("\n");
}

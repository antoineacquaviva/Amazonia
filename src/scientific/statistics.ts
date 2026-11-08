import type { Assumptions } from "./protocol";
export interface Estimate {
  status: "AVAILABLE" | "UNAVAILABLE";
  n: number;
  missing: number;
  mean: number | null;
  sampleSd: number | null;
  standardError: number | null;
  ci95: [number, number] | null;
  method: string;
  reason?: string;
}
const unavailable = (n: number, missing: number, reason: string): Estimate => ({
  status: "UNAVAILABLE",
  n,
  missing,
  mean: null,
  sampleSd: null,
  standardError: null,
  ci95: null,
  method: "NONE",
  reason,
});
export function meanEstimate(
  values: readonly (number | null | undefined)[],
  bounds: [number, number],
  a: Assumptions,
  complete = true,
): Estimate {
  const valid = values.filter(
    (x): x is number => typeof x === "number" && Number.isFinite(x),
  );
  const n = valid.length,
    missing = values.length - n;
  if (
    !bounds.every(Number.isFinite) ||
    !Number.isFinite(bounds[1] - bounds[0]) ||
    bounds[1] <= bounds[0] ||
    valid.some((x) => x < bounds[0] || x > bounds[1])
  )
    throw new Error("Metric outside declared bounds");
  if (!n) return unavailable(0, missing, "NO_OBSERVATIONS");
  let mean = 0,
    m2 = 0;
  valid.forEach((x, i) => {
    const delta = x - mean;
    mean += delta / (i + 1);
    m2 += delta * (x - mean);
  });
  if (!Number.isFinite(mean) || !Number.isFinite(m2))
    throw new Error("Numeric overflow in moments");
  const sd = n > 1 ? Math.sqrt(Math.max(0, m2 / (n - 1))) : null,
    se = sd === null ? null : sd / Math.sqrt(n);
  const reason = missing
    ? "MISSING_VALUES"
    : !a.independentGames
      ? "INDEPENDENCE_NOT_DECLARED"
      : !a.fixedSampleSize || !complete
        ? "FIXED_SAMPLE_NOT_COMPLETE"
        : undefined;
  const radius = (bounds[1] - bounds[0]) * Math.sqrt(Math.log(40) / (2 * n));
  return {
    status: "AVAILABLE",
    n,
    missing,
    mean,
    sampleSd: sd,
    standardError: se,
    ci95: reason
      ? null
      : [
          Math.max(bounds[0], mean - radius),
          Math.min(bounds[1], mean + radius),
        ],
    method: "BOUNDED_HOEFFDING_95_V1",
    ...(reason ? { reason } : {}),
  };
}
export function proportionEstimate(
  values: readonly (boolean | null | undefined)[],
  a: Assumptions,
  complete = true,
): Estimate {
  if (values.some((x) => x != null && typeof x !== "boolean"))
    throw new Error("Invalid proportion observation");
  const base = meanEstimate(
    values.map((x) => (x == null ? null : Number(x))),
    [0, 1],
    a,
    complete,
  );
  if (!base.n) return base;
  const n = base.n,
    p = base.mean!,
    z = 1.959963984540054,
    z2 = z * z,
    d = 1 + z2 / n,
    center = (p + z2 / (2 * n)) / d,
    half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return {
    ...base,
    method: "WILSON_SCORE_95_V1",
    ci95: base.reason
      ? null
      : [Math.max(0, center - half), Math.min(1, center + half)],
  };
}
export interface Pairable {
  unit: string;
  pairingKey: string;
  environmentFingerprint: string;
  value: number | null;
}
export function pairedDifference(
  left: readonly Pairable[],
  right: readonly Pairable[],
  a: Assumptions,
  complete = true,
) {
  if (
    [...left, ...right].some(
      (s) =>
        s.value !== null &&
        (!Number.isFinite(s.value) || s.value < 0 || s.value > 1),
    )
  )
    throw new Error("Paired survival values must be in [0,1]");
  const l = new Map(left.map((x) => [x.unit, x])),
    r = new Map(right.map((x) => [x.unit, x]));
  if (l.size !== left.length || r.size !== right.length)
    throw new Error("Duplicate experimental units");
  const matches = [...l.keys()].filter((k) => r.has(k));
  if (!matches.length || l.size !== r.size || matches.length !== l.size)
    return {
      ...unavailable(
        matches.length,
        l.size + r.size - 2 * matches.length,
        "UNMATCHED_UNITS",
      ),
      paired: false,
    };
  for (const k of matches) {
    const x = l.get(k)!,
      y = r.get(k)!;
    if (
      x.pairingKey !== y.pairingKey ||
      x.environmentFingerprint !== y.environmentFingerprint
    )
      return {
        ...unavailable(0, matches.length, "INCOMPATIBLE_ENVIRONMENTS"),
        paired: false,
      };
  }
  const estimate = meanEstimate(
    matches.map((k) => {
      const x = l.get(k)!.value,
        y = r.get(k)!.value;
      return x === null || y === null ? null : x - y;
    }),
    [-1, 1],
    a,
    complete,
  );
  return { ...estimate, paired: true };
}

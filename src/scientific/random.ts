import { createHash } from "node:crypto";
import { SeededRNG } from "../sim/rng";
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ":" +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value) ?? "null";
}
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
/** Indexed SHA-256 with rejection sampling: no modulo bias, no shared mutable stream. */
export function indexedInt(key: unknown, min: number, max: number) {
  if (
    !Number.isSafeInteger(min) ||
    !Number.isSafeInteger(max) ||
    max < min ||
    max - min + 1 > 0x100000000
  )
    throw new Error("Invalid random range");
  const range = max - min + 1,
    limit = Math.floor(0x100000000 / range) * range;
  for (let retry = 0; ; retry++) {
    const n = createHash("sha256")
      .update(canonical([key, retry]))
      .digest()
      .readUInt32BE();
    if (n < limit) return min + (n % range);
  }
}
export class DecisionRandom {
  #index = 0;
  #key: unknown;
  constructor(key: unknown) {
    this.#key = key;
  }
  nextInt(min: number, max: number) {
    return indexedInt([this.#key, this.#index++], min, max);
  }
}
export class EnvironmentRandom extends SeededRNG {
  readonly events: { turn: number; player: number; d1: number; d2: number }[] =
    [];
  actualTrack?: unknown[];
  constructor(
    private key: unknown,
    private players: number,
  ) {
    super(1);
  }
  override roll2D6() {
    const index = this.events.length,
      turn = Math.floor(index / this.players) + 1,
      player = index % this.players;
    const d1 = indexedInt([this.key, turn, player, "D1"], 1, 6),
      d2 = indexedInt([this.key, turn, player, "D2"], 1, 6);
    this.events.push({ turn, player, d1, d2 });
    return { d1, d2, mIndex: Math.min(d1, d2) };
  }
  override shuffleInPlace<T>(array: T[]): T[] {
    for (let i = array.length - 1; i > 0; i--) {
      const j = indexedInt([this.key, "TACTICS_SHUFFLE", i], 0, i);
      [array[i], array[j]] = [array[j], array[i]];
    }
    this.actualTrack = [...array];
    return array;
  }
}

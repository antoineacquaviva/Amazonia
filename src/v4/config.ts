import { RULES_VERSION, type V4Config } from "./types";
export function validateV4Config(value: unknown): V4Config {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Configuration V4 requise");
  const c = value as V4Config;
  const keys = [
    "rulesVersion",
    "numPlayers",
    "numTurns",
    "trackLength",
    "initialTreesPerCell",
    "initialEyeOrder",
    "eyeMode",
    "stealthCapacity",
    "sabotageMode",
  ];
  if (
    Object.keys(c).some((k) => !keys.includes(k)) ||
    keys.some((k) => !(k in c))
  )
    throw new Error("Paramètre V4 absent ou non pris en charge");
  if (c.rulesVersion !== RULES_VERSION)
    throw new Error("Version de règles V4 non prise en charge");
  if (
    !Number.isInteger(c.numPlayers) ||
    c.numPlayers < 3 ||
    c.numPlayers > 6 ||
    !Number.isInteger(c.numTurns) ||
    c.numTurns < 1 ||
    c.numTurns > 12 ||
    !Number.isInteger(c.trackLength) ||
    c.trackLength < 2 ||
    c.trackLength > 64 ||
    ![2, 3].includes(c.initialTreesPerCell)
  )
    throw new Error(
      "Domaines V4 : 3–6 joueurs, 1–12 tours, 2–64 positions, 2 ou 3 arbres",
    );
  // With at most one advance per turn, this rejects every potentially overflowing setup.
  if (c.trackLength < c.numTurns + 1)
    throw new Error("Fin de piste non définie : longueur requise ≥ tours + 1");
  if (
    !Array.isArray(c.initialEyeOrder) ||
    c.initialEyeOrder.length !== c.numPlayers ||
    new Set(c.initialEyeOrder).size !== c.numPlayers ||
    c.initialEyeOrder.some(
      (p) => !Number.isInteger(p) || p < 0 || p >= c.numPlayers,
    )
  )
    throw new Error(
      "Ordre initial : permutation explicite de tous les joueurs requise",
    );
  if (
    !["ONE_STEP", "FULL_CAPTURE"].includes(c.eyeMode) ||
    !["SINGLE", "MULTIPLE"].includes(c.stealthCapacity) ||
    !["ONE_MACHINE", "BOTH_MACHINES"].includes(c.sabotageMode)
  )
    throw new Error("Variante V4 non prise en charge");
  return structuredClone(c);
}
export function validateSeed(seed: unknown): asserts seed is number {
  if (
    !Number.isSafeInteger(seed) ||
    (seed as number) < 1 ||
    (seed as number) > 0xffffffff
  )
    throw new Error("Graine entière requise : 1 à 2³²−1");
}

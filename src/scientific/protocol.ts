import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { digest } from "./random";
import { resolveTacticsTrackFromPreset } from "../sim/i18n";
import { POLICY_VERSIONS, supported } from "./observations";
import { tablesFor } from "../server/campaignPlan";
import type { CampaignConfig, SimulationConfig } from "../sim/types";
export interface Assumptions {
  independentGames: boolean;
  fixedSampleSize: boolean;
  analysis: "EXPLORATORY" | "CONFIRMATORY";
  familyId?: string;
}
export interface ScienceOptions {
  experimentSeed: number;
  environmentSeed: number;
  policySeed: number;
  assumptions: Assumptions;
}
export interface Provenance {
  protocol: "SCIENTIFIC_V1";
  gameVersion: "V33_RULES";
  observationVersion: "OBS_V1_NO_REVISIONS";
  randomVersion: "INDEXED_SHA256_V1";
  policyVersions: typeof POLICY_VERSIONS;
  rulesFingerprint: string;
  implementationFingerprint: string;
  softwareCommit?: string;
  workingTreeDirty?: boolean;
  softwarePackageVersion: string;
  runtime: { node: string; v8: string; platform: string; arch: string };
}
export type ProtocolConfig = CampaignConfig & {
  protocol?: "HISTORICAL_V33" | "SCIENTIFIC_V1";
  science?: ScienceOptions;
  provenance?: Provenance;
};
let cached: Provenance | undefined;
export function provenance(): Provenance {
  if (cached) return structuredClone(cached);
  const hashFiles = (files: string[]) =>
    digest(
      files.map((f) => [
        f,
        fs.readFileSync(new URL(f, import.meta.url), "utf8"),
      ]),
    );
  let softwareCommit: string | undefined, workingTreeDirty: boolean | undefined;
  try {
    softwareCommit = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: new URL("../../", import.meta.url),
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
    try {
      execFileSync(
        "git",
        ["diff", "--quiet", "HEAD", "--", "src", "server.ts", "package.json"],
        { cwd: new URL("../../", import.meta.url), stdio: "ignore" },
      );
      workingTreeDirty = false;
    } catch {
      workingTreeDirty = true;
    }
  } catch {}
  cached = {
    protocol: "SCIENTIFIC_V1",
    gameVersion: "V33_RULES",
    observationVersion: "OBS_V1_NO_REVISIONS",
    randomVersion: "INDEXED_SHA256_V1",
    policyVersions: POLICY_VERSIONS,
    softwarePackageVersion: JSON.parse(
      fs.readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    ).version,
    rulesFingerprint: hashFiles([
      "../sim/engine.ts",
      "../sim/i18n.ts",
      "../sim/types.ts",
      "../sim/rng.ts",
    ]),
    implementationFingerprint: hashFiles([
      "./protocol.ts",
      "./random.ts",
      "./observations.ts",
      "./policies.ts",
      "./runner.ts",
      "./statistics.ts",
      "./reports.ts",
      "../server/simWorker.ts",
      "../server/campaignManager.ts",
      "../server/campaignPlan.ts",
      "../server/durableStore.ts",
    ]),
    softwareCommit,
    workingTreeDirty,
    runtime: {
      node: process.versions.node,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
    },
  };
  return structuredClone(cached);
}
export function protocolOf(c: CampaignConfig) {
  const p = (c as ProtocolConfig).protocol;
  if (p !== undefined && p !== "HISTORICAL_V33" && p !== "SCIENTIFIC_V1")
    throw new Error("Unsupported experiment protocol");
  return p ?? "HISTORICAL_V33";
}
export function validateScienceOptions(s: ScienceOptions | undefined) {
  if (!s) throw new Error("Scientific seed manifest required");
  for (const key of [
    "experimentSeed",
    "environmentSeed",
    "policySeed",
  ] as const)
    if (!Number.isSafeInteger(s[key]) || s[key] < 0 || s[key] > 0xffffffff)
      throw new Error(`Invalid ${key}`);
  const a = s.assumptions;
  if (
    !a ||
    typeof a.independentGames !== "boolean" ||
    typeof a.fixedSampleSize !== "boolean" ||
    !["EXPLORATORY", "CONFIRMATORY"].includes(a.analysis) ||
    (a.familyId !== undefined &&
      (typeof a.familyId !== "string" || a.familyId.length > 128))
  )
    throw new Error("Explicit statistical assumptions required");
}
export function validateTeam(profiles: readonly string[]) {
  if (!profiles.length || profiles.some((p) => !supported(p as never)))
    throw new Error(
      "Scientific policy unavailable: revisions require validated rules",
    );
  if (
    profiles.includes("OMNISCIENT") &&
    profiles.some((p) => p !== "OMNISCIENT")
  )
    throw new Error(
      "Mixed privileged/ordinary teams require a validated convention",
    );
}
export function normalizeProtocol(config: ProtocolConfig): ProtocolConfig {
  const c = structuredClone(config) as ProtocolConfig;
  c.protocol = protocolOf(c);
  if (c.protocol === "SCIENTIFIC_V1") {
    if (c.type === "ORACLE_STRESS_TEST")
      throw new Error(
        "Scientific randomized stress is deferred; use a fixed Monte-Carlo plan",
      );
    if (c.targetDurationSeconds != null)
      throw new Error(
        "Scientific fixed-N plans do not support time-limited stopping",
      );
    validateScienceOptions(c.science);
    const tables = tablesFor(c);
    if (new Set(tables.map((t) => t.id)).size !== tables.length)
      throw new Error("Duplicate scientific table identifiers");
    for (const t of tables) validateTeam(t.botProfiles);
    const current = provenance();
    if (
      c.provenance &&
      (c.provenance.protocol !== current.protocol ||
        c.provenance.implementationFingerprint !==
          current.implementationFingerprint ||
        c.provenance.rulesFingerprint !== current.rulesFingerprint ||
        c.provenance.observationVersion !== current.observationVersion ||
        c.provenance.randomVersion !== current.randomVersion ||
        digest(c.provenance.policyVersions) !==
          digest(current.policyVersions) ||
        c.provenance.gameVersion !== current.gameVersion ||
        digest(c.provenance.runtime) !== digest(current.runtime))
    )
      throw new Error(
        "Scientific implementation does not match checkpoint provenance",
      );
    c.provenance ??= current;
  } else if (c.science || c.provenance)
    throw new Error(
      "Scientific metadata cannot be attached to historical execution",
    );
  return c;
}
export function validateScientificParams(p: SimulationConfig) {
  const allowed = [
    "numPlayers",
    "numTurns",
    "initialTreesPerCell",
    "tacticsTrackPreset",
    "tacticsTrackSetup",
    "shuffleTacticsTrack",
    "tacticalDefenderCap",
    "combatThresholdShift",
    "bulldozerZeroStumpAction",
    "initialStumpCell2",
    "parryHsRule",
  ];
  if (
    Object.keys(p).some((k) => !allowed.includes(k)) ||
    digest(p.tacticsTrackSetup) !==
      digest(resolveTacticsTrackFromPreset(p.tacticsTrackPreset))
  )
    throw new Error("Unspecified scientific rule parameter");
  if (
    !Number.isInteger(p.numPlayers) ||
    p.numPlayers < 3 ||
    p.numPlayers > 6 ||
    !Number.isInteger(p.numTurns) ||
    p.numTurns < 6 ||
    p.numTurns > 12 ||
    ![2, 3].includes(p.initialTreesPerCell) ||
    ![1, 2, 99].includes(p.tacticalDefenderCap) ||
    ![0, 1].includes(p.combatThresholdShift) ||
    !["NONE", "DESTROY_TREE"].includes(p.bulldozerZeroStumpAction) ||
    !["ASSAULT_LOW", "ASSAULT_HIGH"].includes(p.tacticsTrackPreset) ||
    !["STANDARD_S3", "SYNERGY_TRAP_SAB"].includes(
      p.parryHsRule ?? "SYNERGY_TRAP_SAB",
    ) ||
    typeof p.shuffleTacticsTrack !== "boolean" ||
    typeof p.initialStumpCell2 !== "boolean"
  )
    throw new Error("Unsupported scientific rules configuration");
}

export const manifestDigest = (c: ProtocolConfig) =>
  digest(JSON.parse(JSON.stringify(c)));

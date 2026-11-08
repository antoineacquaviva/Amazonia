import { runSingleGame } from "../sim/engine";
import { resolveTacticsTrackFromPreset } from "../sim/i18n";
import type {
  SimulationConfig,
  BotProfileId,
  SingleGameResult,
  DefenderPlacementDecision,
  TacticType,
} from "../sim/types";
import { EnvironmentRandom, DecisionRandom, digest } from "./random";
import {
  observe,
  POLICY_VERSIONS,
  type Observation,
  type VisiblePlacement,
  type SupportedPolicy,
} from "./observations";
import { decide } from "./policies";
import {
  provenance,
  validateTeam,
  validateScienceOptions,
  validateScientificParams,
  type ScienceOptions,
  type Provenance,
} from "./protocol";
export interface ScientificSample {
  unit: string;
  gameSeed: number;
  pairingKey: string;
  environmentFingerprint: string;
  team: BotProfileId[];
  policyVersions: string[];
  survival: number;
  treesLost: number;
  defeat: boolean;
  protocol: Provenance;
}
export interface ScientificGame extends SingleGameResult {
  scientific: ScientificSample & {
    seeds: ScienceOptions;
    environmentEvents?: EnvironmentRandom["events"];
    observations?: Observation[];
    testOverride?: true;
  };
}
export function runScientificGame(
  params: SimulationConfig,
  profiles: BotProfileId[],
  seed: number,
  tableId: string,
  recordTrace: boolean,
  options: ScienceOptions,
  policy: typeof decide = decide,
): ScientificGame {
  validateScienceOptions(options);
  validateScientificParams(params);
  validateTeam(profiles);
  if (!Number.isSafeInteger(seed))
    throw new Error("Invalid experimental unit seed");
  const unit = digest(["UNIT_V1", options.experimentSeed, seed]);
  const env = new EnvironmentRandom(
    [options.experimentSeed, options.environmentSeed, seed],
    params.numPlayers,
  );
  const history: VisiblePlacement[] = [],
    observations: Observation[] = [];
  let turn = 0;
  const result = runSingleGame(params, profiles, seed, tableId, recordTrace, {
    environment: env,
    phase2(config, groups, draws, team) {
      turn++;
      const placements: VisiblePlacement[] = [],
        decisions: DefenderPlacementDecision[] = [];
      for (const step of [1, 2] as const) {
        const intents = team.map((id, player) => {
          const o = observe({
            policy: id as SupportedPolicy,
            turn,
            player,
            step,
            groups,
            draws,
            placements,
            history,
            track: (env.actualTrack ??
              resolveTacticsTrackFromPreset(
                config.tacticsTrackPreset,
              )) as TacticType[],
            config,
          });
          if (recordTrace) observations.push(o);
          const action = policy(
            o,
            new DecisionRandom([
              options.experimentSeed,
              options.policySeed,
              seed,
              turn,
              player,
              step,
              POLICY_VERSIONS[id as SupportedPolicy],
            ]),
          );
          if (
            !o.legalActions.some(
              (a) =>
                a.targetPlayerIndex === action.targetPlayerIndex &&
                a.cellIndex === action.cellIndex &&
                a.track === action.track,
            )
          )
            throw new Error("Policy returned an illegal action");
          return {
            playerIndex: player,
            step,
            ...action,
            reason: `${POLICY_VERSIONS[id as SupportedPolicy]}: public/legal decision`,
            revisionsRound: 1,
          };
        });
        for (const action of intents) {
          const cell =
            groups[action.targetPlayerIndex].cells[action.cellIndex - 1];
          if (++cell.tacticalDefenders > config.tacticalDefenderCap)
            throw new Error("Scientific placement collision exceeds cap");
          decisions.push(action);
          placements.push({
            playerIndex: action.playerIndex,
            step,
            targetPlayerIndex: action.targetPlayerIndex,
            cellIndex: action.cellIndex,
            track: action.track,
          });
        }
      }
      history.push(...placements);
      return { decisions, step2RevisionsCount: 0, signaledCellsCount: 0 };
    },
  });
  if (result.violations.length)
    throw new Error(
      `Scientific invariant violation, seed ${seed}: ${result.violations.map((v) => v.code).join(", ")}`,
    );
  const p = provenance(),
    team = result.botProfiles;
  const scientific: ScientificGame["scientific"] = {
    unit,
    gameSeed: seed,
    pairingKey: digest([
      unit,
      options.environmentSeed,
      params,
      p.rulesFingerprint,
    ]),
    environmentFingerprint: digest({
      dice: env.events,
      tacticsTrack:
        env.actualTrack ??
        resolveTacticsTrackFromPreset(params.tacticsTrackPreset),
    }),
    team,
    policyVersions: team.map(
      (id) =>
        POLICY_VERSIONS[id as SupportedPolicy] +
        (policy !== decide ? "_TEST_OVERRIDE" : ""),
    ),
    ...(policy !== decide ? { testOverride: true as const } : {}),
    survival: result.survivalRateHorizon,
    treesLost: result.totalTreesLost,
    defeat: result.victoryBracket === "DEFEAT",
    protocol: p,
    seeds: structuredClone(options),
    ...(recordTrace ? { environmentEvents: env.events, observations } : {}),
  };
  if (result.textualJournal)
    result.textualJournal =
      `SCIENTIFIC_V1 — versioned baseline policies; no optimality claim\n` +
      result.textualJournal.replace(
        /plafond théorique/gi,
        "contrôle heuristique privilégié",
      );
  return { ...result, scientific };
}

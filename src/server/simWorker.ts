import { runV4 } from "../v4/engine";
import type { V4Config, GameResult, Provenance } from "../v4/types";
import { runScientificGame } from "../scientific/runner";
import type { ProtocolConfig } from "../scientific/protocol";
import { parentPort } from "node:worker_threads";
import { BotProfileId, SimulationConfig, SingleGameResult } from "../sim/types";
import { runSingleGame } from "../sim/engine";

export interface EvalBatchWorkerRequest {
  taskId: number;
  type: "RUN_EVAL_BATCH";
  params: SimulationConfig;
  tableId: string;
  experiment?: ProtocolConfig;
  botProfiles: BotProfileId[];
  jobs: Array<{
    seed: number;
    recordTrace: boolean;
  }>;
}

export interface EvalBatchWorkerResponse {
  taskId: number;
  type: "RUN_EVAL_BATCH_RESULT";
  results: SingleGameResult[];
}

export interface StressBatchWorkerRequest {
  taskId: number;
  type: "RUN_STRESS_BATCH";
  jobs: Array<{
    seed: number;
    params: SimulationConfig;
    botProfile: BotProfileId;
  }>;
  needDetailedCapture: boolean;
}

export interface StressJobOutcome {
  seed: number;
  params: SimulationConfig;
  botProfile: BotProfileId;
  res: SingleGameResult;
  captureCategory:
    | "INVARIANT_VIOLATION"
    | "MULTI_EXPLOSION"
    | "HIGH_DAMAGE_WIPEOUT"
    | "STEALTH_MASTERCLASS"
    | "OMNISCIENT_DEFEAT"
    | null;
  captureSummary: string;
  detailedJournal?: string;
}

export interface StressBatchWorkerResponse {
  taskId: number;
  type: "RUN_STRESS_BATCH_RESULT";
  outcomes: StressJobOutcome[];
}

export interface V4WorkerRequest {
  taskId: number;
  type: "RUN_V4";
  config: V4Config;
  seed: number;
  trace: boolean;
  provenance: Provenance;
}
export interface V4WorkerResponse {
  taskId: number;
  type: "RUN_V4_RESULT";
  result: GameResult;
}
export type WorkerRequestMessage =
  | V4WorkerRequest
  | EvalBatchWorkerRequest
  | StressBatchWorkerRequest;

export type WorkerResponseMessage =
  | V4WorkerResponse
  | EvalBatchWorkerResponse
  | StressBatchWorkerResponse;

if (parentPort) {
  parentPort.on("message", (msg: WorkerRequestMessage) => {
    if (msg.type === "RUN_V4") {
      const result = runV4(msg.config, msg.seed, msg.trace);
      result.provenance = msg.provenance;
      parentPort?.postMessage({
        taskId: msg.taskId,
        type: "RUN_V4_RESULT",
        result,
      } satisfies V4WorkerResponse);
    } else if (msg.type === "RUN_EVAL_BATCH") {
      const results: SingleGameResult[] = [];
      for (const job of msg.jobs) {
        const gRes =
          msg.experiment?.protocol === "SCIENTIFIC_V1"
            ? runScientificGame(
                msg.params,
                msg.botProfiles,
                job.seed,
                msg.tableId,
                job.recordTrace,
                msg.experiment.science!,
              )
            : runSingleGame(
                msg.params,
                msg.botProfiles,
                job.seed,
                msg.tableId,
                job.recordTrace,
              );
        results.push(gRes);
      }
      const resp: EvalBatchWorkerResponse = {
        taskId: msg.taskId,
        type: "RUN_EVAL_BATCH_RESULT",
        results,
      };
      parentPort?.postMessage(resp);
    } else if (msg.type === "RUN_STRESS_BATCH") {
      const outcomes: StressJobOutcome[] = [];
      for (const job of msg.jobs) {
        const res = runSingleGame(
          job.params,
          [job.botProfile],
          job.seed,
          `stress_${job.botProfile}`,
          false,
        );

        let captureCategory: StressJobOutcome["captureCategory"] = null;
        let captureSummary = "";

        if (res.violations.length > 0) {
          captureCategory = "INVARIANT_VIOLATION";
          captureSummary = res.violations[0].message;
        } else if (res.explosionsCount >= 2) {
          captureCategory = "MULTI_EXPLOSION";
          captureSummary = `${res.explosionsCount} explosions de machines en une seule partie (${res.totalTreesLost} arbres perdus).`;
        } else if (res.survivalRateHorizon <= 0.15) {
          captureCategory = "HIGH_DAMAGE_WIPEOUT";
          captureSummary = `Ravage massif : seulement ${(res.survivalRateHorizon * 100).toFixed(1)}% de survie sur l'horizon N×X×a (${res.totalTreesLost} arbres perdus).`;
        } else if (
          job.botProfile === "OMNISCIENT" &&
          res.victoryBracket === "DEFEAT"
        ) {
          captureCategory = "OMNISCIENT_DEFEAT";
          captureSummary = `Graine très punitive : même le Bot Omniscient subit une Défaite (${(res.survivalRateHorizon * 100).toFixed(1)}% de survie).`;
        } else if (
          res.trapsPlacedCount + res.sabotagesPlacedCount >= 5 &&
          res.parryAndHSCount >= 3
        ) {
          captureCategory = "STEALTH_MASTERCLASS";
          captureSummary = `Synergie Furtivité exceptionnelle : ${res.trapsPlacedCount} pièges + ${res.sabotagesPlacedCount} sabotages → ${res.parryAndHSCount} mises HS défensives.`;
        }

        let detailedJournal: string | undefined;
        if (
          captureCategory &&
          (msg.needDetailedCapture || captureCategory === "INVARIANT_VIOLATION")
        ) {
          const detailed = runSingleGame(
            job.params,
            [job.botProfile],
            job.seed,
            `stress_${job.botProfile}`,
            true,
          );
          detailedJournal = detailed.textualJournal || "";
        }

        outcomes.push({
          seed: job.seed,
          params: job.params,
          botProfile: job.botProfile,
          res,
          captureCategory,
          captureSummary,
          detailedJournal,
        });
      }

      const resp: StressBatchWorkerResponse = {
        taskId: msg.taskId,
        type: "RUN_STRESS_BATCH_RESULT",
        outcomes,
      };
      parentPort?.postMessage(resp);
    }
  });
}

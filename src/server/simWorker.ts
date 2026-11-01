import { parentPort } from 'node:worker_threads';
import {
  BotProfileId,
  GameParameters,
  SingleGameResult,
  TacticId,
} from '../sim/types';
import { runSingleGame } from '../sim/engine';

export interface EvalBatchWorkerRequest {
  taskId: number;
  type: 'RUN_EVAL_BATCH';
  params: GameParameters;
  tableId: string;
  botProfiles: BotProfileId[];
  jobs: Array<{
    seed: number;
    recordTrace: boolean;
  }>;
}

export interface EvalBatchWorkerResponse {
  taskId: number;
  type: 'RUN_EVAL_BATCH_RESULT';
  results: SingleGameResult[];
}

export interface StressBatchWorkerRequest {
  taskId: number;
  type: 'RUN_STRESS_BATCH';
  jobs: Array<{
    seed: number;
    params: GameParameters;
    botProfile: BotProfileId;
  }>;
  needDetailedCapture: boolean;
}

export interface StressJobOutcome {
  seed: number;
  params: GameParameters;
  botProfile: BotProfileId;
  res: SingleGameResult;
  captureCategory:
    | 'INVARIANT_VIOLATION'
    | 'EARLY_WIPEOUT'
    | 'STAGNATION'
    | 'TACTIC_MONOPOLY'
    | 'OMNISCIENT_DEFEAT'
    | 'RECORD_EDGE_CASES'
    | null;
  captureSummary: string;
  detailedJournal?: string;
}

export interface StressBatchWorkerResponse {
  taskId: number;
  type: 'RUN_STRESS_BATCH_RESULT';
  outcomes: StressJobOutcome[];
}

export type WorkerRequestMessage =
  | EvalBatchWorkerRequest
  | StressBatchWorkerRequest;

export type WorkerResponseMessage =
  | EvalBatchWorkerResponse
  | StressBatchWorkerResponse;

const ALL_TACTICS: TacticId[] = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3'];

if (parentPort) {
  parentPort.on('message', (msg: WorkerRequestMessage) => {
    if (msg.type === 'RUN_EVAL_BATCH') {
      const results: SingleGameResult[] = [];
      for (const job of msg.jobs) {
        const gRes = runSingleGame(
          job.seed,
          msg.params,
          msg.tableId,
          msg.botProfiles,
          { recordTraces: job.recordTrace }
        );
        results.push(gRes);
      }
      const resp: EvalBatchWorkerResponse = {
        taskId: msg.taskId,
        type: 'RUN_EVAL_BATCH_RESULT',
        results,
      };
      parentPort?.postMessage(resp);
    } else if (msg.type === 'RUN_STRESS_BATCH') {
      const outcomes: StressJobOutcome[] = [];
      for (const job of msg.jobs) {
        const res = runSingleGame(
          job.seed,
          job.params,
          `stress_${job.botProfile}`,
          [job.botProfile],
          { recordTraces: false }
        );

        let captureCategory: StressJobOutcome['captureCategory'] = null;
        let captureSummary = '';

        if (res.violations.length > 0) {
          captureCategory = 'INVARIANT_VIOLATION';
          captureSummary = res.violations[0].message;
        } else if (res.stagnantTurns > 0) {
          captureCategory = 'STAGNATION';
          captureSummary = `${res.stagnantTurns} tour(s) stagnant(s) sans évolution d'état ni mouvement.`;
        } else if (res.earlyWipeoutTurn !== null) {
          captureCategory = 'EARLY_WIPEOUT';
          captureSummary = `Destruction totale de la forêt dès le tour ${res.earlyWipeoutTurn}/${job.params.x} (Bot: ${job.botProfile}).`;
        } else {
          const monopolyTac = ALL_TACTICS.find(
            (t) => res.tacticSlot1Turns[t] === job.params.x
          );
          if (monopolyTac) {
            captureCategory = 'TACTIC_MONOPOLY';
            captureSummary = `La tactique ${monopolyTac} est restée verrouillée en Case 1 pendant 100% des ${job.params.x} tours.`;
          } else if (
            job.botProfile === 'OMNISCIENT' &&
            res.victoryBracket === 'DEFEAT'
          ) {
            captureCategory = 'OMNISCIENT_DEFEAT';
            captureSummary = `Graine très punitive : même le Bot Omniscient subit une Défaite (${(res.normalizedScore * 100).toFixed(1)}% d'arbres sauvés).`;
          } else {
            const totalEdgeInGame =
              res.edgeCases.H1_noTargetEligible +
              res.edgeCases.H2_multipleHarvesterCardsSingleTree +
              res.edgeCases.H3_multipleBulldozerCardsSameCell +
              res.edgeCases.H4_repairedBulldozerImmunityInCell1;
            if (totalEdgeInGame >= 5) {
              captureCategory = 'RECORD_EDGE_CASES';
              captureSummary = `Forte concentration de cas limites en une seule partie (${totalEdgeInGame} occurrences H1-H4).`;
            }
          }
        }

        let detailedJournal: string | undefined;
        if (
          captureCategory &&
          (msg.needDetailedCapture || captureCategory === 'INVARIANT_VIOLATION')
        ) {
          const detailed = runSingleGame(
            job.seed,
            job.params,
            `stress_${job.botProfile}`,
            [job.botProfile],
            { recordTraces: true }
          );
          detailedJournal = detailed.textualJournal || '';
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
        type: 'RUN_STRESS_BATCH_RESULT',
        outcomes,
      };
      parentPort?.postMessage(resp);
    }
  });
}

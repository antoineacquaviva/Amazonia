import { Worker } from "node:worker_threads";
import type { WorkerRequestMessage, WorkerResponseMessage } from "./simWorker";
export interface PoolOptions {
  workers: number;
  queue: number;
  timeoutMs: number;
  retries: number;
  workerUrl?: URL;
}
interface Task {
  request: WorkerRequestMessage;
  resolve: (r: WorkerResponseMessage) => void;
  reject: (e: Error) => void;
  onRetry: (error: string) => void;
  cancelled: () => boolean;
}
/** Bounded, shared pool. Each attempt owns a fresh worker, discarded on success or failure. */
export class WorkerPool {
  private queue: Task[] = [];
  private active = new Set<Worker>();
  private closed = false;
  constructor(readonly options: PoolOptions) {}
  get stats() {
    return {
      busyWorkers: this.active.size,
      queuedTasks: this.queue.length,
      workersCount: this.options.workers,
    };
  }
  run(
    request: WorkerRequestMessage,
    onRetry: (error: string) => void,
    cancelled: () => boolean = () => false,
  ) {
    if (this.closed) return Promise.reject(new Error("Pool fermé"));
    if (
      this.active.size >= this.options.workers &&
      this.queue.length >= this.options.queue
    )
      return Promise.reject(new Error("File de workers pleine"));
    return new Promise<WorkerResponseMessage>((resolve, reject) => {
      this.queue.push({ request, resolve, reject, onRetry, cancelled });
      this.dispatch();
    });
  }
  private dispatch() {
    while (
      !this.closed &&
      this.active.size < this.options.workers &&
      this.queue.length
    ) {
      const task = this.queue.shift()!;
      if (task.cancelled()) {
        task.reject(new Error("Lot annulé"));
        continue;
      }
      void this.execute(task);
    }
  }
  private async execute(task: Task) {
    try {
      for (let attempt = 0; ; attempt++) {
        if (this.closed || task.cancelled()) throw new Error("Lot annulé");
        try {
          const response = await this.attempt(task.request);
          task.resolve(response);
          return;
        } catch (error) {
          if (this.closed || attempt >= this.options.retries) throw error;
          task.onRetry((error as Error).message);
        }
      }
    } catch (error) {
      task.reject(error as Error);
    } finally {
      this.dispatch();
    }
  }
  private attempt(request: WorkerRequestMessage) {
    return new Promise<WorkerResponseMessage>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(
          this.options.workerUrl ?? new URL("./simWorker.ts", import.meta.url),
          {
            execArgv: ["--import", "tsx"],
            resourceLimits: { maxOldGenerationSizeMb: 256 },
          },
        );
      } catch (e) {
        reject(e);
        return;
      }
      this.active.add(worker);
      let done = false;
      const finish = async (
        error?: Error,
        response?: WorkerResponseMessage,
      ) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        await worker.terminate();
        this.active.delete(worker);
        if (error) reject(error);
        else resolve(response!);
      };
      const timer = setTimeout(
        () => void finish(new Error("Délai de lot dépassé")),
        this.options.timeoutMs,
      );
      worker.once("error", (e) => void finish(e));
      worker.once("exit", (code) => {
        if (!done)
          void finish(new Error(`Sortie inattendue du worker (${code})`));
      });
      worker.once("message", (r: WorkerResponseMessage) => {
        if (r.taskId !== request.taskId)
          void finish(new Error("Réponse de lot incorrecte"));
        else void finish(undefined, r);
      });
      worker.postMessage(request);
    });
  }
  async close() {
    this.closed = true;
    for (const t of this.queue.splice(0)) t.reject(new Error("Pool fermé"));
    await Promise.all([...this.active].map((w) => w.terminate()));
  }
}

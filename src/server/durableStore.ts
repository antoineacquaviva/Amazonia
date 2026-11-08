import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
/** Transactions are the checkpoint boundary. An atomic process lease prevents two runners. */
export class DurableStore {
  readonly db: DatabaseSync;
  private owner = randomUUID();
  constructor(root: string) {
    root = path.resolve(root);
    fs.mkdirSync(root, { recursive: true });
    if (fs.realpathSync(root) !== root)
      throw new Error("Répertoire symbolique interdit");
    const file = path.join(root, "orchestration.sqlite");
    for (const name of [file, `${file}-wal`, `${file}-shm`])
      if (fs.existsSync(name) && fs.lstatSync(name).isSymbolicLink())
        throw new Error("Base symbolique interdite");
    this.db = new DatabaseSync(file);
    try {
      this.db
        .exec(`PRAGMA busy_timeout=1000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
        CREATE TABLE IF NOT EXISTS owner(singleton INTEGER PRIMARY KEY CHECK(singleton=1), pid INTEGER, token TEXT);
        CREATE TABLE IF NOT EXISTS campaigns(id TEXT PRIMARY KEY, generation TEXT NOT NULL, body TEXT NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS batches(id TEXT, generation TEXT, seq INTEGER, state TEXT, request TEXT, result TEXT, error TEXT, attempts INTEGER DEFAULT 0, PRIMARY KEY(id,generation,seq));
        CREATE TABLE IF NOT EXISTS scientific_audits(id TEXT,generation TEXT,variant INTEGER,table_id TEXT,body TEXT,PRIMARY KEY(id,generation,variant,table_id));
        CREATE TABLE IF NOT EXISTS scientific_samples(id TEXT,generation TEXT,variant INTEGER,table_id TEXT,unit TEXT,body TEXT,PRIMARY KEY(id,generation,variant,table_id,unit));
        CREATE TABLE IF NOT EXISTS variants(id TEXT,generation TEXT,idx INTEGER,body TEXT,PRIMARY KEY(id,generation,idx));`);
      this.transaction(() => {
        const row = this.db
          .prepare("SELECT pid FROM owner WHERE singleton=1")
          .get() as { pid: number } | undefined;
        if (row) {
          try {
            process.kill(row.pid, 0);
            throw new Error("Un gestionnaire possède déjà ce répertoire");
          } catch (e) {
            if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
          }
        }
        this.db
          .prepare("INSERT OR REPLACE INTO owner VALUES(1,?,?)")
          .run(process.pid, this.owner);
      });
    } catch (e) {
      this.db.close();
      throw e;
    }
  }
  transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      this.db.exec("COMMIT");
      return result;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  close() {
    try {
      this.db.prepare("DELETE FROM owner WHERE token=?").run(this.owner);
    } finally {
      this.db.close();
    }
  }
}

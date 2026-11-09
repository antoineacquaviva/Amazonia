import express from "express";
import path from "node:path";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
import { StudyManager } from "../src/v4science/manager";
import { privateAccess } from "../src/v4science/privateAccess";
const root = process.env.V4_INSTANCE_DIR,
  port = Number(process.env.V4_PORT),
  keyFile = process.env.V4_ACCESS_KEY_FILE;
if (
  !root ||
  !path.isAbsolute(root) ||
  !Number.isSafeInteger(port) ||
  port < 1024 ||
  port > 65535 ||
  !keyFile
)
  throw new Error(
    "V4_INSTANCE_DIR, V4_PORT et V4_ACCESS_KEY_FILE explicites requis",
  );
const access = privateAccess(keyFile, port),
  studies = new StudyManager({ root: path.join(root, "studies") }),
  manager = new CampaignManager({
    campaignsDir: path.join(root, "legacy-empty"),
    createReference: false,
    pool: { workers: 1, queue: 2 },
  });
const { app } = await createApp({
  manager,
  studies,
  authorize: access.authorized,
});
const outer = express();
outer.disable("x-powered-by");
outer.use(access.guard);
outer.use(app);
const server = outer.listen(port, "127.0.0.1", () =>
  console.log(`Amazonia V4 privée sur 127.0.0.1:${port}`),
);
server.on("error", (e) => {
  console.error((e as Error).message);
  void Promise.all([studies.close(), manager.close()]).finally(() =>
    process.exit(1),
  );
});
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => {
    server.close();
    server.closeAllConnections();
    void Promise.all([studies.close(), manager.close()]).finally(() =>
      process.exit(0),
    );
  });

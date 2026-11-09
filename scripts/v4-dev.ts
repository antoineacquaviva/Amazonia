import { StudyManager } from "../src/v4science/manager";
/** Local-only demo harness. Never reads the historical data directory or production credentials. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server";
import { CampaignManager } from "../src/server/campaignManager";
if (process.env.NODE_ENV === "production")
  throw new Error("Le lanceur V4 local est réservé au développement");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "amazonia-v4-dev-"));
const manager = new CampaignManager({
  campaignsDir: dir,
  createReference: false,
  pool: { workers: 1, queue: 2 },
});
const studyRoot =
  process.env.V4_STUDIES_DIR ??
  path.join(
    os.tmpdir(),
    `amazonia-v4-studies-${process.getuid?.() ?? "local"}`,
  );
const studies = new StudyManager({ root: studyRoot });
const { app } = await createApp({ manager, studies, authorize: () => true });
const port = Number(process.env.V4_PORT ?? 3104);
const server = app.listen(port, "127.0.0.1", () =>
  console.log(
    `V4 local : http://127.0.0.1:${port} ; stockage historique isolé : ${dir}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.once(signal, () => {
    server.close();
    void Promise.all([manager.close(), studies.close()]).finally(() =>
      process.exit(0),
    );
  });

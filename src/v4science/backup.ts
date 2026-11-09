import fs from "node:fs";
import path from "node:path";
import { digest } from "../scientific/random";
import { backupCampaigns, restoreCampaigns } from "../../scripts/backup";
import { PROTOCOL } from "./types";
export async function backupStudies(source: string, destination: string) {
  const files = await backupCampaigns(source, destination);
  fs.writeFileSync(
    path.join(destination, "v4-backup.json"),
    JSON.stringify(
      {
        protocol: PROTOCOL,
        backupManifestHash: digest(
          fs.readFileSync(
            path.join(destination, "backup-manifest.json"),
            "utf8",
          ),
        ),
        files,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  return files;
}
export function restoreStudies(archive: string, destination: string) {
  const format = JSON.parse(
    fs.readFileSync(path.join(archive, "v4-backup.json"), "utf8"),
  );
  if (
    format.protocol !== PROTOCOL ||
    format.backupManifestHash !==
      digest(
        fs.readFileSync(path.join(archive, "backup-manifest.json"), "utf8"),
      )
  )
    throw new Error("Archive V4 incompatible");
  return restoreCampaigns(archive, destination);
}

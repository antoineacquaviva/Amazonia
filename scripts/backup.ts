import { provenance } from "../src/scientific/protocol";
import fs from "node:fs";
import path from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const hash = (b: Buffer) => createHash("sha256").update(b).digest("hex");
function canonical(dir: string) {
  if (
    !path.isAbsolute(dir) ||
    fs.realpathSync(dir) !== dir ||
    !fs.statSync(dir).isDirectory()
  )
    throw new Error("Répertoire absolu canonique requis");
}
function regular(file: string) {
  if (!fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink())
    throw new Error("Fichier régulier requis");
}
function integrity(db: DatabaseSync) {
  if (db.prepare("PRAGMA integrity_check").get()?.integrity_check !== "ok")
    throw new Error("Intégrité SQLite invalide");
}
export async function backupCampaigns(source: string, destination: string) {
  canonical(source);
  canonical(path.dirname(destination));
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination ||
    destination === source ||
    destination.startsWith(source + path.sep)
  )
    throw new Error("Destination externe requise");
  fs.mkdirSync(destination, { mode: 0o700 }); // Exclusive: EEXIST, never overwrite.
  const database = path.join(source, "orchestration.sqlite");
  regular(database);
  for (const suffix of ["-wal", "-shm"])
    if (fs.existsSync(database + suffix)) regular(database + suffix);
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    await backup(db, path.join(destination, "orchestration.sqlite"));
  } finally {
    db.close();
  }
  const snapshot = new DatabaseSync(
    path.join(destination, "orchestration.sqlite"),
  );
  try {
    integrity(snapshot);
    // The archived copy has no live owner. Never change the source lease.
    snapshot.exec(
      "DELETE FROM owner; PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;",
    );
  } finally {
    snapshot.close();
  }
  const files: Record<string, string> = {};
  function copy(dir: string, relative = "") {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const rel = path.join(relative, item.name),
        file = path.join(dir, item.name);
      if (item.isSymbolicLink())
        throw new Error("Lien interdit dans les archives");
      if (item.isDirectory()) {
        if (rel !== "quarantine") continue;
        fs.mkdirSync(path.join(destination, rel), { mode: 0o700 });
        copy(file, rel);
      } else if (
        item.name.endsWith(".json") ||
        item.name === ".amazonia-storage"
      ) {
        regular(file);
        const content = fs.readFileSync(file);
        fs.writeFileSync(path.join(destination, rel), content, {
          flag: "wx",
          mode: 0o600,
        });
        if (hash(fs.readFileSync(file)) !== hash(content))
          throw new Error("Source historique modifiée pendant sauvegarde");
      }
    }
  }
  copy(source);
  function inventory(dir: string, relative = "") {
    for (const name of fs.readdirSync(dir)) {
      const rel = path.join(relative, name),
        file = path.join(dir, name);
      if (fs.statSync(file).isDirectory()) inventory(file, rel);
      else {
        fs.chmodSync(file, 0o600);
        files[rel] = hash(fs.readFileSync(file));
      }
    }
  }
  inventory(destination);
  fs.writeFileSync(
    path.join(destination, "backup-manifest.json"),
    JSON.stringify(
      {
        format: 1,
        createdAt: new Date().toISOString(),
        node: process.version,
        software: provenance(),
        compatibility:
          "Amazonia 1B.4; keep matching source revision and scientific fingerprints",
        files,
      },
      null,
      2,
    ),
    { flag: "wx", mode: 0o600 },
  );
  return files;
}
export function restoreCampaigns(archive: string, destination: string) {
  canonical(archive);
  canonical(path.dirname(destination));
  for (const suffix of ["-wal", "-shm"])
    if (fs.existsSync(path.join(archive, "orchestration.sqlite" + suffix)))
      throw new Error("Archive avec WAL/SHM inattendu");
  if (
    !path.isAbsolute(destination) ||
    path.resolve(destination) !== destination ||
    destination.startsWith(archive + path.sep)
  )
    throw new Error("Destination propre externe requise");
  const manifestFile = path.join(archive, "backup-manifest.json");
  regular(manifestFile);
  const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  if (manifest.format !== 1 || !manifest.files?.["orchestration.sqlite"])
    throw new Error("Manifeste invalide");
  for (const [rel, expected] of Object.entries(manifest.files)) {
    const parts = rel.split("/");
    const allowed =
      rel === "orchestration.sqlite" ||
      rel === ".amazonia-storage" ||
      ((parts.length === 1 ||
        (parts.length === 2 && parts[0] === "quarantine")) &&
        parts.at(-1)!.endsWith(".json"));
    if (
      !allowed ||
      parts.some((p) => !p || p === "." || p === ".." || p.includes("\\"))
    )
      throw new Error("Chemin archive invalide");
    if (parts.length === 2) canonical(path.join(archive, "quarantine"));
    const file = path.join(archive, rel);
    regular(file);
    if (hash(fs.readFileSync(file)) !== expected)
      throw new Error("Empreinte invalide");
  }
  const db = new DatabaseSync(path.join(archive, "orchestration.sqlite"), {
    readOnly: true,
  });
  try {
    integrity(db);
    if (db.prepare("SELECT count(*) AS n FROM owner").get()?.n !== 0)
      throw new Error("Archive avec bail");
  } finally {
    db.close();
  }
  fs.mkdirSync(destination, { mode: 0o700 }); // Never restore over a live directory or an old WAL.
  for (const rel of Object.keys(manifest.files)) {
    fs.mkdirSync(path.dirname(path.join(destination, rel)), {
      recursive: true,
      mode: 0o700,
    });
    fs.copyFileSync(
      path.join(archive, rel),
      path.join(destination, rel),
      fs.constants.COPYFILE_EXCL,
    );
    fs.chmodSync(path.join(destination, rel), 0o600);
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [operation, source, destination] = process.argv.slice(2);
  if (!source || !destination || !["backup", "restore"].includes(operation))
    throw new Error(
      "Usage: tsx scripts/backup.ts backup|restore SOURCE_ABSOLUE DESTINATION_NOUVELLE",
    );
  if (operation === "backup") await backupCampaigns(source, destination);
  else restoreCampaigns(source, destination);
}

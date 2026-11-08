import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";
/** Production must name an existing canonical directory, never implicitly create a database. */
export function configuredCampaignsDir() {
  const dir = process.env.AMAZONIA_CAMPAIGNS_DIR;
  if (!dir && process.env.NODE_ENV !== "production")
    return path.resolve("data/campaigns");
  if (!dir || !path.isAbsolute(dir) || path.resolve(dir) !== dir)
    throw new Error("AMAZONIA_CAMPAIGNS_DIR absolu requis");
  if (!fs.statSync(dir).isDirectory() || fs.realpathSync(dir) !== dir)
    throw new Error("Répertoire persistant non canonique");
  if ((fs.statSync(dir).mode & 0o700) !== 0o700)
    throw new Error("Permissions du stockage insuffisantes");
  const codeRoot = path.resolve(
    fileURLToPath(new URL("../../", import.meta.url)),
  );
  if (
    process.env.NODE_ENV === "production" &&
    (dir === codeRoot || dir.startsWith(codeRoot + path.sep))
  )
    throw new Error("Stockage de production requis hors code");
  fs.accessSync(dir, fs.constants.R_OK | fs.constants.W_OK | fs.constants.X_OK);
  if (
    !fs.existsSync(path.join(dir, "orchestration.sqlite")) &&
    !fs.existsSync(path.join(dir, ".amazonia-storage"))
  )
    throw new Error("Stockage non initialisé : marqueur explicite requis");
  const marker = path.join(dir, ".amazonia-storage");
  if (
    fs.existsSync(marker) &&
    (!fs.lstatSync(marker).isFile() || fs.lstatSync(marker).isSymbolicLink())
  )
    throw new Error("Marqueur de stockage invalide");
  return dir;
}

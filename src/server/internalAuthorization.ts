import fs from "node:fs";
import path from "node:path";
import { timingSafeEqual } from "node:crypto";
import type { Authorize } from "./apiSecurity";
// 32+ random bytes encoded as hex; this is a service credential, never a browser credential.
export function internalAuthorization(): Authorize | undefined {
  const file = process.env.ATELIER_INTERNAL_KEY_FILE;
  const origins = (process.env.ATELIER_PUBLIC_ORIGINS ?? "")
    .split(",")
    .filter(Boolean);
  if (!file || !origins.length) return undefined;
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file)
    throw new Error("Chemin de clé canonique absolu requis");
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077)
    throw new Error("Permissions de clé interne invalides");
  const key = fs.readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64,128}$/.test(key)) throw new Error("Clé interne invalide");
  for (const origin of origins) {
    const u = new URL(origin);
    if (u.origin !== origin || u.protocol !== "https:")
      throw new Error("Origine HTTPS exacte requise");
  }
  return (req) => {
    const proof = req.headers["x-atelier-internal"];
    if (
      typeof proof !== "string" ||
      !/^[a-f0-9]{64,128}$/.test(proof) ||
      proof.length !== key.length ||
      !timingSafeEqual(Buffer.from(proof), Buffer.from(key))
    )
      return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    // Basic Auth is ambient in browsers: mutations require JSON + exact trusted Origin.
    if (!["GET", "HEAD"].includes(req.method))
      return (
        origins.includes(String(req.headers.origin ?? "")) &&
        req.is("application/json") === "application/json"
      );
    return true; // Single administrator, all four permissions; no fabricated user identity.
  };
}

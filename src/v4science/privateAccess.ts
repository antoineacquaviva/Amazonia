import fs from "node:fs";
import { timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler } from "express";
export function privateAccess(file: string, port: number) {
  if (
    !file.startsWith("/") ||
    fs.realpathSync(file) !== file ||
    !fs.lstatSync(file).isFile() ||
    fs.statSync(file).mode & 0o077
  )
    throw new Error("Clé locale privée 0600 canonique requise");
  const token = fs.readFileSync(file, "utf8").trim();
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error("Clé privée invalide");
  const expected = Buffer.from(`amazonia:${token}`);
  const authorized = (req: Request) => {
    const header = req.headers.authorization;
    if (typeof header !== "string" || !header.startsWith("Basic "))
      return false;
    const decoded = Buffer.from(header.slice(6), "base64");
    if (
      decoded.length !== expected.length ||
      !timingSafeEqual(decoded, expected)
    )
      return false;
    if (req.headers["sec-fetch-site"] === "cross-site") return false;
    if (!["GET", "HEAD"].includes(req.method))
      return (
        req.headers.origin === `http://127.0.0.1:${port}` &&
        req.is("application/json") === "application/json"
      );
    return true;
  };
  const guard: RequestHandler = (req, res, next) => {
    if (authorized(req)) {
      next();
      return;
    }
    res
      .set("WWW-Authenticate", 'Basic realm="Amazonia V4 prive"')
      .status(401)
      .send("Authentification privée requise");
  };
  return { authorized, guard };
}

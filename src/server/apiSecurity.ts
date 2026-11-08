import type { Request, RequestHandler } from "express";
export type Permission = "read" | "operate" | "delete" | "audit";
// Server-side integration seam only. Never build this result from unsigned HTTP headers.
export type Authorize = (
  req: Request,
  permission: Permission,
) => Promise<boolean> | boolean;
export function apiSecurity(authorize?: Authorize): RequestHandler {
  let windowStart = Date.now(),
    reads = 0,
    writes = 0;
  return async (req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    if (!authorize) {
      res.status(503).json({ error: "Autorisation du portail non configurée" });
      return;
    }
    const permission: Permission = ["GET", "HEAD"].includes(req.method)
      ? req.path.includes("scientific-audits")
        ? "audit"
        : "read"
      : req.method === "DELETE"
        ? "delete"
        : "operate";
    try {
      if ((await authorize(req, permission)) !== true) {
        res.status(403).json({ error: "Accès refusé" });
        return;
      }
    } catch {
      res.status(503).json({ error: "Autorisation indisponible" });
      return;
    }
    // No cookies accepted by this layer; a future cookie adapter MUST implement CSRF.
    // Fetch Metadata is additional protection only, never an identity proof.
    if (req.headers["sec-fetch-site"] === "cross-site") {
      res.status(403).json({ error: "Requête intersite refusée" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.sendStatus(403);
      return;
    }
    if (Date.now() - windowStart >= 60000) {
      windowStart = Date.now();
      reads = writes = 0;
    }
    const exceeded = ["GET", "HEAD"].includes(req.method)
      ? ++reads > 300
      : ++writes > 30;
    if (exceeded) {
      res.setHeader("Retry-After", "60");
      res.status(429).json({ error: "Limite globale API atteinte" });
      return;
    }
    next();
  };
}

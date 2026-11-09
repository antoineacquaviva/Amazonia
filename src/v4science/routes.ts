import { Router, type Response } from "express";
import { once } from "node:events";
import { StudyManager } from "./manager";
import { markdownReport } from "./statistics";
import { PROTOCOL } from "./types";
export function scienceRoutes(getManager: () => StudyManager) {
  const router = Router();
  const run =
    (fn: (m: StudyManager, req: any, res: Response) => unknown) =>
    async (req: any, res: Response) => {
      try {
        await fn(getManager(), req, res);
      } catch (e) {
        if (res.headersSent) {
          res.destroy();
          return;
        }
        res
          .status((e as Error).message.includes("introuvable") ? 404 : 400)
          .json({ error: (e as Error).message });
      }
    };
  router.get(
    "/",
    run((m, req, res) =>
      res.json({
        studies: m.list(pageOffset(req.query.offset)),
        limits: m.limits,
      }),
    ),
  );
  router.post(
    "/estimate",
    run((m, req, res) => res.json(m.estimate(req.body))),
  );
  router.post(
    "/",
    run((m, req, res) => res.status(202).json(m.start(req.body))),
  );
  router.get(
    "/:id",
    run((m, req, res) => res.json(m.get(req.params.id))),
  );
  router.get(
    "/:id/report",
    run((m, req, res) => res.json(m.report(req.params.id))),
  );
  router.get(
    "/:id/samples",
    run((m, req, res) => {
      m.get(req.params.id);
      res.json({
        samples: m.samples(req.params.id, pageOffset(req.query.offset)),
        offset: pageOffset(req.query.offset),
        limit: 200,
      });
    }),
  );
  for (const action of ["pause", "resume", "stop"] as const)
    router.post(
      `/:id/${action}`,
      run((m, req, res) => res.json(m.control(req.params.id, action))),
    );
  router.get(
    "/:id/export/:format",
    run(async (m, req, res) => {
      const study = m.get(req.params.id),
        report = m.report(study.id),
        format = req.params.format;
      if (!["json", "markdown"].includes(format))
        throw new Error("Format non pris en charge");
      res
        .attachment(
          `amazonia-${PROTOCOL}-${study.id}.${format === "json" ? "json" : "md"}`,
        )
        .type(format === "json" ? "application/json" : "text/markdown");
      if (format === "markdown") {
        res.send(markdownReport(study, report));
        return;
      }
      const write = async (s: string) => {
        if (!res.write(s)) await once(res, "drain");
      };
      // Freeze the checkpoint cut for this export even while a later batch completes.
      await write(
        JSON.stringify({
          format: "V4_AUTONOMOUS_ARCHIVE_1",
          study,
          report,
        }).slice(0, -1) + ',"samples":[',
      );
      let index = 0;
      for (const sample of m.allSamples(study.id)) {
        if (index >= study.completed) break;
        await write((index++ ? "," : "") + JSON.stringify(sample));
      }
      res.end("]}");
    }),
  );
  return router;
}
function pageOffset(raw: unknown) {
  const n = raw === undefined ? 0 : Number(raw);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("Pagination invalide");
  return n;
}

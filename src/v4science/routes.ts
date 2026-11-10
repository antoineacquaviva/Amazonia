import { Router, type Response } from "express";
import { once } from "node:events";
import { StudyManager } from "./manager";
import { markdownReport } from "./statistics";
import { programReport, saveRecommendation, variant } from "./programReport";
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
    "/:id/witness/:index",
    run((m, req, res) => {
      m.get(req.params.id);
      res.json({
        samples: m.samples(req.params.id, pageOffset(req.params.index), 1),
      });
    }),
  );
  router.get(
    "/programs",
    run((m, _req, res) => res.json(m.programs())),
  );
  router.post(
    "/programs",
    run((m, req, res) =>
      res.status(202).json(m.startProgram(req.body?.id, req.body?.repeats)),
    ),
  );
  for (const action of ["pause", "resume"] as const)
    router.post(
      `/programs/:id/${action}`,
      run((m, req, res) => res.json(m.controlProgram(req.params.id, action))),
    );
  router.post(
    "/programs/:id/recommendation",
    run((m, req, res) => {
      saveRecommendation(m, m.program(req.params.id), req.body);
      res.json({ saved: true });
    }),
  );
  router.get(
    "/programs/:id/summary",
    run((m, req, res) => res.json(programReport(m, m.program(req.params.id)))),
  );
  router.get(
    "/programs/:id/export",
    run(async (m, req, res) => {
      const p = m.program(req.params.id);
      const report = programReport(m, p);
      // Capture child watermarks before yielding to another batch commit.
      const checkpoints = p.parts.map((part) => {
        const row = m.store.db
          .prepare("SELECT body FROM v4_studies WHERE id=?")
          .get(part.id);
        return row ? JSON.parse(String(row.body)) : null;
      });
      res.attachment(`amazonia-bilan-${p.id}.json`).type("application/json");
      if (req.query.detail !== "units") {
        // Share enough evidence for analysis without duplicating a trace for every game.
        const witnesses = p.parts[0].plan.configs.map((config) => {
          const cell = report.cells.find(
            (c) =>
              c.variant === variant(config) &&
              c.family === "COORD_HYBRID" &&
              c.witness,
          );
          if (!cell?.witness)
            return { variant: variant(config), available: false };
          const sample = m.samples(
            cell.witness.study,
            cell.witness.index,
            1,
          )[0];
          return {
            variant: cell.variant,
            study: cell.witness.study,
            config: sample.config,
            seed: sample.seed,
            trace: sample.trace,
          };
        });
        res.json({
          ...report,
          documents: checkpoints.find(Boolean)?.documentSnapshots ?? {},
          witnesses,
          metrics: {
            observed: "Parties validées",
            lossSum: "Somme des pertes écologiques finales",
            meanLoss: "Pertes par partie",
            pivotal: "Total des défenseurs décisifs en combat",
            revisions: "Total des révisions",
            regenerated: "Total des arbres régénérés",
            violations: "Invariants enfreints",
          },
          precision:
            "Effectifs fixes, agrégats descriptifs. IC95 marginaux de Hoeffding sur les pertes et sur les différences appariées avec SOLO_INFORMED pour le programme terminé. Un gain positif indique davantage d’arbres préservés. Aucune correction de multiplicité.",
        });
        return;
      }
      const send = async (value: string) => {
        if (res.destroyed) throw new Error("Téléchargement interrompu");
        if (!res.write(value))
          await once(res, "drain", {
            signal: AbortSignal.any([
              AbortSignal.timeout(60000),
              disconnect.signal,
            ]),
          });
      };
      const disconnect = new AbortController();
      res.once("close", () => disconnect.abort());
      await send(
        JSON.stringify({
          ...report,
          documents: checkpoints.find(Boolean)?.documentSnapshots ?? {},
        }).slice(0, -1) + ',"studies":[',
      );
      for (const [i, study] of checkpoints.entries()) {
        if (i) await send(",");
        if (!study) {
          await send("null");
          continue;
        }
        await send(
          JSON.stringify({
            id: study.id,
            completed: study.completed,
            manifestHash: study.manifestHash,
          }).slice(0, -1) + ',"samples":[',
        );
        for (let offset = 0; offset < study.completed; offset += 8) {
          const rows = m.samples(
            study.id,
            offset,
            Math.min(8, study.completed - offset),
          );
          for (const [j, sample] of rows.entries()) {
            const { provenance, ...unit } = sample;
            await send((offset + j ? "," : "") + JSON.stringify(unit));
          }
        }
        await send("]}");
      }
      res.end("]}");
    }),
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

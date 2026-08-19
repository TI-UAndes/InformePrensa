import express, { Express } from "express";
import cors from "cors";
import type { MediaConfig, ReportResponse } from "./types.js";
import type { ReportDeps } from "./report.js";

type BuildReportFn = (media: MediaConfig[], from: string, to: string, deps: ReportDeps) => Promise<ReportResponse>;

export function createApp(buildReportFn: BuildReportFn, media: MediaConfig[], deps: ReportDeps): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/report", async (req, res) => {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (!from || !to) {
      res.status(400).json({ error: "from y to son requeridos" });
      return;
    }
    const result = await buildReportFn(media, from, to, deps);
    res.json(result);
  });

  return app;
}

import express, { Express } from "express";
import cors from "cors";

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}

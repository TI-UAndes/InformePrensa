import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { MediaConfig, ReportResponse } from "./types.js";

const media: MediaConfig[] = [{ domain: "sitio.cl", name: "SITIO EJEMPLO", category: "Sitio Web" }];

const fakeReport: ReportResponse = {
  from: "2026-08-01",
  to: "2026-08-19",
  categories: [],
  errors: [],
};

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = createApp(async () => fakeReport, media, {} as any);
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/report", () => {
  it("returns 400 when from/to are missing", async () => {
    const app = createApp(async () => fakeReport, media, {} as any);
    const response = await request(app).get("/api/report");
    expect(response.status).toBe(400);
  });

  it("calls buildReport with the configured media and query dates", async () => {
    let receivedArgs: unknown[] = [];
    const app = createApp(
      async (...args: unknown[]) => {
        receivedArgs = args;
        return fakeReport;
      },
      media,
      {} as any
    );

    const response = await request(app).get("/api/report?from=2026-08-01&to=2026-08-19");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(fakeReport);
    expect(receivedArgs[0]).toEqual(media);
    expect(receivedArgs[1]).toBe("2026-08-01");
    expect(receivedArgs[2]).toBe("2026-08-19");
  });
});

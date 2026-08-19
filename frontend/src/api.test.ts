import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchReport } from "./api";
import type { ReportResponse } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleReport: ReportResponse = {
  from: "2026-08-01",
  to: "2026-08-19",
  categories: [],
  errors: [],
};

describe("fetchReport", () => {
  it("calls the backend with the given date range and returns the parsed report", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => sampleReport,
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchReport("2026-08-01", "2026-08-19");

    expect(result).toEqual(sampleReport);
    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(calledUrl.origin).toBe("http://localhost:3001");
    expect(calledUrl.pathname).toBe("/api/report");
    expect(calledUrl.searchParams.get("from")).toBe("2026-08-01");
    expect(calledUrl.searchParams.get("to")).toBe("2026-08-19");
  });

  it("throws when the backend responds with an error status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) }))
    );

    await expect(fetchReport("2026-08-01", "2026-08-19")).rejects.toThrow();
  });
});

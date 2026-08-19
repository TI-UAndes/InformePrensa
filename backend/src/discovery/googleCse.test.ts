import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { discoverFromGoogleCse } from "./googleCse.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GOOGLE_CSE_API_KEY = "test-key";
  process.env.GOOGLE_CSE_CX = "test-cx";
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.unstubAllGlobals();
});

describe("discoverFromGoogleCse", () => {
  it("returns an empty array and logs a warning when credentials are missing", async () => {
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_CX;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await discoverFromGoogleCse("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain("GOOGLE_CSE_API_KEY");
    warn.mockRestore();
  });

  it("passes an abort signal to the API call", async () => {
    const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => ({
      ok: true,
      json: async () => ({ items: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await discoverFromGoogleCse("example.cl", "2026-08-01", "2026-08-19");

    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("maps API results into discovered URLs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          items: [{ link: "https://example.cl/nota-uandes" }],
        }),
      }))
    );

    const result = await discoverFromGoogleCse("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([
      { url: "https://example.cl/nota-uandes", discoveredDate: "2026-08-01" },
    ]);
  });

  it("returns an empty array when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, json: async () => ({}) }))
    );

    const result = await discoverFromGoogleCse("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([]);
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverFromSitemapOrRss } from "./sitemapRss.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function mockFetchSequence(responses: Array<{ ok: boolean; text: string }>) {
  let call = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      const response = responses[call] ?? responses[responses.length - 1];
      call += 1;
      return {
        ok: response.ok,
        text: async () => response.text,
      } as Response;
    })
  );
}

describe("discoverFromSitemapOrRss", () => {
  it("returns only sitemap entries within the date range", async () => {
    const sitemapXml = `
      <urlset>
        <url><loc>https://example.cl/a</loc><lastmod>2026-08-18</lastmod></url>
        <url><loc>https://example.cl/b</loc><lastmod>2026-07-01</lastmod></url>
      </urlset>
    `;
    mockFetchSequence([{ ok: true, text: sitemapXml }]);

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([{ url: "https://example.cl/a", discoveredDate: "2026-08-18" }]);
  });

  it("falls back to the RSS feed when sitemap.xml is not available", async () => {
    const rssXml = `
      <rss><channel>
        <item><link>https://example.cl/c</link><pubDate>Tue, 18 Aug 2026 10:00:00 GMT</pubDate></item>
      </channel></rss>
    `;
    mockFetchSequence([
      { ok: false, text: "" },
      { ok: false, text: "" },
      { ok: true, text: rssXml },
    ]);

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([{ url: "https://example.cl/c", discoveredDate: "2026-08-18" }]);
  });

  it("returns an empty array when every path fails", async () => {
    mockFetchSequence([{ ok: false, text: "" }]);

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([]);
  });
});

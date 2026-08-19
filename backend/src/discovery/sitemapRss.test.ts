import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverFromSitemapOrRss } from "./sitemapRss.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function makeResponse(ok: boolean, text: string, contentType?: string): Response {
  return {
    ok,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType ?? null : null) },
    text: async () => text,
  } as unknown as Response;
}

function mockFetchSequence(responses: Array<{ ok: boolean; text: string; contentType?: string }>) {
  let call = 0;
  const fetchMock = vi.fn(async (_input: string, _init?: RequestInit) => {
    const response = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return makeResponse(response.ok, response.text, response.contentType);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function mockFetchByUrl(routes: Record<string, { ok: boolean; text: string; contentType?: string }>) {
  const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => {
    const route = routes[input];
    if (!route) return makeResponse(false, "", "text/html");
    return makeResponse(route.ok, route.text, route.contentType);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
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

  it("follows one level of a sitemapindex and returns the nested sitemap entries", async () => {
    const indexXml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex>
        <sitemap><loc>https://example.cl/sitemap-2026-08.xml</loc><lastmod>2026-08-19</lastmod></sitemap>
        <sitemap><loc>https://example.cl/sitemap-2015-01.xml</loc><lastmod>2015-01-31</lastmod></sitemap>
      </sitemapindex>`;
    const nestedXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset>
        <url><loc>https://example.cl/nota-uandes</loc><lastmod>2026-08-18</lastmod></url>
        <url><loc>https://example.cl/nota-vieja</loc><lastmod>2026-07-01</lastmod></url>
      </urlset>`;

    const fetchMock = mockFetchByUrl({
      "https://example.cl/sitemap.xml": { ok: true, text: indexXml, contentType: "text/xml" },
      "https://example.cl/sitemap-2026-08.xml": { ok: true, text: nestedXml, contentType: "text/xml" },
    });

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([{ url: "https://example.cl/nota-uandes", discoveredDate: "2026-08-18" }]);
    const fetched = fetchMock.mock.calls.map((call) => call[0]);
    expect(fetched).toContain("https://example.cl/sitemap-2026-08.xml");
    // the nested sitemap whose lastmod predates `from` is never fetched
    expect(fetched).not.toContain("https://example.cl/sitemap-2015-01.xml");
  });

  it("rejects soft-200 HTML catch-all responses and falls through to the next candidate", async () => {
    const html = `<!DOCTYPE html><html><head><title>Portada</title></head><body>Noticias</body></html>`;
    const rssXml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss><channel>
        <item><link>https://example.cl/d</link><pubDate>Tue, 18 Aug 2026 10:00:00 GMT</pubDate></item>
      </channel></rss>`;

    mockFetchSequence([
      { ok: true, text: html, contentType: "text/html; charset=utf-8" },
      { ok: true, text: html, contentType: "text/html; charset=utf-8" },
      { ok: true, text: rssXml, contentType: "application/rss+xml" },
    ]);

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([{ url: "https://example.cl/d", discoveredDate: "2026-08-18" }]);
  });

  it("returns an empty array when every candidate answers with soft-200 HTML", async () => {
    const html = `<!DOCTYPE html><html><body>Portada</body></html>`;
    mockFetchSequence([{ ok: true, text: html, contentType: "text/html; charset=utf-8" }]);

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([]);
  });

  it("falls back to sitemaps declared in robots.txt", async () => {
    const robots = "User-agent: *\nDisallow: /draft/\n\nSitemap: https://example.cl/_files/sitemap_lasts.xml\n";
    const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset><url><loc>https://example.cl/e</loc><lastmod>2026-08-18</lastmod></url></urlset>`;

    mockFetchByUrl({
      "https://example.cl/robots.txt": { ok: true, text: robots, contentType: "text/plain" },
      "https://example.cl/_files/sitemap_lasts.xml": { ok: true, text: sitemapXml, contentType: "text/xml" },
    });

    const result = await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([{ url: "https://example.cl/e", discoveredDate: "2026-08-18" }]);
  });

  it("passes an abort signal to every fetch", async () => {
    const fetchMock = mockFetchSequence([{ ok: false, text: "" }]);

    await discoverFromSitemapOrRss("example.cl", "2026-08-01", "2026-08-19");

    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.signal).toBeInstanceOf(AbortSignal);
    }
  });
});

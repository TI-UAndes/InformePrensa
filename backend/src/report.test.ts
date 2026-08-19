import { afterEach, describe, expect, it, vi } from "vitest";
import { buildReport, type ReportDeps } from "./report.js";
import type { MediaConfig } from "./types.js";

const ARTICLE_WITH_MENTION = `<html><head><title>Nota UANDES</title></head><body>Universidad de los Andes.</body></html>`;

function articleWithPublishedDate(date: string): string {
  return `<html><head><title>Nota UANDES</title>
    <script type="application/ld+json">{"datePublished":"${date}","author":{"name":"Autor"}}</script>
    </head><body>Universidad de los Andes.</body></html>`;
}

afterEach(() => {
  vi.restoreAllMocks();
});
const ARTICLE_WITHOUT_MENTION = `<html><head><title>Otra nota</title></head><body>Sin mención.</body></html>`;

function makeDeps(overrides: Partial<ReportDeps> = {}): ReportDeps {
  return {
    discoverSitemapRss: async () => [],
    discoverGoogleCse: async () => [],
    fetchHtml: async () => ARTICLE_WITH_MENTION,
    ...overrides,
  };
}

const media: MediaConfig[] = [
  { domain: "sitio.cl", name: "SITIO EJEMPLO", category: "Sitio Web" },
  { domain: "radio.cl", name: "RADIO EJEMPLO", category: "Radio" },
];

describe("buildReport", () => {
  it("groups matched items by category in the fixed order", async () => {
    const deps = makeDeps({
      discoverSitemapRss: async (domain) =>
        domain === "sitio.cl"
          ? [{ url: "https://sitio.cl/a", discoveredDate: "2026-08-10" }]
          : [{ url: "https://radio.cl/b", discoveredDate: "2026-08-11" }],
    });

    const result = await buildReport(media, "2026-08-01", "2026-08-19", deps);

    expect(result.categories.map((group) => group.category)).toEqual(["Sitio Web", "Radio"]);
    expect(result.categories[0].items[0]).toMatchObject({ medio: "SITIO EJEMPLO", url: "https://sitio.cl/a" });
  });

  it("dedupes the same URL found by both discovery sources", async () => {
    const deps = makeDeps({
      discoverSitemapRss: async () => [{ url: "https://sitio.cl/a", discoveredDate: "2026-08-10" }],
      discoverGoogleCse: async () => [{ url: "https://sitio.cl/a/", discoveredDate: "2026-08-10" }],
    });

    const result = await buildReport([media[0]], "2026-08-01", "2026-08-19", deps);

    expect(result.categories[0].items).toHaveLength(1);
  });

  it("excludes pages that do not actually mention the UANDES", async () => {
    const deps = makeDeps({
      discoverSitemapRss: async () => [{ url: "https://sitio.cl/a", discoveredDate: "2026-08-10" }],
      fetchHtml: async () => ARTICLE_WITHOUT_MENTION,
    });

    const result = await buildReport([media[0]], "2026-08-01", "2026-08-19", deps);

    expect(result.categories).toEqual([]);
  });

  it("records an error, logs the real cause and continues when a medium's discovery throws", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const deps = makeDeps({
      discoverSitemapRss: async (domain) => {
        if (domain === "sitio.cl") throw new Error("network down");
        return [{ url: "https://radio.cl/b", discoveredDate: "2026-08-11" }];
      },
    });

    const result = await buildReport(media, "2026-08-01", "2026-08-19", deps);

    expect(result.errors).toEqual([{ medio: "SITIO EJEMPLO", motivo: "no se pudo consultar el medio" }]);
    expect(result.categories.map((group) => group.category)).toEqual(["Radio"]);
    expect(warn).toHaveBeenCalledWith("[SITIO EJEMPLO] discovery failed: network down");
  });

  it("excludes items whose extracted publication date falls outside the range", async () => {
    const deps = makeDeps({
      discoverSitemapRss: async () => [
        { url: "https://sitio.cl/vieja", discoveredDate: "2026-08-10" },
        { url: "https://sitio.cl/nueva", discoveredDate: "2026-08-10" },
      ],
      // The sitemap `lastmod` is inside the range for both, but the article's own
      // `datePublished` is much older for the first one.
      fetchHtml: async (url) =>
        url.endsWith("/vieja")
          ? articleWithPublishedDate("2024-01-15")
          : articleWithPublishedDate("2026-08-12"),
    });

    const result = await buildReport([media[0]], "2026-08-01", "2026-08-19", deps);

    expect(result.categories[0].items).toEqual([
      {
        medio: "SITIO EJEMPLO",
        titulo: "Nota UANDES",
        url: "https://sitio.cl/nueva",
        fecha: "2026-08-12",
        autor: "Autor",
      },
    ]);
    expect(result.errors).toEqual([]);
  });

  it("caps the number of candidate URLs fetched per medium at 30", async () => {
    const fetched: string[] = [];
    const deps = makeDeps({
      discoverSitemapRss: async () =>
        Array.from({ length: 50 }, (_, index) => ({
          url: `https://sitio.cl/nota-${index}`,
          discoveredDate: "2026-08-10",
        })),
      fetchHtml: async (url) => {
        fetched.push(url);
        return ARTICLE_WITH_MENTION;
      },
    });

    const result = await buildReport([media[0]], "2026-08-01", "2026-08-19", deps);

    expect(fetched).toHaveLength(30);
    expect(fetched[0]).toBe("https://sitio.cl/nota-0");
    expect(fetched[29]).toBe("https://sitio.cl/nota-29");
    expect(result.categories[0].items).toHaveLength(30);
  });

  it("dedupes globally so an article shared by two media appears only once", async () => {
    const sharedDomainMedia: MediaConfig[] = [
      { domain: "biobiochile.cl", name: "BIO-BIO ONLINE", category: "Sitio Web" },
      { domain: "biobiochile.cl", name: "RADIO BIO-BIO", category: "Radio" },
    ];
    const deps = makeDeps({
      discoverSitemapRss: async () => [{ url: "https://biobiochile.cl/nota", discoveredDate: "2026-08-10" }],
    });

    const result = await buildReport(sharedDomainMedia, "2026-08-01", "2026-08-19", deps);

    expect(result.categories).toHaveLength(1);
    expect(result.categories[0].category).toBe("Sitio Web");
    expect(result.categories[0].items).toHaveLength(1);
    expect(result.categories[0].items[0].medio).toBe("BIO-BIO ONLINE");
  });

  it("skips a single URL that fails to fetch without failing the whole medium", async () => {
    let call = 0;
    const deps = makeDeps({
      discoverSitemapRss: async () => [
        { url: "https://sitio.cl/a", discoveredDate: "2026-08-10" },
        { url: "https://sitio.cl/b", discoveredDate: "2026-08-11" },
      ],
      fetchHtml: async () => {
        call += 1;
        if (call === 1) throw new Error("timeout");
        return ARTICLE_WITH_MENTION;
      },
    });

    const result = await buildReport([media[0]], "2026-08-01", "2026-08-19", deps);

    expect(result.categories[0].items).toHaveLength(1);
    expect(result.errors).toEqual([]);
  });

  it("omits categories with no items and returns empty errors when everything succeeds", async () => {
    const deps = makeDeps();
    const result = await buildReport(media, "2026-08-01", "2026-08-19", deps);
    expect(result.categories).toEqual([]);
    expect(result.errors).toEqual([]);
    expect(result.from).toBe("2026-08-01");
    expect(result.to).toBe("2026-08-19");
  });
});

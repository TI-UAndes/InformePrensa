import type {
  Category,
  DiscoveredUrl,
  MediaConfig,
  ReportError,
  ReportItem,
  ReportResponse,
} from "./types.js";
import { extractArticle } from "./articleExtractor.js";

const CATEGORY_ORDER: Category[] = ["Sitio Web", "Televisión", "Prensa Escrita", "Radio"];

/**
 * Upper bound on how many candidate URLs are downloaded per medium. A real news
 * sitemap can list hundreds of URLs for a single day, and each candidate costs
 * one sequential HTTP request.
 */
const MAX_CANDIDATES_PER_MEDIUM = 30;

export interface ReportDeps {
  discoverSitemapRss: (domain: string, from: string, to: string) => Promise<DiscoveredUrl[]>;
  discoverGoogleCse: (domain: string, from: string, to: string) => Promise<DiscoveredUrl[]>;
  fetchHtml: (url: string) => Promise<string>;
}

function normalizeUrl(url: string): string {
  return url.replace(/\/$/, "");
}

async function collectMediaItems(
  media: MediaConfig,
  from: string,
  to: string,
  deps: ReportDeps
): Promise<{ items: ReportItem[]; error?: ReportError }> {
  let sitemapResults: DiscoveredUrl[];
  let cseResults: DiscoveredUrl[];

  try {
    [sitemapResults, cseResults] = await Promise.all([
      deps.discoverSitemapRss(media.domain, from, to),
      deps.discoverGoogleCse(media.domain, from, to),
    ]);
  } catch (error) {
    console.warn(
      `[${media.name}] discovery failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return { items: [], error: { medio: media.name, motivo: "no se pudo consultar el medio" } };
  }

  const seen = new Set<string>();
  const candidates = [...sitemapResults, ...cseResults]
    .filter((entry) => {
      const key = normalizeUrl(entry.url);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_CANDIDATES_PER_MEDIUM);

  const items: ReportItem[] = [];
  for (const candidate of candidates) {
    let html: string;
    try {
      html = await deps.fetchHtml(candidate.url);
    } catch {
      continue;
    }
    const extracted = extractArticle(html, candidate.discoveredDate);
    if (!extracted.matched) continue;
    // `extracted.fecha` comes from the article itself (JSON-LD `datePublished`),
    // which can differ from the sitemap `lastmod` used to discover it, so the
    // real publication date has to be re-checked against the requested range.
    if (extracted.fecha < from || extracted.fecha > to) continue;
    items.push({
      medio: media.name,
      titulo: extracted.titulo,
      url: candidate.url,
      fecha: extracted.fecha,
      autor: extracted.autor,
    });
  }

  return { items };
}

export async function buildReport(
  media: MediaConfig[],
  from: string,
  to: string,
  deps: ReportDeps
): Promise<ReportResponse> {
  const results = await Promise.all(media.map((entry) => collectMediaItems(entry, from, to, deps)));

  const itemsByCategory = new Map<Category, ReportItem[]>();
  const errors: ReportError[] = [];
  // Global dedup: two media configs can share a domain (e.g. a site and its
  // radio station), so the same article must not be reported under both. Applied
  // here, in `media` array order, so the result never depends on race timing.
  const includedUrls = new Set<string>();

  media.forEach((entry, index) => {
    const { items, error } = results[index];
    if (error) errors.push(error);
    const uniqueItems = items.filter((item) => {
      const key = normalizeUrl(item.url);
      if (includedUrls.has(key)) return false;
      includedUrls.add(key);
      return true;
    });
    if (uniqueItems.length === 0) return;
    const existing = itemsByCategory.get(entry.category) ?? [];
    itemsByCategory.set(entry.category, [...existing, ...uniqueItems]);
  });

  const categories = CATEGORY_ORDER.filter((category) => itemsByCategory.has(category)).map((category) => ({
    category,
    items: itemsByCategory.get(category)!,
  }));

  return { from, to, categories, errors };
}

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
  } catch {
    return { items: [], error: { medio: media.name, motivo: "no se pudo consultar el medio" } };
  }

  const seen = new Set<string>();
  const candidates = [...sitemapResults, ...cseResults].filter((entry) => {
    const key = normalizeUrl(entry.url);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

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

  media.forEach((entry, index) => {
    const { items, error } = results[index];
    if (error) errors.push(error);
    if (items.length === 0) return;
    const existing = itemsByCategory.get(entry.category) ?? [];
    itemsByCategory.set(entry.category, [...existing, ...items]);
  });

  const categories = CATEGORY_ORDER.filter((category) => itemsByCategory.has(category)).map((category) => ({
    category,
    items: itemsByCategory.get(category)!,
  }));

  return { from, to, categories, errors };
}

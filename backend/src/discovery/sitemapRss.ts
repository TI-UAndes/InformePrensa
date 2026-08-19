import { XMLParser } from "fast-xml-parser";
import type { DiscoveredUrl } from "../types.js";

const CANDIDATE_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/feed", "/rss"];

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export async function discoverFromSitemapOrRss(
  domain: string,
  from: string,
  to: string
): Promise<DiscoveredUrl[]> {
  const parser = new XMLParser();

  for (const path of CANDIDATE_PATHS) {
    try {
      const response = await fetch(`https://${domain}${path}`);
      if (!response.ok) continue;
      const xml = parser.parse(await response.text());

      const sitemapEntries: DiscoveredUrl[] = asArray(xml?.urlset?.url)
        .map((entry: any) => ({
          url: entry.loc,
          discoveredDate: toIsoDate(entry.lastmod),
        }))
        .filter((entry: any): entry is DiscoveredUrl => Boolean(entry.url && entry.discoveredDate));

      const rssEntries: DiscoveredUrl[] = asArray(xml?.rss?.channel?.item)
        .map((entry: any) => ({
          url: entry.link,
          discoveredDate: toIsoDate(entry.pubDate),
        }))
        .filter((entry: any): entry is DiscoveredUrl => Boolean(entry.url && entry.discoveredDate));

      const entries = [...sitemapEntries, ...rssEntries];
      if (entries.length === 0) continue;

      return entries.filter((entry) => inRange(entry.discoveredDate, from, to));
    } catch {
      continue;
    }
  }

  return [];
}

import { XMLParser } from "fast-xml-parser";
import type { DiscoveredUrl } from "../types.js";

const CANDIDATE_PATHS = ["/sitemap.xml", "/sitemap_index.xml", "/feed", "/rss"];
const FETCH_TIMEOUT_MS = 10_000;
const MAX_NESTED_SITEMAPS = 5;
const MAX_ROBOTS_SITEMAPS = 3;

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

/**
 * Guards against "soft 200" catch-all responses: several Chilean outlets answer
 * every unknown path with their HTML homepage and a 200 status, which would
 * otherwise be parsed as XML and silently yield zero entries.
 */
function looksLikeXml(response: Response, text: string): boolean {
  const contentType = response.headers?.get?.("content-type") ?? "";
  if (contentType.toLowerCase().includes("xml")) return true;
  const head = text.trimStart().slice(0, 200).toLowerCase();
  return (
    head.startsWith("<?xml") ||
    head.startsWith("<urlset") ||
    head.startsWith("<rss") ||
    head.startsWith("<sitemapindex")
  );
}

async function fetchXml(url: string): Promise<string | undefined> {
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) return undefined;
  const text = await response.text();
  if (!looksLikeXml(response, text)) return undefined;
  return text;
}

function parseFlatEntries(xml: any): DiscoveredUrl[] {
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

  return [...sitemapEntries, ...rssEntries];
}

/**
 * Follows a <sitemapindex> exactly one level deep. Nested sitemaps whose own
 * lastmod predates `from` cannot contain URLs modified inside the range, so
 * they are skipped before fetching.
 */
async function parseSitemapIndex(
  parser: XMLParser,
  nested: any[],
  from: string
): Promise<DiscoveredUrl[]> {
  const relevant = nested
    .filter((entry: any) => Boolean(entry?.loc))
    .filter((entry: any) => {
      const lastmod = toIsoDate(entry.lastmod ? String(entry.lastmod) : undefined);
      return !lastmod || lastmod >= from;
    })
    .slice(0, MAX_NESTED_SITEMAPS);

  const entries: DiscoveredUrl[] = [];
  for (const entry of relevant) {
    try {
      const text = await fetchXml(String(entry.loc));
      if (!text) continue;
      entries.push(...parseFlatEntries(parser.parse(text)));
    } catch {
      continue;
    }
  }
  return entries;
}

async function robotsSitemapUrls(domain: string): Promise<string[]> {
  try {
    const response = await fetch(`https://${domain}/robots.txt`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return [];
    const text = await response.text();
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^sitemap\s*:/i.test(line))
      .map((line) => line.replace(/^sitemap\s*:/i, "").trim())
      .filter((value) => /^https?:\/\//i.test(value))
      .slice(0, MAX_ROBOTS_SITEMAPS);
  } catch {
    return [];
  }
}

async function entriesFromCandidate(
  parser: XMLParser,
  url: string,
  from: string
): Promise<DiscoveredUrl[]> {
  const text = await fetchXml(url);
  if (!text) return [];
  const xml = parser.parse(text);

  const nested = asArray<any>(xml?.sitemapindex?.sitemap);
  if (nested.length > 0) return parseSitemapIndex(parser, nested, from);

  return parseFlatEntries(xml);
}

export async function discoverFromSitemapOrRss(
  domain: string,
  from: string,
  to: string
): Promise<DiscoveredUrl[]> {
  const parser = new XMLParser();
  const wellKnownUrls = CANDIDATE_PATHS.map((path) => `https://${domain}${path}`);

  for (const url of wellKnownUrls) {
    try {
      const entries = await entriesFromCandidate(parser, url, from);
      if (entries.length === 0) continue;
      return entries.filter((entry) => inRange(entry.discoveredDate, from, to));
    } catch {
      continue;
    }
  }

  // Fallback: many sites publish their real sitemap location only in robots.txt.
  for (const url of await robotsSitemapUrls(domain)) {
    try {
      const entries = await entriesFromCandidate(parser, url, from);
      if (entries.length === 0) continue;
      return entries.filter((entry) => inRange(entry.discoveredDate, from, to));
    } catch {
      continue;
    }
  }

  return [];
}

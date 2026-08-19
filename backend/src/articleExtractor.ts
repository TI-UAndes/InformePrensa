import * as cheerio from "cheerio";
import { containsUandesMention } from "./matcher.js";

export interface ExtractedArticle {
  titulo: string;
  fecha: string;
  autor: string;
  matched: boolean;
}

function toIsoDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function extractFromJsonLd($: cheerio.CheerioAPI): { fecha?: string; autor?: string } {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    try {
      const data = JSON.parse($(script).text());
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        const fecha = toIsoDate(item.datePublished);
        let autor: string | undefined;
        if (typeof item.author === "string") {
          autor = item.author;
        } else if (item.author?.name) {
          autor = item.author.name;
        } else if (Array.isArray(item.author) && item.author[0]?.name) {
          autor = item.author[0].name;
        }
        if (fecha || autor) return { fecha, autor };
      }
    } catch {
      continue;
    }
  }
  return {};
}

export function extractArticle(html: string, fallbackDate: string): ExtractedArticle {
  const $ = cheerio.load(html);

  const titulo =
    $("title").text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    "";

  const jsonLd = extractFromJsonLd($);

  const fecha =
    jsonLd.fecha ||
    toIsoDate($('meta[property="article:published_time"]').attr("content")) ||
    fallbackDate;

  const autor =
    jsonLd.autor ||
    $('meta[property="article:author"]').attr("content")?.trim() ||
    $('meta[name="author"]').attr("content")?.trim() ||
    "";

  const bodyText = $("body").text();
  const matched = containsUandesMention(`${titulo} ${bodyText}`);

  return { titulo, fecha, autor, matched };
}

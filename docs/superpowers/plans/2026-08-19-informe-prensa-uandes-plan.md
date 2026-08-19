# Informe de Prensa UANDES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Vite+React frontend and Express backend that, given a
date range, finds mentions of "Universidad de los Andes" / "UANDES" across a
configurable list of Chilean media (sitemap/RSS + Google Custom Search) and
renders them on screen grouped by category, matching the visual structure of
`Informe.html`.

**Architecture:** Two independent Node projects (`backend/`, `frontend/`).
The backend exposes `GET /api/report?from=&to=` which runs, per configured
medium, sitemap/RSS discovery + Google Custom Search discovery, dedupes
candidate URLs, fetches and verifies each page for an actual UANDES mention,
and extracts title/date/author. The frontend calls that endpoint and renders
the grouped result.

**Tech Stack:** TypeScript on both sides. Backend: Node (>=18, global
`fetch`), Express, `cors`, `cheerio`, `fast-xml-parser`, `dotenv`, run via
`tsx`, tested with `vitest` + `supertest`. Frontend: Vite, React 18, tested
with `vitest` + `@testing-library/react` + `jsdom`.

**Spec:** [docs/superpowers/specs/2026-08-19-informe-prensa-uandes-design.md](../specs/2026-08-19-informe-prensa-uandes-design.md)

## Global Constraints

- Local-only tool, single user, no auth, no deployment — `localhost` only.
- Output is on-screen only — no PDF/HTML export, no email sending.
- Fixed category set and order: `Sitio Web`, `Televisión`, `Prensa Escrita`,
  `Radio` — same names/order as `Informe.html`.
- `backend/src/config/media.json` is the only source of which domains get
  searched; no attempt to discover "all media on the internet".
- If `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` are not set, Google Custom Search
  discovery must degrade to returning no results (not throw), so the app
  still works with sitemap/RSS alone.
- A single medium failing (sitemap/RSS down, page not loading) must never
  fail the whole report — skip it and record it in `errors`.
- Node >=18 required (relies on global `fetch`).

---

## File Structure

```
InformePrensa/
  backend/
    package.json
    tsconfig.json
    vitest.config.ts
    .env.example
    src/
      config/media.json
      types.ts
      matcher.ts
      matcher.test.ts
      articleExtractor.ts
      articleExtractor.test.ts
      discovery/
        sitemapRss.ts
        sitemapRss.test.ts
        googleCse.ts
        googleCse.test.ts
      report.ts
      report.test.ts
      app.ts
      app.test.ts
      server.ts
  frontend/
    package.json
    tsconfig.json
    vite.config.ts
    index.html
    src/
      types.ts
      api.ts
      api.test.ts
      styles.css
      components/
        MediaItemCard.tsx
        MediaItemCard.test.tsx
        CategorySection.tsx
        CategorySection.test.tsx
        ReportView.tsx
        ReportView.test.tsx
        DateRangeForm.tsx
        DateRangeForm.test.tsx
      App.tsx
      App.test.tsx
      main.tsx
  README.md
```

---

### Task 1: Backend scaffold + shared types + health check

**Files:**
- Create: `backend/package.json`
- Create: `backend/tsconfig.json`
- Create: `backend/vitest.config.ts`
- Create: `backend/.env.example`
- Create: `backend/src/config/media.json`
- Create: `backend/src/types.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Produces: `Category`, `MediaConfig`, `ReportItem`, `ReportError`,
  `CategoryGroup`, `ReportResponse`, `DiscoveredUrl` (from `types.ts`) — used
  by every later backend task.
- Produces: `createApp(): Express` (from `app.ts`) — extended in Task 7 to
  add the real `/api/report` route. For now it only has `/health`.

- [ ] **Step 1: Create the backend project files**

`backend/package.json`:

```json
{
  "name": "informe-prensa-backend",
  "private": true,
  "type": "module",
  "engines": { "node": ">=18" },
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "test": "vitest run"
  }
}
```

`backend/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist"
  },
  "include": ["src"]
}
```

`backend/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
  },
});
```

`backend/.env.example`:

```
GOOGLE_CSE_API_KEY=
GOOGLE_CSE_CX=
PORT=3001
```

`backend/src/config/media.json`:

```json
[
  { "domain": "agriculturaonline.cl", "name": "AGRICULTURA ONLINE", "category": "Sitio Web" },
  { "domain": "biobiochile.cl", "name": "BIO-BIO ONLINE", "category": "Sitio Web" },
  { "domain": "13.cl", "name": "CANAL 13", "category": "Televisión" },
  { "domain": "chvnoticias.cl", "name": "CHILEVISIÓN NOTICIAS", "category": "Televisión" },
  { "domain": "latercera.com", "name": "LA TERCERA", "category": "Prensa Escrita" },
  { "domain": "emol.com", "name": "EL MERCURIO", "category": "Prensa Escrita" },
  { "domain": "biobiochile.cl", "name": "RADIO BIO-BIO", "category": "Radio" }
]
```

`backend/src/types.ts`:

```ts
export type Category = "Sitio Web" | "Televisión" | "Prensa Escrita" | "Radio";

export interface MediaConfig {
  domain: string;
  name: string;
  category: Category;
}

export interface DiscoveredUrl {
  url: string;
  discoveredDate: string;
}

export interface ReportItem {
  medio: string;
  titulo: string;
  url: string;
  fecha: string;
  autor: string;
}

export interface CategoryGroup {
  category: Category;
  items: ReportItem[];
}

export interface ReportError {
  medio: string;
  motivo: string;
}

export interface ReportResponse {
  from: string;
  to: string;
  categories: CategoryGroup[];
  errors: ReportError[];
}
```

`backend/src/app.ts`:

```ts
import express, { Express } from "express";
import cors from "cors";

export function createApp(): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  return app;
}
```

`backend/src/server.ts`:

```ts
import "dotenv/config";
import { createApp } from "./app.js";

const app = createApp();
const port = process.env.PORT ?? 3001;

app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});
```

- [ ] **Step 2: Install dependencies**

Run:

```bash
cd backend
npm init -y >/dev/null 2>&1 || true
npm install express cors cheerio fast-xml-parser dotenv
npm install -D typescript tsx vitest supertest @types/supertest @types/express @types/cors @types/node
```

(The `package.json` created in Step 1 will be overwritten by `npm init`'s
defaults for fields like `name`/`version` if you run `npm init` first — make
sure the final `backend/package.json` still has the `scripts`, `type`, and
`engines` fields exactly as written in Step 1 after installing.)

- [ ] **Step 3: Write the failing test**

`backend/src/app.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = createApp();
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/app.test.ts`
Expected: PASS (since `app.ts` already implements `/health` — this
establishes the test setup works before later tasks add real logic).

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "chore: scaffold backend with health check"
```

---

### Task 2: Keyword matcher

**Files:**
- Create: `backend/src/matcher.ts`
- Test: `backend/src/matcher.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `containsUandesMention(text: string): boolean` — used by
  `articleExtractor.ts` (Task 3).

- [ ] **Step 1: Write the failing tests**

`backend/src/matcher.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { containsUandesMention } from "./matcher.js";

describe("containsUandesMention", () => {
  it("matches the full university name", () => {
    expect(containsUandesMention("La Universidad de los Andes anunció...")).toBe(true);
  });

  it("matches the acronym UANDES case-insensitively", () => {
    expect(containsUandesMention("uandes lanza nuevo programa")).toBe(true);
  });

  it("matches with mixed case in the full name", () => {
    expect(containsUandesMention("universidad de LOS ANDES informó")).toBe(true);
  });

  it("does not match a different university", () => {
    expect(containsUandesMention("La Universidad de Chile anunció...")).toBe(false);
  });

  it("does not match uandes as part of a longer word", () => {
    expect(containsUandesMention("Perteneció a un club llamado clubuandes")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(containsUandesMention("Sin mención relevante")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/matcher.test.ts`
Expected: FAIL with "Cannot find module './matcher.js'" (or similar).

- [ ] **Step 3: Implement**

`backend/src/matcher.ts`:

```ts
const KEYWORD_REGEX = /\b(universidad de los andes|uandes)\b/i;

export function containsUandesMention(text: string): boolean {
  return KEYWORD_REGEX.test(text);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/matcher.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/matcher.ts backend/src/matcher.test.ts
git commit -m "feat: add UANDES keyword matcher"
```

---

### Task 3: Article HTML extractor

**Files:**
- Create: `backend/src/articleExtractor.ts`
- Test: `backend/src/articleExtractor.test.ts`

**Interfaces:**
- Consumes: `containsUandesMention(text: string): boolean` (Task 2).
- Produces: `extractArticle(html: string, fallbackDate: string): ExtractedArticle`
  where `ExtractedArticle = { titulo: string; fecha: string; autor: string; matched: boolean }`
  — used by `report.ts` (Task 6).

- [ ] **Step 1: Write the failing tests**

`backend/src/articleExtractor.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { extractArticle } from "./articleExtractor.js";

describe("extractArticle", () => {
  it("extracts title, date and author from JSON-LD", () => {
    const html = `
      <html><head>
        <title>Nota sobre la Universidad de los Andes</title>
        <script type="application/ld+json">
          {"@type":"NewsArticle","datePublished":"2026-08-18T10:00:00Z","author":{"name":"Carolina Pye"}}
        </script>
      </head><body>Cuerpo con mención a la Universidad de los Andes.</body></html>
    `;
    const result = extractArticle(html, "2026-08-01");
    expect(result.titulo).toBe("Nota sobre la Universidad de los Andes");
    expect(result.fecha).toBe("2026-08-18");
    expect(result.autor).toBe("Carolina Pye");
    expect(result.matched).toBe(true);
  });

  it("falls back to meta tags when there is no JSON-LD", () => {
    const html = `
      <html><head>
        <title>UANDES en los medios</title>
        <meta property="article:published_time" content="2026-08-17T00:00:00Z">
        <meta name="author" content="Matías Acevedo">
      </head><body>Contenido con UANDES mencionada.</body></html>
    `;
    const result = extractArticle(html, "2026-08-01");
    expect(result.fecha).toBe("2026-08-17");
    expect(result.autor).toBe("Matías Acevedo");
    expect(result.matched).toBe(true);
  });

  it("falls back to the discovery date and empty author when nothing is found", () => {
    const html = `<html><head><title>Nota genérica</title></head><body>Universidad de los Andes.</body></html>`;
    const result = extractArticle(html, "2026-08-05");
    expect(result.fecha).toBe("2026-08-05");
    expect(result.autor).toBe("");
    expect(result.matched).toBe(true);
  });

  it("reports matched as false when there is no UANDES mention", () => {
    const html = `<html><head><title>Otra universidad</title></head><body>Universidad de Chile.</body></html>`;
    const result = extractArticle(html, "2026-08-05");
    expect(result.matched).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/articleExtractor.test.ts`
Expected: FAIL with "Cannot find module './articleExtractor.js'".

- [ ] **Step 3: Implement**

`backend/src/articleExtractor.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/articleExtractor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/articleExtractor.ts backend/src/articleExtractor.test.ts
git commit -m "feat: extract title, date and author from article HTML"
```

---

### Task 4: Sitemap/RSS discovery

**Files:**
- Create: `backend/src/discovery/sitemapRss.ts`
- Test: `backend/src/discovery/sitemapRss.test.ts`

**Interfaces:**
- Consumes: `DiscoveredUrl` (Task 1), global `fetch`.
- Produces: `discoverFromSitemapOrRss(domain: string, from: string, to: string): Promise<DiscoveredUrl[]>`
  — used by `report.ts` (Task 6) and `server.ts` (Task 7).

- [ ] **Step 1: Write the failing tests**

`backend/src/discovery/sitemapRss.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/discovery/sitemapRss.test.ts`
Expected: FAIL with "Cannot find module './sitemapRss.js'".

- [ ] **Step 3: Implement**

`backend/src/discovery/sitemapRss.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/discovery/sitemapRss.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/sitemapRss.ts backend/src/discovery/sitemapRss.test.ts
git commit -m "feat: discover candidate URLs from sitemap or RSS"
```

---

### Task 5: Google Custom Search discovery

**Files:**
- Create: `backend/src/discovery/googleCse.ts`
- Test: `backend/src/discovery/googleCse.test.ts`

**Interfaces:**
- Consumes: `DiscoveredUrl` (Task 1), global `fetch`,
  `process.env.GOOGLE_CSE_API_KEY`, `process.env.GOOGLE_CSE_CX`.
- Produces: `discoverFromGoogleCse(domain: string, from: string, to: string): Promise<DiscoveredUrl[]>`
  — used by `report.ts` (Task 6) and `server.ts` (Task 7).

- [ ] **Step 1: Write the failing tests**

`backend/src/discovery/googleCse.test.ts`:

```ts
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
  it("returns an empty array when credentials are missing", async () => {
    delete process.env.GOOGLE_CSE_API_KEY;
    delete process.env.GOOGLE_CSE_CX;

    const result = await discoverFromGoogleCse("example.cl", "2026-08-01", "2026-08-19");

    expect(result).toEqual([]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/discovery/googleCse.test.ts`
Expected: FAIL with "Cannot find module './googleCse.js'".

- [ ] **Step 3: Implement**

`backend/src/discovery/googleCse.ts`:

```ts
import type { DiscoveredUrl } from "../types.js";

function compactDate(date: string): string {
  return date.replace(/-/g, "");
}

export async function discoverFromGoogleCse(
  domain: string,
  from: string,
  to: string
): Promise<DiscoveredUrl[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const cx = process.env.GOOGLE_CSE_CX;
  if (!apiKey || !cx) {
    return [];
  }

  const url = new URL("https://www.googleapis.com/customsearch/v1");
  url.searchParams.set("key", apiKey);
  url.searchParams.set("cx", cx);
  url.searchParams.set("q", `site:${domain} ("Universidad de los Andes" OR UANDES)`);
  url.searchParams.set("sort", `date:r:${compactDate(from)}:${compactDate(to)}`);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) return [];
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];

    return items
      .filter((item: any) => Boolean(item.link))
      .map((item: any) => ({ url: item.link, discoveredDate: from }));
  } catch {
    return [];
  }
}
```

**Note for implementer:** the exact syntax of the `sort=date:r:...` date
range parameter should be double-checked against Google's current Custom
Search JSON API documentation — if it has changed, adjust this one line and
re-run the tests (they mock `fetch`, so they won't catch a live API syntax
drift; only manual verification with real credentials will).

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/discovery/googleCse.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/discovery/googleCse.ts backend/src/discovery/googleCse.test.ts
git commit -m "feat: discover candidate URLs from Google Custom Search"
```

---

### Task 6: Report orchestration

**Files:**
- Create: `backend/src/report.ts`
- Test: `backend/src/report.test.ts`

**Interfaces:**
- Consumes: `MediaConfig`, `ReportItem`, `ReportError`, `Category`,
  `ReportResponse`, `DiscoveredUrl` (Task 1); `extractArticle` (Task 3).
- Produces: `buildReport(media: MediaConfig[], from: string, to: string, deps: ReportDeps): Promise<ReportResponse>`
  where `ReportDeps = { discoverSitemapRss, discoverGoogleCse, fetchHtml }` —
  used by `app.ts`/`server.ts` (Task 7).

- [ ] **Step 1: Write the failing tests**

`backend/src/report.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReport, type ReportDeps } from "./report.js";
import type { MediaConfig } from "./types.js";

const ARTICLE_WITH_MENTION = `<html><head><title>Nota UANDES</title></head><body>Universidad de los Andes.</body></html>`;
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

  it("records an error and continues when a medium's discovery throws", async () => {
    const deps = makeDeps({
      discoverSitemapRss: async (domain) => {
        if (domain === "sitio.cl") throw new Error("network down");
        return [{ url: "https://radio.cl/b", discoveredDate: "2026-08-11" }];
      },
    });

    const result = await buildReport(media, "2026-08-01", "2026-08-19", deps);

    expect(result.errors).toEqual([{ medio: "SITIO EJEMPLO", motivo: "no se pudo consultar el medio" }]);
    expect(result.categories.map((group) => group.category)).toEqual(["Radio"]);
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && npx vitest run src/report.test.ts`
Expected: FAIL with "Cannot find module './report.js'".

- [ ] **Step 3: Implement**

`backend/src/report.ts`:

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && npx vitest run src/report.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/report.ts backend/src/report.test.ts
git commit -m "feat: orchestrate report generation across configured media"
```

---

### Task 7: Wire the `/api/report` route and real server

**Files:**
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/src/app.test.ts`

**Interfaces:**
- Consumes: `buildReport`, `ReportDeps` (Task 6); `MediaConfig`,
  `ReportResponse` (Task 1); `discoverFromSitemapOrRss` (Task 4);
  `discoverFromGoogleCse` (Task 5).
- Produces: `createApp(buildReportFn, media, deps): Express` — the finished
  backend entry point consumed only by `server.ts` and by the frontend over
  HTTP.

- [ ] **Step 1: Write the failing test**

Replace the contents of `backend/src/app.test.ts` with:

```ts
import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "./app.js";
import type { MediaConfig, ReportResponse } from "./types.js";

const media: MediaConfig[] = [{ domain: "sitio.cl", name: "SITIO EJEMPLO", category: "Sitio Web" }];

const fakeReport: ReportResponse = {
  from: "2026-08-01",
  to: "2026-08-19",
  categories: [],
  errors: [],
};

describe("GET /health", () => {
  it("returns status ok", async () => {
    const app = createApp(async () => fakeReport, media, {} as any);
    const response = await request(app).get("/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });
});

describe("GET /api/report", () => {
  it("returns 400 when from/to are missing", async () => {
    const app = createApp(async () => fakeReport, media, {} as any);
    const response = await request(app).get("/api/report");
    expect(response.status).toBe(400);
  });

  it("calls buildReport with the configured media and query dates", async () => {
    let receivedArgs: unknown[] = [];
    const app = createApp(
      async (...args: unknown[]) => {
        receivedArgs = args;
        return fakeReport;
      },
      media,
      {} as any
    );

    const response = await request(app).get("/api/report?from=2026-08-01&to=2026-08-19");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(fakeReport);
    expect(receivedArgs[0]).toEqual(media);
    expect(receivedArgs[1]).toBe("2026-08-01");
    expect(receivedArgs[2]).toBe("2026-08-19");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx vitest run src/app.test.ts`
Expected: FAIL — `createApp` currently takes no arguments and has no
`/api/report` route.

- [ ] **Step 3: Implement**

Replace `backend/src/app.ts` with:

```ts
import express, { Express } from "express";
import cors from "cors";
import type { MediaConfig, ReportResponse } from "./types.js";
import type { ReportDeps } from "./report.js";

type BuildReportFn = (media: MediaConfig[], from: string, to: string, deps: ReportDeps) => Promise<ReportResponse>;

export function createApp(buildReportFn: BuildReportFn, media: MediaConfig[], deps: ReportDeps): Express {
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.get("/api/report", async (req, res) => {
    const from = String(req.query.from ?? "");
    const to = String(req.query.to ?? "");
    if (!from || !to) {
      res.status(400).json({ error: "from y to son requeridos" });
      return;
    }
    const result = await buildReportFn(media, from, to, deps);
    res.json(result);
  });

  return app;
}
```

Replace `backend/src/server.ts` with:

```ts
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { buildReport } from "./report.js";
import { discoverFromSitemapOrRss } from "./discovery/sitemapRss.js";
import { discoverFromGoogleCse } from "./discovery/googleCse.js";
import type { MediaConfig } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const media: MediaConfig[] = JSON.parse(fs.readFileSync(path.join(__dirname, "config/media.json"), "utf-8"));

const app = createApp(buildReport, media, {
  discoverSitemapRss: discoverFromSitemapOrRss,
  discoverGoogleCse: discoverFromGoogleCse,
  fetchHtml: async (url: string) => {
    const response = await fetch(url);
    return response.text();
  },
});

const port = process.env.PORT ?? 3001;
app.listen(port, () => {
  console.log(`Backend escuchando en http://localhost:${port}`);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && npx vitest run src/app.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the whole backend test suite**

Run: `cd backend && npm test`
Expected: PASS (all tests from Tasks 1–7).

- [ ] **Step 6: Commit**

```bash
git add backend/src/app.ts backend/src/app.test.ts backend/src/server.ts
git commit -m "feat: wire GET /api/report to buildReport"
```

---

### Task 8: Frontend scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/tsconfig.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/index.html`
- Create: `frontend/src/types.ts`
- Create: `frontend/src/styles.css`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Test: `frontend/src/App.test.tsx`

**Interfaces:**
- Produces: `ReportItem`, `CategoryGroup`, `ReportError`, `ReportResponse`,
  `Category` (from `frontend/src/types.ts`, mirroring the backend's
  `types.ts`) — used by every later frontend task.
- Produces: `App` component placeholder — replaced with real wiring in
  Task 14.

- [ ] **Step 1: Create the project with Vite's React+TS template**

Run:

```bash
cd frontend 2>/dev/null || (mkdir frontend && cd frontend)
npm create vite@latest . -- --template react-ts
npm install
npm install -D vitest jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Configure Vitest**

Modify `frontend/vite.config.ts` to add a `test` block:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
  },
});
```

Create `frontend/src/setupTests.ts`:

```ts
import "@testing-library/jest-dom/vitest";
```

Add a `test` script to `frontend/package.json`'s `"scripts"`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Create shared types**

`frontend/src/types.ts`:

```ts
export type Category = "Sitio Web" | "Televisión" | "Prensa Escrita" | "Radio";

export interface ReportItem {
  medio: string;
  titulo: string;
  url: string;
  fecha: string;
  autor: string;
}

export interface CategoryGroup {
  category: Category;
  items: ReportItem[];
}

export interface ReportError {
  medio: string;
  motivo: string;
}

export interface ReportResponse {
  from: string;
  to: string;
  categories: CategoryGroup[];
  errors: ReportError[];
}
```

- [ ] **Step 4: Create the full stylesheet**

`frontend/src/styles.css`:

```css
body {
  font-family: Helvetica, Arial, sans-serif;
  color: #505050;
  max-width: 700px;
  margin: 0 auto;
  padding: 20px;
}

.report-view__title {
  background-color: #063c4a;
  color: white;
  padding: 10px 20px;
  font-size: 15px;
}

.report-view__empty {
  color: #505050;
  padding: 10px 0;
}

.report-view__errors {
  margin-top: 20px;
  font-size: 12px;
  color: #606060;
}

.category-section__title {
  background-color: white;
  color: #063c4a;
  border-bottom: 1px solid #063c4a;
  font-size: 13px;
  padding: 10px 20px;
}

.media-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid #eee;
}

.media-item:nth-child(even) {
  background-color: #f3f4f5;
}

.media-item__logo {
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background-color: #dedede;
  flex-shrink: 0;
}

.media-item__title {
  display: block;
  font-size: 14px;
  font-weight: bold;
  color: #606060;
  text-decoration: none;
  margin-bottom: 5px;
}

.media-item__meta {
  font-size: 12px;
  color: #606060;
  margin: 0 0 5px;
}

.media-item__author {
  font-size: 12px;
  margin: 0;
}

form label {
  display: block;
  margin-bottom: 10px;
}
```

- [ ] **Step 5: Write the failing test for the App placeholder**

`frontend/src/App.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "./App";

describe("App", () => {
  it("renders the date range form", () => {
    render(<App />);
    expect(screen.getByText("Generar informe")).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL — `App.tsx` from the Vite template doesn't have a "Generar
informe" button yet.

- [ ] **Step 7: Implement a minimal placeholder**

Replace `frontend/src/App.tsx` with:

```tsx
import "./styles.css";

export function App() {
  return (
    <main>
      <form>
        <button type="submit">Generar informe</button>
      </form>
    </main>
  );
}
```

Replace `frontend/src/main.tsx` with:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "chore: scaffold frontend with Vite + React + TS"
```

---

### Task 9: Backend API client

**Files:**
- Create: `frontend/src/api.ts`
- Test: `frontend/src/api.test.ts`

**Interfaces:**
- Consumes: `ReportResponse` (Task 8), global `fetch`.
- Produces: `fetchReport(from: string, to: string): Promise<ReportResponse>`
  — used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing tests**

`frontend/src/api.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: FAIL with "Cannot find module './api'".

- [ ] **Step 3: Implement**

`frontend/src/api.ts`:

```ts
import type { ReportResponse } from "./types";

const BACKEND_URL = "http://localhost:3001";

export async function fetchReport(from: string, to: string): Promise<ReportResponse> {
  const url = new URL("/api/report", BACKEND_URL);
  url.searchParams.set("from", from);
  url.searchParams.set("to", to);

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Error al generar el informe (${response.status})`);
  }
  return response.json();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/api.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api.ts frontend/src/api.test.ts
git commit -m "feat: add frontend client for GET /api/report"
```

---

### Task 10: `MediaItemCard` component

**Files:**
- Create: `frontend/src/components/MediaItemCard.tsx`
- Test: `frontend/src/components/MediaItemCard.test.tsx`

**Interfaces:**
- Consumes: `ReportItem` (Task 8).
- Produces: `MediaItemCard({ item: ReportItem })` — used by
  `CategorySection.tsx` (Task 11).

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/MediaItemCard.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaItemCard } from "./MediaItemCard";
import type { ReportItem } from "../types";

const item: ReportItem = {
  medio: "LA TERCERA",
  titulo: "Matías Acevedo: reforma al empleo público",
  url: "https://latercera.com/nota",
  fecha: "2026-08-19",
  autor: "Matías Acevedo",
};

describe("MediaItemCard", () => {
  it("renders the title as a link to the source", () => {
    render(<MediaItemCard item={item} />);
    const link = screen.getByRole("link", { name: item.titulo });
    expect(link).toHaveAttribute("href", item.url);
  });

  it("renders the medium name and date", () => {
    render(<MediaItemCard item={item} />);
    expect(screen.getByText(`${item.medio} ${item.fecha}`)).toBeInTheDocument();
  });

  it("renders the author when present", () => {
    render(<MediaItemCard item={item} />);
    expect(screen.getByText("Matías Acevedo")).toBeInTheDocument();
  });

  it("does not render an author line when the author is empty", () => {
    render(<MediaItemCard item={{ ...item, autor: "" }} />);
    expect(screen.queryByText("Matías Acevedo")).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/MediaItemCard.test.tsx`
Expected: FAIL with "Cannot find module './MediaItemCard'".

- [ ] **Step 3: Implement**

`frontend/src/components/MediaItemCard.tsx`:

```tsx
import type { ReportItem } from "../types";

export function MediaItemCard({ item }: { item: ReportItem }) {
  return (
    <div className="media-item">
      <div className="media-item__logo" aria-hidden="true" />
      <div className="media-item__body">
        <a className="media-item__title" href={item.url} target="_blank" rel="noreferrer">
          {item.titulo}
        </a>
        <p className="media-item__meta">
          <em>
            {item.medio} {item.fecha}
          </em>
        </p>
        {item.autor && <p className="media-item__author">{item.autor}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/MediaItemCard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/MediaItemCard.tsx frontend/src/components/MediaItemCard.test.tsx
git commit -m "feat: add MediaItemCard component"
```

---

### Task 11: `CategorySection` component

**Files:**
- Create: `frontend/src/components/CategorySection.tsx`
- Test: `frontend/src/components/CategorySection.test.tsx`

**Interfaces:**
- Consumes: `CategoryGroup` (Task 8); `MediaItemCard` (Task 10).
- Produces: `CategorySection({ group: CategoryGroup })` — used by
  `ReportView.tsx` (Task 12).

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/CategorySection.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategorySection } from "./CategorySection";
import type { CategoryGroup } from "../types";

const group: CategoryGroup = {
  category: "Radio",
  items: [
    { medio: "RADIO BIO-BIO", titulo: "Nota 1", url: "https://a.cl", fecha: "2026-08-18", autor: "" },
    { medio: "RADIO BIO-BIO", titulo: "Nota 2", url: "https://b.cl", fecha: "2026-08-19", autor: "" },
  ],
};

describe("CategorySection", () => {
  it("renders the category title", () => {
    render(<CategorySection group={group} />);
    expect(screen.getByText("Radio")).toBeInTheDocument();
  });

  it("renders one card per item", () => {
    render(<CategorySection group={group} />);
    expect(screen.getByText("Nota 1")).toBeInTheDocument();
    expect(screen.getByText("Nota 2")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/CategorySection.test.tsx`
Expected: FAIL with "Cannot find module './CategorySection'".

- [ ] **Step 3: Implement**

`frontend/src/components/CategorySection.tsx`:

```tsx
import type { CategoryGroup } from "../types";
import { MediaItemCard } from "./MediaItemCard";

export function CategorySection({ group }: { group: CategoryGroup }) {
  return (
    <section className="category-section">
      <h2 className="category-section__title">{group.category}</h2>
      {group.items.map((item) => (
        <MediaItemCard key={item.url} item={item} />
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/CategorySection.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/CategorySection.tsx frontend/src/components/CategorySection.test.tsx
git commit -m "feat: add CategorySection component"
```

---

### Task 12: `ReportView` component

**Files:**
- Create: `frontend/src/components/ReportView.tsx`
- Test: `frontend/src/components/ReportView.test.tsx`

**Interfaces:**
- Consumes: `ReportResponse` (Task 8); `CategorySection` (Task 11).
- Produces: `ReportView({ report: ReportResponse })` — used by `App.tsx`
  (Task 14).

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/ReportView.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportView } from "./ReportView";
import type { ReportResponse } from "../types";

describe("ReportView", () => {
  it("shows the empty state when there are no categories", () => {
    const report: ReportResponse = { from: "2026-08-01", to: "2026-08-19", categories: [], errors: [] };
    render(<ReportView report={report} />);
    expect(
      screen.getByText("No se encontraron menciones de la UANDES en el período seleccionado.")
    ).toBeInTheDocument();
  });

  it("renders a section per category and no empty state when there are results", () => {
    const report: ReportResponse = {
      from: "2026-08-01",
      to: "2026-08-19",
      categories: [
        {
          category: "Radio",
          items: [{ medio: "RADIO BIO-BIO", titulo: "Nota 1", url: "https://a.cl", fecha: "2026-08-18", autor: "" }],
        },
      ],
      errors: [],
    };
    render(<ReportView report={report} />);
    expect(screen.getByText("Radio")).toBeInTheDocument();
    expect(screen.getByText("Nota 1")).toBeInTheDocument();
    expect(
      screen.queryByText("No se encontraron menciones de la UANDES en el período seleccionado.")
    ).not.toBeInTheDocument();
  });

  it("renders failed media as a collapsible detail", () => {
    const report: ReportResponse = {
      from: "2026-08-01",
      to: "2026-08-19",
      categories: [],
      errors: [{ medio: "CANAL 13", motivo: "no se pudo consultar el medio" }],
    };
    render(<ReportView report={report} />);
    expect(screen.getByText(/CANAL 13/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/ReportView.test.tsx`
Expected: FAIL with "Cannot find module './ReportView'".

- [ ] **Step 3: Implement**

`frontend/src/components/ReportView.tsx`:

```tsx
import type { ReportResponse } from "../types";
import { CategorySection } from "./CategorySection";

export function ReportView({ report }: { report: ReportResponse }) {
  return (
    <div className="report-view">
      <h1 className="report-view__title">UANDES EN LOS MEDIOS</h1>
      {report.categories.length === 0 && (
        <p className="report-view__empty">
          No se encontraron menciones de la UANDES en el período seleccionado.
        </p>
      )}
      {report.categories.map((group) => (
        <CategorySection key={group.category} group={group} />
      ))}
      {report.errors.length > 0 && (
        <details className="report-view__errors">
          <summary>Medios que no se pudieron consultar ({report.errors.length})</summary>
          <ul>
            {report.errors.map((error) => (
              <li key={error.medio}>
                {error.medio}: {error.motivo}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/ReportView.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ReportView.tsx frontend/src/components/ReportView.test.tsx
git commit -m "feat: add ReportView component"
```

---

### Task 13: `DateRangeForm` component

**Files:**
- Create: `frontend/src/components/DateRangeForm.tsx`
- Test: `frontend/src/components/DateRangeForm.test.tsx`

**Interfaces:**
- Consumes: nothing beyond React.
- Produces: `DateRangeForm({ onSubmit: (from: string, to: string) => void, isLoading: boolean })`
  — used by `App.tsx` (Task 14).

- [ ] **Step 1: Write the failing tests**

`frontend/src/components/DateRangeForm.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeForm } from "./DateRangeForm";

describe("DateRangeForm", () => {
  it("calls onSubmit with the selected dates", async () => {
    const onSubmit = vi.fn();
    render(<DateRangeForm onSubmit={onSubmit} isLoading={false} />);

    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(onSubmit).toHaveBeenCalledWith("2026-08-01", "2026-08-19");
  });

  it("disables the submit button while loading", () => {
    render(<DateRangeForm onSubmit={vi.fn()} isLoading={true} />);
    expect(screen.getByRole("button", { name: "Generando..." })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/DateRangeForm.test.tsx`
Expected: FAIL with "Cannot find module './DateRangeForm'" (also install
`@testing-library/user-event` if missing: `npm install -D @testing-library/user-event`).

- [ ] **Step 3: Implement**

`frontend/src/components/DateRangeForm.tsx`:

```tsx
import { useState } from "react";

export function DateRangeForm({
  onSubmit,
  isLoading,
}: {
  onSubmit: (from: string, to: string) => void;
  isLoading: boolean;
}) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(from, to);
      }}
    >
      <label htmlFor="from-date">
        Desde
        <input
          id="from-date"
          type="date"
          value={from}
          onChange={(event) => setFrom(event.target.value)}
          required
        />
      </label>
      <label htmlFor="to-date">
        Hasta
        <input
          id="to-date"
          type="date"
          value={to}
          onChange={(event) => setTo(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isLoading}>
        {isLoading ? "Generando..." : "Generar informe"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/components/DateRangeForm.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/DateRangeForm.tsx frontend/src/components/DateRangeForm.test.tsx
git commit -m "feat: add DateRangeForm component"
```

---

### Task 14: Wire `App.tsx`

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchReport` (Task 9), `DateRangeForm` (Task 13), `ReportView`
  (Task 12).
- Produces: the finished `App` component — the frontend's entry point,
  rendered by `main.tsx` (Task 8).

- [ ] **Step 1: Write the failing tests**

Replace `frontend/src/App.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import * as api from "./api";
import type { ReportResponse } from "./types";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the date range form", () => {
    render(<App />);
    expect(screen.getByText("Generar informe")).toBeInTheDocument();
  });

  it("renders the report after a successful submit", async () => {
    const report: ReportResponse = {
      from: "2026-08-01",
      to: "2026-08-19",
      categories: [
        {
          category: "Radio",
          items: [{ medio: "RADIO BIO-BIO", titulo: "Nota 1", url: "https://a.cl", fecha: "2026-08-18", autor: "" }],
        },
      ],
      errors: [],
    };
    vi.spyOn(api, "fetchReport").mockResolvedValue(report);

    render(<App />);
    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(await screen.findByText("Nota 1")).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(api, "fetchReport").mockRejectedValue(new Error("Error al generar el informe (500)"));

    render(<App />);
    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error al generar el informe (500)");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: FAIL — the current placeholder `App` has no date inputs or report
rendering.

- [ ] **Step 3: Implement**

Replace `frontend/src/App.tsx` with:

```tsx
import { useState } from "react";
import { DateRangeForm } from "./components/DateRangeForm";
import { ReportView } from "./components/ReportView";
import { fetchReport } from "./api";
import type { ReportResponse } from "./types";
import "./styles.css";

export function App() {
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(from: string, to: string) {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchReport(from, to);
      setReport(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <main>
      <DateRangeForm onSubmit={handleSubmit} isLoading={isLoading} />
      {error && <p role="alert">{error}</p>}
      {report && <ReportView report={report} />}
    </main>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && npx vitest run src/App.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Run the whole frontend test suite**

Run: `cd frontend && npm test`
Expected: PASS (all tests from Tasks 8–14).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat: wire date range form, api client and report view in App"
```

---

### Task 15: Root README with setup and run instructions

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by other tasks — this is the last task.

- [ ] **Step 1: Write the README**

`README.md`:

```markdown
# Informe de Prensa UANDES

App local para generar el informe de apariciones de la UANDES en medios
chilenos, dado un rango de fechas. Ver el diseño completo en
`docs/superpowers/specs/2026-08-19-informe-prensa-uandes-design.md`.

## Requisitos

- Node >=18

## Backend

```bash
cd backend
npm install
cp .env.example .env   # opcional: agrega GOOGLE_CSE_API_KEY y GOOGLE_CSE_CX
npm run dev             # http://localhost:3001
```

Sin `GOOGLE_CSE_API_KEY`/`GOOGLE_CSE_CX`, el backend sigue funcionando pero
solo con descubrimiento vía sitemap/RSS (sin Google Custom Search).

Editar `backend/src/config/media.json` para agregar o corregir medios a
revisar.

## Frontend

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Con el backend corriendo en el puerto 3001, abrir el frontend, elegir un
rango de fechas y presionar "Generar informe".

## Tests

```bash
cd backend && npm test
cd frontend && npm test
```
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup and run instructions"
```

---

## Self-Review Notes

- **Spec coverage:** sitemap/RSS discovery (Task 4), Google CSE discovery
  with graceful degradation when credentials are missing (Task 5), dedupe +
  verification + extraction (Task 6), per-medium error isolation (Task 6),
  fixed category order (Task 6, 12), `media.json` config (Task 1),
  date-range UI (Task 13), on-screen-only report matching the visual
  hierarchy of `Informe.html` (Tasks 10–12), local-only run instructions
  (Task 15) — all covered.
- **Type consistency:** `DiscoveredUrl`, `MediaConfig`, `ReportItem`,
  `ReportError`, `CategoryGroup`, `ReportResponse` are defined once in
  `backend/src/types.ts` (Task 1) and reused verbatim by every later backend
  task; the frontend's `frontend/src/types.ts` (Task 8) mirrors the same
  field names so `ReportView`/`CategorySection`/`MediaItemCard` line up with
  what `api.ts` returns.
- **Scope check:** single subsystem (one report-generation flow), sized for
  one plan — not split further.

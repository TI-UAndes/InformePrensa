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

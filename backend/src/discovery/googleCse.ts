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

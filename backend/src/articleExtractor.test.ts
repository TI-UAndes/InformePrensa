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

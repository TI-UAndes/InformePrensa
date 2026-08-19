# Informe de Prensa UANDES — Diseño

**Fecha:** 2026-08-19
**Estado:** Aprobado para plan de implementación

## Contexto y objetivo

Hoy la UANDES recibe un boletín de clipping ("Conecta Media") con las apariciones
de la universidad en medios chilenos, agrupadas por categoría (Sitio Web,
Televisión, Prensa Escrita, Radio). El HTML de referencia es
[`Informe.html`](../../../Informe.html).

Se construirá una aplicación local (uso personal, un solo usuario, corre en el
equipo del usuario) que, dado un rango de fechas, busque en un conjunto
configurable de medios chilenos menciones de "Universidad de los Andes" /
"UANDES", y muestre el resultado en pantalla replicando el estilo visual del
informe original.

**Hallazgo clave del análisis del HTML de referencia:** los links del informe
apuntan al visor interno de Conecta Media (`map.conectamedia.cl/.../clippingNews/view?id=...`),
no a la nota original. No se puede depender de esos links; hay que ubicar cada
nota de forma independiente en el sitio del medio.

## Fuera de alcance (por ahora)

- Exportar a PDF/HTML descargable o enviar por correo — solo vista en pantalla.
- Multiusuario, autenticación, despliegue en servidor — solo `localhost`.
- Cobertura de "todos los medios existentes" — solo los medios listados en
  `media.json` (ver más abajo), extensible a mano.
- Desambiguación de "Universidad de los Andes" de Colombia/Venezuela — no
  aplica porque `media.json` solo contiene dominios chilenos.

## Arquitectura

Dos proyectos separados en el mismo repo, cada uno con su propio proceso de
desarrollo (elección explícita del usuario sobre Next.js: prefiere Vite +
Express separados):

```
InformePrensa/
  Informe.html                 # referencia visual existente
  frontend/                    # Vite + React
  backend/                     # Express (Node)
  docs/superpowers/specs/...
```

Un React puro no puede hacer el scraping de RSS/sitemaps ni de páginas de
artículo de terceros por CORS, de ahí la necesidad del backend Express: el
frontend solo llama a `GET /api/report` en `localhost`.

## Backend (Express)

### Config: `backend/src/config/media.json`

Lista editable a mano de medios a revisar, semilla con los 7 medios que
aparecen en `Informe.html`:

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

`category` debe ser uno de los 4 valores fijos: `Sitio Web`, `Televisión`,
`Prensa Escrita`, `Radio` (mismo orden y nombres que el informe original).
Los dominios reales deben confirmarse/ajustarse durante la implementación
(los de arriba son la mejor inferencia a partir del nombre del medio, no
vinieron en el HTML).

### Pipeline de descubrimiento (`GET /api/report?from=YYYY-MM-DD&to=YYYY-MM-DD`)

Por cada medio en `media.json`, en paralelo:

1. **Sitemap/RSS (gratis, primera fuente):** probar rutas conocidas
   (`/sitemap.xml`, `/sitemap_index.xml`, `/feed`, `/rss`) y quedarse con las
   entradas cuya fecha cae dentro de `[from, to]`.
2. **Google Custom Search API (complementaria):** consultar
   `site:{domain} ("Universidad de los Andes" OR UANDES)` acotado por fecha.
   Requiere `GOOGLE_CSE_API_KEY` y `GOOGLE_CSE_CX` en `backend/.env`; si no
   están configuradas, este paso se omite (se loguea un aviso) y el pipeline
   sigue solo con sitemap/RSS. La sintaxis exacta del parámetro de rango de
   fecha (`sort=date:r:YYYYMMDD:YYYYMMDD` o equivalente vigente) se debe
   verificar contra la documentación de Google al implementar.
3. **Dedupe:** unir resultados de (1) y (2) por URL normalizada.
4. **Verificación + extracción:** descargar cada URL candidata con `cheerio`,
   confirmar que el texto visible (título + cuerpo) contiene
   `/universidad de los andes|uandes/i` con límites de palabra (para evitar
   falsos positivos como "Universidad de Chile"), y extraer:
   - `titulo`: `<title>` u `og:title`.
   - `fecha`: JSON-LD `datePublished` → meta `article:published_time` → fecha
     de descubrimiento (sitemap `lastmod` / fecha del snippet CSE) como
     último fallback.
   - `autor`: JSON-LD `author.name` → meta `author`/`article:author` → vacío
     si no se encuentra (se muestra en blanco en el informe, sin inventar).
5. Cualquier medio cuyo sitemap/RSS falle o cuya página de artículo no cargue
   se omite en silencio para ese medio puntual — no debe tumbar el informe
   completo. Se acumula en una lista `errors` que el frontend puede mostrar
   como detalle no bloqueante.

### Forma de la respuesta

```json
{
  "from": "2026-08-01",
  "to": "2026-08-19",
  "categories": [
    {
      "category": "Sitio Web",
      "items": [
        { "medio": "AGRICULTURA ONLINE", "titulo": "...", "url": "...", "fecha": "2026-08-18", "autor": "Carolina Pye" }
      ]
    }
  ],
  "errors": [ { "medio": "CANAL 13", "motivo": "sitemap no disponible" } ]
}
```

Categorías vacías (sin items) no se incluyen en la respuesta.

## Frontend (Vite + React)

- **Selector de fechas:** dos inputs de fecha (`from`, `to`) + botón
  "Generar informe".
- **Estado de carga:** spinner mientras se resuelve `GET /api/report`.
- **`ReportView`:** encabezado "UANDES EN LOS MEDIOS", luego una sección por
  categoría presente (orden fijo: Sitio Web, Televisión, Prensa Escrita,
  Radio), cada una con su barra de título de categoría y la lista de
  `MediaItemCard`.
- **`MediaItemCard`:** logo circular (placeholder genérico si no hay logo),
  título en negrita, línea "*{medio} {fecha}*" en cursiva, autor debajo —
  replicando la jerarquía visual de `Informe.html` (colores `#063c4a` para
  barras de categoría, filas alternadas `#f3f4f5`/blanco) con CSS de
  componentes, no con tablas de email.
- **Estado vacío:** "No se encontraron menciones de la UANDES en el período
  seleccionado."
- **Errores no bloqueantes:** detalle colapsable con los medios que fallaron
  (de `errors`).

## Testing

- **`matcher`:** casos con coincidencia (mayúsculas/minúsculas, "UANDES"
  suelto) y casos que NO deben matchear (p. ej. "Universidad de Chile").
- **`articleExtractor`:** fixtures HTML con JSON-LD, con solo meta tags, y sin
  ninguno (verifica el fallback a autor vacío).
- **`sitemapRss` / `googleCse`:** HTTP mockeado (sin red real en tests),
  verifican parseo de XML/JSON de ejemplo y filtro por rango de fecha.
- **`GET /api/report`:** test de integración con discovery/extracción
  mockeados, verifica agrupamiento por categoría y que categorías vacías no
  aparezcan.
- **Frontend:** test de `ReportView` con un payload fijo (caso poblado y caso
  vacío).
- No se requiere e2e de navegador en esta etapa.

## Supuestos y pendientes explícitos

- El usuario debe obtener sus propias credenciales de Google Custom Search
  (`GOOGLE_CSE_API_KEY`, `GOOGLE_CSE_CX`) y colocarlas en `backend/.env`; sin
  ellas la app funciona solo con sitemap/RSS.
- Los dominios reales en `media.json` son una primera inferencia y deben
  confirmarse/corregirse durante la implementación.
- `media.json` es un punto de partida (7 medios); se espera que el usuario lo
  amplíe con el tiempo.

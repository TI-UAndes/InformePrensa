# Informe de Prensa UANDES

App local que genera el informe de apariciones de la Universidad de los Andes
(UANDES) en medios chilenos, para un rango de fechas dado. Reemplaza —a menor
escala— el clipping manual que hoy llega por correo (ver
[`Informe.html`](Informe.html), el ejemplo real usado como referencia de
formato).

Dado un rango `[from, to]`, la app busca en un conjunto configurable de
medios, verifica que la nota realmente mencione "Universidad de los Andes" /
"UANDES", extrae título, fecha y autor, y muestra el resultado agrupado por
categoría (Sitio Web, Televisión, Prensa Escrita, Radio) — con la misma
jerarquía visual del clipping original, en la paleta oficial roja de la
UANDES.

## Quick start

Requisitos: **Node >= 20** (lo exigen `vite@8`, `cheerio@1.2` y `vitest@4`).

```bash
# Backend — terminal 1
cd backend
npm install
cp .env.example .env   # opcional, ver "Configuración" más abajo
npm run dev             # http://localhost:3001

# Frontend — terminal 2
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Con ambos corriendo, abre `http://localhost:5173`, elige un rango de fechas
y presiona **Generar informe**.

Sin `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_CX` configuradas, el backend funciona
igual, solo que descubre notas únicamente vía sitemap/RSS (sin la búsqueda
complementaria de Google).

## Cómo funciona

Por cada medio en `backend/src/config/media.json`, el backend:

1. **Descubre candidatos** en paralelo por dos vías independientes:
   - **Sitemap/RSS** (`backend/src/discovery/sitemapRss.ts`): prueba
     `/sitemap.xml`, `/sitemap_index.xml`, `/feed`, `/rss` en ese orden; si
     encuentra un `<sitemapindex>`, sigue un nivel de sitemaps anidados; si
     ninguna ruta conocida responde, cae a leer las líneas `Sitemap:` del
     `robots.txt` del sitio. Descarta cualquier respuesta que no sea XML real
     (un "soft 200" que devuelve HTML disfrazado de sitemap se detecta y se
     ignora).
   - **Google Custom Search** (`backend/src/discovery/googleCse.ts`):
     `site:{dominio} ("Universidad de los Andes" OR UANDES)` acotado por
     fecha — se omite en silencio (con un aviso en consola) si no hay
     credenciales configuradas.
2. **Dedupea** las URL candidatas de ambas fuentes (por medio, y de nuevo de
   forma global entre medios que comparten dominio) y **limita a 30
   candidatos por medio** (`MAX_CANDIDATES_PER_MEDIUM` en `report.ts`) para
   no descargar cientos de notas de un sitemap grande.
3. **Descarga y verifica cada candidata** (`backend/src/articleExtractor.ts`):
   confirma que el texto visible contiene "Universidad de los Andes" o
   "UANDES" como palabra completa (`backend/src/matcher.ts`), y extrae
   título, fecha y autor priorizando JSON-LD → metaetiquetas Open Graph →
   la fecha de descubrimiento como último recurso.
4. **Vuelve a filtrar por fecha** contra `[from, to]` usando la fecha real
   extraída de la nota (no solo la del sitemap, que puede ser una edición
   posterior a la publicación original).
5. **Aísla fallas por medio**: si un medio falla al descubrir notas, se
   registra en `errors` y el resto del informe sigue generándose. Si una
   URL puntual falla al descargarse, se omite en silencio sin afectar al
   resto de ese mismo medio.

El resultado se agrupa en categorías en el orden fijo `Sitio Web →
Televisión → Prensa Escrita → Radio` (`report.ts`), omitiendo categorías sin
resultados, y se sirve por `GET /api/report?from=&to=` (`backend/src/app.ts`).
El frontend (`frontend/src/App.tsx`) llama a ese endpoint y renderiza el
resultado con `ReportView` → `CategorySection` → `MediaItemCard`.

## Estructura del proyecto

```
backend/src/
  types.ts                    # Contrato compartido: MediaConfig, ReportItem, ReportResponse…
  matcher.ts                  # ¿el texto menciona "Universidad de los Andes" / "UANDES"?
  articleExtractor.ts         # HTML de una nota → { titulo, fecha, autor, matched }
  discovery/
    sitemapRss.ts             # Sitemap → sitemapindex → robots.txt → candidatas
    googleCse.ts               # Búsqueda complementaria vía Google Custom Search
  report.ts                    # Orquesta: descubre, dedupea, verifica, agrupa por categoría
  app.ts / server.ts           # Express: GET /health, GET /api/report, wiring de dependencias
  config/media.json            # Lista de medios a revisar (dominio, nombre, categoría)

frontend/src/
  api.ts                        # Cliente HTTP hacia GET /api/report
  types.ts                      # Espejo de los tipos del backend
  components/
    DateRangeForm.tsx           # Selector de fechas + botón "Generar informe"
    ReportView.tsx               # Contenedor del informe, estado vacío, medios con error
    CategorySection.tsx          # Una categoría + contador de menciones
    MediaItemCard.tsx            # Una nota: título enlazado, medio + fecha, autor
  App.tsx                        # Layout general (navbar UANDES, tarjetas) y estado de carga/error
  styles.css                     # Paleta e identidad visual oficial UANDES
```

## Configuración

**`backend/src/config/media.json`** — único lugar donde se decide qué
medios se revisan. Cada entrada es `{ domain, name, category }`, con
`category` restringido a `"Sitio Web" | "Televisión" | "Prensa Escrita" |
"Radio"`. Agregar un medio nuevo no requiere tocar código.

**`backend/.env`** (opcional, ver `.env.example`):

| Variable              | Efecto si falta                                             |
| ---------------------- | ------------------------------------------------------------ |
| `GOOGLE_CSE_API_KEY`   | Se omite la búsqueda por Google CSE (solo sitemap/RSS)        |
| `GOOGLE_CSE_CX`        | Igual que arriba                                              |
| `PORT`                 | Usa `3001` por defecto                                        |

## Tests

```bash
cd backend && npm test    # 34 tests — matcher, extractor, discovery, orquestación, ruta HTTP
cd frontend && npm test   # 16 tests — cliente API y cada componente
```

Ambas suites usan Vitest con dependencias inyectadas (nunca golpean la red
real ni un backend real) — ver `ReportDeps` en `report.ts` como el punto de
inyección del lado del backend.

## Limitaciones conocidas

Detectadas en la revisión final del desarrollo y aceptadas conscientemente
por ahora (no bloquean el uso, pero conviene tenerlas presentes):

- **Fechas en el borde del rango**: la normalización de fecha usa UTC, así
  que una nota publicada tarde en el día (hora de Chile) puede quedar
  excluida si cae justo en el límite superior del rango pedido.
- **El tope de 30 candidatos por medio** se aplica primero a los resultados
  de sitemap y después a los de Google CSE — un medio con muchas notas en
  rango puede llenar el cupo antes de llegar a los resultados de Google
  (que ya vienen filtrados por relevancia).
- **Sitios con protección anti-bot** (ej. The Clinic, Ex Ante) rechazan la
  solicitud automatizada — no están cubiertos por el pipeline actual, que
  hace peticiones HTTP simples, no renderiza con un navegador real.
- El presupuesto de peticiones por medio puede llegar a ~43 en el peor caso
  (sitemap + sitemaps anidados + robots.txt + sitemaps del robots.txt), sin
  un límite de tiempo global sobre `GET /api/report` — cada petición
  individual sí tiene timeout (10s).

## Roadmap

- **Diseño original**: [`docs/superpowers/specs/2026-08-19-informe-prensa-uandes-design.md`](docs/superpowers/specs/2026-08-19-informe-prensa-uandes-design.md)
  y el [plan de implementación](docs/superpowers/plans/2026-08-19-informe-prensa-uandes-plan.md)
  que se ejecutó para construir esta primera versión (7 medios).
- **Propuesta de ampliación**: `docs/propuestas/2026-09-16-ampliacion-informe-uandes.html`
  en la rama `main` (no en esta rama) — evalúa llevar la cobertura de 7 a
  ~45 medios (TV, radio, prensa escrita), con evidencia real de
  factibilidad y los datos externos pendientes (listado de planta docente,
  universidades competidoras) para replicar las tres secciones del informe
  mensual real de referencia.

## Cómo extender

- **Agregar/corregir un medio**: editar `backend/src/config/media.json`.
  Ningún otro archivo necesita cambios.
- **Ajustar los límites de descubrimiento** (timeout, candidatos por medio,
  sitemaps anidados a seguir): son constantes al inicio de
  `backend/src/discovery/sitemapRss.ts` y `backend/src/report.ts`
  (`FETCH_TIMEOUT_MS`, `MAX_NESTED_SITEMAPS`, `MAX_ROBOTS_SITEMAPS`,
  `MAX_CANDIDATES_PER_MEDIUM`).
- **Nueva fuente de descubrimiento**: implementar la misma forma
  `(domain, from, to) => Promise<DiscoveredUrl[]>` y sumarla a
  `ReportDeps` en `report.ts` — el resto del pipeline (dedupe, verificación,
  agrupación) no necesita saber de dónde vino cada URL candidata.

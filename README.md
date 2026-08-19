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

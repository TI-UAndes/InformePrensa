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

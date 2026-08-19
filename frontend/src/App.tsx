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

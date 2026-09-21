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
    <>
      <header className="app-navbar">
        <span className="app-navbar__brand">UANDES</span>
        <span className="app-navbar__title">Informe de Prensa</span>
      </header>
      <main className="app-main">
        <div className="app-card">
          <div className="app-card__header">
            <h1>Período del informe</h1>
          </div>
          <div className="app-card__body">
            <DateRangeForm onSubmit={handleSubmit} isLoading={isLoading} />
            {error && (
              <p className="app-alert" role="alert">
                {error}
              </p>
            )}
          </div>
        </div>
        {report && <ReportView report={report} />}
      </main>
    </>
  );
}

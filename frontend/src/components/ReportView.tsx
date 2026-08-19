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

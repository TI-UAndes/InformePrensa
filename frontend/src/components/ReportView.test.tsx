import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportView } from "./ReportView";
import type { ReportResponse } from "../types";

describe("ReportView", () => {
  it("shows the empty state when there are no categories", () => {
    const report: ReportResponse = { from: "2026-08-01", to: "2026-08-19", categories: [], errors: [] };
    render(<ReportView report={report} />);
    expect(
      screen.getByText("No se encontraron menciones de la UANDES en el período seleccionado.")
    ).toBeInTheDocument();
  });

  it("renders a section per category and no empty state when there are results", () => {
    const report: ReportResponse = {
      from: "2026-08-01",
      to: "2026-08-19",
      categories: [
        {
          category: "Radio",
          items: [{ medio: "RADIO BIO-BIO", titulo: "Nota 1", url: "https://a.cl", fecha: "2026-08-18", autor: "" }],
        },
      ],
      errors: [],
    };
    render(<ReportView report={report} />);
    expect(screen.getByText("Radio")).toBeInTheDocument();
    expect(screen.getByText("Nota 1")).toBeInTheDocument();
    expect(
      screen.queryByText("No se encontraron menciones de la UANDES en el período seleccionado.")
    ).not.toBeInTheDocument();
  });

  it("renders failed media as a collapsible detail", () => {
    const report: ReportResponse = {
      from: "2026-08-01",
      to: "2026-08-19",
      categories: [],
      errors: [{ medio: "CANAL 13", motivo: "no se pudo consultar el medio" }],
    };
    render(<ReportView report={report} />);
    expect(screen.getByText(/CANAL 13/)).toBeInTheDocument();
  });
});

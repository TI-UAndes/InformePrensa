import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import * as api from "./api";
import type { ReportResponse } from "./types";

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("App", () => {
  it("renders the date range form", () => {
    render(<App />);
    expect(screen.getByText("Generar informe")).toBeInTheDocument();
  });

  it("renders the report after a successful submit", async () => {
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
    vi.spyOn(api, "fetchReport").mockResolvedValue(report);

    render(<App />);
    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(await screen.findByText("Nota 1")).toBeInTheDocument();
  });

  it("shows an error message when the request fails", async () => {
    vi.spyOn(api, "fetchReport").mockRejectedValue(new Error("Error al generar el informe (500)"));

    render(<App />);
    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error al generar el informe (500)");
  });
});

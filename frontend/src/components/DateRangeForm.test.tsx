import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DateRangeForm } from "./DateRangeForm";

describe("DateRangeForm", () => {
  it("calls onSubmit with the selected dates", async () => {
    const onSubmit = vi.fn();
    render(<DateRangeForm onSubmit={onSubmit} isLoading={false} />);

    await userEvent.type(screen.getByLabelText("Desde"), "2026-08-01");
    await userEvent.type(screen.getByLabelText("Hasta"), "2026-08-19");
    await userEvent.click(screen.getByRole("button", { name: "Generar informe" }));

    expect(onSubmit).toHaveBeenCalledWith("2026-08-01", "2026-08-19");
  });

  it("disables the submit button while loading", () => {
    render(<DateRangeForm onSubmit={vi.fn()} isLoading={true} />);
    expect(screen.getByRole("button", { name: "Generando..." })).toBeDisabled();
  });
});

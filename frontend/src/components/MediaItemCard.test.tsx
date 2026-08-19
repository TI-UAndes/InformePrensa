import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MediaItemCard } from "./MediaItemCard";
import type { ReportItem } from "../types";

const item: ReportItem = {
  medio: "LA TERCERA",
  titulo: "Matías Acevedo: reforma al empleo público",
  url: "https://latercera.com/nota",
  fecha: "2026-08-19",
  autor: "Matías Acevedo",
};

describe("MediaItemCard", () => {
  it("renders the title as a link to the source", () => {
    render(<MediaItemCard item={item} />);
    const link = screen.getByRole("link", { name: item.titulo });
    expect(link).toHaveAttribute("href", item.url);
  });

  it("renders the medium name and date", () => {
    render(<MediaItemCard item={item} />);
    expect(screen.getByText(`${item.medio} ${item.fecha}`)).toBeInTheDocument();
  });

  it("renders the author when present", () => {
    render(<MediaItemCard item={item} />);
    expect(screen.getByText("Matías Acevedo")).toBeInTheDocument();
  });

  it("does not render an author line when the author is empty", () => {
    render(<MediaItemCard item={{ ...item, autor: "" }} />);
    expect(screen.queryByText("Matías Acevedo")).not.toBeInTheDocument();
  });
});

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CategorySection } from "./CategorySection";
import type { CategoryGroup } from "../types";

const group: CategoryGroup = {
  category: "Radio",
  items: [
    { medio: "RADIO BIO-BIO", titulo: "Nota 1", url: "https://a.cl", fecha: "2026-08-18", autor: "" },
    { medio: "RADIO BIO-BIO", titulo: "Nota 2", url: "https://b.cl", fecha: "2026-08-19", autor: "" },
  ],
};

describe("CategorySection", () => {
  it("renders the category title", () => {
    render(<CategorySection group={group} />);
    expect(screen.getByText("Radio")).toBeInTheDocument();
  });

  it("renders one card per item", () => {
    render(<CategorySection group={group} />);
    expect(screen.getByText("Nota 1")).toBeInTheDocument();
    expect(screen.getByText("Nota 2")).toBeInTheDocument();
  });
});

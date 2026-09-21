import { describe, expect, it } from "vitest";
import { containsUandesMention } from "./matcher.js";

describe("containsUandesMention", () => {
  it("matches the full university name", () => {
    expect(containsUandesMention("La Universidad de los Andes anunció...")).toBe(true);
  });

  it("matches the acronym UANDES case-insensitively", () => {
    expect(containsUandesMention("uandes lanza nuevo programa")).toBe(true);
  });

  it("matches with mixed case in the full name", () => {
    expect(containsUandesMention("universidad de LOS ANDES informó")).toBe(true);
  });

  it("does not match a different university", () => {
    expect(containsUandesMention("La Universidad de Chile anunció...")).toBe(false);
  });

  it("does not match uandes as part of a longer word", () => {
    expect(containsUandesMention("Perteneció a un club llamado clubuandes")).toBe(false);
  });

  it("does not match unrelated text", () => {
    expect(containsUandesMention("Sin mención relevante")).toBe(false);
  });
});

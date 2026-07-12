import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  getExternalEntityKey,
  getExternalEventAliases,
} from "@/lib/external-event-candidates";

describe("external event entity aliases", () => {
  it("connects Mega and mechanic variants to the underlying Pokemon", () => {
    expect(getExternalEventAliases("pokemon", "Mega Gengar ex")).toEqual(
      expect.arrayContaining(["Mega Gengar", "Gengar"])
    );
    expect(getExternalEntityKey("pokemon", "Gengar VMAX")).toBe("pokemon:gengar");
    expect(getExternalEntityKey("pokemon", "Mega Gengar ex")).toBe("pokemon:gengar");
  });

  it("splits tag-team names so a reveal can reach either character", () => {
    expect(getExternalEventAliases("pokemon", "Gengar & Mimikyu-GX")).toEqual(
      expect.arrayContaining(["Gengar", "Mimikyu"])
    );
  });

  it("removes only display versions from One Piece names", () => {
    expect(getExternalEventAliases("one-piece", "Nami (V.1)")).toContain("Nami");
    expect(getExternalEntityKey("one-piece", "Nami (V.1)")).toBe("one-piece:nami");
  });
});

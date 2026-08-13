import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ db: {} }));

import {
  buildUniqueSealedProductNameIndex,
  normalizeSealedReleaseProductName,
} from "@/lib/sealed-release-matching";

const episode = { id: "226", name: "Pokémon Products", code: "PROD" };

describe("sealed release matching", () => {
  it("matches official Pokémon TCG punctuation to the catalog product name", () => {
    expect(
      normalizeSealedReleaseProductName(
        "Pokémon TCG: First Partner Illustration Collection—Series 3"
      )
    ).toBe(normalizeSealedReleaseProductName("First Partner Illustration Collection Series 3"));
  });

  it("does not auto-match an ambiguous normalized product name", () => {
    const index = buildUniqueSealedProductNameIndex([
      { id: "one", name: "Pokémon TCG: Example Box", episode },
      { id: "two", name: "Example Box", episode },
      { id: "three", name: "Unique Box", episode },
    ]);

    expect(index.has("example box")).toBe(false);
    expect(index.get("unique box")?.id).toBe("three");
  });
});

import { describe, expect, it } from "vitest";

import { buildTcgdexCardIdAliases } from "@/lib/tcgdex";

describe("buildTcgdexCardIdAliases", () => {
  it("maps Shining Fates main-set ids to the swsh45 alias", () => {
    expect(buildTcgdexCardIdAliases("swsh4.5-073")).toContain("swsh45-73");
  });

  it("does not let other Sword & Shield half sets claim Shining Fates aliases", () => {
    expect(buildTcgdexCardIdAliases("swsh10.5-073")).not.toContain("swsh45-73");
  });

  it("keeps Shining Fates shiny vault aliases scoped to Shining Fates", () => {
    expect(buildTcgdexCardIdAliases("swsh4.5-SV001")).toContain("swsh45sv-sv001");
    expect(buildTcgdexCardIdAliases("swsh10.5-SV001")).not.toContain("swsh45sv-sv001");
  });
});

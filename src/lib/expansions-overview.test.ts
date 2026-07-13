import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  getExpansionCurrentValues,
  getExpansionsOverviewHistory,
} from "@/lib/expansions-overview";

describe("expansion overview current totals", () => {
  beforeEach(() => {
    dbMock.$queryRawUnsafe.mockReset();
  });

  it("selects the newest usable English Near Mint quote per card", async () => {
    dbMock.$queryRawUnsafe.mockResolvedValue([
      { episode_id: "episode-en-nm-filter", total_market: 300, priced_cards: 1 },
    ]);

    const result = await getExpansionCurrentValues(["episode-en-nm-filter"]);
    const sql = String(dbMock.$queryRawUnsafe.mock.calls[0]?.[0] ?? "");

    expect(result).toEqual([
      { episode_id: "episode-en-nm-filter", total_market: 300, priced_cards: 1 },
    ]);
    expect(sql).toContain("p2.cm_en_lowest_nm > 0");
    expect(sql).toContain("p2.cm_en_lowest_nm <> 9001");
    expect(sql).toContain("ORDER BY p2.fetched_at DESC, p2.id DESC");
  });

  it("filters invalid English snapshots before ranking daily history rows", async () => {
    dbMock.$queryRawUnsafe.mockResolvedValue([]);

    await getExpansionsOverviewHistory(["episode-history-en-nm-filter"]);
    const sql = String(dbMock.$queryRawUnsafe.mock.calls[0]?.[0] ?? "");

    expect(sql.match(/p\.cm_en_lowest_nm > 0/g)).toHaveLength(2);
    expect(sql.match(/p\.cm_en_lowest_nm <> 9001/g)).toHaveLength(2);
    expect(sql).not.toContain("cm_de_lowest_nm");
    expect(sql).not.toContain("tcp_market");
  });
});

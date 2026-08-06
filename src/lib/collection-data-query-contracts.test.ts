import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    $queryRaw: vi.fn(),
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({ db: dbMock }));

import {
  ACTIVE_CATEGORY_OWNERSHIP_FILTER,
  getCategoryPriceSnapshots,
} from "@/lib/card-categories";
import {
  ACTIVE_COLLECTION_CARD_FILTER,
  buildCollectionCardSaleStateWhere,
  getCardHistoryRows,
  getCollectionValueDriversData,
} from "@/lib/collection-data";

function taggedSql(call: unknown[] | undefined): string {
  const strings = call?.[0] as TemplateStringsArray | undefined;
  return strings ? Array.from(strings).join("?") : "";
}

describe("collection query contracts", () => {
  beforeEach(() => {
    dbMock.$queryRaw.mockReset();
    dbMock.$queryRawUnsafe.mockReset();
  });

  it("defines active ownership as unsold and not for sale", () => {
    expect(ACTIVE_COLLECTION_CARD_FILTER).toEqual({ for_sale: false, sold_at: null });
    expect(ACTIVE_CATEGORY_OWNERSHIP_FILTER).toEqual({ for_sale: false, sold_at: null });
  });

  it("builds all-card value drivers from usable English NM rows only", async () => {
    dbMock.$queryRaw
      .mockResolvedValueOnce([{ date: "2026-07-13" }, { date: "2026-07-06" }])
      .mockResolvedValueOnce([]);

    const result = await getCollectionValueDriversData("user-query-contract", "all", "pokemon");
    const datesSql = taggedSql(dbMock.$queryRaw.mock.calls[0]);
    const valuesSql = taggedSql(dbMock.$queryRaw.mock.calls[1]);

    expect(result.gains).toEqual([]);
    expect(result.drops).toEqual([]);
    expect(datesSql).toContain("p.cm_en_lowest_nm > 0");
    expect(datesSql).toContain("p.cm_en_lowest_nm <> 9001");
    expect(valuesSql.match(/cm_en_lowest_nm > 0/g)).toHaveLength(3);
    expect(valuesSql.match(/cm_en_lowest_nm <> 9001/g)).toHaveLength(3);
    expect(valuesSql).not.toContain("cm_de_lowest_nm");
    expect(valuesSql).not.toContain("current_fallback_prices");
    expect(valuesSql).not.toContain("previous_fallback_prices");
  });

  it("filters invalid English rows before ranking category and collection history", async () => {
    dbMock.$queryRawUnsafe.mockResolvedValue([]);

    await getCategoryPriceSnapshots(["category-card"], "2026-07-01T00:00:00.000Z");
    await getCardHistoryRows(["collection-card"], "2026-07-01T00:00:00.000Z");

    const categorySql = String(dbMock.$queryRawUnsafe.mock.calls[0]?.[0] ?? "");
    const collectionSql = String(dbMock.$queryRawUnsafe.mock.calls[1]?.[0] ?? "");
    for (const sql of [categorySql, collectionSql]) {
      expect(sql).toContain("p.cm_en_lowest_nm > 0");
      expect(sql).toContain("p.cm_en_lowest_nm <> 9001");
      expect(sql).toMatch(/FROM "Price" p[\s\S]*WHERE p\.card_id IN[\s\S]*p\.cm_en_lowest_nm > 0/);
    }
  });

  it("keeps active sale inventory and completed transactions mutually exclusive", () => {
    expect(buildCollectionCardSaleStateWhere({ forSale: true })).toEqual({
      for_sale: true,
      sold_at: null,
    });
    expect(buildCollectionCardSaleStateWhere({ forSale: true, sold: true })).toEqual({
      sold_at: { not: null },
    });
  });
});

import { db } from "@/lib/db";
import { normalizeCollectionInspection, type CollectionCatalogQuote } from "@/lib/marktplaats-collections";
import MarktplaatsCollectionsPanel from "@/components/MarktplaatsCollectionsPanel";

export default async function MarktplaatsCollectionsPanelServer() {
  const rows = await db.marktplaatsCollectionInspection.findMany({
    where: { removed_at: null }, orderBy: { observed_at: "desc" }, take: 50,
  });
  const inspections = rows.flatMap((row) => {
    try {
      return [{ ...normalizeCollectionInspection(JSON.parse(row.report_json)), observedAt: row.observed_at.toISOString() }];
    } catch {
      // One obsolete/corrupt imported report must not break the entire selling page.
      return [];
    }
  });
  const ids = [...new Set(inspections.flatMap((item) => item.cards.map((card) => card.cardId)).filter((id): id is string => Boolean(id)))];
  const cards = ids.length ? await db.card.findMany({
    where: { id: { in: ids }, game: "pokemon" },
    select: {
      id: true, name: true, card_number: true, printed_card_number: true,
      episode: { select: { name: true } },
      prices: {
        where: { cm_en_lowest_nm: { gt: 0, not: 9001 } },
        orderBy: [{ fetched_at: "desc" }, { id: "desc" }], take: 1,
        select: { cm_en_lowest_nm: true, fetched_at: true },
      },
    },
  }) : [];
  const catalog: Record<string, CollectionCatalogQuote> = Object.fromEntries(cards.map((card) => [card.id, {
    id: card.id, name: card.name, number: card.printed_card_number ?? card.card_number,
    expansion: card.episode.name, nmEur: card.prices[0]?.cm_en_lowest_nm ?? null,
    priceAt: card.prices[0]?.fetched_at.toISOString() ?? null,
  }]));
  return <MarktplaatsCollectionsPanel now={new Date().toISOString()} inspections={inspections.map((item) => ({
    ...item,
    catalog: Object.fromEntries(item.cards.flatMap((card) => card.cardId && catalog[card.cardId] ? [[card.cardId, catalog[card.cardId]]] : [])),
  }))} />;
}

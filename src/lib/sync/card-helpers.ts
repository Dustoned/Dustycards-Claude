import type { Prisma } from "@/generated/prisma";
import {
  categoryToSupertype,
  findTcgdexSetIdForEpisode,
  getTcgdexIllustratorLookupForCards,
  getTcgdexSupertypeLookupForSet,
} from "@/lib/tcgdex";
import { extractPrices } from "@/lib/tcggo";

const CARD_FIELDS = [
  "name",
  "card_number",
  "rarity",
  "hp",
  "supertype",
  "subtypes",
  "artist",
  "image_url",
  "tcggo_url",
  "cardmarket_url",
  "tcgid",
  "cardmarket_id",
  "tcgplayer_id",
] as const;

const PRICE_FIELDS = [
  "cm_en_lowest_nm",
  "cm_de_lowest_nm",
  "cm_fr_lowest_nm",
  "cm_es_lowest_nm",
  "cm_it_lowest_nm",
  "cm_en_avg_30d",
  "cm_en_avg_7d",
  "tcp_market",
  "tcp_mid",
  "tcp_low",
] as const;

export type PriceSnapshotData = ReturnType<typeof extractPrices>;

export type CardWriteData = {
  name: string;
  card_number: string | null;
  rarity: string | null;
  hp: number | null;
  supertype: string | null;
  subtypes: string | null;
  artist: string | null;
  image_url: string | null;
  tcggo_url: string | null;
  cardmarket_url: string | null;
  tcgid: string | null;
  cardmarket_id: string | null;
  tcgplayer_id: string | null;
};

export interface ExistingPriceRecord extends PriceSnapshotData {
  id: string;
}

const latestPriceSnapshotSelect = {
  id: true,
  cm_en_lowest_nm: true,
  cm_de_lowest_nm: true,
  cm_fr_lowest_nm: true,
  cm_es_lowest_nm: true,
  cm_it_lowest_nm: true,
  cm_en_avg_30d: true,
  cm_en_avg_7d: true,
  tcp_market: true,
  tcp_mid: true,
  tcp_low: true,
} satisfies Prisma.PriceSelect;

export const syncCardBaseSelect = {
  id: true,
  name: true,
  card_number: true,
  rarity: true,
  hp: true,
  supertype: true,
  subtypes: true,
  artist: true,
  image_url: true,
  tcggo_url: true,
  cardmarket_url: true,
  tcgid: true,
  cardmarket_id: true,
  tcgplayer_id: true,
  price_source_status: true,
  price_source_checked_at: true,
  native_history_synced_at: true,
  prices: {
    orderBy: { fetched_at: "desc" },
    take: 1,
    select: latestPriceSnapshotSelect,
  },
} satisfies Prisma.CardSelect;

export const syncCardWithEpisodeSelect = {
  ...syncCardBaseSelect,
  episode: {
    select: {
      code: true,
      name: true,
      card_count: true,
    },
  },
} satisfies Prisma.CardSelect;

export type SyncCardRecord = Prisma.CardGetPayload<{
  select: typeof syncCardBaseSelect;
}>;

export type EpisodeCardLookupInput = {
  code?: string | null;
  name?: string | null;
  card_count?: number | null;
};

export type GradedCreateRow = {
  card_id: string;
  label: string;
  price: number;
  fetched_at: Date;
};

export function buildCardWriteData(
  existing: CardWriteData | undefined,
  card: CardWriteData,
  fallbackSupertype: string | null = null
): CardWriteData {
  const normalizedSupertype = categoryToSupertype(card.supertype);

  return {
    name: card.name,
    card_number: card.card_number ?? existing?.card_number ?? null,
    rarity: card.rarity ?? existing?.rarity ?? null,
    hp: card.hp ?? existing?.hp ?? null,
    supertype: normalizedSupertype ?? fallbackSupertype ?? existing?.supertype ?? null,
    subtypes: card.subtypes ?? existing?.subtypes ?? null,
    artist: card.artist ?? existing?.artist ?? null,
    image_url: card.image_url ?? existing?.image_url ?? null,
    tcggo_url: card.tcggo_url ?? existing?.tcggo_url ?? null,
    cardmarket_url: card.cardmarket_url ?? existing?.cardmarket_url ?? null,
    tcgid: card.tcgid ?? existing?.tcgid ?? null,
    cardmarket_id: card.cardmarket_id ?? existing?.cardmarket_id ?? null,
    tcgplayer_id: card.tcgplayer_id ?? existing?.tcgplayer_id ?? null,
  };
}

export function hasCardChanges(existing: CardWriteData, next: CardWriteData): boolean {
  return CARD_FIELDS.some((field) => existing[field] !== next[field]);
}

async function getTcgdexSupertypeLookupForEpisode(input: EpisodeCardLookupInput): Promise<ReadonlyMap<string, string>> {
  const tcgdexSetId = await findTcgdexSetIdForEpisode({
    code: input.code,
    name: input.name,
    cardCount: input.card_count ?? null,
  });
  if (!tcgdexSetId) {
    return new Map();
  }

  return getTcgdexSupertypeLookupForSet(tcgdexSetId);
}

export function hasAnyPrice(prices: PriceSnapshotData): boolean {
  return PRICE_FIELDS.some((field) => prices[field] !== null);
}

export function pricesMatch(existing: ExistingPriceRecord, next: PriceSnapshotData): boolean {
  return PRICE_FIELDS.every((field) => existing[field] === next[field]);
}

export function hasAnyMarketplaceId(
  card: Pick<CardWriteData, "cardmarket_id" | "tcgplayer_id">
): boolean {
  return Boolean(card.cardmarket_id || card.tcgplayer_id);
}

export function dedupeGradedCreateRows(rows: GradedCreateRow[]): GradedCreateRow[] {
  const deduped = new Map<string, GradedCreateRow>();

  for (const row of rows) {
    const normalizedLabel = row.label.replace(/\s+/g, " ").trim();
    if (!normalizedLabel) continue;

    const dedupeKey = `${row.card_id}::${normalizedLabel.toUpperCase()}`;
    const existing = deduped.get(dedupeKey);

    if (!existing || row.price > existing.price) {
      deduped.set(dedupeKey, {
        ...row,
        label: normalizedLabel,
      });
    }
  }

  return [...deduped.values()];
}

export async function loadEpisodeCardEnrichmentLookups(
  episode: EpisodeCardLookupInput | null | undefined,
  cards: Array<{
    id: string;
    name: string;
    card_number: string | null;
    tcgid: string | null;
    artist?: string | null;
  }>
): Promise<{
  tcgdexSupertypeLookup: ReadonlyMap<string, string>;
  tcgdexIllustratorLookup: ReadonlyMap<string, string>;
}> {
  if (!episode) {
    return {
      tcgdexSupertypeLookup: new Map(),
      tcgdexIllustratorLookup: new Map(),
    };
  }

  const episodeLabel = episode.name ?? episode.code ?? "unknown episode";
  const [tcgdexSupertypeLookup, tcgdexIllustratorLookup] = await Promise.all([
    getTcgdexSupertypeLookupForEpisode(episode),
    getTcgdexIllustratorLookupForCards(
      {
        code: episode.code,
        name: episode.name,
        cardCount: episode.card_count,
      },
      cards
    ).catch((error) => {
      console.error(`Failed to load TCGdex illustrator lookup for ${episodeLabel}`, error);
      return new Map<string, string>();
    }),
  ]);

  return {
    tcgdexSupertypeLookup,
    tcgdexIllustratorLookup,
  };
}

export async function findExistingCardsForSync(
  tx: Prisma.TransactionClient,
  where: Prisma.CardWhereInput
): Promise<SyncCardRecord[]> {
  return tx.card.findMany({
    where,
    select: syncCardBaseSelect,
  });
}

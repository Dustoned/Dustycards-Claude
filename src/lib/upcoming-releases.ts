import { db } from "@/lib/db";
import {
  isRelevantUpcomingReleaseDate,
  upcomingRecentReleaseFloor,
} from "@/lib/upcoming-release-policy";
import { readStoredUpcomingReveals } from "@/lib/upcoming-source-reveals";
import { groupUpcomingSingles } from "@/lib/upcoming-single-groups";
import { shouldShowUpcomingSourceReveal } from "@/lib/upcoming-reveal-policy";

export type UpcomingSingleStatus = "confirmed" | "reveal" | "leak" | "upcoming";
export type UpcomingStoryStatus = "confirmed" | "reveal" | "rumour" | "release";

export interface UpcomingLibraryReference {
  kind: "artwork" | "set-number" | "name";
  count: number;
  href: string;
  label: string;
}

export interface UpcomingSingleItem {
  id: string;
  cardId: string | null;
  name: string;
  imageUrl: string | null;
  cardNumber: string | null;
  rarity: string | null;
  version: string | null;
  episodeId: string | null;
  episodeName: string;
  episodeCode: string | null;
  releaseDate: string | null;
  status: UpcomingSingleStatus;
  headline: string | null;
  sourceName: string | null;
  sourceUrl: string | null;
  observedAt: string | null;
  libraryReference?: UpcomingLibraryReference | null;
}

export interface UpcomingSourceStory {
  id: string;
  title: string;
  description: string | null;
  imageUrl: string | null;
  sourceName: string;
  sourceUrl: string;
  publishedAt: string | null;
  status: UpcomingStoryStatus;
}

export interface UpcomingReleaseFeed {
  singles: UpcomingSingleItem[];
  stories: UpcomingSourceStory[];
}

const RELEASE_LANGUAGE = "en-GB";
const RELEVANT_SOURCE_PATTERN =
  /\b(?:upcoming|release|revealed?|leak(?:ed)?|rumou?r|promo|product|collection|booster|tin|box|set)\b/i;
const LEAK_PATTERN = /\b(?:leak(?:ed)?|booklet|scan|photo|rumou?r)\b/i;
const REVEAL_PATTERN = /\b(?:revealed?|promo|first look|unveil(?:ed)?)\b/i;

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function sourceLabel(domain: string): string {
  const normalized = domain.replace(/^www\./i, "").toLowerCase();
  if (normalized === "billsarchive.com") return "Bill's Archive";
  if (normalized === "pokebeach.com") return "PokeBeach";
  if (normalized === "pokemon.com") return "Pokemon.com";
  return normalized;
}

function firstHttpImage(value: unknown, depth = 0): string | null {
  if (depth > 3 || value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return /^https?:\/\//i.test(trimmed) && /\.(?:avif|gif|jpe?g|png|webp)(?:\?|$)/i.test(trimmed)
      ? trimmed
      : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const image = firstHttpImage(item, depth + 1);
      if (image) return image;
    }
    return null;
  }
  if (typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const preferredKeys = [
    "ogImage",
    "og:image",
    "image",
    "imageUrl",
    "twitter:image",
    "twitterImage",
  ];
  for (const key of preferredKeys) {
    const image = firstHttpImage(record[key], depth + 1);
    if (image) return image;
  }
  for (const nested of Object.values(record)) {
    const image = firstHttpImage(nested, depth + 1);
    if (image) return image;
  }
  return null;
}

function metadataImage(metadataJson: string | null): string | null {
  if (!metadataJson) return null;
  try {
    return firstHttpImage(JSON.parse(metadataJson));
  } catch {
    return null;
  }
}

function storyStatus(sourceType: string, text: string): UpcomingStoryStatus {
  if (sourceType === "official") return "confirmed";
  if (LEAK_PATTERN.test(text)) return "rumour";
  if (REVEAL_PATTERN.test(text)) return "reveal";
  return "release";
}

function singleStatus(sourceType: string, text: string): UpcomingSingleStatus {
  if (sourceType === "official") return "confirmed";
  return LEAK_PATTERN.test(text) ? "leak" : "reveal";
}

function normalizedUpcomingCardNumber(value: string | null | undefined): string | null {
  const normalized = value?.toLowerCase().replace(/[^a-z0-9]/g, "") ?? "";
  return normalized || null;
}

export async function getUpcomingReleaseFeed(now = new Date()): Promise<UpcomingReleaseFeed> {
  const todayKey = new Intl.DateTimeFormat(RELEASE_LANGUAGE, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  })
    .formatToParts(now)
    .reduce<Record<string, string>>((parts, part) => {
      if (part.type !== "literal") parts[part.type] = part.value;
      return parts;
    }, {});
  const releaseCutoff = `${todayKey.year}-${todayKey.month}-${todayKey.day}`;
  const recentReleaseFloor = upcomingRecentReleaseFloor(now);
  const sourceCutoff = new Date(now.getTime() - 180 * 24 * 60 * 60_000);

  const [upcomingEpisodes, eligibleCatalystCards, sourceRows] = await Promise.all([
    db.episode.findMany({
      where: {
        game: "pokemon",
        release_date: { not: null, gte: releaseCutoff },
      },
      orderBy: [{ release_date: "asc" }, { name: "asc" }],
      take: 16,
      select: {
        id: true,
        name: true,
        code: true,
        release_date: true,
        cards: {
          where: { image_url: { not: null } },
          orderBy: [{ card_number: "asc" }, { name: "asc" }],
          take: 24,
          select: {
            id: true,
            name: true,
            card_number: true,
            rarity: true,
            version: true,
            image_url: true,
          },
        },
      },
    }),
    db.card.findMany({
      where: {
        game: "pokemon",
        image_url: { not: null },
        episode: {
          release_date: { not: null, gte: recentReleaseFloor },
        },
      },
      select: {
        id: true,
        name: true,
        card_number: true,
        rarity: true,
        version: true,
        image_url: true,
        episode: {
          select: { id: true, name: true, code: true, release_date: true },
        },
      },
    }),
    db.externalCatalystSource.findMany({
      where: {
        game: "pokemon",
        source_type: { in: ["official", "community"] },
        scrape_status: { in: ["matched", "ignored", "pending"] },
        last_seen_at: { gte: sourceCutoff },
      },
      orderBy: [{ published_at: "desc" }, { last_seen_at: "desc" }],
      take: 160,
      select: {
        id: true,
        canonical_url: true,
        domain: true,
        source_type: true,
        title: true,
        description: true,
        content_excerpt: true,
        metadata_json: true,
        published_at: true,
        last_seen_at: true,
      },
    }),
  ]);

  const eligibleCatalystCardIds = eligibleCatalystCards.map((card) => card.id);
  const catalysts = eligibleCatalystCardIds.length
    ? await db.externalCardCatalyst.findMany({
        where: {
          game: "pokemon",
          card_id: { in: eligibleCatalystCardIds },
          catalyst_type: { in: ["reveal", "product", "localization"] },
          observed_at: { gte: sourceCutoff },
        },
        orderBy: [{ observed_at: "desc" }, { strength: "desc" }],
        take: 120,
        include: {
          source: {
            select: {
              canonical_url: true,
              domain: true,
              source_type: true,
              title: true,
              description: true,
              published_at: true,
            },
          },
        },
      })
    : [];
  const storedSourceRows = sourceRows.map((source) => ({
    source,
    reveals: readStoredUpcomingReveals(source.metadata_json),
  }));
  const revealNames = [...new Set(storedSourceRows.flatMap(({ reveals }) =>
    reveals.map((reveal) => reveal.name)
  ))];
  const storedMatchIds = [...new Set(storedSourceRows.flatMap(({ reveals }) =>
    reveals.flatMap((reveal) => reveal.libraryMatch?.cardId ? [reveal.libraryMatch.cardId] : [])
  ))];
  const localRevealCards = revealNames.length || storedMatchIds.length
    ? await db.card.findMany({
        where: {
          game: "pokemon",
          OR: [
            ...(revealNames.length ? [{ name: { in: revealNames } }] : []),
            ...(storedMatchIds.length ? [{ id: { in: storedMatchIds } }] : []),
          ],
        },
        select: {
          id: true,
          name: true,
          card_number: true,
          printed_card_number: true,
          rarity: true,
          version: true,
          image_url: true,
          episode: { select: { id: true, name: true, code: true, release_date: true } },
        },
      })
    : [];
  const localCardsById = new Map(localRevealCards.map((card) => [card.id, card]));
  const localCardsByName = new Map<string, typeof localRevealCards>();
  const releasedCardsByName = new Map<string, typeof localRevealCards>();
  for (const card of localRevealCards) {
    const key = card.name.trim().toLowerCase();
    const localCards = localCardsByName.get(key) ?? [];
    localCards.push(card);
    localCardsByName.set(key, localCards);
    if (!card.episode.release_date || card.episode.release_date > releaseCutoff) continue;
    const cards = releasedCardsByName.get(key) ?? [];
    cards.push(card);
    releasedCardsByName.set(key, cards);
  }
  const cardsById = new Map(eligibleCatalystCards.map((card) => [card.id, card]));
  const singlesByCard = new Map<string, UpcomingSingleItem>();

  for (const catalyst of catalysts) {
    if (!catalyst.card_id || singlesByCard.has(catalyst.card_id)) continue;
    const card = cardsById.get(catalyst.card_id);
    if (!card) continue;
    const text = [
      catalyst.headline,
      catalyst.evidence_excerpt,
      catalyst.source.title,
      catalyst.source.description,
    ]
      .filter(Boolean)
      .join(" ");
    singlesByCard.set(card.id, {
      id: `catalyst:${catalyst.id}`,
      cardId: card.id,
      name: card.name,
      imageUrl: card.image_url,
      cardNumber: card.card_number,
      rarity: card.rarity,
      version: card.version,
      episodeId: card.episode.id,
      episodeName: card.episode.name,
      episodeCode: card.episode.code,
      releaseDate: card.episode.release_date,
      status: singleStatus(catalyst.source.source_type, text),
      headline: catalyst.headline,
      sourceName: sourceLabel(catalyst.source.domain),
      sourceUrl: catalyst.source.canonical_url,
      observedAt: toIso(catalyst.source.published_at ?? catalyst.observed_at),
    });
  }

  for (const episode of upcomingEpisodes) {
    for (const card of episode.cards) {
      if (singlesByCard.has(card.id)) continue;
      singlesByCard.set(card.id, {
        id: `upcoming:${card.id}`,
        cardId: card.id,
        name: card.name,
        imageUrl: card.image_url,
        cardNumber: card.card_number,
        rarity: card.rarity,
        version: card.version,
        episodeId: episode.id,
        episodeName: episode.name,
        episodeCode: episode.code,
        releaseDate: episode.release_date,
        status: "upcoming",
        headline: null,
        sourceName: null,
        sourceUrl: null,
        observedAt: null,
      });
    }
  }

  const matchedSingleKeys = new Set(
    [...singlesByCard.values()].map((item) =>
      `${item.name.trim().toLowerCase()}\u0000${item.cardNumber?.trim().toLowerCase() ?? ""}`
    )
  );
  const sourceSingles: UpcomingSingleItem[] = [];
  for (const { source, reveals } of storedSourceRows) {
    const sourceText = [source.title, source.description, source.content_excerpt]
      .filter(Boolean)
      .join(" ");
    for (const [index, reveal] of reveals.entries()) {
      if (
        reveal.releaseDate
        && !isRelevantUpcomingReleaseDate(reveal.releaseDate, recentReleaseFloor)
      ) {
        continue;
      }
      const revealKey = `${reveal.name.trim().toLowerCase()}\u0000${reveal.cardNumber?.trim().toLowerCase() ?? ""}`;
      if (matchedSingleKeys.has(revealKey)) continue;
      matchedSingleKeys.add(revealKey);
      const storedMatch = reveal.libraryMatch;
      const nameKey = reveal.name.trim().toLowerCase();
      const localNameMatches = localCardsByName.get(nameKey) ?? [];
      const releasedNameMatches = releasedCardsByName.get(nameKey) ?? [];
      const revealNumber = normalizedUpcomingCardNumber(reveal.cardNumber);
      const numberedLocalMatches = revealNumber == null
        ? []
        : localNameMatches.filter((card) =>
            [card.card_number, card.printed_card_number]
              .map(normalizedUpcomingCardNumber)
              .includes(revealNumber)
          );
      const futureNameMatches = localNameMatches.filter((card) =>
        Boolean(card.episode.release_date && card.episode.release_date >= releaseCutoff)
      );
      const megaPromoNameMatches = localNameMatches.filter((card) =>
        card.episode.code?.trim().toUpperCase() === "MEP"
      );
      const resolvedCard = storedMatch
        ? localCardsById.get(storedMatch.cardId) ?? null
        : numberedLocalMatches.length === 1
          ? numberedLocalMatches[0]
          : megaPromoNameMatches.length === 1
            ? megaPromoNameMatches[0]
          : futureNameMatches.length === 1
            ? futureNameMatches[0]
            : null;
      const resolvedIsReleased = Boolean(
        resolvedCard?.episode.release_date && resolvedCard.episode.release_date <= releaseCutoff
      );
      const revealBelongsToUpcomingRelease = Boolean(
        reveal.releaseDate && reveal.releaseDate >= releaseCutoff
      );
      if (!shouldShowUpcomingSourceReveal({
        hasExactLibraryMatch: Boolean(storedMatch),
        exactLibraryMatchIsReleased: storedMatch
          ? resolvedIsReleased && !revealBelongsToUpcomingRelease
          : undefined,
        releasedNameMatchCount: releasedNameMatches.length,
        episodeName: reveal.episodeName,
      })) {
        continue;
      }
      const libraryReference: UpcomingLibraryReference | null = resolvedCard
        ? {
            kind: storedMatch?.method ?? "name",
            count: Math.max(1, localNameMatches.length),
            href: `/expansions/${resolvedCard.episode.id}?card=${resolvedCard.id}`,
            label: storedMatch?.method === "artwork"
              ? `Artwork matched to ${resolvedCard.episode.name}`
              : `Database card in ${resolvedCard.episode.name}`,
          }
        : releasedNameMatches.length
          ? {
              kind: "name",
              count: releasedNameMatches.length,
              href: `/search?q=${encodeURIComponent(reveal.name)}`,
              label: `${releasedNameMatches.length} released ${releasedNameMatches.length === 1 ? "printing" : "printings"} found`,
            }
          : null;
      sourceSingles.push({
        id: `source:${source.id}:${index}`,
        cardId: resolvedCard?.id ?? null,
        name: resolvedCard?.name ?? reveal.name,
        imageUrl: resolvedCard?.image_url ?? reveal.imageUrl,
        cardNumber: reveal.cardNumber ?? resolvedCard?.card_number ?? null,
        rarity: resolvedCard?.rarity ?? reveal.rarity,
        version: resolvedCard?.version ?? null,
        episodeId: resolvedCard?.episode.id ?? null,
        // Keep the source gallery identity and upcoming numbering intact. The
        // local episode/card ids are only the destination for Card Detail.
        episodeName: reveal.episodeName ?? source.title?.trim() ?? resolvedCard?.episode.name ?? "Source reveal",
        episodeCode: null,
        releaseDate: reveal.releaseDate ?? resolvedCard?.episode.release_date ?? null,
        status:
          source.source_type === "official"
            ? "confirmed"
            : reveal.status === "leak"
              ? "leak"
              : singleStatus(source.source_type, sourceText),
        headline: source.title?.trim() ?? null,
        sourceName: sourceLabel(source.domain),
        sourceUrl: source.canonical_url,
        observedAt: toIso(source.published_at ?? source.last_seen_at),
        libraryReference,
      });
    }
  }

  const stories: UpcomingSourceStory[] = sourceRows
    .flatMap((source) => {
      if (source.published_at && source.published_at < sourceCutoff) return [];
      const title = source.title?.trim();
      if (!title) return [];
      const text = [title, source.description, source.content_excerpt].filter(Boolean).join(" ");
      if (!RELEVANT_SOURCE_PATTERN.test(text)) return [];
      return [{
        id: source.id,
        title,
        description: source.description?.trim() || null,
        imageUrl: metadataImage(source.metadata_json),
        sourceName: sourceLabel(source.domain),
        sourceUrl: source.canonical_url,
        publishedAt: toIso(source.published_at ?? source.last_seen_at),
        status: storyStatus(source.source_type, text),
      } satisfies UpcomingSourceStory];
    })
    .slice(0, 18);

  const groupedSingles = groupUpcomingSingles([...singlesByCard.values(), ...sourceSingles])
    .flatMap((group) => group.items);

  return {
    singles: groupedSingles.slice(0, 320),
    stories,
  };
}

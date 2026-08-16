import "server-only";

import { loadLatestSafeEnglishNmPrices } from "@/lib/card-market-history";
import { db } from "@/lib/db";
import { getExternalEntityKey } from "@/lib/external-event-candidates";
import type { ExternalCardSignal } from "@/lib/external-signal-radar";
import { getPressureTierForScore } from "@/lib/external-signal-radar";
import {
  getOlderHighRarityValueProfile,
  STRICT_OLDER_HIGH_RARITIES,
} from "@/lib/older-high-rarity-value";
import { normalizeRarityLabel } from "@/lib/rarity";
import { createSwrCache } from "@/lib/server-swr-cache";

const OLDER_HIGH_RARITY_CACHE_FRESH_MS = 6 * 60 * 60_000;
const OLDER_HIGH_RARITY_CACHE_STALE_MS = 24 * 60 * 60_000;
const olderHighRarityCache = createSwrCache<ExternalCardSignal[]>(
  OLDER_HIGH_RARITY_CACHE_FRESH_MS,
  OLDER_HIGH_RARITY_CACHE_STALE_MS,
  { maxEntries: 4 }
);

const RAW_STRICT_RARITIES = [
  ...STRICT_OLDER_HIGH_RARITIES,
  "Rare Secret",
  ...STRICT_OLDER_HIGH_RARITIES.map((rarity) => rarity.toLowerCase()),
  "rare secret",
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function fiveYearCutoff(now: Date): string {
  const cutoff = new Date(now);
  cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 5);
  return cutoff.toISOString().slice(0, 10);
}

function ageInYears(releaseDate: string, now: Date): number {
  const releasedAt = Date.parse(releaseDate);
  if (!Number.isFinite(releasedAt)) return 0;
  return Math.max(0, (now.getTime() - releasedAt) / (365.25 * 86_400_000));
}

function discoveryScore(input: {
  ageYears: number;
  currentPrice: number;
  rarityCohortSize: number;
  historyPoints: number;
}): number {
  const affordability =
    input.currentPrice <= 25
      ? 20
      : input.currentPrice <= 50
        ? 17
        : input.currentPrice <= 100
          ? 14
          : input.currentPrice <= 200
            ? 10
            : input.currentPrice <= 350
              ? 6
              : 3;
  const age = Math.min(18, Math.max(0, input.ageYears - 5) * 1.15);
  const rarityScarcity = Math.max(0, 21 - input.rarityCohortSize) * 0.85;
  const historyConfidence = Math.min(6, Math.log10(input.historyPoints + 1) * 2.4);
  return Math.round(clamp(48 + affordability + age + rarityScarcity + historyConfidence, 55, 99));
}

async function loadOlderHighRarityValueSignalsUncached(
  now: Date
): Promise<ExternalCardSignal[]> {
  const cards = await db.card.findMany({
    where: {
      game: "pokemon",
      rarity: { in: [...new Set(RAW_STRICT_RARITIES)] },
      episode: { release_date: { not: null, lte: fiveYearCutoff(now) } },
      prices: { some: { cm_en_lowest_nm: { gt: 0, not: 9001 } } },
    },
    select: {
      id: true,
      game: true,
      episode_id: true,
      name: true,
      image_url: true,
      card_number: true,
      printed_card_number: true,
      rarity: true,
      cardmarket_id: true,
      cardmarket_url: true,
      episode: {
        select: {
          name: true,
          code: true,
          release_date: true,
        },
      },
      _count: { select: { prices: true } },
    },
  });

  const episodeIds = [...new Set(cards.map((card) => card.episode_id))];
  const rarityRows = episodeIds.length
    ? await db.card.groupBy({
        by: ["episode_id", "rarity"],
        where: { episode_id: { in: episodeIds }, rarity: { not: null } },
        _count: { _all: true },
      })
    : [];
  const rarityCohortByEpisode = new Map<string, number>();
  for (const row of rarityRows) {
    const normalized = normalizeRarityLabel(row.rarity);
    if (!normalized) continue;
    const key = `${row.episode_id}:${normalized}`;
    rarityCohortByEpisode.set(
      key,
      (rarityCohortByEpisode.get(key) ?? 0) + row._count._all
    );
  }

  const latestPrices = await loadLatestSafeEnglishNmPrices(
    cards.map((card) => ({
      id: card.id,
      game: card.game,
      episodeId: card.episode_id,
      name: card.name,
      cardNumber: card.card_number,
      printedCardNumber: card.printed_card_number,
      cardmarketId: card.cardmarket_id,
      cardmarketUrl: card.cardmarket_url,
    }))
  );

  const candidates = cards.flatMap((card) => {
    const currentPrice = latestPrices.get(card.id)?.value ?? null;
    const releaseDate = card.episode.release_date;
    const normalizedRarity = normalizeRarityLabel(card.rarity);
    if (currentPrice == null || !releaseDate || !normalizedRarity) return [];
    const ageYears = ageInYears(releaseDate, now);
    const rarityCohortSize =
      rarityCohortByEpisode.get(`${card.episode_id}:${normalizedRarity}`) ?? 0;
    const profile = getOlderHighRarityValueProfile({
      game: card.game,
      rarity: card.rarity,
      ageYears,
      currentPrice,
      rarityCohortSize,
      historyPoints: card._count.prices,
    });
    if (!profile) return [];

    const externalScore = discoveryScore({
      ageYears,
      currentPrice,
      rarityCohortSize,
      historyPoints: card._count.prices,
    });
    const pressure = getPressureTierForScore(Math.min(82, externalScore));
    return [
      {
        rank: 0,
        cardId: card.id,
        entityKey: getExternalEntityKey("pokemon", card.name),
        sourceMode: "structural" as const,
        olderHighRarityValue: profile,
        game: "pokemon" as const,
        name: card.name,
        imageUrl: card.image_url,
        cardNumber: card.printed_card_number ?? card.card_number,
        episodeName: card.episode.name,
        episodeCode: card.episode.code,
        episodeReleaseDate: releaseDate,
        rarity: card.rarity,
        currentPrice,
        currency: "EUR" as const,
        externalScore,
        competitiveScore: -1,
        confidence: "Medium" as const,
        horizon: "30-90 day watch" as const,
        pressureLabel: pressure.label,
        pressureExplanation:
          "Older high-rarity scarcity and relative value, independent from a current news event",
        reasons: [
          `${card.rarity ?? "High rarity"} from a ${ageYears.toFixed(1)}-year-old set`,
          `Only ${rarityCohortSize} cards share this rarity tier inside the set`,
          `Current English NM market is EUR ${currentPrice.toFixed(2)}`,
          `${card._count.prices} saved price observations support this comparison`,
        ],
        evidence: [],
        maxDeckSharePercent: 0,
        maxInclusionPercent: 0,
        archetypeCount: 0,
      } satisfies ExternalCardSignal,
    ];
  });

  return candidates
    .sort(
      (left, right) =>
        right.externalScore - left.externalScore ||
        left.currentPrice! - right.currentPrice! ||
        (left.episodeReleaseDate ?? "").localeCompare(right.episodeReleaseDate ?? "") ||
        left.cardId.localeCompare(right.cardId)
    )
    .map((signal, index) => ({ ...signal, rank: index + 1 }));
}

export function getOlderHighRarityValueSignals(
  now = new Date()
): Promise<ExternalCardSignal[]> {
  const day = now.toISOString().slice(0, 10);
  return olderHighRarityCache.get(day, () =>
    loadOlderHighRarityValueSignalsUncached(now)
  );
}

export function clearOlderHighRarityValueSignalCache(): void {
  olderHighRarityCache.clear();
}

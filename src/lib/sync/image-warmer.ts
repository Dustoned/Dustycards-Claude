import "server-only";
import { db } from "@/lib/db";
import {
  warmCardImages,
  type WarmCardImagesProgress,
  type WarmCardImagesResult,
} from "@/lib/image-cache-server";

interface WarmStats {
  cards: WarmCardImagesResult | null;
  sealed: WarmCardImagesResult | null;
}

const inFlightEpisodeWarms = new Map<string, Promise<WarmStats>>();

async function collectEpisodeImageUrls(
  episodeId: string
): Promise<{ cardUrls: string[]; sealedUrls: string[] }> {
  const [cards, sealed, episode] = await Promise.all([
    db.card.findMany({
      where: { episode_id: episodeId, image_url: { not: null } },
      select: { image_url: true },
    }),
    db.sealedProduct.findMany({
      where: { episode_id: episodeId, image_url: { not: null } },
      select: { image_url: true },
    }),
    db.episode.findUnique({
      where: { id: episodeId },
      select: { logo_url: true },
    }),
  ]);

  const cardUrls = cards
    .map((c) => c.image_url)
    .filter((v): v is string => Boolean(v));
  if (episode?.logo_url) cardUrls.push(episode.logo_url);

  return {
    cardUrls,
    sealedUrls: sealed.map((p) => p.image_url).filter((v): v is string => Boolean(v)),
  };
}

async function warmEpisode(episodeId: string): Promise<WarmStats> {
  const { cardUrls, sealedUrls } = await collectEpisodeImageUrls(episodeId);

  const [cards, sealed] = await Promise.all([
    cardUrls.length > 0 ? warmCardImages(cardUrls) : Promise.resolve(null),
    sealedUrls.length > 0 ? warmCardImages(sealedUrls) : Promise.resolve(null),
  ]);

  return { cards, sealed };
}

function logResult(label: string, result: WarmCardImagesResult | null) {
  if (!result || result.total === 0) return;
  console.info(
    `[image-warmer] ${label}: total=${result.total} hit=${result.hits} new=${result.downloaded} skip=${result.skipped} fail=${result.failed} (${result.durationMs}ms)`
  );
}

/**
 * Pre-warms the image cache for every card and sealed product in the episode.
 * Idempotent — already-cached images are fast HITs.
 *
 * Runs concurrently if invoked multiple times for the same episode the in-flight
 * promise is reused so callers can fire-and-forget without thundering-herd risk.
 */
export function warmEpisodeImages(episodeId: string): Promise<WarmStats> {
  const existing = inFlightEpisodeWarms.get(episodeId);
  if (existing) return existing;

  const promise = warmEpisode(episodeId)
    .then((stats) => {
      logResult(`episode ${episodeId} cards`, stats.cards);
      logResult(`episode ${episodeId} sealed`, stats.sealed);
      return stats;
    })
    .catch((error: unknown) => {
      console.warn(
        `[image-warmer] episode ${episodeId} failed:`,
        error instanceof Error ? error.message : String(error)
      );
      return { cards: null, sealed: null } satisfies WarmStats;
    })
    .finally(() => {
      inFlightEpisodeWarms.delete(episodeId);
    });

  inFlightEpisodeWarms.set(episodeId, promise);
  return promise;
}

/**
 * Pre-warms images for every card and sealed product in the database.
 * Used by the backfill script.
 */
export async function warmAllImages(options?: {
  onProgress?: (state: { phase: "cards" | "sealed"; progress: WarmCardImagesProgress }) => void;
}): Promise<{ cards: WarmCardImagesResult; sealed: WarmCardImagesResult }> {
  const [cardRows, sealedRows] = await Promise.all([
    db.card.findMany({
      where: { image_url: { not: null } },
      select: { image_url: true },
    }),
    db.sealedProduct.findMany({
      where: { image_url: { not: null } },
      select: { image_url: true },
    }),
  ]);

  const cardUrls = cardRows.map((c) => c.image_url).filter((v): v is string => Boolean(v));
  const sealedUrls = sealedRows.map((p) => p.image_url).filter((v): v is string => Boolean(v));

  const cards = await warmCardImages(cardUrls, {
    onProgress: options?.onProgress
      ? (progress) => options.onProgress?.({ phase: "cards", progress })
      : undefined,
  });
  const sealed = await warmCardImages(sealedUrls, {
    onProgress: options?.onProgress
      ? (progress) => options.onProgress?.({ phase: "sealed", progress })
      : undefined,
  });

  return { cards, sealed };
}

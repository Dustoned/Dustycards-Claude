import { db } from "@/lib/db";
import type {
  EpisodeSealedPriceHistorySnapshot,
  SealedPriceHistorySnapshot,
} from "@/lib/price-history";

type SealedSnapshotDelegate = {
  findMany: (args: unknown) => Promise<unknown[]>;
};

function getSnapshotDelegate(): SealedSnapshotDelegate | null {
  const client = db as typeof db & {
    sealedPriceSnapshot?: SealedSnapshotDelegate;
  };

  return client.sealedPriceSnapshot ?? null;
}

export async function getSealedPriceSnapshotsByEpisode(
  episodeId: string
): Promise<EpisodeSealedPriceHistorySnapshot[]> {
  const delegate = getSnapshotDelegate();

  if (delegate) {
    return (await delegate.findMany({
      where: { episode_id: episodeId },
      orderBy: [{ fetched_at: "asc" }, { product_id: "asc" }],
      select: {
        product_id: true,
        fetched_at: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        cm_avg_7d: true,
        cm_avg_30d: true,
      },
    })) as EpisodeSealedPriceHistorySnapshot[];
  }

  try {
    return await db.$queryRawUnsafe<EpisodeSealedPriceHistorySnapshot[]>(
      `SELECT
        product_id,
        fetched_at,
        cm_lowest,
        cm_lowest_eu,
        cm_lowest_de,
        cm_lowest_fr,
        cm_lowest_es,
        cm_lowest_it,
        cm_avg_7d,
        cm_avg_30d
      FROM "SealedPriceSnapshot"
      WHERE episode_id = ?
      ORDER BY fetched_at ASC, product_id ASC`,
      episodeId
    );
  } catch {
    return [];
  }
}

export async function getSealedPriceSnapshotsByProduct(
  productId: string
): Promise<SealedPriceHistorySnapshot[]> {
  const delegate = getSnapshotDelegate();

  if (delegate) {
    return (await delegate.findMany({
      where: { product_id: productId },
      orderBy: { fetched_at: "asc" },
      select: {
        fetched_at: true,
        cm_lowest: true,
        cm_lowest_eu: true,
        cm_lowest_de: true,
        cm_lowest_fr: true,
        cm_lowest_es: true,
        cm_lowest_it: true,
        cm_avg_7d: true,
        cm_avg_30d: true,
      },
    })) as SealedPriceHistorySnapshot[];
  }

  try {
    return await db.$queryRawUnsafe<SealedPriceHistorySnapshot[]>(
      `SELECT
        fetched_at,
        cm_lowest,
        cm_lowest_eu,
        cm_lowest_de,
        cm_lowest_fr,
        cm_lowest_es,
        cm_lowest_it,
        cm_avg_7d,
        cm_avg_30d
      FROM "SealedPriceSnapshot"
      WHERE product_id = ?
      ORDER BY fetched_at ASC`,
      productId
    );
  } catch {
    return [];
  }
}

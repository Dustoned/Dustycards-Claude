import { describe, expect, it } from "vitest";
import {
  decodeSyncLogDetailsJson,
  decodeSyncLogMessage,
  encodeSyncLogDetailsJson,
  encodeSyncLogMessage,
  type AutoPriceRefreshLogDetails,
  type CardHistoryLogDetails,
  type EbaySoldGradedPriceLogDetails,
  type EpisodeSyncLogDetails,
  type FullSyncLogDetails,
  type SealedSyncLogDetails,
} from "@/lib/sync-log-details";

const details: AutoPriceRefreshLogDetails = {
  version: 1,
  kind: "auto-price-refresh",
  batchId: "batch-1",
  status: "running",
  checkedEpisodes: 4,
  catalogSyncedEpisodes: 1,
  dueCards: 120,
  missingPriceCards: 8,
  selectedCards: 50,
  backfillCards: 6,
  nativeHistoryItems: 0,
  remainingDueCards: 70,
  newEpisodes: 1,
  newCards: 2,
  updatedCards: 3,
  newPrices: 4,
  refreshedPrices: 5,
  refreshedCards: 5,
  gradedPricesUpdated: 1,
  quotaExceeded: false,
  requestsRemaining: 123,
  requestConcurrency: 8,
  currentSet: {
    index: 2,
    total: 4,
    name: "Test Set",
    cards: 12,
    previewCards: ["Card A"],
  },
};

const cardHistoryDetails: CardHistoryLogDetails = {
  version: 1,
  kind: "card-history",
  runId: "history-1",
  status: "running",
  candidateCards: 120,
  selectedCards: 48,
  processedCards: 12,
  syncedCards: 10,
  failedCards: 2,
  newHistorySnapshots: 240,
  remainingCards: 108,
  hasMore: true,
  quotaExceeded: false,
  requestsRemaining: 651,
  requestConcurrency: 8,
};

const ebaySoldGradedPriceDetails: EbaySoldGradedPriceLogDetails = {
  version: 1,
  kind: "ebay-sold-graded-prices",
  runId: "ebay-1",
  status: "running",
  candidateCards: 90,
  selectedCards: 48,
  processedCards: 12,
  cardsWithPrices: 6,
  cardsWithoutPrices: 5,
  failedCards: 1,
  ebaySoldGradedPricesUpdated: 18,
  remainingCards: 84,
  hasMore: true,
  quotaExceeded: false,
  requestsRemaining: 630,
  requestConcurrency: 8,
};

const episodeSyncDetails: EpisodeSyncLogDetails = {
  version: 1,
  kind: "episode-sync",
  syncId: "sync-episode-1",
  status: "success",
  episodeId: "sv1",
  count: 120,
  newCards: 3,
  updatedCards: 4,
  newPrices: 5,
  refreshedPrices: 6,
  gradedPricesUpdated: 1,
  preemptedAutoPriceRefresh: false,
  quotaExceeded: false,
  requestsRemaining: 650,
  requestConcurrency: 8,
};

const fullSyncDetails: FullSyncLogDetails = {
  version: 1,
  kind: "full-sync",
  syncId: "sync-full-1",
  status: "running",
  count: 177,
  newEpisodes: 1,
  syncedEpisodes: 6,
  skippedEpisodes: 170,
  newCards: 20,
  updatedCards: 12,
  newPrices: 8,
  refreshedPrices: 10,
  gradedPricesUpdated: 2,
  quotaExceeded: false,
  requestsRemaining: 640,
  requestConcurrency: 8,
  currentEpisode: {
    index: 6,
    total: 10,
    id: "sv2",
    name: "Test Expansion",
  },
};

const sealedSyncDetails: SealedSyncLogDetails = {
  version: 1,
  kind: "sealed-sync",
  syncId: "sync-sealed-1",
  status: "quota-paused",
  synced: 12,
  products: 45,
  quotaExceeded: true,
  requestsRemaining: 0,
  requestConcurrency: 8,
  currentEpisode: null,
};

describe("sync log details", () => {
  it("round-trips a human message with structured details", () => {
    const encoded = encodeSyncLogMessage("Batch 50 cards", details);
    const decoded = decodeSyncLogMessage(encoded);

    expect(decoded.message).toBe("Batch 50 cards");
    expect(decoded.details).toEqual(details);
  });

  it("replaces existing details instead of nesting markers", () => {
    const encoded = encodeSyncLogMessage("Batch 50 cards", details);
    const updated = encodeSyncLogMessage(encoded, {
      ...details,
      status: "success",
      remainingDueCards: 0,
    });
    const decoded = decodeSyncLogMessage(updated);

    expect(decoded.message).toBe("Batch 50 cards");
    expect(decoded.details?.kind).toBe("auto-price-refresh");
    if (decoded.details?.kind !== "auto-price-refresh") {
      throw new Error("Expected auto price refresh details");
    }
    expect(decoded.details.status).toBe("success");
    expect(decoded.details.remainingDueCards).toBe(0);
  });

  it("keeps the human message when details JSON is invalid", () => {
    const decoded = decodeSyncLogMessage(
      "Still readable\n\n@@dustycards-sync-details:{not-json"
    );

    expect(decoded.message).toBe("Still readable");
    expect(decoded.details).toBeNull();
  });

  it("decodes details from the dedicated JSON column format", () => {
    expect(decodeSyncLogDetailsJson(encodeSyncLogDetailsJson(details))).toEqual(details);
    expect(decodeSyncLogDetailsJson("{broken")).toBeNull();
  });

  it("round-trips card history details", () => {
    const encoded = encodeSyncLogMessage("History chunk", cardHistoryDetails);

    expect(decodeSyncLogMessage(encoded).details).toEqual(cardHistoryDetails);
    expect(decodeSyncLogDetailsJson(encodeSyncLogDetailsJson(cardHistoryDetails))).toEqual(
      cardHistoryDetails
    );
  });

  it("round-trips eBay sold graded price details", () => {
    const encoded = encodeSyncLogMessage("eBay chunk", ebaySoldGradedPriceDetails);

    expect(decodeSyncLogMessage(encoded).details).toEqual(ebaySoldGradedPriceDetails);
    expect(
      decodeSyncLogDetailsJson(encodeSyncLogDetailsJson(ebaySoldGradedPriceDetails))
    ).toEqual(ebaySoldGradedPriceDetails);
  });

  it("round-trips full, episode, and sealed sync details", () => {
    for (const syncDetails of [episodeSyncDetails, fullSyncDetails, sealedSyncDetails]) {
      expect(decodeSyncLogMessage(encodeSyncLogMessage("Sync", syncDetails)).details).toEqual(
        syncDetails
      );
      expect(decodeSyncLogDetailsJson(encodeSyncLogDetailsJson(syncDetails))).toEqual(
        syncDetails
      );
    }
  });
});

"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { useSettings } from "@/components/SettingsProvider";
import CardDetailShell, {
  type CardDetailTab,
} from "@/components/card-detail/CardDetailShell";
import {
  CardCharacterLinks,
  getCardCharacterFactLabel,
  isCardCharacterFactLabel,
} from "@/components/card-detail/CardCharacterLinks";
import { CardDetailMediaSwitcher } from "@/components/card-detail/CardDetailMediaSwitcher";
import { CardDetailMarketControls } from "@/components/card-detail/CardDetailMarketControls";
import { buildCardDetailSignalTabs } from "@/components/card-detail/CardDetailSignalTabs";
import { orderCardDetailTabs } from "@/components/card-detail/card-detail-tabs";
import {
  getSafeDirectCardMarketCardUrl,
  isDirectCardMarketUrl,
  resolveCardMarketCardUrl,
} from "@/lib/cardmarket";
import {
  GRADED_SLAB_ASPECT_CLASS,
  RAW_CARD_ASPECT_CLASS,
  normalizeGradingCompanyLabel,
  normalizeGradingGradeLabel,
} from "@/lib/graded-slabs";
import {
  CARD_MARKET_HISTORY_SERIES,
  getCardMarketHistorySeriesValue,
  getSaneCardMarketHistorySeriesCurrentValue,
  hasCardMarketHistorySeries,
  type CardMarketHistorySeriesKey,
} from "@/lib/price-history";
import useBodyScrollLock from "@/lib/useBodyScrollLock";
import useModalA11y from "@/lib/useModalA11y";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import { formatCurrency } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";
import { MOBILE_EDGE_BACK_EVENT } from "@/lib/mobile-edge-back";
import { invalidateMarketHomeClientCache } from "@/lib/home-client-cache";
import type { CollectionCardSavedDetail } from "@/lib/collection-client-events";
import EbayCardDemandPanel from "@/components/ebay/EbayCardDemandPanel";
import {
  CardModalActiveListingsPanel,
  CardModalDesktopActionGroup,
  CardModalHistorySection,
  CardModalMarketSignalPanel,
  CardModalOwnedCopyPanel,
  CardModalPreview,
  CardModalRecentPricesPanel,
  CardModalRelatedPrintingsPanel,
  getPreferredCardModalGradedDisplayPrice,
  type CardModalGradedDisplayPrice,
} from "./card-modal/CardModalSections";
import type { ModalCardData } from "./card-modal/types";
import type { SealedModalProductData } from "./sealed-modal/types";
import { getCardModalLayoutClasses } from "./card-modal/utils";
import CardMarketPriceCheckDialog from "./card-modal/CardMarketPriceCheckDialog";

export type { ModalCardData } from "./card-modal/types";

const CardThreeViewer = dynamic(() => import("@/app/expansions/[id]/CardThreeViewer"), {
  ssr: false,
  loading: () => null,
});
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

const relatedPrintingsCache = new Map<
  string,
  ModalCardData["related_printings"]
>();
const MIN_CURRENT_RULES_REPRINT_SIMILARITY = 0.92;

interface Props {
  card: ModalCardData;
  showGradedSlabPreview?: boolean;
  backLabel?: string;
  initialMarketSource?: "cardmarket" | "tcgplayer";
  onClose: () => void;
  onCollectionItemSaved?: (detail: CollectionCardSavedDetail) => void | Promise<void>;
}

interface SignalResearchResult {
  url: string;
  title: string;
  description: string | null;
  domain: string;
  category: string;
  reason: string | null;
}

interface SignalResearchSnapshot {
  results: SignalResearchResult[];
}

interface SubmittedCardRefreshJobSnapshot {
  status: "idle" | "queued" | "running" | "success" | "failed";
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

interface SubmittedCardRefreshStartResponse {
  refreshPending: true;
  refreshJob: SubmittedCardRefreshJobSnapshot;
}

interface SubmittedCardRefreshStatusResponse {
  refreshJob: SubmittedCardRefreshJobSnapshot;
}

function isModalCardData(value: unknown): value is ModalCardData {
  return Boolean(
    value &&
      typeof value === "object" &&
      "id" in value &&
      typeof (value as { id?: unknown }).id === "string"
  );
}

function isSubmittedCardRefreshStartResponse(
  value: unknown
): value is SubmittedCardRefreshStartResponse {
  return Boolean(
    value &&
      typeof value === "object" &&
      "refreshPending" in value &&
      (value as { refreshPending?: unknown }).refreshPending === true
  );
}

function waitForCardRefreshPoll(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", handleAbort);
      resolve();
    }, ms);
    const handleAbort = () => {
      window.clearTimeout(timeout);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal.addEventListener("abort", handleAbort, { once: true });
  });
}

function normalizeGradeSelection(value: string | null | undefined): string {
  return value?.toUpperCase().replace(/[^A-Z0-9.]+/g, " ").replace(/\s+/g, " ").trim() ?? "";
}

function findSavedGradedLabel(
  prices: Array<{ label: string; price?: number; company?: string; grade?: string }>,
  collectionItem: ModalCardData["collection_item"] | null | undefined
): string | null {
  const company = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const grade = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  if (!company || !grade) return null;

  const normalizedCompany = normalizeGradeSelection(company);
  const normalizedGrade = normalizeGradeSelection(grade);
  const exactStructuredMatch = prices.find((price) => {
    if (!price.company || !price.grade) return false;
    return (
      normalizeGradeSelection(price.company) === normalizedCompany &&
      normalizeGradeSelection(price.grade) === normalizedGrade
    );
  });
  if (exactStructuredMatch) return exactStructuredMatch.label;

  return (
    prices.find((price) => {
      const label = normalizeGradeSelection(price.label);
      return label.includes(normalizedCompany) && label.includes(normalizedGrade);
    })?.label ?? null
  );
}

function getLatestSeriesValue(points: Array<{ value: number | null }>): number | undefined {
  for (let index = points.length - 1; index >= 0; index -= 1) {
    const value = points[index]?.value;
    if (value != null) return value;
  }

  return undefined;
}

function getInitialCardMarketFloorValue(card: ModalCardData): number | null {
  return card.price?.cm_en_lowest_nm ?? null;
}

function getEbaySoldDisplayValueEur(
  price: NonNullable<ModalCardData["ebay_sold_graded_prices"]>[number] | null | undefined
): number | null {
  if (!price) return null;
  if (price.median_price_eur != null) return price.median_price_eur;
  return price.currency.toUpperCase() === "EUR" ? price.median_price : null;
}

function shouldOpenOnRawMarket(
  card: ModalCardData,
  savedCardMarketGradedLabel: string | null,
  savedEbaySoldGradedLabel: string | null
): boolean {
  if (savedCardMarketGradedLabel || !savedEbaySoldGradedLabel) return false;

  const rawFloorValue = getInitialCardMarketFloorValue(card);
  const savedEbaySoldPrice = (card.ebay_sold_graded_prices ?? []).find(
    (price) => price.label === savedEbaySoldGradedLabel
  );
  const ebaySoldValue = getEbaySoldDisplayValueEur(savedEbaySoldPrice);

  return rawFloorValue != null && ebaySoldValue != null && rawFloorValue > ebaySoldValue;
}

export default function CardModal({
  card,
  showGradedSlabPreview = false,
  backLabel = "Back",
  initialMarketSource,
  onClose,
  onCollectionItemSaved,
}: Props) {
  // The fullscreen detail owns its own scroll surface. Keeping the document
  // in normal viewport coordinates prevents iOS from offsetting body-level
  // fixed controls when the underlying page was already scrolled.
  useBodyScrollLock(true, "overflow");
  const router = useRouter();

  const savedCardMarketGradedLabel = findSavedGradedLabel(
    [
      ...(card.graded_prices ?? []),
      ...(card.graded_price_history ?? []).map((series) => ({
        label: series.label,
        price: getLatestSeriesValue(series.points),
      })),
    ],
    card.collection_item
  );
  const savedEbaySoldGradedLabel = findSavedGradedLabel(
    card.ebay_sold_graded_prices ?? [],
    card.collection_item
  );
  const defaultToRawMarket = shouldOpenOnRawMarket(
    card,
    savedCardMarketGradedLabel,
    savedEbaySoldGradedLabel
  );
  const [modalCardOverride, setModalCard] = useState<ModalCardData | null>(null);
  const cachedRelatedPrintings = relatedPrintingsCache.get(card.id);
  const cachedCard =
    cachedRelatedPrintings !== undefined
      ? { ...card, related_printings: cachedRelatedPrintings }
      : card;
  const modalCard = modalCardOverride?.id === card.id ? modalCardOverride : cachedCard;
  const [gradedHeroState, setGradedHeroState] = useState<{
    cardId: string;
    price: CardModalGradedDisplayPrice | null;
  } | null>(null);
  const { settings, displaySettings, currentUserRole } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);
  const [cardMarketPriceCheckOpen, setCardMarketPriceCheckOpen] = useState(false);
  const [selectedSealedProduct, setSelectedSealedProduct] =
    useState<SealedModalProductData | null>(null);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [syncingHistory, setSyncingHistory] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [removingCollectionItem, setRemovingCollectionItem] = useState(false);
  const [researchingSignal, setResearchingSignal] = useState(false);
  const [signalResearchError, setSignalResearchError] = useState<string | null>(null);
  const [signalResearch, setSignalResearch] = useState<SignalResearchSnapshot | null>(null);
  const [signalSummaryState, setSignalSummaryState] = useState<{
    cardId: string;
    signal: ModalCardData["signal_summary"];
    loading: boolean;
  }>({
    cardId: card.id,
    signal: card.signal_summary ?? null,
    loading: !card.signal_summary,
  });
  const [historyChartMode, setHistoryChartMode] = useState<"market" | "graded">(() =>
    defaultToRawMarket || (!savedCardMarketGradedLabel && !savedEbaySoldGradedLabel)
      ? "market"
      : "graded"
  );
  const [marketDataSource, setMarketDataSource] = useState<"cardmarket" | "tcgplayer">(
    initialMarketSource ?? (settings.primaryPriceSource === "tcp" ? "tcgplayer" : "cardmarket")
  );
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const modalFrameRef = useRef<HTMLDivElement | null>(null);
  const threeDClosingGuardUntilRef = useRef(0);
  const cardActionAbortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      cardActionAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    const handleMobileEdgeBack = (event: Event) => {
      event.preventDefault();

      if (threeDOpen) {
        setThreeDOpen(false);
        return;
      }
      if (selectedSealedProduct) {
        setSelectedSealedProduct(null);
        return;
      }
      if (priceAlertOpen) {
        setPriceAlertOpen(false);
        return;
      }
      if (cardMarketPriceCheckOpen) {
        setCardMarketPriceCheckOpen(false);
        return;
      }

      onClose();
    };

    window.addEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
    return () => window.removeEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
  }, [cardMarketPriceCheckOpen, onClose, priceAlertOpen, selectedSealedProduct, threeDOpen]);

  const collectionItem = modalCard.collection_item ?? null;
  const layout = getCardModalLayoutClasses(
    displaySettings.modalSize,
    displaySettings.widescreen
  );
  const gradedPrices = modalCard.graded_prices ?? [];
  const ebaySoldGradedPrices = modalCard.ebay_sold_graded_prices ?? [];
  const gradedPriceHistory = modalCard.graded_price_history ?? [];
  const ebaySoldGradedPriceHistory = modalCard.ebay_sold_graded_price_history ?? [];
  const gradingCompanyLabel = normalizeGradingCompanyLabel(collectionItem?.grading_company);
  const gradingGradeLabel = normalizeGradingGradeLabel(collectionItem?.grading_grade);
  const showGradedPreview = Boolean(
    showGradedSlabPreview && gradingCompanyLabel && gradingGradeLabel
  );
  const previewAspectClass = showGradedPreview
    ? GRADED_SLAB_ASPECT_CLASS
    : RAW_CARD_ASPECT_CLASS;
  const isBusy = refreshing || syncingHistory;
  const canManageCardPrices = currentUserRole === "admin";
  const gradePremiumScore = modalCard.market_stats?.metrics.grade_premium ?? null;
  const gradedComparisons = modalCard.market_stats?.graded_comparisons ?? [];
  // Prefer the PSA 10 benchmark; otherwise show the best available graded quote.
  const topGradedComparison =
    gradedComparisons.find((entry) => /psa\s*10\b/i.test(entry.label)) ??
    gradedComparisons[0] ??
    null;
  const signalSummary =
    signalSummaryState.cardId === modalCard.id ? signalSummaryState.signal : null;
  const signalSummaryLoading =
    signalSummaryState.cardId !== modalCard.id || signalSummaryState.loading;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/cards/${encodeURIComponent(modalCard.id)}/signal-preview`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { ok: true; signal: NonNullable<ModalCardData["signal_summary"]> }
          | { ok: false }
          | null;
        setSignalSummaryState({
          cardId: modalCard.id,
          signal: response.ok && payload?.ok ? payload.signal : null,
          loading: false,
        });
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[card signal preview]", error);
          setSignalSummaryState({ cardId: modalCard.id, signal: null, loading: false });
        }
      });
    return () => controller.abort();
  }, [modalCard.id]);

  useEffect(() => {
    const cached = relatedPrintingsCache.get(card.id);
    if (cached !== undefined) return;

    const hasLegacyAmbiguousMatch = (card.related_printings ?? []).some(
      (printing) =>
        printing.match_method === "rules-and-art" &&
        printing.image_similarity != null &&
        printing.image_similarity < MIN_CURRENT_RULES_REPRINT_SIMILARITY
    );
    if (!hasLegacyAmbiguousMatch) {
      relatedPrintingsCache.set(card.id, card.related_printings);
      return;
    }

    const controller = new AbortController();
    void fetch(
      `/api/cards/${encodeURIComponent(card.id)}?relatedPrintings=1`,
      { cache: "no-store", signal: controller.signal }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
          | { related_printings?: ModalCardData["related_printings"] }
          | null;
        if (!response.ok || !Array.isArray(payload?.related_printings)) return;
        relatedPrintingsCache.set(card.id, payload.related_printings);
        setModalCard((current) => ({
          ...(current?.id === card.id ? current : card),
          related_printings: payload.related_printings,
        }));
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          console.error("[card related printings]", error);
        }
      });
    return () => controller.abort();
  }, [card]);
  const availableCardMarketHistorySeries = CARD_MARKET_HISTORY_SERIES.filter(
    (series) =>
      series.key === "cm_market_en" ||
      hasCardMarketHistorySeries(modalCard.price_history, series.key)
  );
  // Never silently switch the main graph to another language. EN Near Mint is
  // the default; DE/FR/ES/IT/JP only become active after an explicit selection.
  const activeCardMarketHistorySeries = cardMarketHistorySeries;
  const activeCardMarketSeriesLabel =
    availableCardMarketHistorySeries.find((series) => series.key === activeCardMarketHistorySeries)
      ?.label ?? "EN";
  const cardMarketHistory = modalCard.price_history.map((point) => ({
    date: point.date,
    label: point.label,
    value: getCardMarketHistorySeriesValue(point, activeCardMarketHistorySeries),
  }));
  const tcgPlayerHistory = modalCard.price_history.map((point) => ({
    date: point.date,
    label: point.label,
    value: point.tcp_market,
  }));
  const hasTcgPlayerData =
    [modalCard.price?.tcp_market, modalCard.price?.tcp_mid, modalCard.price?.tcp_low].some(
      (value) => value != null
    ) || tcgPlayerHistory.some((point) => point.value != null);
  const effectiveMarketDataSource = hasTcgPlayerData ? marketDataSource : "cardmarket";
  const saneActiveCardMarketCurrent = getSaneCardMarketHistorySeriesCurrentValue(
    modalCard.price,
    activeCardMarketHistorySeries,
    modalCard.price_history
  );
  const activeCardMarketCurrentValue = saneActiveCardMarketCurrent.value;
  const hasGradedData =
    gradedPrices.length > 0 ||
    ebaySoldGradedPrices.length > 0 ||
    gradedPriceHistory.some((series) => series.points.some((point) => point.value != null)) ||
    ebaySoldGradedPriceHistory.some((series) => series.points.some((point) => point.value != null));
  const effectiveHistoryChartMode = hasGradedData ? historyChartMode : "market";

  useModalA11y({
    dialogRef: modalFrameRef,
    enabled: !threeDOpen && !priceAlertOpen && !cardMarketPriceCheckOpen,
    initialFocus: "dialog",
    onClose,
  });

  useEffect(() => {
    const frame = modalFrameRef.current;
    if (!frame) return;
    frame.scrollTo({ top: 0, left: 0 });
  }, [modalCard.id]);

  function openThreeDView() {
    if (Date.now() < threeDClosingGuardUntilRef.current) return;
    setThreeDOpen(true);
  }

  function closeThreeDView() {
    threeDClosingGuardUntilRef.current = Date.now() + 300;
    setThreeDOpen(false);
  }

  function applyRefreshedCard(nextCard: ModalCardData) {
    setModalCard({
      ...nextCard,
      collection_item: nextCard.collection_item ?? null,
    });
    setGradedHeroState({
      cardId: nextCard.id,
      price: getPreferredCardModalGradedDisplayPrice(nextCard, nextCard.collection_item),
    });
    setResolvedUrl(null);
  }

  async function waitForSubmittedCardRefresh(signal: AbortSignal): Promise<ModalCardData> {
    const deadline = Date.now() + 180_000;

    while (Date.now() < deadline) {
      await waitForCardRefreshPoll(1_500, signal);
      const statusResponse = await fetch(
        `/api/cards/${encodeURIComponent(modalCard.id)}?refreshStatus=1`,
        { cache: "no-store", signal }
      );
      const statusPayload = (await statusResponse.json().catch(() => null)) as
        | SubmittedCardRefreshStatusResponse
        | null;

      if (!statusResponse.ok || !statusPayload?.refreshJob) {
        throw new Error(
          statusResponse.ok
            ? "The server returned an empty refresh status. Try again."
            : `Could not check the submitted-card refresh (server returned ${statusResponse.status}).`
        );
      }

      if (statusPayload.refreshJob.status === "failed") {
        throw new Error(statusPayload.refreshJob.error ?? "Could not refresh this submitted card.");
      }

      if (statusPayload.refreshJob.status !== "success") continue;

      const cardResponse = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        cache: "no-store",
        signal,
      });
      const cardPayload = (await cardResponse.json().catch(() => null)) as unknown;
      if (!cardResponse.ok || !isModalCardData(cardPayload)) {
        throw new Error(
          cardResponse.ok
            ? "The refreshed card response was empty. Reopen the card to see the new price."
            : `The card refreshed, but reloading it failed (server returned ${cardResponse.status}).`
        );
      }

      return cardPayload;
    }

    throw new Error(
      "This submitted-card refresh is still running in the background. Reopen the card in a moment."
    );
  }

  async function runCardAction(action: "refresh" | "sync-history") {
    if (action === "refresh") {
      setRefreshing(true);
    } else {
      setSyncingHistory(true);
    }
    setRefreshError(null);
    cardActionAbortRef.current?.abort();
    const controller = new AbortController();
    cardActionAbortRef.current = controller;

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = (await response.json().catch(() => null)) as
        | (ModalCardData & { error?: string; activeType?: string })
        | SubmittedCardRefreshStartResponse
        | { error?: string; activeType?: string }
        | null;

      if (!response.ok) {
        throw new Error(
          (data && "error" in data ? data.error : null) ??
            (action === "refresh"
              ? `Could not refresh this card (server returned ${response.status})`
              : `Could not import price history for this card (server returned ${response.status})`)
        );
      }

      if (!data) {
        throw new Error(
          action === "refresh"
            ? "The server connection was interrupted during the refresh. Try again."
            : "The server connection was interrupted during the history import. Try again."
        );
      }

      const refreshedCard = isSubmittedCardRefreshStartResponse(data)
        ? await waitForSubmittedCardRefresh(controller.signal)
        : data;
      if (!isModalCardData(refreshedCard)) {
        throw new Error(
          action === "refresh"
            ? "The server returned an invalid card refresh response. Try again."
            : "The server returned an invalid history response. Try again."
        );
      }

      // The server response is authoritative. In particular, a null value must
      // clear a stale local owned-copy state after a refresh.
      applyRefreshedCard(refreshedCard);
      invalidateMarketHomeClientCache();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setRefreshError(
        error instanceof Error
          ? error.message
          : action === "refresh"
            ? "Could not refresh this card"
            : "Could not import price history for this card"
      );
    } finally {
      if (cardActionAbortRef.current !== controller) return;
      cardActionAbortRef.current = null;
      if (action === "refresh") {
        setRefreshing(false);
      } else {
        setSyncingHistory(false);
      }
    }
  }

  async function refreshModalCardFromServer() {
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setModalCard(data);
      setGradedHeroState({
        cardId: data.id,
        price: getPreferredCardModalGradedDisplayPrice(data, data.collection_item),
      });
      setResolvedUrl(null);
    } catch {
      // The page refresh still updates the backing data; keep the modal usable if this request fails.
    }
  }

  async function researchSignalCard() {
    if (researchingSignal) return;
    setResearchingSignal(true);
    setSignalResearchError(null);
    try {
      const response = await fetch(
        `/api/movers/signal-radar/${encodeURIComponent(modalCard.id)}/research`,
        { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }
      );
      const payload = (await response.json().catch(() => null)) as
        | { ok: true; research: SignalResearchSnapshot }
        | { ok: false; error?: string }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(
          payload && "error" in payload && payload.error
            ? payload.error
            : "Could not build the signal analysis."
        );
      }
      setSignalResearch(payload.research);
    } catch (error) {
      setSignalResearchError(
        error instanceof Error ? error.message : "Could not build the signal analysis."
      );
    } finally {
      setResearchingSignal(false);
    }
  }

  async function removeCurrentCollectionItem() {
    if (!collectionItem || collectionItem.read_only || removingCollectionItem) return;

    const location = collectionItem.for_sale
      ? "For Sale"
      : collectionItem.binder_name ?? "loose singles";
    const confirmed = window.confirm(`Remove this saved copy from ${location}?`);
    if (!confirmed) return;

    setRemovingCollectionItem(true);
    setRefreshError(null);

    try {
      const response = await fetch("/api/collection/cards", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: collectionItem.id }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Could not remove this copy");
      }

      router.refresh();
      onClose();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : "Could not remove this copy");
    } finally {
      setRemovingCollectionItem(false);
    }
  }

  function getCardMarketUrl(): string {
    const stored = resolvedUrl ?? modalCard.cardmarket_url;
    return resolveCardMarketCardUrl({
      id: modalCard.id,
      game: modalCard.game,
      cardmarket_id: modalCard.cardmarket_id,
      cardmarket_url: stored,
    });
  }

  async function openCardMarket() {
    let targetUrl = getCardMarketUrl();
    if (!isDirectCardMarketUrl(targetUrl)) {
      try {
        const res = await fetch(`/api/cm-url?card_id=${encodeURIComponent(modalCard.id)}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = (await res.json()) as { url?: string };
          const direct =
            typeof data.url === "string"
              ? getSafeDirectCardMarketCardUrl(data.url, modalCard.game)
              : null;
          if (direct) {
            setResolvedUrl(direct);
            targetUrl = direct;
          }
        }
      } catch {
        // fall through with proxy URL
      }
    }
    window.open(targetUrl, "_blank", "noopener,noreferrer");
  }

  const storedCardMarketUrl = getCardMarketUrl();
  const previewPanel = (
    <CardDetailMediaSwitcher
      cardName={modalCard.name}
      threeDimensionalAvailable={Boolean(modalCard.image_url)}
      twoDimensional={
        <CardModalPreview
          card={modalCard}
          mediaWidth="100%"
          imageSize={layout.imageSize}
          previewAspectClass={previewAspectClass}
          showGradedPreview={showGradedPreview}
          gradingCompanyLabel={gradingCompanyLabel}
          gradingGradeLabel={gradingGradeLabel}
          gradedTileSize={displaySettings.cardSize}
          onOpenThreeD={openThreeDView}
        />
      }
      renderThreeDimensional={(showTwoDimensional) =>
        modalCard.image_url ? (
          <CardThreeViewer
            key={`${modalCard.id}-inline`}
            card={modalCard}
            frontImageUrl={modalCard.image_url}
            cardMarketUrl={storedCardMarketUrl}
            showGradedSlabPreview={showGradedSlabPreview}
            variant="inline"
            onOpenExpanded={openThreeDView}
            onClose={showTwoDimensional}
          />
        ) : null
      }
    />
  );
  const activeGradedHeroPrice =
    gradedHeroState?.cardId === modalCard.id
      ? gradedHeroState.price
      : getPreferredCardModalGradedDisplayPrice(modalCard, collectionItem);
  const historyPanel = (
    <CardModalHistorySection
      historyChartMode={effectiveHistoryChartMode}
      activeMarketSource={effectiveMarketDataSource}
      cardMarketHistory={cardMarketHistory}
      activeCardMarketCurrentValue={activeCardMarketCurrentValue}
      showTcgPlayerSource={hasTcgPlayerData}
      card={modalCard}
      collectionItem={collectionItem}
      availableCardMarketHistorySeries={availableCardMarketHistorySeries}
      activeCardMarketHistorySeries={activeCardMarketHistorySeries}
      activeCardMarketSeriesLabel={activeCardMarketSeriesLabel}
      onSelectMarketSource={setMarketDataSource}
      onSelectCardMarketHistorySeries={setCardMarketHistorySeries}
      onSelectHistoryChartMode={setHistoryChartMode}
      tcgPlayerHistory={tcgPlayerHistory}
      tcgPlayerCurrentValue={modalCard.price?.tcp_market ?? null}
      gradedPriceHistory={gradedPriceHistory}
      ebaySoldGradedPriceHistory={ebaySoldGradedPriceHistory}
      showCurrentValue={false}
      showModeControl={false}
      showGradedSelectionControl
      selectedGradedDisplayPrice={activeGradedHeroPrice}
      onGradedDisplayPriceChange={(price) => {
        if (price) {
          setGradedHeroState({ cardId: modalCard.id, price });
        }
      }}
    />
  );

  const rawCardMarketValue =
    activeCardMarketCurrentValue ?? modalCard.price?.cm_en_lowest_nm ?? null;
  const showingGradedHero = effectiveHistoryChartMode === "graded" && activeGradedHeroPrice != null;
  const showingTcgPlayerHero =
    effectiveHistoryChartMode === "market" && effectiveMarketDataSource === "tcgplayer";
  const tcgPlayerHeroValue =
    modalCard.price?.tcp_market ?? getLatestSeriesValue(tcgPlayerHistory);
  const tcgPlayerHeroValueEur =
    tcgPlayerHeroValue != null && modalCard.exchange_rate_usd_eur
      ? Number((tcgPlayerHeroValue * modalCard.exchange_rate_usd_eur).toFixed(2))
      : null;
  const heroPriceValue = showingGradedHero
    ? activeGradedHeroPrice.value
    : showingTcgPlayerHero
      ? tcgPlayerHeroValue
      : rawCardMarketValue;
  const heroPriceCurrency = showingGradedHero
    ? activeGradedHeroPrice.currency
    : showingTcgPlayerHero
      ? "USD"
      : "EUR";
  const heroPriceLabel = showingGradedHero
    ? `${activeGradedHeroPrice.sourceLabel} · ${activeGradedHeroPrice.label}`
    : showingTcgPlayerHero
      ? "TCGPlayer raw"
      : `${activeCardMarketSeriesLabel} Near Mint`;
  const average7d = modalCard.price?.cm_en_avg_7d ?? null;
  const average30d = modalCard.price?.cm_en_avg_30d ?? null;
  const trend30d =
    !showingGradedHero && !showingTcgPlayerHero && rawCardMarketValue != null && average30d != null && average30d > 0
      ? ((rawCardMarketValue - average30d) / average30d) * 100
      : null;
  const costBasis = collectionItem?.cost_basis_value ?? collectionItem?.purchase_price ?? null;
  const ownedChange =
    rawCardMarketValue != null && costBasis != null ? rawCardMarketValue - costBasis : null;
  const priceContextKpis = showingGradedHero
    ? [
        {
          label: "Selected grade",
          value: activeGradedHeroPrice.label,
          hint: "Chart series",
          tone: "violet" as const,
        },
        {
          label: "Market source",
          value: activeGradedHeroPrice.sourceLabel,
          hint: activeGradedHeroPrice.hint ?? "Latest saved graded value",
        },
      ]
    : showingTcgPlayerHero
      ? [
          {
            label: "EUR equivalent",
            value: tcgPlayerHeroValueEur == null ? "Unavailable" : `≈ ${formatCurrency(tcgPlayerHeroValueEur, "EUR")}`,
            hint: modalCard.exchange_rate_date
              ? `Reference rate ${modalCard.exchange_rate_date}`
              : "Converted from the USD market price",
            tone: "positive" as const,
          },
          {
            label: "TCGPlayer mid",
            value: formatCurrency(modalCard.price?.tcp_mid ?? null, "USD"),
            hint: "Current midpoint",
            tone: "violet" as const,
          },
          {
            label: "TCGPlayer low",
            value: formatCurrency(modalCard.price?.tcp_low ?? null, "USD"),
            hint: "Current low listing",
          },
        ]
      : [
          {
            label: "7-day average",
            value: formatCurrency(average7d, "EUR"),
            hint: "Short-term market",
            tone: "violet" as const,
          },
          {
            label: "30-day average",
            value: formatCurrency(average30d, "EUR"),
            hint: "Broader baseline",
          },
        ];
  const releaseLabel = modalCard.episode_release_date
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(modalCard.episode_release_date)
      )
    : "Unknown";
  const hasCharacterSubjects = (modalCard.characters?.length ?? 0) > 0;
  const hasWideCharacterSubjects = (modalCard.characters?.length ?? 0) > 1;
  const detailFacts = [
    [
      "Expansion",
      <Link
        key="expansion"
        href={getExpansionHref(modalCard.episode_id)}
        onClick={onClose}
        className="text-[var(--dc-primary)] transition-colors hover:text-[var(--dc-primary-hover)] hover:underline focus-visible:underline"
      >
        {modalCard.episode_name}
      </Link>,
    ],
    ["Card number", modalCard.card_number ? `#${modalCard.card_number}` : "--"],
    ...(modalCard.version ? [["Version", modalCard.version] as const] : []),
    ["Rarity", modalCard.rarity ?? "--"],
    ["Type", [modalCard.supertype, modalCard.subtypes].filter(Boolean).join(" · ") || "--"],
    [
      "Illustrator",
      modalCard.artist ? (
        <Link
          key="artist"
          href={`/illustrators/${encodeURIComponent(modalCard.artist)}`}
          onClick={onClose}
          className="text-[var(--dc-primary)] transition-colors hover:text-[var(--dc-primary-hover)] hover:underline focus-visible:underline"
        >
          {modalCard.artist}
        </Link>
      ) : (
        "--"
      ),
    ],
    ["Release", releaseLabel],
    [
      getCardCharacterFactLabel(modalCard.characters),
      <CardCharacterLinks
        key="characters"
        characters={modalCard.characters}
        hpFallback={modalCard.hp}
        onNavigate={onClose}
      />,
    ],
    [
      "Pull odds",
      modalCard.pull_rate_info?.specific_pull_odds ??
        modalCard.pull_rate_info?.pull_rate_odds ??
        "Unknown",
    ],
  ] as const;

  const overviewPanel = (
    <div
      className="card-detail-section-grid card-detail-overview-grid"
      data-columns="2"
    >
      <section className="card-detail-surface card-detail-profile-overview">
        <h2 className="card-detail-surface-title">Card profile</h2>
        <p className="card-detail-surface-copy">
          The essential printing details, kept in one predictable place.
        </p>
        <dl
          className="card-detail-info-grid mt-4"
          data-has-character-subject={
            hasCharacterSubjects
              ? hasWideCharacterSubjects
                ? "wide"
                : "single"
              : undefined
          }
        >
          {detailFacts.map(([label, value]) => (
            <div
              key={label}
              className={`card-detail-info-cell${
                isCardCharacterFactLabel(label)
                  ? ` card-detail-info-cell--character-subject${
                      hasWideCharacterSubjects
                        ? " card-detail-info-cell--character-subject-wide"
                        : ""
                    }`
                  : label === "Pull odds" && hasWideCharacterSubjects
                    ? " card-detail-info-cell--subject-pull-odds"
                    : ""
              }`}
            >
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <aside className="card-detail-surface card-detail-collector-snapshot">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="card-detail-eyebrow">Collector snapshot</p>
            <h2 className="mt-2 text-lg font-extrabold text-white/92">
              {collectionItem ? "A saved copy with context" : "Ready for your collection"}
            </h2>
          </div>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.07] text-violet-100/76">
            <Sparkles className="h-4 w-4" />
          </span>
        </div>
        <dl className="card-detail-info-grid mt-4">
          <div className="card-detail-info-cell">
            <dt>Status</dt>
            <dd>{collectionItem ? (collectionItem.read_only ? "Shared" : "Owned") : "Not owned"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Condition</dt>
            <dd>{collectionItem?.condition ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Language</dt>
            <dd>{collectionItem?.language ?? "--"}</dd>
          </div>
          <div className="card-detail-info-cell">
            <dt>Location</dt>
            <dd>{collectionItem?.for_sale ? "For sale" : collectionItem?.binder_name ?? "Singles"}</dd>
          </div>
        </dl>
      </aside>
    </div>
  );

  const marketPanel = (
    <div className="card-detail-section-grid" data-columns="2">
      <CardModalMarketSignalPanel
        signal={signalSummary}
        card={modalCard}
        loading={signalSummaryLoading}
        onNavigate={onClose}
        showFullAnalysisLink={false}
      />
      <div className="card-detail-section-grid">
        <CardModalRecentPricesPanel card={modalCard} />
        <EbayCardDemandPanel
          cardId={modalCard.id}
          mode={historyChartMode === "graded" ? "graded" : "raw"}
          onModeChange={(mode) => setHistoryChartMode(mode === "graded" ? "graded" : "market")}
          showModeControl={false}
        />
      </div>
    </div>
  );

  const collectionPanel = (
    <div
      className="card-detail-section-grid card-detail-collection-grid"
      data-columns="2"
    >
      <CardModalOwnedCopyPanel
        card={modalCard}
        collectionItem={collectionItem}
        onAddedToCollection={refreshModalCardFromServer}
        showActions={false}
      />
      <CardModalRelatedPrintingsPanel card={modalCard} onNavigate={onClose} />
    </div>
  );

  const signalTabs = buildCardDetailSignalTabs({
    signal: signalSummary ?? null,
    loading: signalSummaryLoading,
    marketMode: effectiveHistoryChartMode === "graded" ? "graded" : "raw",
    selectedGradeLabel: activeGradedHeroPrice?.label,
    researchResults: signalResearch?.results ?? [],
    researchStatus: researchingSignal
      ? "loading"
      : signalResearchError
        ? "error"
        : signalResearch
          ? "success"
          : "idle",
    researchError: signalResearchError,
    onResearch: () => void researchSignalCard(),
  });

  const tabs: CardDetailTab[] = orderCardDetailTabs("standard", [
    { id: "overview", label: "Overview", content: overviewPanel },
    { id: "market", label: "Market", content: marketPanel },
    { id: "collection", label: "Collection & Reprints", content: collectionPanel },
    ...signalTabs,
  ]);

  return (
    <>
      <div
        data-card-modal-root
        data-card-detail-overlay
        className="dc-modal-overlay dc-sidebar-offset-overlay fixed inset-0 z-[200] flex items-start justify-center overflow-hidden px-0 py-0 sm:px-3 sm:py-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:block md:overflow-y-auto md:p-0"
        style={{ overscrollBehaviorX: "auto", overscrollBehaviorY: "contain" }}
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-full sm:w-[min(100%,calc(100vw-1.5rem))] md:w-full"
          onClick={(event) => event.stopPropagation()}
        >
          <div
            ref={modalFrameRef}
            role="dialog"
            aria-modal="true"
            aria-label={modalCard.name}
            tabIndex={-1}
            className="card-modal-frame dc-modal-panel relative h-dvh max-h-dvh w-full max-w-full overflow-hidden rounded-none border border-white/12 [scrollbar-gutter:stable] shadow-none outline-none sm:overflow-y-auto md:h-auto md:min-h-dvh md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:shadow-none"
            data-modal-size={displaySettings.modalSize}
            data-mobile-showcase="true"
          >
            <CardDetailShell
              mode="standard"
              detailSize={displaySettings.modalSize}
              navigation={{ label: backLabel, onBack: onClose }}
              eyebrow={modalCard.game === "one-piece" ? "One Piece card" : "Pokémon card"}
              title={modalCard.name}
              subtitle={
                <span className="inline-flex max-w-full items-center gap-1.5">
                  <Link
                    href={getExpansionHref(modalCard.episode_id)}
                    onClick={onClose}
                    className="min-w-0 truncate text-inherit transition-colors hover:text-[var(--dc-primary)] hover:underline focus-visible:text-[var(--dc-primary)] focus-visible:underline"
                  >
                    {modalCard.episode_name}
                  </Link>
                  {modalCard.card_number ? (
                    <span className="shrink-0">· #{modalCard.card_number}</span>
                  ) : null}
                </span>
              }
              badges={
                <>
                  {modalCard.rarity ? (
                    <span className="rounded-full border border-violet-300/18 bg-violet-400/[0.075] px-2.5 py-1 text-[11px] font-bold text-violet-100/78">
                      {modalCard.rarity}
                    </span>
                  ) : null}
                  {gradingCompanyLabel && gradingGradeLabel ? (
                    <span className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] font-bold text-white/58">
                      {gradingCompanyLabel} {gradingGradeLabel}
                    </span>
                  ) : null}
                </>
              }
              status={
                refreshError ? (
                  <span className="text-sm font-semibold text-rose-200/78">{refreshError}</span>
                ) : null
              }
              priceLabel={heroPriceLabel}
              price={formatCurrency(heroPriceValue, heroPriceCurrency)}
              priceMeta={
                showingGradedHero ? (
                  activeGradedHeroPrice.hint ?? "Latest saved graded market value"
                ) : showingTcgPlayerHero ? (
                  tcgPlayerHeroValueEur == null
                    ? "Selected TCGPlayer source"
                    : `≈ ${formatCurrency(tcgPlayerHeroValueEur, "EUR")} · converted reference`
                ) : trend30d == null ? (
                  "Latest saved raw market value"
                ) : (
                  <span className={trend30d >= 0 ? "text-emerald-200/78" : "text-rose-200/78"}>
                    {trend30d > 0 ? "+" : ""}{trend30d.toFixed(1)}% vs 30-day average
                  </span>
                )
              }
              marketControls={
                <CardDetailMarketControls
                  mode={effectiveHistoryChartMode === "graded" ? "graded" : "raw"}
                  gradedAvailable={hasGradedData}
                  onModeChange={(mode) =>
                    setHistoryChartMode(mode === "graded" ? "graded" : "market")
                  }
                />
              }
              kpis={[
                ...priceContextKpis,
                {
                  label: collectionItem?.cost_basis_label ?? "Collection",
                  value: collectionItem ? formatCurrency(costBasis, "EUR") : "Not owned",
                  hint:
                    ownedChange == null
                      ? "Add a copy to track value"
                      : `${ownedChange >= 0 ? "+" : ""}${formatCurrency(ownedChange, "EUR")} market change`,
                  tone: ownedChange != null && ownedChange >= 0 ? "positive" : "neutral",
                },
                {
                  label: "Market score",
                  value: modalCard.market_stats ? `${modalCard.market_stats.score}/100` : "Building",
                  hint: modalCard.market_stats?.tier ?? "More evidence needed",
                  tone: "violet",
                  targetTab: "market",
                },
                {
                  label: "Grade score",
                  value:
                    gradePremiumScore != null ? `${Math.round(gradePremiumScore)}/100` : "Building",
                  hint:
                    gradePremiumScore != null
                      ? "Graded vs raw premium"
                      : "No graded evidence yet",
                  tone: "cyan",
                  targetTab: "market",
                },
                {
                  label: topGradedComparison?.label ?? "PSA 10",
                  value:
                    topGradedComparison != null
                      ? formatCurrency(topGradedComparison.price_eur, "EUR")
                      : "--",
                  hint:
                    topGradedComparison != null
                      ? [
                          topGradedComparison.raw_multiple != null
                            ? `${topGradedComparison.raw_multiple.toFixed(1)}x raw`
                            : null,
                          topGradedComparison.source === "ebay_sold"
                            ? "eBay sold"
                            : "CardMarket graded",
                        ]
                          .filter(Boolean)
                          .join(" · ")
                      : "No graded sales yet",
                  tone: "neutral",
                  targetTab: "market",
                },
              ]}
              media={previewPanel}
              mediaActions={
                <div className="card-detail-market-links">
                  <button type="button" onClick={() => void openCardMarket()} className="card-detail-market-link">
                    CardMarket <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                  <a
                    href={buildCardEbaySearchUrl({
                      name: modalCard.name,
                      cardNumber: modalCard.card_number,
                      gradingCompany: gradingCompanyLabel,
                      gradingGrade: gradingGradeLabel,
                    })}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="card-detail-market-link"
                  >
                    eBay Deals <ArrowUpRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              }
              chart={historyPanel}
              heroSupplement={
                (modalCard.sealed_product_count ?? modalCard.sealed_products?.length ?? 0) > 0 ? (
                  <CardModalActiveListingsPanel
                    card={modalCard}
                    onOpenSealedProduct={setSelectedSealedProduct}
                    onClose={onClose}
                    compact
                  />
                ) : null
              }
              actions={
                <CardModalDesktopActionGroup
                  card={modalCard}
                  collectionItem={collectionItem}
                  isBusy={isBusy}
                  refreshing={refreshing}
                  syncingHistory={syncingHistory}
                  canManageCardPrices={canManageCardPrices}
                  removingCollectionItem={removingCollectionItem}
                  onRefresh={() => void runCardAction("refresh")}
                  onLivePriceCheck={() => setCardMarketPriceCheckOpen(true)}
                  onSyncHistory={() => void runCardAction("sync-history")}
                  onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                  onAddedToCollection={refreshModalCardFromServer}
                  onCollectionItemSaved={onCollectionItemSaved}
                  onClose={onClose}
                  cardMarketHref={storedCardMarketUrl}
                  onOpenCardMarket={() => void openCardMarket()}
                  onPriceAlertOpenChange={setPriceAlertOpen}
                  sharePrice={heroPriceValue}
                  shareCurrency={heroPriceCurrency}
                />
              }
              tabs={tabs}
              mobileChartTabs={["market"]}
              mobileChartAlwaysVisible
            />
          </div>
        </div>
      </div>

      {threeDOpen && modalCard.image_url && (
        <CardThreeViewer
          key={modalCard.id}
          card={modalCard}
          frontImageUrl={modalCard.image_url}
          cardMarketUrl={storedCardMarketUrl}
          showGradedSlabPreview={showGradedSlabPreview}
          onClose={closeThreeDView}
        />
      )}

      {selectedSealedProduct ? (
        <SealedProductModal
          product={selectedSealedProduct}
          onClose={() => setSelectedSealedProduct(null)}
        />
      ) : null}

      {cardMarketPriceCheckOpen ? (
        <CardMarketPriceCheckDialog
          card={modalCard}
          onClose={() => setCardMarketPriceCheckOpen(false)}
          onSaved={(nextCard) => {
            applyRefreshedCard(nextCard);
            invalidateMarketHomeClientCache();
          }}
        />
      ) : null}
    </>
  );
}

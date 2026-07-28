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

export type { ModalCardData } from "./card-modal/types";

const CardThreeViewer = dynamic(() => import("@/app/expansions/[id]/CardThreeViewer"), {
  ssr: false,
  loading: () => null,
});
const SealedProductModal = dynamic(() => import("@/components/SealedProductModal"), {
  ssr: false,
  loading: () => null,
});

interface Props {
  card: ModalCardData;
  showGradedSlabPreview?: boolean;
  backLabel?: string;
  onClose: () => void;
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
  onClose,
}: Props) {
  useBodyScrollLock();
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
  const [modalCard, setModalCard] = useState(card);
  const [gradedHeroState, setGradedHeroState] = useState<{
    cardId: string;
    price: CardModalGradedDisplayPrice | null;
  }>(() => ({
    cardId: card.id,
    price: getPreferredCardModalGradedDisplayPrice(card, card.collection_item),
  }));
  const { displaySettings, currentUserRole } = useSettings();
  const [threeDOpen, setThreeDOpen] = useState(false);
  const [priceAlertOpen, setPriceAlertOpen] = useState(false);
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
    "cardmarket"
  );
  const [cardMarketHistorySeries, setCardMarketHistorySeries] =
    useState<CardMarketHistorySeriesKey>("cm_market_en");
  const modalFrameRef = useRef<HTMLDivElement | null>(null);
  const threeDClosingGuardUntilRef = useRef(0);

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

      onClose();
    };

    window.addEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
    return () => window.removeEventListener(MOBILE_EDGE_BACK_EVENT, handleMobileEdgeBack);
  }, [onClose, priceAlertOpen, selectedSealedProduct, threeDOpen]);

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
    enabled: !threeDOpen && !priceAlertOpen,
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

  async function runCardAction(action: "refresh" | "sync-history") {
    if (action === "refresh") {
      setRefreshing(true);
    } else {
      setSyncingHistory(true);
    }
    setRefreshError(null);

    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(modalCard.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action }),
        cache: "no-store",
      });
      const data = (await response.json()) as ModalCardData & {
        error?: string;
        activeType?: string;
      };

      if (!response.ok) {
        throw new Error(
          data.error ??
            (action === "refresh"
              ? "Could not refresh this card"
              : "Could not import price history for this card")
        );
      }

      // The server response is authoritative. In particular, a null value must
      // clear a stale local owned-copy state after a refresh.
      const nextCard = {
        ...data,
        collection_item: data.collection_item ?? null,
      };
      setModalCard(nextCard);
      setGradedHeroState({
        cardId: nextCard.id,
        price: getPreferredCardModalGradedDisplayPrice(nextCard, nextCard.collection_item),
      });
      setResolvedUrl(null);
    } catch (error) {
      setRefreshError(
        error instanceof Error
          ? error.message
          : action === "refresh"
            ? "Could not refresh this card"
            : "Could not import price history for this card"
      );
    } finally {
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
            onClose={showTwoDimensional}
          />
        ) : null
      }
    />
  );
  const activeGradedHeroPrice =
    gradedHeroState.cardId === modalCard.id
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
        className="text-violet-200/82 transition hover:text-white"
      >
        {modalCard.episode_name}
      </Link>,
    ],
    ["Card number", modalCard.card_number ? `#${modalCard.card_number}` : "--"],
    ...(modalCard.version ? [["Version", modalCard.version] as const] : []),
    ["Rarity", modalCard.rarity ?? "--"],
    [
      "Illustrator",
      modalCard.artist ? (
        <Link
          key="artist"
          href={`/illustrators/${encodeURIComponent(modalCard.artist)}`}
          onClick={onClose}
          className="text-violet-200/82 transition hover:text-white"
        >
          {modalCard.artist}
        </Link>
      ) : (
        "--"
      ),
    ],
    ["Type", [modalCard.supertype, modalCard.subtypes].filter(Boolean).join(" · ") || "--"],
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
    <div className="card-detail-section-grid" data-columns="2">
      <section className="card-detail-surface">
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

      <section className="card-detail-surface">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="card-detail-eyebrow">Collector snapshot</p>
            <h2 className="mt-2 text-xl font-extrabold text-white/92">
              {collectionItem ? "A saved copy with context" : "Ready for your collection"}
            </h2>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-violet-300/16 bg-violet-400/[0.07] text-violet-100/76">
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

      </section>
      <CardModalRelatedPrintingsPanel card={modalCard} onNavigate={onClose} />
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
      <CardModalActiveListingsPanel
        card={modalCard}
        onOpenSealedProduct={setSelectedSealedProduct}
        onClose={onClose}
      />
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
    { id: "collection", label: "Collection", content: collectionPanel },
    ...signalTabs,
  ]);

  return (
    <>
      <div
        data-card-modal-root
        className="dc-modal-overlay dc-sidebar-offset-overlay fixed inset-0 z-[200] flex items-start justify-center overflow-hidden bg-[#050507] px-0 py-0 sm:px-3 sm:py-[calc(0.75rem+env(safe-area-inset-top,0px))] sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] md:block md:overflow-y-auto md:bg-[#08080c] md:p-0"
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
            className="card-modal-frame dc-modal-panel relative h-dvh max-h-dvh w-full max-w-full overflow-hidden rounded-none border border-white/12 bg-[#050506] [scrollbar-gutter:stable] shadow-none outline-none sm:overflow-y-auto md:h-auto md:min-h-dvh md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:bg-[#050505] md:shadow-none"
            data-modal-size={displaySettings.modalSize}
            data-mobile-showcase="true"
          >
            <CardDetailShell
              mode="standard"
              detailSize={displaySettings.modalSize}
              navigation={{ label: backLabel, onBack: onClose }}
              eyebrow={modalCard.game === "one-piece" ? "One Piece card" : "Pokémon card"}
              title={modalCard.name}
              subtitle={[
                modalCard.episode_name,
                modalCard.card_number ? `#${modalCard.card_number}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
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
                  "Selected TCGPlayer source"
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
                  onSyncHistory={() => void runCardAction("sync-history")}
                  onRemoveCollectionItem={() => void removeCurrentCollectionItem()}
                  onAddedToCollection={refreshModalCardFromServer}
                  onClose={onClose}
                  cardMarketHref={storedCardMarketUrl}
                  onOpenCardMarket={() => void openCardMarket()}
                  onPriceAlertOpenChange={setPriceAlertOpen}
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
    </>
  );
}

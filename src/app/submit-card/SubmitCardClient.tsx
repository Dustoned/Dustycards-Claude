"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ExternalLink, Loader2, Search, Sparkles } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { COLLECTION_CONDITIONS } from "@/lib/collection";
import {
  getExpansionHref,
  getGameLabel,
  getGameSearchParamValue,
  type TradingCardGame,
} from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";

type SubmissionStatus =
  | "preview"
  | "duplicate"
  | "failed"
  | "added"
  | "deleted"
  | "migrated_to_tcggo"
  | "possible_tcggo_match";

interface SubmissionPreview {
  id: string;
  status: SubmissionStatus;
  game: TradingCardGame;
  canSave: boolean;
  duplicateCard: {
    id: string;
    game: TradingCardGame;
    name: string;
    episodeId: string;
    episodeName: string;
    cardNumber: string | null;
    imageUrl: string | null;
  } | null;
  duplicateCards: Array<{
    id: string;
    game: TradingCardGame;
    name: string;
    episodeId: string;
    episodeName: string;
    cardNumber: string | null;
    imageUrl: string | null;
  }>;
  canForceFirecrawl: boolean;
  card: {
    name: string;
    setName: string;
    cardNumber: string | null;
    cardmarketUrl: string | null;
    imageUrl: string | null;
    language: "English" | "Japanese" | null;
    condition: string;
    nmPriceEur: number | null;
    gradedPrices: Array<{ label: string; price: number }>;
    confidence: number | null;
  };
  firecrawl: {
    creditsUsed: number;
    monthlyBudget: number;
    monthlyUsed: number;
    dailyAttemptsUsed: number;
  };
  warnings: string[];
  error: string | null;
}

interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

interface SavedSubmittedCard {
  id: string;
  name: string;
  image_url: string | null;
  condition: string;
  price_eur: number | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
  };
}

interface UserSubmittedCardItem {
  id: string;
  game: TradingCardGame;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
  card: {
    id: string;
    name: string;
    setName: string;
    episodeId: string;
    episodeCode: string | null;
    cardNumber: string | null;
    imageUrl: string | null;
    cardmarketUrl: string | null;
    language: "English" | "Japanese" | null;
    condition: string;
    priceEur: number | null;
    gradedPrices: Array<{ label: string; price: number }>;
  };
}

interface FirecrawlUsage {
  configured: boolean;
  monthlyBudget: number;
  monthlyOffset: number;
  monthlyUsed: number;
  monthlyRemaining: number;
  dailyAttemptLimit: number;
  dailyAttemptsUsed: number;
}

function fieldClass() {
  return "w-full rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2.5 text-sm font-semibold text-white outline-none transition placeholder:text-white/30 focus:border-violet-400/50 focus:ring-2 focus:ring-violet-400/10";
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/38">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-white">{value}</p>
    </div>
  );
}

export default function SubmitCardClient() {
  const [game, setGame] = useState<TradingCardGame>("pokemon");
  const [name, setName] = useState("");
  const [setNameValue, setSetNameValue] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardmarketUrl, setCardmarketUrl] = useState("");
  const [condition, setCondition] = useState("Near Mint");
  const [preview, setPreview] = useState<SubmissionPreview | null>(null);
  const [savedCard, setSavedCard] = useState<SavedSubmittedCard | null>(null);
  const [submittedCards, setSubmittedCards] = useState<UserSubmittedCardItem[]>([]);
  const [submittedLoading, setSubmittedLoading] = useState(true);
  const [firecrawlUsage, setFirecrawlUsage] = useState<FirecrawlUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [nameSuggestions, setNameSuggestions] = useState<string[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState<"preview" | "save" | null>(null);

  async function loadFirecrawlUsage(options?: { quiet?: boolean }) {
    if (!options?.quiet) setUsageLoading(true);
    try {
      const response = await fetch("/api/card-submissions/firecrawl-usage", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse<FirecrawlUsage>;
      setFirecrawlUsage(response.ok && data.ok && data.result ? data.result : null);
    } catch {
      setFirecrawlUsage(null);
    } finally {
      setUsageLoading(false);
    }
  }

  async function loadSubmittedCards() {
    setSubmittedLoading(true);
    try {
      const response = await fetch("/api/card-submissions", { cache: "no-store" });
      const data = (await response.json()) as ApiResponse<UserSubmittedCardItem[]>;
      if (!response.ok || !data.ok || !data.result) {
        setSubmittedCards([]);
        return;
      }
      setSubmittedCards(data.result);
    } catch {
      setSubmittedCards([]);
    } finally {
      setSubmittedLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialSubmittedCards() {
      try {
        const response = await fetch("/api/card-submissions", { cache: "no-store" });
        const data = (await response.json()) as ApiResponse<UserSubmittedCardItem[]>;
        if (cancelled) return;
        setSubmittedCards(response.ok && data.ok && data.result ? data.result : []);
      } catch {
        if (!cancelled) setSubmittedCards([]);
      } finally {
        if (!cancelled) setSubmittedLoading(false);
      }
    }

    async function loadInitialFirecrawlUsage() {
      try {
        const response = await fetch("/api/card-submissions/firecrawl-usage", { cache: "no-store" });
        const data = (await response.json()) as ApiResponse<FirecrawlUsage>;
        if (cancelled) return;
        setFirecrawlUsage(response.ok && data.ok && data.result ? data.result : null);
      } catch {
        if (!cancelled) setFirecrawlUsage(null);
      } finally {
        if (!cancelled) setUsageLoading(false);
      }
    }

    void loadInitialSubmittedCards();
    void loadInitialFirecrawlUsage();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(async () => {
      setSuggestionsLoading(true);
      try {
        const params = new URLSearchParams({ q: query, game });
        const response = await fetch(`/api/card-submissions/name-suggestions?${params.toString()}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as ApiResponse<string[]>;
        if (cancelled) return;
        setNameSuggestions(response.ok && data.ok && data.result ? data.result : []);
      } catch {
        if (!cancelled) setNameSuggestions([]);
      } finally {
        if (!cancelled) setSuggestionsLoading(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [game, name]);

  async function runPreview(event?: React.FormEvent<HTMLFormElement>, options?: { skipDuplicateCheck?: boolean }) {
    event?.preventDefault();
    setLoading("preview");
    setStatus(options?.skipDuplicateCheck ? "Running Firecrawl preview..." : "Checking local cards first...");
    setPreview(null);
    setSavedCard(null);

    try {
      const response = await fetch("/api/card-submissions/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          game,
          setName: setNameValue,
          cardNumber,
          cardmarketUrl,
          condition,
          skipDuplicateCheck: options?.skipDuplicateCheck ?? false,
        }),
      });
      const data = (await response.json()) as ApiResponse<SubmissionPreview>;
      if (!response.ok || !data.ok || !data.result) {
        setStatus(data.error ?? "Preview failed.");
        return;
      }

      const result = data.result;
      setPreview(result);
      setFirecrawlUsage((current) =>
        current
          ? {
              ...current,
              monthlyBudget: result.firecrawl.monthlyBudget,
              monthlyUsed: result.firecrawl.monthlyUsed,
              monthlyRemaining: Math.max(
                0,
                result.firecrawl.monthlyBudget - result.firecrawl.monthlyUsed
              ),
              dailyAttemptsUsed: result.firecrawl.dailyAttemptsUsed,
            }
          : current
      );
      void loadFirecrawlUsage({ quiet: true });
      setStatus(
        result.status === "duplicate"
          ? `Found ${result.duplicateCards.length || 1} possible existing card${
              (result.duplicateCards.length || 1) === 1 ? "" : "s"
            }.`
          : result.canSave
            ? "Preview ready."
            : result.error ?? "Preview needs more data before saving."
      );
    } catch {
      setStatus("Network error while previewing the card.");
    } finally {
      setLoading(null);
    }
  }

  async function savePreview() {
    if (!preview?.canSave) return;
    setLoading("save");
    setStatus("Saving submitted card to your collection...");

    try {
      const response = await fetch(`/api/card-submissions/${encodeURIComponent(preview.id)}/save`, {
        method: "POST",
      });
      const data = (await response.json()) as ApiResponse<{
        cardId: string;
        episodeId: string;
        collectionItemId: string | null;
      }>;
      if (!response.ok || !data.ok || !data.result) {
        setStatus(data.error ?? "Saving failed.");
        return;
      }

      setStatus("Card saved to your collection.");
      setSavedCard({
        id: data.result.cardId,
        name: preview.card.name,
        image_url: preview.card.imageUrl,
        condition: preview.card.condition,
        price_eur: preview.card.nmPriceEur,
        episode: {
          id: data.result.episodeId,
          name: preview.card.setName,
          code: null,
        },
      });
      setPreview((current) => (current ? { ...current, status: "added", canSave: false } : current));
      await loadSubmittedCards();
    } catch {
      setStatus("Network error while saving the card.");
    } finally {
      setLoading(null);
    }
  }

  const duplicateCards = preview?.duplicateCards?.length
    ? preview.duplicateCards
    : preview?.duplicateCard
      ? [preview.duplicateCard]
      : [];
  const gameLabel = getGameLabel(game);
  const savedCardHref = savedCard
    ? `${getExpansionHref(savedCard.episode.id)}?card=${encodeURIComponent(savedCard.id)}`
    : null;
  const savedSearchGame = preview ? getGameSearchParamValue(preview.game) : getGameSearchParamValue(game);
  const savedSearchHref =
    preview || savedCard
      ? `/search?q=${encodeURIComponent(savedCard?.name ?? preview?.card.name ?? name)}${
          savedSearchGame ? `&game=${encodeURIComponent(savedSearchGame)}` : ""
        }`
      : null;
  const usageMonthlyBudget = firecrawlUsage?.monthlyBudget ?? preview?.firecrawl.monthlyBudget ?? 1000;
  const usageMonthlyOffset = firecrawlUsage?.monthlyOffset ?? 0;
  const usageMonthlyUsed = firecrawlUsage?.monthlyUsed ?? preview?.firecrawl.monthlyUsed ?? 0;
  const usageMonthlyRemaining =
    firecrawlUsage?.monthlyRemaining ?? Math.max(0, usageMonthlyBudget - usageMonthlyUsed);
  const usageDailyLimit = firecrawlUsage?.dailyAttemptLimit ?? 3;
  const usageDailyUsed = firecrawlUsage?.dailyAttemptsUsed ?? preview?.firecrawl.dailyAttemptsUsed ?? 0;
  const usagePercent =
    usageMonthlyBudget > 0
      ? Math.min(100, Math.max(0, (usageMonthlyUsed / usageMonthlyBudget) * 100))
      : 0;
  const nameSuggestionQuery = name.trim();
  const visibleNameSuggestions = nameSuggestionQuery.length >= 2 ? nameSuggestions : [];
  const showSuggestionsLoading = nameSuggestionQuery.length >= 2 && suggestionsLoading;

  return (
    <div className="grid gap-4">
      <section className="glass min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-5 shadow-md shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Firecrawl credits</h2>
            <p className="mt-1 text-sm leading-5 text-white/45">
              Monthly submit usage for CardMarket previews.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFirecrawlUsage()}
            disabled={usageLoading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold text-white/72 transition hover:bg-white/[0.09] hover:text-white disabled:cursor-wait disabled:opacity-50"
          >
            {usageLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Refresh
          </button>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <StatPill
            label="This month"
            value={
              usageLoading && !firecrawlUsage
                ? "Loading..."
                : `${usageMonthlyUsed.toLocaleString("en-US")} / ${usageMonthlyBudget.toLocaleString("en-US")}`
            }
          />
          <StatPill
            label="Offset"
            value={
              usageLoading && !firecrawlUsage
                ? "Loading..."
                : usageMonthlyOffset.toLocaleString("en-US")
            }
          />
          <StatPill
            label="Remaining"
            value={
              usageLoading && !firecrawlUsage
                ? "Loading..."
                : usageMonthlyRemaining.toLocaleString("en-US")
            }
          />
          <StatPill
            label="Today"
            value={
              usageLoading && !firecrawlUsage
                ? "Loading..."
                : `${usageDailyUsed.toLocaleString("en-US")} / ${usageDailyLimit.toLocaleString("en-US")} attempts`
            }
          />
          <StatPill
            label="API"
            value={usageLoading && !firecrawlUsage ? "Loading..." : firecrawlUsage?.configured ? "Ready" : "Missing key"}
          />
        </div>

        <div className="mt-4 h-2 overflow-hidden rounded-full border border-white/8 bg-black/28">
          <div
            className="h-full rounded-full bg-violet-500 transition-[width]"
            style={{ width: `${usagePercent}%` }}
          />
        </div>

        {firecrawlUsage && !firecrawlUsage.configured ? (
          <p className="mt-3 rounded-xl border border-amber-300/14 bg-amber-300/[0.055] px-3 py-2 text-xs font-semibold leading-5 text-amber-100">
            Firecrawl API key is missing on this server.
          </p>
        ) : null}
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <form
        onSubmit={runPreview}
        className="glass min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-5 shadow-md shadow-black/20"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Card details</h2>
            <p className="mt-1 text-sm leading-5 text-white/45">
              Name and card number are enough. Set is optional, but helps if you know it.
            </p>
          </div>
          <Search className="h-5 w-5 shrink-0 text-violet-200" />
        </div>

        <div className="mt-5 grid gap-3">
          <div className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              Game
            </span>
            <div className="grid grid-cols-2 gap-2 rounded-xl border border-white/10 bg-black/18 p-1">
              {(["pokemon", "one-piece"] as TradingCardGame[]).map((option) => {
                const active = game === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setGame(option);
                      setNameSuggestions([]);
                    }}
                    className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                      active
                        ? "bg-violet-600 text-white shadow-md shadow-violet-950/25"
                        : "text-white/55 hover:bg-white/[0.055] hover:text-white"
                    }`}
                  >
                    {getGameLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              Card name
            </span>
            <div className="relative">
              <input
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onBlur={() => {
                  window.setTimeout(() => setSuggestionsOpen(false), 120);
                }}
                className={`${fieldClass()} pr-10`}
                placeholder={game === "one-piece" ? "Monkey.D.Luffy" : "Umbreon ex"}
                autoComplete="off"
                required
              />
              <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-white/35">
                {showSuggestionsLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
              {suggestionsOpen && visibleNameSuggestions.length > 0 ? (
                <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 overflow-hidden rounded-xl border border-white/10 bg-[#111116] p-1 shadow-2xl shadow-black/45">
                  {visibleNameSuggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setName(suggestion);
                        setSuggestionsOpen(false);
                      }}
                      className="block w-full truncate rounded-lg px-3 py-2 text-left text-sm font-semibold text-white/75 transition hover:bg-violet-500/16 hover:text-white"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              Number
            </span>
            <input
              value={cardNumber}
              onChange={(event) => setCardNumber(event.target.value)}
              className={fieldClass()}
              placeholder={game === "one-piece" ? "OP01-024" : "161/131"}
              required
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              Set name
              <span className="ml-1 text-white/28">Optional</span>
            </span>
            <input
              value={setNameValue}
              onChange={(event) => setSetNameValue(event.target.value)}
              className={fieldClass()}
              placeholder={game === "one-piece" ? "Romance Dawn" : "Prismatic Evolutions"}
            />
          </label>

          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
              Condition
              <span className="ml-1 text-white/28">Optional</span>
            </span>
            <select
              value={condition}
              onChange={(event) => setCondition(event.target.value)}
              className={fieldClass()}
            >
              {COLLECTION_CONDITIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-3">
            <label className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-white/38">
                CardMarket URL
                <span className="ml-1 text-white/28">Optional</span>
              </span>
              <input
                value={cardmarketUrl}
                onChange={(event) => setCardmarketUrl(event.target.value)}
                className={fieldClass()}
                placeholder="Optional, saves a search"
              />
            </label>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading != null}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-400/35 bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-violet-950/25 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {loading === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Preview {gameLabel}
        </button>

        {status ? <p className="mt-3 text-sm text-white/55">{status}</p> : null}
        </form>

        <section className="glass min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-5 shadow-md shadow-black/20">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-white">Preview</h2>
            <p className="mt-1 text-sm leading-5 text-white/45">
              Save only appears when the scrape found an image and EN/JP Near Mint price.
            </p>
          </div>
          {preview?.canSave ? (
            <Check className="h-5 w-5 shrink-0 text-emerald-300" />
          ) : (
            <AlertTriangle className="h-5 w-5 shrink-0 text-white/35" />
          )}
        </div>

        {!preview ? (
          <div className="mt-5 rounded-2xl border border-dashed border-white/10 bg-black/15 p-8 text-center text-sm text-white/45">
            Submit a card to see the CardMarket preview here.
          </div>
        ) : preview.status === "duplicate" && duplicateCards.length > 0 ? (
          <div className="mt-5 rounded-2xl border border-amber-300/18 bg-amber-300/[0.07] p-4">
            <p className="text-sm font-bold text-amber-100">Possible existing cards</p>
            <p className="mt-1 text-sm leading-5 text-white/62">
              Check these variants first. If your exact variant is missing, use the CardMarket URL
              for the best match.
            </p>

            {preview.warnings.length > 0 ? (
              <div className="mt-3 grid gap-2">
                {preview.warnings.map((warning) => (
                  <p
                    key={warning}
                    className="rounded-xl border border-amber-300/18 bg-black/18 px-3 py-2 text-xs font-semibold leading-5 text-amber-100"
                  >
                    {warning}
                  </p>
                ))}
              </div>
            ) : null}

            <div className="mt-4 grid gap-2">
              {duplicateCards.map((card) => {
                const href = `${getExpansionHref(card.episodeId)}?card=${encodeURIComponent(card.id)}`;
                return (
                  <Link
                    key={card.id}
                    href={href}
                    className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-white/10 bg-black/16 p-2 transition hover:bg-white/[0.055]"
                  >
                    <div className="aspect-[5/7] overflow-hidden rounded-lg border border-white/10 bg-black/24">
                      {card.imageUrl ? (
                        <Image
                          src={getCachedImageUrl(card.imageUrl) ?? card.imageUrl}
                          alt={card.name}
                          width={88}
                          height={124}
                          className="h-full w-full object-cover"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{card.name}</p>
                      <p className="mt-0.5 truncate text-xs font-semibold text-white/48">
                        {card.episodeName}
                        {card.cardNumber ? ` / #${card.cardNumber}` : ""}
                      </p>
                    </div>
                    <ExternalLink className="h-4 w-4 text-white/45" />
                  </Link>
                );
              })}
            </div>

            {preview.canForceFirecrawl ? (
              <button
                type="button"
                disabled={loading != null}
                onClick={() => void runPreview(undefined, { skipDuplicateCheck: true })}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-300/28 bg-violet-500/18 px-4 py-3 text-sm font-bold text-violet-100 transition hover:bg-violet-500/24 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              >
                {loading === "preview" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                My variant is missing
              </button>
            ) : preview.warnings.length === 0 ? (
              <p className="mt-4 rounded-xl border border-white/10 bg-black/16 px-3 py-2 text-xs font-semibold leading-5 text-white/48">
                Paste the exact CardMarket URL if this is a different variant.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[150px_minmax(0,1fr)]">
            <div className="aspect-[5/7] overflow-hidden rounded-2xl border border-white/10 bg-black/24">
              {preview.card.imageUrl ? (
                <Image
                  src={getCachedImageUrl(preview.card.imageUrl) ?? preview.card.imageUrl}
                  alt={preview.card.name}
                  width={300}
                  height={420}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xs font-semibold text-white/35">
                  No image
                </div>
              )}
            </div>

            <div className="min-w-0">
              <p className="text-2xl font-black tracking-tight text-white">{preview.card.name}</p>
              <p className="mt-1 text-sm font-semibold text-white/50">
                {getGameLabel(preview.game)} / {preview.card.setName}
                {preview.card.cardNumber ? ` / #${preview.card.cardNumber}` : ""}
              </p>

              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                <StatPill
                  label={`${preview.card.condition} price`}
                  value={formatCurrency(preview.card.nmPriceEur, "EUR")}
                />
                <StatPill label="Language" value={preview.card.language ?? "--"} />
                <StatPill label="Graded comments" value={String(preview.card.gradedPrices.length)} />
                <StatPill
                  label="Monthly credits"
                  value={`${preview.firecrawl.monthlyUsed}/${preview.firecrawl.monthlyBudget}`}
                />
              </div>

              {preview.firecrawl.creditsUsed === 0 ? (
                <p className="mt-2 text-xs font-semibold text-white/38">
                  This preview used 0 new credits.
                </p>
              ) : null}

              {preview.card.cardmarketUrl ? (
                <a
                  href={preview.card.cardmarketUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex max-w-full items-center gap-2 truncate rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/[0.08] hover:text-white"
                >
                  <span className="truncate">CardMarket page</span>
                  <ExternalLink className="h-4 w-4 shrink-0" />
                </a>
              ) : null}

              {preview.warnings.length > 0 ? (
                <div className="mt-4 grid gap-2">
                  {preview.warnings.map((warning) => (
                    <p
                      key={warning}
                      className="rounded-xl border border-amber-300/14 bg-amber-300/[0.055] px-3 py-2 text-xs font-semibold leading-5 text-amber-100"
                    >
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}

              <button
                type="button"
                onClick={() => void savePreview()}
                disabled={!preview.canSave || loading != null}
                className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-300/24 bg-emerald-500/16 px-4 py-3 text-sm font-bold text-emerald-100 transition hover:bg-emerald-500/22 disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
              >
                {loading === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Save card
              </button>

              {preview.status === "added" && savedCard ? (
                <div className="mt-5 rounded-2xl border border-emerald-300/18 bg-emerald-300/[0.065] p-4">
                  <p className="text-sm font-bold text-emerald-100">Saved to collection</p>
                  <p className="mt-1 text-sm leading-5 text-white/58">
                    This card is now searchable, has its own set/card page, and was added to your
                    collection.
                  </p>
                  <p className="mt-1 text-xs font-semibold text-white/42">
                    Default add condition: {savedCard.condition}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {savedCardHref ? (
                      <Link
                        href={savedCardHref}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-white/78 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        Open card
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {savedSearchHref ? (
                      <Link
                        href={savedSearchHref}
                        className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-bold text-white/78 transition hover:bg-white/[0.1] hover:text-white"
                      >
                        Search
                        <Search className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <CollectionAddCardButton
                      card={savedCard}
                      mode="button"
                      label="Add another copy"
                      defaultCondition={savedCard.condition}
                      defaultPurchasePrice={savedCard.price_eur}
                      className="rounded-xl border-emerald-300/24 bg-emerald-400/14 px-3 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/20"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
        </section>
      </div>

      <section className="glass min-w-0 rounded-2xl border border-white/8 bg-white/[0.035] p-5 shadow-md shadow-black/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Your submitted cards</h2>
            <p className="mt-1 text-sm leading-5 text-white/45">
              These are your Firecrawl cards. Saved cards are added to your collection automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadSubmittedCards()}
            className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-sm font-bold text-white/72 transition hover:bg-white/[0.09] hover:text-white"
          >
            Reload
          </button>
        </div>

        {submittedLoading ? (
          <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/8 bg-black/16 p-4 text-sm text-white/45">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading submitted cards...
          </div>
        ) : submittedCards.length === 0 ? (
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-black/15 p-5 text-sm text-white/45">
            No submitted cards saved yet.
          </div>
        ) : (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {submittedCards.map((item) => {
              const href = `${getExpansionHref(item.card.episodeId)}?card=${encodeURIComponent(item.card.id)}`;
              return (
                <div
                  key={item.id}
                  className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 rounded-2xl border border-white/8 bg-black/16 p-3"
                >
                  <Link
                    href={href}
                    className="aspect-[5/7] overflow-hidden rounded-xl border border-white/10 bg-black/24"
                  >
                    {item.card.imageUrl ? (
                      <Image
                        src={getCachedImageUrl(item.card.imageUrl) ?? item.card.imageUrl}
                        alt={item.card.name}
                        width={128}
                        height={180}
                        className="h-full w-full object-cover"
                        unoptimized
                      />
                    ) : null}
                  </Link>
                  <div className="min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <Link href={href} className="block truncate text-sm font-black text-white">
                          {item.card.name}
                        </Link>
                        <p className="mt-0.5 truncate text-xs font-semibold text-white/45">
                          {item.card.setName}
                          {item.card.cardNumber ? ` / #${item.card.cardNumber}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full border border-cyan-300/18 bg-cyan-300/[0.08] px-2 py-1 text-[10px] font-bold text-cyan-100">
                        {getGameLabel(item.game)}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-white/8 bg-white/[0.045] px-2 py-1 text-[10px] font-bold text-white/55">
                        {item.card.condition}
                      </span>
                      <span className="rounded-full border border-emerald-300/16 bg-emerald-300/[0.08] px-2 py-1 text-[10px] font-bold text-emerald-100">
                        {formatCurrency(item.card.priceEur, "EUR")}
                      </span>
                      {item.card.gradedPrices.length > 0 ? (
                        <span className="rounded-full border border-violet-300/16 bg-violet-300/[0.08] px-2 py-1 text-[10px] font-bold text-violet-100">
                          {item.card.gradedPrices.length} graded
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Link
                        href={href}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-bold text-white/72 transition hover:bg-white/[0.09] hover:text-white"
                      >
                        Open
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                      <CollectionAddCardButton
                        card={{
                          id: item.card.id,
                          name: item.card.name,
                          image_url: item.card.imageUrl,
                          episode: {
                            id: item.card.episodeId,
                            name: item.card.setName,
                            code: item.card.episodeCode,
                          },
                        }}
                        mode="button"
                        label="Add copy"
                        defaultCondition={item.card.condition}
                        defaultPurchasePrice={item.card.priceEur}
                        className="rounded-xl border-emerald-300/24 bg-emerald-400/14 px-3 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-400/20"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

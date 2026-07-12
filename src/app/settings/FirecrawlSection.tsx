"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  BookOpen,
  Flame,
  Globe2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type {
  FirecrawlConfigSnapshot,
  FirecrawlDocsSearchResult,
  FirecrawlScrapeResult,
} from "@/lib/firecrawl";
import { COLLECTION_CONDITIONS } from "@/lib/collection";
import { formatCurrency } from "@/lib/format";
import { getGameLabel, getGameSearchParamValue, type TradingCardGame } from "@/lib/games";
import { getCachedImageUrl } from "@/lib/image-cache";

type FirecrawlAction = "docs-search" | "scrape";

interface FirecrawlSectionProps {
  config: FirecrawlConfigSnapshot;
  isAdmin: boolean;
}

interface FirecrawlActionResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

interface AdminCardSubmissionItem {
  id: string;
  status: string;
  game: TradingCardGame;
  canSave: boolean;
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
  warnings: string[];
  createdAt: string;
  updatedAt: string;
  migratedAt: string | null;
  officialCardId: string | null;
}

function StatusTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "neutral" | "good" | "warn";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "warn"
        ? "text-amber-700 dark:text-amber-300"
        : "text-gray-950 dark:text-white";

  return (
    <div className="min-w-0 rounded-xl border border-black/6 bg-black/[0.02] px-3 py-2.5 dark:border-white/8 dark:bg-white/[0.03]">
      <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
        {label}
      </p>
      <p className={`mt-1 truncate text-sm font-bold leading-tight ${toneClass}`} title={value}>
        {value}
      </p>
      <p className="mt-1 truncate text-[11px] text-gray-500 dark:text-white/45" title={hint}>
        {hint}
      </p>
    </div>
  );
}

function CreditGuide({ config }: { config: FirecrawlConfigSnapshot }) {
  return (
    <div className="rounded-2xl border border-cyan-500/14 bg-cyan-500/[0.04] p-4 dark:border-cyan-300/12 dark:bg-cyan-300/[0.045]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">Credit guard</p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
            Free plan budget is set to {config.monthlyCreditBudget.toLocaleString("en-US")} credits
            per month. Use single-page checks first; avoid crawls unless you really need them.
            {config.monthlyCreditOffset > 0
              ? ` Includes ${config.monthlyCreditOffset.toLocaleString("en-US")} manually tracked credits already spent outside this database.`
              : ""}
          </p>
        </div>
        <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-500 dark:text-cyan-200" />
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {config.creditGuide.map((item) => (
          <div
            key={item.feature}
            className="rounded-xl border border-black/6 bg-white/35 px-3 py-2 dark:border-white/8 dark:bg-white/[0.04]"
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-400">
              {item.feature}
            </p>
            <p className="mt-1 text-xs font-semibold text-gray-800 dark:text-white/80">
              {item.cost}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  children,
  disabled,
  loading,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-black/8 bg-black/[0.03] px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm shadow-black/5 transition-all hover:scale-[1.01] hover:bg-black/[0.045] disabled:cursor-not-allowed disabled:scale-100 disabled:opacity-50 dark:border-white/8 dark:bg-white/[0.05] dark:text-gray-100 dark:hover:bg-white/[0.08] sm:w-auto"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      {children}
    </button>
  );
}

function AdminSubmittedCards() {
  const [items, setItems] = useState<AdminCardSubmissionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<
    Record<
      string,
      {
        name: string;
        setName: string;
        cardNumber: string;
        cardmarketUrl: string;
        imageUrl: string;
        language: "English" | "Japanese";
        condition: string;
        nmPriceEur: string;
      }
    >
  >({});

  async function loadItems() {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/card-submissions", { cache: "no-store" });
      const data = (await response.json()) as FirecrawlActionResponse<AdminCardSubmissionItem[]>;
      if (!response.ok || !data.ok || !data.result) {
        setStatus(data.error ?? "Could not load submitted cards.");
        return;
      }
      setItems(data.result);
      setDrafts(
        Object.fromEntries(
          data.result.map((item) => [
            item.id,
            {
              name: item.card.name,
              setName: item.card.setName === "Set unknown" ? "" : item.card.setName,
              cardNumber: item.card.cardNumber ?? "",
              cardmarketUrl: item.card.cardmarketUrl ?? "",
              imageUrl: item.card.imageUrl ?? "",
              language: item.card.language ?? "English",
              condition: item.card.condition ?? "Near Mint",
              nmPriceEur: item.card.nmPriceEur != null ? String(item.card.nmPriceEur) : "",
            },
          ])
        )
      );
      setStatus(null);
    } catch {
      setStatus("Network error while loading submitted cards.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialItems() {
      try {
        const response = await fetch("/api/admin/card-submissions", { cache: "no-store" });
        const data = (await response.json()) as FirecrawlActionResponse<AdminCardSubmissionItem[]>;
        if (cancelled) return;

        if (!response.ok || !data.ok || !data.result) {
          setStatus(data.error ?? "Could not load submitted cards.");
          return;
        }

        setItems(data.result);
        setDrafts(
          Object.fromEntries(
            data.result.map((item) => [
              item.id,
              {
                name: item.card.name,
                setName: item.card.setName === "Set unknown" ? "" : item.card.setName,
                cardNumber: item.card.cardNumber ?? "",
                cardmarketUrl: item.card.cardmarketUrl ?? "",
                imageUrl: item.card.imageUrl ?? "",
                language: item.card.language ?? "English",
                condition: item.card.condition ?? "Near Mint",
                nmPriceEur: item.card.nmPriceEur != null ? String(item.card.nmPriceEur) : "",
              },
            ])
          )
        );
        setStatus(null);
      } catch {
        if (!cancelled) setStatus("Network error while loading submitted cards.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialItems();
    return () => {
      cancelled = true;
    };
  }, []);

  async function mutateItem(
    id: string,
    method: "PATCH" | "POST" | "DELETE",
    body?: Record<string, unknown>
  ) {
    setBusyId(id);
    setStatus(null);
    try {
      const response = await fetch(`/api/admin/card-submissions/${encodeURIComponent(id)}`, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = (await response.json()) as FirecrawlActionResponse<AdminCardSubmissionItem>;
      if (!response.ok || !data.ok) {
        setStatus(data.error ?? "Submitted card action failed.");
        return;
      }
      if (method === "DELETE") {
        setItems((current) => current.filter((item) => item.id !== id));
        setDrafts((current) => {
          const next = { ...current };
          delete next[id];
          return next;
        });
      }
      await loadItems();
      setStatus(method === "DELETE" ? "Submitted card deleted." : "Submitted card updated.");
    } catch {
      setStatus("Network error while updating submitted card.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mt-5 rounded-2xl border border-black/6 bg-black/[0.015] p-4 dark:border-white/8 dark:bg-white/[0.025]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Submitted CardMarket cards
          </p>
          <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
            Edit, refresh, delete, and review cards that users added through Firecrawl.
          </p>
        </div>
        <ActionButton onClick={() => void loadItems()} loading={loading}>
          Reload
        </ActionButton>
      </div>

      {status ? <p className="mb-3 text-xs text-gray-500 dark:text-white/45">{status}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.03] p-3 text-sm text-white/55">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading submitted cards...
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 text-sm text-white/45">
          No Firecrawl submitted cards yet.
        </div>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => {
            const draft = drafts[item.id];
            const busy = busyId === item.id;
            const gameParam = getGameSearchParamValue(item.game);
            const cardHref =
              item.status === "added"
                ? `/search?q=${encodeURIComponent(item.card.name)}${gameParam ? `&game=${encodeURIComponent(gameParam)}` : ""}`
                : null;

            return (
              <div
                key={item.id}
                className="grid gap-3 rounded-2xl border border-white/8 bg-white/[0.035] p-3 lg:grid-cols-[70px_minmax(0,1fr)]"
              >
                <div className="aspect-[5/7] overflow-hidden rounded-xl border border-white/10 bg-black/20">
                  {item.card.imageUrl ? (
                    <Image
                      src={getCachedImageUrl(item.card.imageUrl) ?? item.card.imageUrl}
                      alt={item.card.name}
                      width={140}
                      height={196}
                      className="h-full w-full object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>

                <div className="min-w-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-gray-950 dark:text-white">
                        {item.card.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-white/45">
                        {item.card.setName} {item.card.cardNumber ? `/ #${item.card.cardNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <span className="rounded-full border border-cyan-300/16 bg-cyan-300/[0.08] px-2 py-1 text-[10px] font-bold text-cyan-100">
                        {getGameLabel(item.game)}
                      </span>
                      <span className="rounded-full border border-white/8 bg-white/[0.045] px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/55">
                        {item.status}
                      </span>
                      <span className="rounded-full border border-emerald-300/16 bg-emerald-300/[0.08] px-2 py-1 text-[10px] font-bold text-emerald-100">
                        {formatCurrency(item.card.nmPriceEur, "EUR")}
                      </span>
                      <span className="rounded-full border border-white/8 bg-white/[0.045] px-2 py-1 text-[10px] font-bold text-white/55">
                        {item.card.condition}
                      </span>
                      {item.card.gradedPrices.length > 0 ? (
                        <span className="rounded-full border border-violet-300/16 bg-violet-300/[0.08] px-2 py-1 text-[10px] font-bold text-violet-100">
                          {item.card.gradedPrices.length} graded
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {draft ? (
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, name: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                        placeholder="Name"
                      />
                      <input
                        value={draft.setName}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, setName: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                        placeholder="Set"
                      />
                      <input
                        value={draft.cardNumber}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, cardNumber: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                        placeholder="Number"
                      />
                      <input
                        value={draft.nmPriceEur}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, nmPriceEur: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                        placeholder={`${draft.condition} EUR`}
                      />
                      <select
                        value={draft.condition}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, condition: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                      >
                        {COLLECTION_CONDITIONS.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                      <select
                        value={draft.language}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: {
                              ...draft,
                              language: event.target.value === "Japanese" ? "Japanese" : "English",
                            },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                      >
                        <option value="English">English</option>
                        <option value="Japanese">Japanese</option>
                      </select>
                      <input
                        value={draft.cardmarketUrl}
                        onChange={(event) =>
                          setDrafts((current) => ({
                            ...current,
                            [item.id]: { ...draft, cardmarketUrl: event.target.value },
                          }))
                        }
                        className="rounded-xl border border-white/8 bg-black/10 px-3 py-2 text-xs font-semibold text-white outline-none dark:bg-white/[0.04]"
                        placeholder="CardMarket URL"
                      />
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {cardHref ? (
                      <Link
                        href={cardHref}
                        className="rounded-xl border border-white/8 bg-white/[0.045] px-3 py-2 text-xs font-bold text-white/75 transition hover:bg-white/[0.08]"
                      >
                        Open
                      </Link>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy || !draft}
                      onClick={() =>
                        draft &&
                        void mutateItem(item.id, "PATCH", {
                          ...draft,
                          nmPriceEur: Number(draft.nmPriceEur),
                        })
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300/18 bg-emerald-300/[0.08] px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-45"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                      Save
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mutateItem(item.id, "POST", { action: "refresh" })}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-cyan-300/18 bg-cyan-300/[0.08] px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-45"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Refresh
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void mutateItem(item.id, "DELETE")}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300/18 bg-rose-300/[0.08] px-3 py-2 text-xs font-bold text-rose-100 disabled:opacity-45"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FirecrawlSection({ config, isAdmin }: FirecrawlSectionProps) {
  const [docsQuestion, setDocsQuestion] = useState(
    "How should I debug Firecrawl API errors in a Next.js app without wasting credits?"
  );
  const [scrapeUrl, setScrapeUrl] = useState("");
  const [runningAction, setRunningAction] = useState<FirecrawlAction | null>(null);
  const [docsResult, setDocsResult] = useState<FirecrawlDocsSearchResult | null>(null);
  const [scrapeResult, setScrapeResult] = useState<FirecrawlScrapeResult | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function runDocsSearch() {
    setRunningAction("docs-search");
    setStatus("Asking Firecrawl docs...");
    setDocsResult(null);

    try {
      const response = await fetch("/api/admin/firecrawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "docs-search", question: docsQuestion }),
      });
      const data = (await response.json()) as FirecrawlActionResponse<FirecrawlDocsSearchResult>;

      if (!response.ok || !data.ok || !data.result) {
        setStatus(data.error ?? "Firecrawl docs search failed.");
        return;
      }

      setDocsResult(data.result);
      setStatus("Docs answer ready.");
    } catch {
      setStatus("Network error while asking Firecrawl docs.");
    } finally {
      setRunningAction(null);
    }
  }

  async function runScrape() {
    setRunningAction("scrape");
    setStatus("Scraping one page...");
    setScrapeResult(null);

    try {
      const response = await fetch("/api/admin/firecrawl", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scrape", url: scrapeUrl }),
      });
      const data = (await response.json()) as FirecrawlActionResponse<FirecrawlScrapeResult>;

      if (!response.ok || !data.ok || !data.result) {
        setStatus(data.error ?? "Firecrawl scrape failed.");
        return;
      }

      setScrapeResult(data.result);
      setStatus("Single-page scrape ready.");
    } catch {
      setStatus("Network error while scraping the page.");
    } finally {
      setRunningAction(null);
    }
  }

  const configuredTone = config.configured ? "good" : "warn";

  return (
    <section className="settings-panel glass min-w-0 rounded-2xl p-6 shadow-md shadow-black/5">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white">
            Firecrawl Tools
          </h2>
          <p className="mt-0.5 text-sm text-gray-400">
            Admin web tools plus the tightly bounded Signal Radar catalyst scan.
          </p>
        </div>
        <Flame className="h-5 w-5 shrink-0 text-orange-500 dark:text-orange-300" />
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <StatusTile
          label="API key"
          value={config.configured ? "Configured" : "Missing"}
          hint="Stored server-side only"
          tone={configuredTone}
        />
        <StatusTile
          label="Budget"
          value={`${config.monthlyCreditBudget.toLocaleString("en-US")} credits`}
          hint="Free monthly guardrail"
        />
        <StatusTile
          label="Mode"
          value="Bounded radar"
          hint="Catalysts every 72h; hard sub-budget"
        />
      </div>

      <div className="mt-5">
        <CreditGuide config={config} />
      </div>

      {!config.configured ? (
        <div className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/18 bg-amber-500/[0.06] p-4 text-sm text-amber-800 dark:border-amber-300/14 dark:bg-amber-300/[0.07] dark:text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>Add FIRECRAWL_API_KEY to the server environment before using these tools.</p>
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1.1fr]">
        <div className="rounded-2xl border border-black/6 bg-black/[0.015] p-4 dark:border-white/8 dark:bg-white/[0.025]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Ask Firecrawl docs
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
                Use this for integration errors, API behavior, and quick self-fix hints.
              </p>
            </div>
            <BookOpen className="h-5 w-5 shrink-0 text-gray-400 dark:text-white/40" />
          </div>
          <textarea
            value={docsQuestion}
            onChange={(event) => setDocsQuestion(event.target.value)}
            rows={4}
            className="w-full resize-none rounded-xl border border-black/8 bg-white/60 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-cyan-500/45 focus:ring-2 focus:ring-cyan-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-400">Docs search is safer than broad crawling.</p>
            <ActionButton
              onClick={() => void runDocsSearch()}
              disabled={!config.configured || docsQuestion.trim().length < 8}
              loading={runningAction === "docs-search"}
            >
              Ask Docs
            </ActionButton>
          </div>
          {docsResult ? (
            <div className="mt-4 rounded-xl border border-emerald-500/14 bg-emerald-500/[0.045] p-3 dark:border-emerald-300/12 dark:bg-emerald-300/[0.05]">
              <p className="whitespace-pre-wrap text-sm leading-6 text-gray-700 dark:text-white/75">
                {docsResult.answer}
              </p>
              {docsResult.citations.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {docsResult.citations.slice(0, 4).map((citation) => (
                    <a
                      key={citation.url}
                      href={citation.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-full border border-emerald-500/18 bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-500/14 dark:text-emerald-100"
                    >
                      {citation.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-black/6 bg-black/[0.015] p-4 dark:border-white/8 dark:bg-white/[0.025]">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Single-page scrape
              </p>
              <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-white/45">
                Pull clean markdown from one URL when a data issue needs live page context.
              </p>
            </div>
            <Globe2 className="h-5 w-5 shrink-0 text-gray-400 dark:text-white/40" />
          </div>
          <input
            value={scrapeUrl}
            onChange={(event) => setScrapeUrl(event.target.value)}
            placeholder="https://example.com/page"
            className="w-full rounded-xl border border-black/8 bg-white/60 px-3 py-2 text-sm text-gray-900 outline-none transition focus:border-cyan-500/45 focus:ring-2 focus:ring-cyan-500/10 dark:border-white/10 dark:bg-white/[0.05] dark:text-white"
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-gray-400">Expected cost: 1 credit for one page.</p>
            <ActionButton
              onClick={() => void runScrape()}
              disabled={!config.configured || scrapeUrl.trim().length < 8}
              loading={runningAction === "scrape"}
            >
              Scrape Page
            </ActionButton>
          </div>
          {scrapeResult ? (
            <div className="mt-4 rounded-xl border border-cyan-500/14 bg-cyan-500/[0.04] p-3 dark:border-cyan-300/12 dark:bg-cyan-300/[0.045]">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                {scrapeResult.title ?? "Scrape result"}
              </p>
              <p className="mt-1 break-all text-xs text-gray-500 dark:text-white/45">
                {scrapeResult.sourceUrl} / {scrapeResult.markdownLength.toLocaleString("en-US")} chars
              </p>
              <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-black/6 bg-white/45 p-3 text-xs leading-5 text-gray-700 dark:border-white/8 dark:bg-black/20 dark:text-white/70">
                {scrapeResult.markdownPreview || "No markdown returned."}
              </pre>
            </div>
          ) : null}
        </div>
      </div>

      {status ? <p className="mt-4 text-xs text-gray-400">{status}</p> : null}

      {isAdmin ? <AdminSubmittedCards /> : null}
    </section>
  );
}

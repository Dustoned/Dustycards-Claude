"use client";

import { useState } from "react";
import { AlertTriangle, BookOpen, Flame, Globe2, Loader2, ShieldCheck } from "lucide-react";
import type {
  FirecrawlConfigSnapshot,
  FirecrawlDocsSearchResult,
  FirecrawlScrapeResult,
} from "@/lib/firecrawl";

type FirecrawlAction = "docs-search" | "scrape";

interface FirecrawlSectionProps {
  config: FirecrawlConfigSnapshot;
}

interface FirecrawlActionResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
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

export default function FirecrawlSection({ config }: FirecrawlSectionProps) {
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
            Admin-only web context, docs diagnostics, and single-page checks for repair work.
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
        <StatusTile label="Mode" value="Manual only" hint="No background Firecrawl jobs" />
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
    </section>
  );
}

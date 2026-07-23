"use client";

import {
  CheckCircle2,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  MessageSquareText,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FEEDBACK_STATUSES,
  type FeedbackStatus,
} from "@/lib/feedback";

type FeedbackItem = {
  id: string;
  category: string;
  message: string;
  pageUrl: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  userEmail: string;
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  reviewed: "Reviewed",
  resolved: "Resolved",
};

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function FeedbackSection() {
  const [items, setItems] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | FeedbackStatus>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadFeedback = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/feedback", { cache: "no-store" });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; result?: FeedbackItem[] }
        | null;
      if (!response.ok || !payload?.ok || !Array.isArray(payload.result)) {
        throw new Error(payload?.error || "Could not load feedback.");
      }
      setItems(payload.result);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Could not load feedback."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadFeedback(), 0);
    return () => window.clearTimeout(timer);
  }, [loadFeedback]);

  const counts = useMemo(
    () =>
      FEEDBACK_STATUSES.reduce<Record<FeedbackStatus, number>>(
        (result, status) => {
          result[status] = items.filter((item) => item.status === status).length;
          return result;
        },
        { new: 0, reviewed: 0, resolved: 0 }
      ),
    [items]
  );

  const visibleItems = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [filter, items]
  );

  async function updateStatus(id: string, status: FeedbackStatus) {
    setUpdatingId(id);
    setError(null);
    try {
      const response = await fetch("/api/admin/feedback", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; error?: string; result?: { updatedAt?: string } }
        | null;
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Could not update feedback.");
      }
      setItems((current) =>
        current.map((item) =>
          item.id === id
            ? {
                ...item,
                status,
                updatedAt: payload.result?.updatedAt ?? new Date().toISOString(),
              }
            : item
        )
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update feedback."
      );
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section className="overflow-hidden rounded-[24px] border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-primary-rgb)/0.62)] shadow-[0_20px_65px_rgba(0,0,0,0.16)]">
      <header className="border-b border-[rgb(var(--dc-border-rgb)/0.76)] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--dc-primary-soft)]">
              Admin inbox
            </p>
            <h2 className="mt-1.5 flex items-center gap-2 text-xl font-black text-[var(--dc-text-primary)]">
              <MessageSquareText className="h-5 w-5 text-[var(--dc-primary-soft)]" />
              User feedback
            </h2>
            <p className="mt-1 text-sm text-[var(--dc-text-muted)]">
              Reports and ideas submitted from inside the app.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadFeedback()}
            disabled={loading}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.9)] bg-[rgb(var(--dc-surface-hover-rgb)/0.55)] px-3 text-xs font-black text-[var(--dc-text-secondary)] disabled:cursor-wait disabled:opacity-55"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Inbox className="h-3.5 w-3.5" />}
            Refresh
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {(["all", ...FEEDBACK_STATUSES] as const).map((status) => {
            const active = filter === status;
            const count = status === "all" ? items.length : counts[status];
            return (
              <button
                key={status}
                type="button"
                onClick={() => setFilter(status)}
                className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-xs font-black transition ${
                  active
                    ? "border-[rgb(var(--dc-primary-soft-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.18)] text-[var(--dc-text-primary)]"
                    : "border-[rgb(var(--dc-border-rgb)/0.8)] bg-[rgb(var(--dc-bg-main-rgb)/0.3)] text-[var(--dc-text-muted)]"
                }`}
              >
                {status === "all" ? "All" : STATUS_LABELS[status]}
                <span className="rounded-full bg-[rgb(var(--dc-surface-hover-rgb)/0.72)] px-1.5 py-0.5 text-[9px] tabular-nums">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </header>

      {error ? (
        <p role="alert" className="m-4 rounded-xl border border-rose-400/18 bg-rose-400/[0.07] px-3 py-2.5 text-xs font-semibold text-rose-200 sm:m-5">
          {error}
        </p>
      ) : null}

      <div className="grid gap-3 p-4 sm:p-5">
        {loading && items.length === 0 ? (
          Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-36 animate-pulse rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.65)] bg-[rgb(var(--dc-surface-hover-rgb)/0.35)]"
            />
          ))
        ) : visibleItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[rgb(var(--dc-border-rgb)/0.85)] px-5 py-12 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-[var(--dc-text-disabled)]" />
            <p className="mt-3 text-sm font-black text-[var(--dc-text-secondary)]">
              No feedback in this view
            </p>
          </div>
        ) : (
          visibleItems.map((item) => (
            <article
              key={item.id}
              className="rounded-2xl border border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-bg-main-rgb)/0.32)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[rgb(var(--dc-primary-soft-rgb)/0.18)] bg-[rgb(var(--dc-primary-rgb)/0.1)] px-2 py-1 text-[9px] font-black uppercase tracking-[0.1em] text-[var(--dc-primary-soft)]">
                      {item.category}
                    </span>
                    <span className="text-[10px] font-bold text-[var(--dc-text-disabled)]">
                      {formatDateTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="mt-2 flex min-w-0 items-center gap-1.5 text-xs font-bold text-[var(--dc-text-muted)]">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.userEmail}</span>
                  </p>
                </div>
                {item.pageUrl ? (
                  <a
                    href={item.pageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.8)] px-2.5 text-[10px] font-black text-[var(--dc-text-muted)] hover:text-[var(--dc-text-primary)]"
                  >
                    Open page
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ) : null}
              </div>

              <p className="mt-4 whitespace-pre-wrap text-sm font-medium leading-relaxed text-[var(--dc-text-secondary)]">
                {item.message}
              </p>

              <div className="mt-4 flex flex-wrap gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.65)] pt-3">
                {FEEDBACK_STATUSES.map((status) => {
                  const active = item.status === status;
                  const updating = updatingId === item.id;
                  return (
                    <button
                      key={status}
                      type="button"
                      onClick={() => void updateStatus(item.id, status)}
                      disabled={updating || active}
                      className={`min-h-9 rounded-xl border px-3 text-[10px] font-black transition ${
                        active
                          ? "border-[rgb(var(--dc-primary-soft-rgb)/0.34)] bg-[rgb(var(--dc-primary-rgb)/0.18)] text-[var(--dc-text-primary)]"
                          : "border-[rgb(var(--dc-border-rgb)/0.76)] text-[var(--dc-text-muted)] hover:bg-[rgb(var(--dc-surface-hover-rgb)/0.5)]"
                      } disabled:cursor-default`}
                    >
                      {updating && !active ? "Saving…" : STATUS_LABELS[status]}
                    </button>
                  );
                })}
              </div>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { Bell, CheckCircle2, Clock3, Radar, UserRoundCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const ACTION_CENTER_ITEM_READ_EVENT = "dustycards:action-center-item-read";

type ActionItem = {
  id: string;
  kind: "account" | "alert" | "ebay" | "signal" | "feedback";
  title: string;
  detail: string;
  href: string;
  occurredAt: string;
  tone: "positive" | "warning" | "neutral";
};

function timeAgo(value: string): string {
  const elapsed = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 60_000) return "now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return `${Math.floor(elapsed / 86_400_000)}d`;
}

export default function ActionCenterButton({
  initialCount = 0,
  className = "",
  desktopPlacement = "below-right",
}: {
  initialCount?: number;
  className?: string;
  desktopPlacement?: "below-right" | "above-left";
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [count, setCount] = useState(initialCount);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const locallyReadItemIdsRef = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      try {
        const response = await fetch("/api/action-center", { cache: "no-store" });
        const payload = (await response.json().catch(() => ({}))) as { count?: number; items?: ActionItem[] };
        if (!active || !response.ok) return;
        const nextItems = (payload.items ?? []).filter(
          (item) => !locallyReadItemIdsRef.current.has(item.id)
        );
        setItems(nextItems);
        setCount(nextItems.length);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    const timer = window.setInterval(load, 5 * 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    function handleItemRead(event: Event) {
      const itemId = (event as CustomEvent<{ itemId?: string }>).detail?.itemId;
      if (!itemId) return;

      locallyReadItemIdsRef.current.add(itemId);
      setItems((current) => current.filter((item) => item.id !== itemId));
      setCount((current) => Math.max(0, current - 1));
    }

    window.addEventListener(ACTION_CENTER_ITEM_READ_EVENT, handleItemRead);
    return () => window.removeEventListener(ACTION_CENTER_ITEM_READ_EVENT, handleItemRead);
  }, []);

  function markItemRead(itemId: string) {
    window.dispatchEvent(
      new CustomEvent(ACTION_CENTER_ITEM_READ_EVENT, { detail: { itemId } })
    );
    void fetch("/api/action-center", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
    });
  }

  useEffect(() => {
    if (!open) return;
    function close(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", keydown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative shrink-0 ${className}`} data-action-center>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.045] text-white/68 transition-colors hover:bg-white/[0.08] hover:text-white"
        aria-label={`Action Center${count ? `, ${count} items` : ""}`}
        aria-expanded={open}
      >
        <Bell className="h-4 w-4" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 text-center text-[9px] font-black leading-4 text-white">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
          className={`fixed inset-0 z-[160] bg-black/30 backdrop-blur-sm sm:absolute sm:inset-auto sm:w-[24rem] sm:bg-transparent sm:backdrop-blur-0 ${
            desktopPlacement === "above-left"
              ? "sm:bottom-[calc(100%+0.55rem)] sm:left-0"
              : "sm:right-0 sm:top-[calc(100%+0.55rem)]"
          }`}
        >
          <div className="absolute left-3 right-3 top-[calc(var(--ui-app-header-height)+env(safe-area-inset-top,0px)+0.5rem)] max-h-[calc(100dvh-var(--ui-app-header-height)-env(safe-area-inset-top,0px)-1rem)] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/94 shadow-2xl backdrop-blur-2xl sm:relative sm:left-auto sm:right-auto sm:top-auto sm:max-h-[32rem]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-3">
              <div>
                <p className="text-sm font-black text-white">Action Center</p>
                <p className="text-[10px] font-semibold text-white/38">Alerts, results and reviews in one place</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/8 text-white/46" aria-label="Close Action Center">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="max-h-[calc(100dvh-var(--ui-app-header-height)-env(safe-area-inset-top,0px)-5rem)] overscroll-contain overflow-y-auto p-2 sm:max-h-[27rem]">
              {items.length ? items.map((item) => {
                const Icon = item.kind === "signal"
                  ? Radar
                  : item.kind === "ebay"
                    ? Clock3
                    : item.kind === "account"
                      ? UserRoundCheck
                      : CheckCircle2;
                return (
                  <Link key={item.id} href={item.href} onClick={() => { markItemRead(item.id); setOpen(false); }} target={item.kind === "ebay" ? "_blank" : undefined} rel={item.kind === "ebay" ? "noopener noreferrer" : undefined} className="flex gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-white/[0.055]">
                    <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${item.tone === "positive" ? "border-emerald-300/16 bg-emerald-500/[0.08] text-emerald-200" : item.tone === "warning" ? "border-amber-300/16 bg-amber-500/[0.08] text-amber-200" : "border-white/8 bg-white/[0.035] text-white/52"}`}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <strong className="text-[12px] leading-4 text-white/84">{item.title}</strong>
                        <small className="shrink-0 text-[9px] font-bold text-white/28">{timeAgo(item.occurredAt)}</small>
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-[10px] leading-4 text-white/42">{item.detail}</span>
                    </span>
                  </Link>
                );
              }) : (
                <div className="px-4 py-10 text-center text-sm text-white/42">{loading ? "Loading actions..." : "Nothing needs your attention."}</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

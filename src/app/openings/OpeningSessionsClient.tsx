"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, ChevronDown, Loader2, PackageOpen, Plus, Search, Trash2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import CachedImage from "@/components/CachedImage";
import { formatCollectionCurrency } from "@/lib/collection";
import OwnedSealedPickerDialog from "./OwnedSealedPickerDialog";

export type OwnedSealedChoice = {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  purchasePricePerItem: number | null;
  marketPrice: number | null;
  suggestedPacks: number | null;
  episode: { id: string; name: string; code: string | null };
};

export type CatalogSealedChoice = {
  productId: string;
  name: string;
  imageUrl: string | null;
  game: string;
  marketPrice: number | null;
  suggestedPacks: number | null;
  episode: { id: string; name: string; code: string | null };
};

export type OpeningSealedChoice = {
  selectionKey: string;
  source: "collection" | "catalog";
  collectionSealedId: string | null;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number | null;
  purchasePricePerItem: number | null;
  marketPrice: number | null;
  suggestedPacks: number | null;
  episode: { id: string; name: string; code: string | null };
};

type OpeningCard = {
  collectionItemId: string;
  id: string;
  name: string;
  cardNumber: string | null;
  imageUrl: string | null;
  value: number | null;
};

export type OpeningSessionView = {
  id: string;
  title: string | null;
  status: string;
  openedAt: string;
  packsOpened: number;
  cost: number | null;
  product: { id: string; name: string; imageUrl: string | null };
  cards: OpeningCard[];
};

type SearchCard = {
  id: string;
  name: string;
  card_number: string | null;
  image_url: string | null;
  episode_name: string;
  cm_en_lowest_nm: number | null;
  included_promo?: boolean;
};

type OpeningPoolScope = {
  strict: boolean;
  reason: "named-expansion" | "declared-content-sets" | "unknown-pack-contents";
};

function productImage(imageUrl: string | null, name: string, size = "64px") {
  return (
    <span className="relative aspect-square w-14 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/18">
      {imageUrl ? <CachedImage sourceUrl={imageUrl} alt="" fill sizes={size} className="object-contain p-1" unoptimized /> : <PackageOpen className="absolute inset-0 m-auto h-5 w-5 text-white/20" />}
      <span className="sr-only">{name}</span>
    </span>
  );
}

export default function OpeningSessionsClient({ owned, sessions }: { owned: OwnedSealedChoice[]; sessions: OpeningSessionView[] }) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(sessions.length === 0);
  const [sealedPickerOpen, setSealedPickerOpen] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<OpeningSealedChoice | null>(null);
  const [cost, setCost] = useState("");
  const [packs, setPacks] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSessionId, setActiveSessionId] = useState(sessions.find((session) => session.status === "open")?.id ?? null);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchCard[]>([]);
  const [resultsKey, setResultsKey] = useState("");
  const [scope, setScope] = useState<OpeningPoolScope | null>(null);
  const [scopeKey, setScopeKey] = useState("");
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [confirmingRemovalId, setConfirmingRemovalId] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;
  const activeSearchKey = activeSession?.status === "open"
    ? `${activeSession.id}:${search.trim()}`
    : "";
  const visibleResults = resultsKey === activeSearchKey ? results : [];
  const visibleScope = scopeKey === activeSearchKey ? scope : null;

  useEffect(() => {
    const query = search.trim();
    if (!activeSession || activeSession.status !== "open") {
      return;
    }
    const controller = new AbortController();
    const requestKey = `${activeSession.id}:${query}`;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await fetch(
          `/api/openings/cards?sessionId=${encodeURIComponent(activeSession.id)}&q=${encodeURIComponent(query)}`,
          { cache: "no-store", signal: controller.signal }
        );
        const payload = (await response.json().catch(() => ({}))) as {
          singles?: SearchCard[];
          scope?: OpeningPoolScope;
        };
        if (response.ok) {
          setResults(payload.singles ?? []);
          setResultsKey(requestKey);
          setScope(payload.scope ?? null);
          setScopeKey(requestKey);
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, query ? 180 : 0);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [activeSession, search]);

  const totals = useMemo(() => sessions.reduce((summary, session) => {
    const value = session.cards.reduce((sum, card) => sum + (card.value ?? 0), 0);
    return { sessions: summary.sessions + 1, cards: summary.cards + session.cards.length, cost: summary.cost + (session.cost ?? 0), value: summary.value + value };
  }, { sessions: 0, cards: 0, cost: 0, value: 0 }), [sessions]);

  function selectSealed(item: OpeningSealedChoice) {
    setSelectedChoice(item);
    const suggestedCost = item.purchasePricePerItem ?? item.marketPrice;
    setCost(suggestedCost?.toFixed(2) ?? "");
    setPacks(item.suggestedPacks?.toString() ?? "");
  }

  async function createSession() {
    const packCount = Number(packs);
    if (!selectedChoice || creating || !Number.isInteger(packCount) || packCount <= 0) return;
    setCreating(true); setError(null);
    try {
      const response = await fetch("/api/collection/opening-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(selectedChoice.source === "collection"
            ? { collectionSealedId: selectedChoice.collectionSealedId }
            : { sealedProductId: selectedChoice.productId }),
          openedCostEur: cost,
          packsOpened: packs,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not start opening");
      setActiveSessionId(payload.id ?? null); setCreateOpen(false); router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not start opening"); }
    finally { setCreating(false); }
  }

  async function addPull(card: SearchCard) {
    if (!activeSession || addingId) return;
    setAddingId(card.id); setError(null);
    try {
      const response = await fetch("/api/collection/cards", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cardId: card.id, openingSessionId: activeSession.id, condition: "Near Mint", language: "English" }) });
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not add pull");
      router.refresh();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not add pull"); }
    finally { setAddingId(null); }
  }

  async function closeSession(sessionId: string) {
    const response = await fetch(`/api/collection/opening-sessions/${encodeURIComponent(sessionId)}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "closed" }) });
    if (response.ok) { if (activeSessionId === sessionId) setActiveSessionId(null); router.refresh(); }
  }

  async function removeSession(session: OpeningSessionView) {
    if (removingId) return;
    setRemovingId(session.id);
    setError(null);
    try {
      const response = await fetch(
        `/api/collection/opening-sessions/${encodeURIComponent(session.id)}`,
        { method: "DELETE" }
      );
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not remove opening");
      if (activeSessionId === session.id) setActiveSessionId(null);
      setConfirmingRemovalId(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove opening");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <main className="page-container mx-auto px-3 pb-24 pt-6 sm:px-6 lg:px-8">
      <header className="rounded-[var(--ui-page-header-radius)] border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="text-[10px] font-black uppercase tracking-[0.13em] text-violet-200/58">Collection workflow</p><h1 className="mt-1 text-2xl font-black text-white">Sealed openings</h1><p className="mt-1 max-w-xl text-sm text-white/42">Keep sealed cost, every pull and the live result together.</p></div>
          <button type="button" onClick={() => setCreateOpen((current) => !current)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-violet-300/18 bg-violet-500/[0.12] px-3 text-xs font-black text-violet-50"><Plus className="h-4 w-4" /> New opening</button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[["Sessions", totals.sessions], ["Pulls", totals.cards], ["Opened cost", formatCollectionCurrency(totals.cost)], ["Current result", formatCollectionCurrency(totals.value - totals.cost)]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-white/7 bg-black/16 px-3 py-2"><p className="text-[9px] font-bold uppercase tracking-[0.1em] text-white/30">{label}</p><p className="mt-1 text-sm font-black tabular-nums text-white/82">{value}</p></div>)}
        </div>
      </header>

      {createOpen ? <section className="mt-3 rounded-2xl border border-violet-300/14 bg-violet-500/[0.04] p-4">
        <div className="mb-3">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-violet-200/52">New opening</p>
          <p className="mt-1 text-xs text-white/38">Choose from your collection or the full sealed catalogue. Best price and pack count are filled automatically when known.</p>
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_auto] lg:items-end">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white/36">Sealed product</p>
            <button
              type="button"
              onClick={() => setSealedPickerOpen(true)}
              aria-haspopup="dialog"
              className="mt-1.5 flex min-h-16 w-full items-center gap-3 rounded-2xl border border-white/10 bg-black/18 p-2.5 text-left transition-colors hover:border-violet-300/24 hover:bg-violet-500/[0.06]"
            >
              {selectedChoice ? (
                <>
                  {productImage(selectedChoice.imageUrl, selectedChoice.name)}
                  <span className="min-w-0 flex-1">
                    <strong className="block truncate text-sm text-white/84">{selectedChoice.name}</strong>
                    <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[9px] font-bold text-white/38">
                      <span>{selectedChoice.source === "collection" ? `${selectedChoice.quantity} owned` : "Full catalogue"}</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedChoice.purchasePricePerItem != null
                        ? `${formatCollectionCurrency(selectedChoice.purchasePricePerItem)} paid`
                        : selectedChoice.marketPrice != null
                          ? `${formatCollectionCurrency(selectedChoice.marketPrice)} best price`
                          : "No price available"}</span>
                    </span>
                  </span>
                  <span className="shrink-0 rounded-xl border border-violet-300/14 bg-violet-500/[0.08] px-2.5 py-1.5 text-[10px] font-black text-violet-100/68">Change</span>
                </>
              ) : (
                <>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-300/14 bg-violet-500/[0.08] text-violet-100/55">
                    <Search className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <strong className="block text-sm text-white/72">Choose a sealed product</strong>
                    <span className="mt-1 block text-[10px] text-white/32">Your collection or every openable sealed product.</span>
                  </span>
                </>
              )}
            </button>
          </div>
          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-white/36">Cost EUR<input value={cost} onChange={(event) => setCost(event.target.value)} inputMode="decimal" className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white" /></label>
          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-white/36">Packs<input value={packs} onChange={(event) => setPacks(event.target.value)} inputMode="numeric" className="mt-1.5 h-11 w-full rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-white" /></label>
          <button type="button" onClick={() => void createSession()} disabled={!selectedChoice || !Number.isInteger(Number(packs)) || Number(packs) <= 0 || creating} className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-black text-white disabled:opacity-45">{creating ? "Starting..." : "Start opening"}</button>
        </div>
      </section> : null}
      {sealedPickerOpen ? (
        <OwnedSealedPickerDialog
          items={owned}
          selectedKey={selectedChoice?.selectionKey ?? null}
          onClose={() => setSealedPickerOpen(false)}
          onSelect={(item) => {
            selectSealed(item);
            setSealedPickerOpen(false);
          }}
        />
      ) : null}
      {error ? <p className="mt-3 rounded-xl border border-rose-300/14 bg-rose-500/[0.07] px-3 py-2 text-sm text-rose-100">{error}</p> : null}

      <section className="mt-4 grid gap-3">
        {sessions.length === 0 ? <div className="rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center text-sm text-white/42">Start an opening from your collection or the sealed catalogue.</div> : sessions.map((session) => {
          const pullValue = session.cards.reduce((sum, card) => sum + (card.value ?? 0), 0); const result = pullValue - (session.cost ?? 0); const open = session.id === activeSessionId;
          return <article key={session.id} className={`rounded-2xl border p-3 sm:p-4 ${open ? "border-violet-300/22 bg-violet-500/[0.055]" : "border-white/8 bg-white/[0.025]"}`}>
            <button type="button" onClick={() => setActiveSessionId(open ? null : session.id)} className="flex w-full items-center gap-3 text-left">{productImage(session.product.imageUrl, session.product.name)}<span className="min-w-0 flex-1"><strong className="block truncate text-sm text-white">{session.title ?? session.product.name}</strong><span className="mt-1 block text-[10px] font-semibold text-white/38">{session.packsOpened} packs · {session.cards.length} pulls · {new Date(session.openedAt).toLocaleDateString("en-GB")}</span></span><span className="text-right"><strong className={`block text-sm tabular-nums ${result >= 0 ? "text-emerald-200" : "text-rose-200"}`}>{result >= 0 ? "+" : ""}{formatCollectionCurrency(result)}</strong><small className="text-[9px] uppercase text-white/28">live result</small></span><ChevronDown className={`h-4 w-4 text-white/30 transition ${open ? "rotate-180" : ""}`} /></button>
            {open ? <div className="mt-3 border-t border-white/7 pt-3"><div className="grid gap-2 sm:grid-cols-3">{[["Opening cost", session.cost == null ? "Unknown" : formatCollectionCurrency(session.cost)], ["Pull value", formatCollectionCurrency(pullValue)], ["Value / cost", session.cost && session.cost > 0 ? `${(pullValue / session.cost).toFixed(2)}x` : "--"]].map(([label, value]) => <div key={label} className="rounded-xl border border-white/7 bg-black/16 px-3 py-2"><p className="text-[9px] uppercase text-white/28">{label}</p><p className="mt-1 text-sm font-black text-white/78">{value}</p></div>)}</div>
              {session.status === "open" ? <><div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={visibleScope?.strict === false ? "Search any card from the packs you opened..." : "Search this expansion or its included promos..."} className="h-11 w-full rounded-xl border border-white/10 bg-black/20 pl-10 pr-3 text-sm text-white outline-none focus:border-violet-300/30" />{searching ? <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-violet-200" /> : null}</div><Link href={`/scan?openingSession=${encodeURIComponent(session.id)}`} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-white/9 px-3 text-xs font-black text-white/62"><Camera className="h-4 w-4" /> Scan pulls</Link><button type="button" onClick={() => void closeSession(session.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300/14 bg-emerald-500/[0.06] px-3 text-xs font-black text-emerald-100"><Check className="h-4 w-4" /> Finish</button></div><p className="mt-1.5 text-[10px] text-white/32">{visibleScope?.strict === false ? "Pack contents are not mapped for this box. Search all cards from the same game and add only the pulls you actually opened." : "Only cards from this sealed expansion, declared content sets and explicitly included promos can be added."}</p></> : null}
              {visibleResults.length > 0 && session.status === "open" ? <div className="mt-2 grid gap-1.5 sm:grid-cols-2">{visibleResults.map((card) => <button key={card.id} type="button" onClick={() => void addPull(card)} disabled={addingId === card.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.025] p-2 text-left hover:bg-white/[0.05]"><span className="relative aspect-[63/88] w-9 shrink-0 overflow-hidden rounded-md">{card.image_url ? <CachedImage sourceUrl={card.image_url} alt="" fill sizes="36px" className="object-contain" unoptimized /> : null}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white/82">{card.name}</strong><small className="block truncate text-[9px] text-white/34">{card.episode_name} {card.card_number ? `#${card.card_number}` : ""}{card.included_promo ? " · Included promo" : ""}</small></span><Plus className="h-4 w-4 text-violet-200/62" /></button>)}</div> : null}
              {!searching && session.status === "open" && resultsKey === activeSearchKey && visibleResults.length === 0 ? <p className="mt-3 rounded-xl border border-dashed border-white/8 px-3 py-5 text-center text-xs text-white/34">{visibleScope?.strict === false && search.trim().length < 2 ? "Search by card name, number or set. This box has no confirmed pack list, so no expansion is assumed." : "No cards from this sealed product match your search."}</p> : null}
              {session.cards.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{session.cards.map((card) => <div key={card.collectionItemId} className="w-20 shrink-0"><span className="relative block aspect-[63/88] overflow-hidden rounded-lg border border-white/8 bg-black/16">{card.imageUrl ? <CachedImage sourceUrl={card.imageUrl} alt="" fill sizes="80px" className="object-contain" unoptimized /> : null}</span><p className="mt-1 truncate text-[9px] font-bold text-white/58">{card.name}</p><p className="text-[9px] tabular-nums text-white/34">{card.value == null ? "--" : formatCollectionCurrency(card.value)}</p></div>)}</div> : <p className="mt-3 text-xs text-white/34">No pulls added yet.</p>}
              <div className="mt-4 border-t border-white/7 pt-3">
                {confirmingRemovalId === session.id ? (
                  <div className="rounded-xl border border-rose-300/16 bg-rose-500/[0.07] p-3">
                    <p className="text-xs font-black text-rose-100">
                      {session.status === "open" ? "Cancel this opening?" : "Delete this opening record?"}
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-rose-100/58">
                      {session.status === "open"
                        ? `${session.cards.length} pull${session.cards.length === 1 ? "" : "s"} will be removed. An owned sealed item is restored when applicable.`
                        : `${session.cards.length} collected pull${session.cards.length === 1 ? "" : "s"} will stay in your collection.`}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void removeSession(session)}
                        disabled={removingId === session.id}
                        className="inline-flex h-9 items-center gap-2 rounded-xl bg-rose-600 px-3 text-[11px] font-black text-white disabled:opacity-50"
                      >
                        {removingId === session.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {removingId === session.id ? "Removing..." : session.status === "open" ? "Confirm cancel" : "Confirm delete"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingRemovalId(null)}
                        disabled={removingId === session.id}
                        className="h-9 rounded-xl border border-white/10 px-3 text-[11px] font-black text-white/60 disabled:opacity-50"
                      >
                        Keep opening
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmingRemovalId(session.id)}
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-300/12 px-3 text-[11px] font-black text-rose-100/70 transition-colors hover:bg-rose-500/[0.07]"
                  >
                    {session.status === "open" ? <XCircle className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                    {session.status === "open" ? "Cancel opening" : "Delete opening"}
                  </button>
                )}
              </div>
            </div> : null}
          </article>;
        })}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ExternalLink,
  ImageOff,
  PackageSearch,
  Radar,
  ScanSearch,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import HomeItemDetailProvider from "@/components/HomeItemDetailProvider";
import MarktplaatsCardDetailButton from "@/components/MarktplaatsCardDetailButton";
import {
  matchesMarktplaatsSelection,
  summarizeMarktplaatsFilterCounts,
  type MarktplaatsDealFilterKind,
  type MarktplaatsSelectionFilter,
} from "@/lib/marktplaats-filter-navigation";

type DealKind = MarktplaatsDealFilterKind;
type SelectionFilter = MarktplaatsSelectionFilter;
export interface MarktplaatsDealSearchParams {
  dealKind?: string;
  dealMatch?: string;
  dealQ?: string;
}

export interface MarktplaatsDealPanelRun {
  finishedAt: string | null;
  listingsChecked: number;
  warning: string | null;
}

export interface MarktplaatsDealPanelItem {
  id: string;
  kind: string;
  title: string;
  listing_url: string;
  listing_price_eur: number;
  shipping_eur: number | null;
  market_value_eur: number;
  savings_eur: number;
  discount_percent: number;
  condition: string | null;
  language: string | null;
  grading_company: string | null;
  grading_grade: string | null;
  match_confidence: number;
  match_status: string;
  description_summary: string | null;
  offer_contents: string | null;
  card: {
    id: string;
    name: string;
    card_number: string | null;
    printed_card_number: string | null;
    image_url: string | null;
    episode: { name: string; code: string | null };
  } | null;
  episode: {
    id: string;
    name: string;
    code: string | null;
    logo_url: string | null;
  } | null;
}

export interface MarktplaatsRadarSignalPreview {
  cardId: string;
  rank: number;
  pressureLabel: string;
  externalScore: number;
  confidence: string;
  reasons: string[];
  pressureExplanation: string;
}

function parseKind(value: string | undefined): DealKind | null {
  return value === "raw" ||
    value === "graded" ||
    value === "expansion" ||
    value === "collection"
    ? value
    : null;
}

function parseSelection(value: string | undefined): SelectionFilter {
  return value === "deals" || value === "review" ? value : "daily";
}

function money(value: number): string {
  return new Intl.NumberFormat("nl-NL", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(value);
}

function dateTime(value: string | null): string {
  if (!value) return "Nog niet uitgevoerd";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

function kindLabel(kind: string): string {
  if (kind === "graded") return "Graded kaart";
  if (kind === "expansion") return "Complete expansion";
  if (kind === "collection") return "Kaartcollectie";
  return "Raw ENG kaart";
}

const DEAL_GROUPS: Array<{
  kind: DealKind;
  title: string;
  description: string;
  emptyText: string;
}> = [
  {
    kind: "graded",
    title: "Graded cards",
    description:
      "Exacte grading company en grade, vergeleken met de bijbehorende graded marktprijs.",
    emptyText:
      "Vandaag is nog geen exact geverifieerde graded aanbieding in deze selectie gevonden.",
  },
  {
    kind: "expansion",
    title: "Complete expansions",
    description:
      "Alleen complete Engelse expansions die veilig met het volledige DustyCards-settotaal matchen.",
    emptyText:
      "Geen complete expansion veilig gematcht. Onvolledige base sets en onduidelijke edities worden bewust niet als expansiondeal getoond.",
  },
  {
    kind: "collection",
    title: "Collections & mastersets",
    description:
      "Exact benoemde Engelse inhoud uit binders, collecties en mastersets in de advertentiebeschrijving.",
    emptyText:
      "Geen collectie met voldoende exact beschreven Engelse inhoud voor een betrouwbare totaalprijs.",
  },
  {
    kind: "raw",
    title: "English singles",
    description:
      "Losse Engelse kaarten vanaf €5 marktwaarde, op naam, nummer, set en beschrijving gecontroleerd.",
    emptyText: "Geen losse Engelse kaart in deze selectie.",
  },
];

function MarktplaatsFilterButton({
  onClick,
  active,
  label,
  activeClassName,
  inactiveClassName,
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  activeClassName: string;
  inactiveClassName: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
        active ? activeClassName : inactiveClassName
      }`}
    >
      {label}
    </button>
  );
}

export default function MarktplaatsDealsPanel({
  initialSearchParams,
  run,
  allDeals,
  radarSignals,
}: {
  initialSearchParams: MarktplaatsDealSearchParams;
  run: MarktplaatsDealPanelRun | null;
  allDeals: MarktplaatsDealPanelItem[];
  radarSignals: MarktplaatsRadarSignalPreview[];
}) {
  const [kind, setKind] = useState<DealKind | null>(() =>
    parseKind(initialSearchParams.dealKind),
  );
  const [selection, setSelection] = useState<SelectionFilter>(() =>
    parseSelection(initialSearchParams.dealMatch),
  );
  const [query, setQuery] = useState(
    () => initialSearchParams.dealQ?.trim().slice(0, 100) ?? "",
  );
  const normalizedQuery = query.toLocaleLowerCase("nl-NL");
  const searchedDeals = useMemo(
    () =>
      normalizedQuery
        ? allDeals.filter((deal) =>
            [deal.title, deal.description_summary, deal.offer_contents]
              .filter((value): value is string => Boolean(value))
              .some((value) =>
                value.toLocaleLowerCase("nl-NL").includes(normalizedQuery),
              ),
          )
        : allDeals,
    [allDeals, normalizedQuery],
  );
  const counts = useMemo(
    () => summarizeMarktplaatsFilterCounts(searchedDeals, kind, selection),
    [kind, searchedDeals, selection],
  );
  const deals = useMemo(
    () =>
      searchedDeals.filter(
        (deal) =>
          matchesMarktplaatsSelection(deal.match_status, selection) &&
          (!kind || deal.kind === kind),
      ),
    [kind, searchedDeals, selection],
  );
  const radarSignalsByCardId = new Map(
    radarSignals.map((signal) => [
      signal.cardId,
      signal,
    ]),
  );
  const dealGroups = (
    kind ? DEAL_GROUPS.filter((group) => group.kind === kind) : DEAL_GROUPS
  ).map((group) => ({
    ...group,
    deals: deals.filter((deal) => deal.kind === group.kind),
  }));

  return (
    <HomeItemDetailProvider>
      <div className="space-y-3">
        <section className="binder-subpanel overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
                <PackageSearch className="h-4 w-4" /> Dagelijkse Codex-scan ·
                21:00
              </div>
              <h2 className="mt-2 text-xl font-black text-[var(--dc-text-primary)] sm:text-2xl">
                Marktplaats topselectie
              </h2>
              <p className="mt-2 text-xs leading-5 text-[var(--dc-text-muted)] sm:text-sm">
                Elke advertentie is op titel én beschrijving gecontroleerd.
                Echte deals staan bovenaan; de dagselectie wordt tot minimaal 10
                aangevuld met de beste aanbiedingen rond marktwaarde. Losse en
                graded kaarten met een marktwaarde onder €5 worden niet getoond.
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.7)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] p-3">
                <div className="text-[var(--dc-text-muted)]">Gecontroleerd</div>
                <div className="mt-1 text-xl font-black text-[var(--dc-text-primary)]">
                  {run?.listingsChecked ?? 0}
                </div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.7)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] p-3">
                <div className="text-[var(--dc-text-muted)]">Geselecteerd</div>
                <div className="mt-1 text-xl font-black text-[var(--dc-text-primary)]">
                  {counts.currentResultCount}
                </div>
              </div>
              <div className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.7)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] p-3">
                <div className="text-[var(--dc-text-muted)]">Onder markt</div>
                <div className="mt-1 text-xl font-black text-emerald-200">
                  {counts.dealCount}
                </div>
              </div>
            </div>
          </div>
          <p className="mt-3 text-[10px] font-semibold text-[var(--dc-text-muted)]">
            Laatste scan: {dateTime(run?.finishedAt ?? null)} · Niet iedere
            gecontroleerde advertentie haalt de dagselectie.
          </p>
          {run?.warning ? (
            <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{run.warning}</span>
            </div>
          ) : null}
        </section>

        <section
          id="marktplaats-filters"
          className="binder-subpanel flex scroll-mt-24 flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap gap-1.5">
            {[
              [null, `Alles (${counts.allKindsCount})`],
              ["raw", `Raw (${counts.categoryCounts.raw})`],
              ["graded", `Graded (${counts.categoryCounts.graded})`],
              ["expansion", `Expansions (${counts.categoryCounts.expansion})`],
              ["collection", `Collecties (${counts.categoryCounts.collection})`],
            ].map(([filterKind, label]) => (
              <MarktplaatsFilterButton
                key={filterKind ?? "all"}
                onClick={() => setKind(filterKind as DealKind | null)}
                active={filterKind === kind}
                label={label ?? ""}
                activeClassName="bg-amber-300 text-slate-950"
                inactiveClassName="border border-[rgb(var(--dc-border-rgb)/0.75)] text-[var(--dc-text-secondary)] hover:bg-white/5"
              />
            ))}
            {[
              ["daily", `Dagselectie (${counts.dailyCount})`],
              ["deals", `Onder markt (${counts.dealCount})`],
              ["review", `Controleren (${counts.reviewCount})`],
            ].map(([filter, label]) => (
              <MarktplaatsFilterButton
                key={filter}
                onClick={() => setSelection(filter as SelectionFilter)}
                active={filter === selection}
                label={label}
                activeClassName="bg-violet-300 text-slate-950"
                inactiveClassName="border border-violet-300/20 text-violet-200 hover:bg-violet-300/10"
              />
            ))}
          </div>
          <div className="flex min-w-0 gap-2">
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value.slice(0, 100))}
              placeholder="Zoek titel of beschrijving"
              className="min-w-0 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.8)] bg-[var(--dc-surface-primary)] px-3 py-2 text-xs text-[var(--dc-text-primary)] outline-none placeholder:text-[var(--dc-text-muted)] focus:border-amber-300/60"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="rounded-xl bg-[rgb(var(--dc-text-primary-rgb)/0.1)] px-3 py-2 text-xs font-bold text-[var(--dc-text-primary)] hover:bg-[rgb(var(--dc-text-primary-rgb)/0.15)]"
              >
                Wissen
              </button>
            ) : null}
          </div>
        </section>

        {deals.length === 0 ? (
          <section className="binder-subpanel rounded-2xl border-dashed px-5 py-12 text-center">
            <PackageSearch className="mx-auto h-9 w-9 text-[var(--dc-text-muted)]" />
            <h3 className="mt-3 text-lg font-bold text-[var(--dc-text-primary)]">
              {kind
                ? `Geen ${DEAL_GROUPS.find((group) => group.kind === kind)?.title.toLowerCase()}`
                : "Nog geen dagselectie"}
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-[var(--dc-text-muted)]">
              {kind
                ? DEAL_GROUPS.find((group) => group.kind === kind)?.emptyText
                : "Na de eerstvolgende scan om 21:00 verschijnt hier de topselectie van de dag."}
            </p>
          </section>
        ) : (
          <div className="space-y-4">
            {dealGroups.map((group) => (
              <section
                key={group.kind}
                className="binder-subpanel overflow-hidden rounded-2xl p-3 sm:p-4"
              >
                <div className="flex flex-col gap-2 border-b border-[rgb(var(--dc-border-rgb)/0.65)] pb-3 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-200">
                      Marktplaats · {group.title}
                    </div>
                    <p className="mt-1 max-w-3xl text-xs leading-5 text-[var(--dc-text-muted)]">
                      {group.description}
                    </p>
                  </div>
                  <span className="w-fit rounded-full border border-[rgb(var(--dc-border-rgb)/0.75)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] px-3 py-1.5 text-xs font-black text-[var(--dc-text-secondary)]">
                    {group.deals.length} gevonden
                  </span>
                </div>

                {group.deals.length === 0 ? (
                  <div className="mt-3 rounded-xl border border-dashed border-[rgb(var(--dc-border-rgb)/0.75)] px-4 py-6 text-center text-xs leading-5 text-[var(--dc-text-muted)]">
                    {group.emptyText}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 xl:grid-cols-2">
                    {group.deals.map((deal) => {
                      const index = deals.findIndex(
                        (candidate) => candidate.id === deal.id,
                      );
                      const referenceName =
                        deal.card?.name ?? deal.episode?.name ?? deal.title;
                      const referenceDetail = deal.card
                        ? [
                            deal.card.episode.code ?? deal.card.episode.name,
                            deal.card.printed_card_number ??
                              deal.card.card_number,
                          ]
                            .filter(Boolean)
                            .join(" · ")
                        : (deal.episode?.code ?? null);
                      const belowMarket =
                        deal.listing_price_eur < deal.market_value_eur;
                      const referenceImageUrl =
                        deal.card?.image_url ?? deal.episode?.logo_url ?? null;
                      const detailLabel = deal.card
                        ? `Bekijk ${referenceName} in DustyCards`
                        : `Bekijk expansion ${referenceName}`;
                      const radarSignal = deal.card
                        ? (radarSignalsByCardId.get(deal.card.id) ?? null)
                        : null;
                      return (
                        <article
                          key={deal.id}
                          className="binder-subpanel overflow-hidden rounded-2xl p-3 sm:p-4"
                        >
                          <div className="grid min-w-0 grid-cols-[5.6rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-4">
                            <div className="min-w-0">
                              {deal.card ? (
                                <MarktplaatsCardDetailButton
                                  cardId={deal.card.id}
                                  label={detailLabel}
                                  className="group/reference relative block w-full rounded-xl text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
                                >
                                  <ReferenceImage
                                    imageUrl={referenceImageUrl}
                                    alt={referenceName}
                                    kind="card"
                                  />
                                  <span className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-violet-300/20 bg-violet-300/10 px-2 py-2 text-[9px] font-black text-violet-100 transition group-hover/reference:border-violet-300/40 group-hover/reference:bg-violet-300/15 sm:text-[10px]">
                                    <ScanSearch className="h-3.5 w-3.5 shrink-0" />{" "}
                                    Kaartdetails
                                  </span>
                                </MarktplaatsCardDetailButton>
                              ) : deal.episode ? (
                                <Link
                                  href={`/expansions/${encodeURIComponent(deal.episode.id)}`}
                                  aria-label={detailLabel}
                                  className="group/reference block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70"
                                >
                                  <ReferenceImage
                                    imageUrl={referenceImageUrl}
                                    alt={referenceName}
                                    kind="expansion"
                                  />
                                  <span className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-violet-300/20 bg-violet-300/10 px-2 py-2 text-[9px] font-black text-violet-100 transition group-hover/reference:border-violet-300/40 group-hover/reference:bg-violet-300/15 sm:text-[10px]">
                                    <ScanSearch className="h-3.5 w-3.5 shrink-0" />{" "}
                                    Setdetails
                                  </span>
                                </Link>
                              ) : (
                                <span className="block rounded-xl opacity-70">
                                  <ReferenceImage
                                    imageUrl={referenceImageUrl}
                                    alt={referenceName}
                                    kind="expansion"
                                  />
                                  <span className="mt-2 inline-flex w-full items-center justify-center rounded-lg border border-[rgb(var(--dc-border-rgb)/0.65)] px-2 py-2 text-[9px] font-black text-[var(--dc-text-muted)] sm:text-[10px]">
                                    Geen setdetail
                                  </span>
                                </span>
                              )}
                              <p className="mt-2 text-center text-[8px] font-black uppercase tracking-[0.12em] text-[var(--dc-text-muted)] sm:text-[9px]">
                                DustyCards match
                              </p>
                            </div>

                            <div className="min-w-0">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200">
                                      #{index + 1} · {kindLabel(deal.kind)}
                                    </span>
                                    <span
                                      className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                                        deal.match_status === "review"
                                          ? "bg-violet-300/10 text-violet-200"
                                          : belowMarket
                                            ? "bg-emerald-300/10 text-emerald-200"
                                            : "bg-sky-300/10 text-sky-200"
                                      }`}
                                    >
                                      {deal.match_status === "review"
                                        ? "Controleren"
                                        : belowMarket
                                          ? `${Math.round(deal.match_confidence * 100)}% match · onder markt`
                                          : "Dagselectie · rond markt"}
                                    </span>
                                    {radarSignal ? (
                                      <Link
                                        href={`/movers/signal-radar/${encodeURIComponent(radarSignal.cardId)}?game=pokemon`}
                                        className="inline-flex items-center gap-1 rounded-full border border-violet-300/25 bg-violet-300/10 px-2 py-1 text-[10px] font-black text-violet-100 transition hover:border-violet-300/45 hover:bg-violet-300/15"
                                      >
                                        <Radar className="h-3 w-3" /> Signal
                                        Radar #{radarSignal.rank} ·{" "}
                                        {radarSignal.pressureLabel}
                                      </Link>
                                    ) : null}
                                  </div>
                                  <h3 className="mt-2 line-clamp-2 text-base font-black text-[var(--dc-text-primary)]">
                                    {deal.title}
                                  </h3>
                                  <p className="mt-1 text-xs font-semibold text-[var(--dc-text-secondary)]">
                                    {referenceName}
                                    {referenceDetail
                                      ? ` · ${referenceDetail}`
                                      : ""}
                                  </p>
                                </div>
                                {deal.match_status === "review" ? (
                                  <TriangleAlert className="h-5 w-5 shrink-0 text-violet-300" />
                                ) : (
                                  <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
                                )}
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
                                <PriceStat
                                  label="Advertentie"
                                  value={money(deal.listing_price_eur)}
                                />
                                <PriceStat
                                  label="Marktwaarde"
                                  value={money(deal.market_value_eur)}
                                />
                                <PriceStat
                                  label={
                                    belowMarket ? "Besparing" : "Boven markt"
                                  }
                                  value={`${money(Math.abs(deal.savings_eur))} · ${Math.abs(deal.discount_percent).toFixed(1)}%`}
                                  positive={belowMarket}
                                />
                                <PriceStat
                                  label="Verzending"
                                  value={
                                    deal.shipping_eur == null
                                      ? "Onbekend"
                                      : money(deal.shipping_eur)
                                  }
                                  hint="Niet meegerekend"
                                />
                              </div>

                              {deal.description_summary ? (
                                <div className="mt-3 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.65)] bg-[rgb(var(--dc-surface-primary-rgb)/0.4)] p-3">
                                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-[var(--dc-text-muted)]">
                                    Gecontroleerde beschrijving
                                  </div>
                                  <p className="mt-1.5 text-xs leading-5 text-[var(--dc-text-secondary)]">
                                    {deal.description_summary}
                                  </p>
                                  {deal.offer_contents ? (
                                    <p className="mt-1.5 text-[11px] text-[var(--dc-text-muted)]">
                                      <strong className="text-[var(--dc-text-secondary)]">
                                        Aanbod:
                                      </strong>{" "}
                                      {deal.offer_contents}
                                    </p>
                                  ) : null}
                                </div>
                              ) : null}

                              {radarSignal ? (
                                <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-300/[0.07] p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 text-[9px] font-black uppercase tracking-[0.12em] text-violet-200">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Radar className="h-3.5 w-3.5" /> Signal
                                      Radar-prioriteit
                                    </span>
                                    <span>
                                      Score {radarSignal.externalScore} ·{" "}
                                      {radarSignal.confidence}
                                    </span>
                                  </div>
                                  <p className="mt-1.5 text-[11px] leading-4 text-violet-100/75">
                                    {radarSignal.reasons[0] ??
                                      radarSignal.pressureExplanation}
                                  </p>
                                </div>
                              ) : null}

                              <div className="mt-3 flex flex-col gap-2 border-t border-[rgb(var(--dc-border-rgb)/0.6)] pt-3 text-[10px] text-[var(--dc-text-muted)] sm:flex-row sm:items-center sm:justify-between">
                                <span className="min-w-0">
                                  {[
                                    deal.condition,
                                    deal.language,
                                    deal.grading_company,
                                    deal.grading_grade,
                                  ]
                                    .filter(Boolean)
                                    .join(" · ") || "Geen extra kenmerken"}
                                </span>
                                <a
                                  href={deal.listing_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 font-bold text-slate-950 hover:bg-amber-200"
                                >
                                  Bekijk advertentie{" "}
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </div>
    </HomeItemDetailProvider>
  );
}

function ReferenceImage({
  imageUrl,
  alt,
  kind,
}: {
  imageUrl: string | null;
  alt: string;
  kind: "card" | "expansion";
}) {
  return (
    <span
      className={`relative block w-full overflow-hidden border border-[rgb(var(--dc-border-rgb)/0.85)] bg-[rgb(var(--dc-surface-primary-rgb)/0.72)] shadow-[0_12px_28px_rgba(0,0,0,0.28)] ${
        kind === "card"
          ? "aspect-[63/88] rounded-[0.8rem]"
          : "aspect-square rounded-xl"
      }`}
    >
      {imageUrl ? (
        <CachedImage
          sourceUrl={imageUrl}
          alt={alt}
          fill
          sizes="(max-width: 640px) 90px, 120px"
          className="object-contain transition-transform duration-200 group-hover/reference:scale-[1.025]"
          revealImmediately
        />
      ) : (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-2 text-center text-[var(--dc-text-muted)]">
          <ImageOff className="h-6 w-6" />
          <span className="text-[8px] font-bold uppercase tracking-[0.1em]">
            Geen afbeelding
          </span>
        </span>
      )}
    </span>
  );
}

function PriceStat({
  label,
  value,
  hint,
  positive = false,
}: {
  label: string;
  value: string;
  hint?: string;
  positive?: boolean;
}) {
  return (
    <div
      className={`rounded-xl p-2.5 ${positive ? "bg-emerald-300/10" : "bg-[rgb(var(--dc-text-primary-rgb)/0.045)]"}`}
    >
      <div
        className={`text-[10px] ${positive ? "text-emerald-200/70" : "text-[var(--dc-text-muted)]"}`}
      >
        {label}
      </div>
      <div
        className={`mt-1 text-xs font-black ${positive ? "text-emerald-200" : "text-[var(--dc-text-primary)]"}`}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-1 text-[9px] text-[var(--dc-text-muted)]">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

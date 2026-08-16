import Link from "next/link";
import { ExternalLink, PackageSearch, ShieldCheck, TriangleAlert } from "lucide-react";
import { db } from "@/lib/db";

type DealKind = "raw" | "graded" | "expansion";
type SelectionFilter = "daily" | "deals" | "review";

export interface MarktplaatsDealSearchParams {
  dealKind?: string;
  dealMatch?: string;
  dealQ?: string;
}

function parseKind(value: string | undefined): DealKind | null {
  return value === "raw" || value === "graded" || value === "expansion" ? value : null;
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

function dateTime(value: Date | null): string {
  if (!value) return "Nog niet uitgevoerd";
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(value);
}

function kindLabel(kind: string): string {
  if (kind === "graded") return "Graded kaart";
  if (kind === "expansion") return "Complete expansion";
  return "Raw ENG kaart";
}

function buildFilterHref(input: {
  kind?: DealKind | null;
  selection?: SelectionFilter;
  q?: string;
}): string {
  const params = new URLSearchParams({ tab: "selling", sellingView: "marktplaats" });
  if (input.kind) params.set("dealKind", input.kind);
  if (input.selection && input.selection !== "daily") params.set("dealMatch", input.selection);
  if (input.q?.trim()) params.set("dealQ", input.q.trim());
  return `/?${params.toString()}`;
}

async function latestRun() {
  return db.marktplaatsScanRun.findFirst({
    where: { finished_at: { not: null } },
    orderBy: { started_at: "desc" },
  });
}

export async function getLatestMarktplaatsSelectionCount(): Promise<number> {
  const run = await latestRun();
  if (!run) return 0;
  return db.marktplaatsDeal.count({
    where: {
      scan_run_id: run.id,
      removed_at: null,
      match_status: { in: ["matched", "shortlist"] },
    },
  });
}

export default async function MarktplaatsDealsPanel({
  searchParams,
}: {
  searchParams: MarktplaatsDealSearchParams;
}) {
  const kind = parseKind(searchParams.dealKind);
  const selection = parseSelection(searchParams.dealMatch);
  const query = searchParams.dealQ?.trim().slice(0, 100) ?? "";
  const run = await latestRun();

  const statusWhere =
    selection === "review"
      ? "review"
      : selection === "deals"
        ? "matched"
        : { in: ["matched", "shortlist"] };
  const where = {
    scan_run_id: run?.id ?? "__no_scan__",
    removed_at: null,
    match_status: statusWhere,
    ...(kind ? { kind } : {}),
    ...(query
      ? {
          OR: [
            { title: { contains: query } },
            { description_summary: { contains: query } },
            { offer_contents: { contains: query } },
          ],
        }
      : {}),
  };
  const [deals, activeCounts, selectionCount, dealCount, reviewCount] = await Promise.all([
    db.marktplaatsDeal.findMany({
      where,
      orderBy: [{ discount_percent: "desc" }, { savings_eur: "desc" }],
      take: 200,
      include: {
        card: {
          select: {
            name: true,
            card_number: true,
            printed_card_number: true,
            episode: { select: { name: true, code: true } },
          },
        },
        episode: { select: { name: true, code: true } },
      },
    }),
    db.marktplaatsDeal.groupBy({
      by: ["kind"],
      where: {
        scan_run_id: run?.id ?? "__no_scan__",
        removed_at: null,
        match_status: { in: ["matched", "shortlist"] },
      },
      _count: { _all: true },
    }),
    run
      ? db.marktplaatsDeal.count({
          where: {
            scan_run_id: run.id,
            removed_at: null,
            match_status: { in: ["matched", "shortlist"] },
          },
        })
      : 0,
    run
      ? db.marktplaatsDeal.count({
          where: { scan_run_id: run.id, removed_at: null, match_status: "matched" },
        })
      : 0,
    run
      ? db.marktplaatsDeal.count({
          where: { scan_run_id: run.id, removed_at: null, match_status: "review" },
        })
      : 0,
  ]);
  const counts = new Map(activeCounts.map((entry) => [entry.kind, entry._count._all]));

  return (
    <div className="space-y-3">
      <section className="binder-subpanel overflow-hidden rounded-2xl p-4 sm:rounded-3xl sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-amber-300">
              <PackageSearch className="h-4 w-4" /> Dagelijkse Codex-scan · 21:00
            </div>
            <h2 className="mt-2 text-xl font-black text-[var(--dc-text-primary)] sm:text-2xl">
              Marktplaats topselectie
            </h2>
            <p className="mt-2 text-xs leading-5 text-[var(--dc-text-muted)] sm:text-sm">
              Elke advertentie is op titel én beschrijving gecontroleerd. Echte deals staan bovenaan;
              de dagselectie wordt tot minimaal 10 aangevuld met de beste aanbiedingen rond marktwaarde.
            </p>
          </div>
          <div className="grid min-w-[260px] grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.7)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] p-3">
              <div className="text-[var(--dc-text-muted)]">Dagselectie</div>
              <div className="mt-1 text-xl font-black text-[var(--dc-text-primary)]">{selectionCount}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--dc-border-rgb)/0.7)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.65)] p-3">
              <div className="text-[var(--dc-text-muted)]">Laatste scan</div>
              <div className="mt-1 font-bold text-[var(--dc-text-primary)]">
                {dateTime(run?.finished_at ?? null)}
              </div>
            </div>
          </div>
        </div>
        {run?.warning ? (
          <div className="mt-4 flex gap-2 rounded-xl border border-amber-400/25 bg-amber-400/10 p-3 text-xs text-amber-100">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{run.warning}</span>
          </div>
        ) : null}
      </section>

      <section className="binder-subpanel flex flex-col gap-3 rounded-2xl p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1.5">
          {[
            [null, `Alles (${selectionCount})`],
            ["raw", `Raw (${counts.get("raw") ?? 0})`],
            ["graded", `Graded (${counts.get("graded") ?? 0})`],
            ["expansion", `Expansions (${counts.get("expansion") ?? 0})`],
          ].map(([filterKind, label]) => (
            <Link
              key={filterKind ?? "all"}
              href={buildFilterHref({ kind: filterKind as DealKind | null, selection, q: query })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                filterKind === kind
                  ? "bg-amber-300 text-slate-950"
                  : "border border-[rgb(var(--dc-border-rgb)/0.75)] text-[var(--dc-text-secondary)] hover:bg-white/5"
              }`}
            >
              {label}
            </Link>
          ))}
          {[
            ["daily", `Dagselectie (${selectionCount})`],
            ["deals", `Onder markt (${dealCount})`],
            ["review", `Controleren (${reviewCount})`],
          ].map(([filter, label]) => (
            <Link
              key={filter}
              href={buildFilterHref({ kind, selection: filter as SelectionFilter, q: query })}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition ${
                filter === selection
                  ? "bg-violet-300 text-slate-950"
                  : "border border-violet-300/20 text-violet-200 hover:bg-violet-300/10"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
        <form className="flex min-w-0 gap-2" action="/">
          <input type="hidden" name="tab" value="selling" />
          <input type="hidden" name="sellingView" value="marktplaats" />
          {kind ? <input type="hidden" name="dealKind" value={kind} /> : null}
          {selection !== "daily" ? <input type="hidden" name="dealMatch" value={selection} /> : null}
          <input
            type="search"
            name="dealQ"
            defaultValue={query}
            placeholder="Zoek titel of beschrijving"
            className="min-w-0 rounded-xl border border-[rgb(var(--dc-border-rgb)/0.8)] bg-[var(--dc-surface-primary)] px-3 py-2 text-xs text-[var(--dc-text-primary)] outline-none placeholder:text-[var(--dc-text-muted)] focus:border-amber-300/60"
          />
          <button className="rounded-xl bg-[rgb(var(--dc-text-primary-rgb)/0.1)] px-3 py-2 text-xs font-bold text-[var(--dc-text-primary)] hover:bg-[rgb(var(--dc-text-primary-rgb)/0.15)]">
            Zoeken
          </button>
        </form>
      </section>

      {deals.length === 0 ? (
        <section className="binder-subpanel rounded-2xl border-dashed px-5 py-12 text-center">
          <PackageSearch className="mx-auto h-9 w-9 text-[var(--dc-text-muted)]" />
          <h3 className="mt-3 text-lg font-bold text-[var(--dc-text-primary)]">Nog geen dagselectie</h3>
          <p className="mx-auto mt-2 max-w-xl text-xs leading-5 text-[var(--dc-text-muted)]">
            Na de eerstvolgende scan om 21:00 verschijnt hier de top 10 van de dag. Als er minder dan
            tien bruikbare advertenties bestaan, toont DustyCards alle gecontroleerde resultaten.
          </p>
        </section>
      ) : (
        <section className="grid gap-3 xl:grid-cols-2">
          {deals.map((deal, index) => {
            const referenceName = deal.card?.name ?? deal.episode?.name ?? deal.title;
            const referenceDetail = deal.card
              ? [
                  deal.card.episode.code ?? deal.card.episode.name,
                  deal.card.printed_card_number ?? deal.card.card_number,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : deal.episode?.code ?? null;
            const belowMarket = deal.listing_price_eur < deal.market_value_eur;
            return (
              <article key={deal.id} className="binder-subpanel rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="rounded-full bg-amber-300/10 px-2 py-1 text-[10px] font-bold text-amber-200">
                        #{index + 1} · {kindLabel(deal.kind)}
                      </span>
                      <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                        deal.match_status === "review"
                          ? "bg-violet-300/10 text-violet-200"
                          : belowMarket
                            ? "bg-emerald-300/10 text-emerald-200"
                            : "bg-sky-300/10 text-sky-200"
                      }`}>
                        {deal.match_status === "review"
                          ? "Controleren"
                          : belowMarket
                            ? `${Math.round(deal.match_confidence * 100)}% match · onder markt`
                            : "Dagselectie · rond markt"}
                      </span>
                    </div>
                    <h3 className="mt-2 line-clamp-2 text-base font-black text-[var(--dc-text-primary)]">
                      {deal.title}
                    </h3>
                    <p className="mt-1 text-xs font-semibold text-[var(--dc-text-secondary)]">
                      {referenceName}{referenceDetail ? ` · ${referenceDetail}` : ""}
                    </p>
                  </div>
                  {deal.match_status === "review" ? (
                    <TriangleAlert className="h-5 w-5 shrink-0 text-violet-300" />
                  ) : (
                    <ShieldCheck className="h-5 w-5 shrink-0 text-emerald-300" />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PriceStat label="Advertentie" value={money(deal.listing_price_eur)} />
                  <PriceStat label="Marktwaarde" value={money(deal.market_value_eur)} />
                  <PriceStat
                    label={belowMarket ? "Besparing" : "Boven markt"}
                    value={`${money(Math.abs(deal.savings_eur))} · ${Math.abs(deal.discount_percent).toFixed(1)}%`}
                    positive={belowMarket}
                  />
                  <PriceStat
                    label="Verzending"
                    value={deal.shipping_eur == null ? "Onbekend" : money(deal.shipping_eur)}
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
                        <strong className="text-[var(--dc-text-secondary)]">Aanbod:</strong> {deal.offer_contents}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--dc-text-muted)]">
                  <span>
                    {[deal.condition, deal.language, deal.grading_company, deal.grading_grade]
                      .filter(Boolean)
                      .join(" · ") || "Geen extra kenmerken"}
                  </span>
                  <a
                    href={deal.listing_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-xl bg-amber-300 px-3 py-2 font-bold text-slate-950 hover:bg-amber-200"
                  >
                    Bekijk advertentie <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
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
    <div className={`rounded-xl p-2.5 ${positive ? "bg-emerald-300/10" : "bg-[rgb(var(--dc-text-primary-rgb)/0.045)]"}`}>
      <div className={`text-[10px] ${positive ? "text-emerald-200/70" : "text-[var(--dc-text-muted)]"}`}>
        {label}
      </div>
      <div className={`mt-1 text-xs font-black ${positive ? "text-emerald-200" : "text-[var(--dc-text-primary)]"}`}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[9px] text-[var(--dc-text-muted)]">{hint}</div> : null}
    </div>
  );
}

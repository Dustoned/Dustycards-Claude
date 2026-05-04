import { formatCurrency } from "@/lib/format";
import type { CollectionMoverItem } from "@/lib/movers";

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatDelta(value: number | null | undefined, currency: "EUR" | "USD"): string {
  if (value == null) return "--";
  return `${value >= 0 ? "+" : ""}${formatCurrency(value, currency)}`;
}

function formatScoreValue(value: number | null | undefined): string {
  if (value == null) return "--";
  if (Math.abs(value) >= 100) {
    return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
  }
  return value.toFixed(1);
}

function formatShortDate(value: string | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short" }).format(
    new Date(value)
  );
}

function getToneClass(value: number | null | undefined): string {
  if (value == null || value === 0) return "text-white/55";
  if (value < 0) return "text-rose-300";
  return "text-emerald-300";
}

interface TrendStat {
  label: string;
  percent: number | null;
  delta: number | null;
  hint: string;
}

function buildTrendStats(item: CollectionMoverItem): TrendStat[] {
  return [
    {
      label: "7D",
      percent: item.change7dPct,
      delta: item.change7d,
      hint: item.change7dCoveredDays ? `${item.change7dCoveredDays}d window` : "Recent",
    },
    {
      label: "30D",
      percent: item.change30dPct,
      delta: item.change30d,
      hint: item.change30dCoveredDays ? `${item.change30dCoveredDays}d window` : "Recent",
    },
    {
      label: "Tracked",
      percent: item.changeSinceTrackedPct,
      delta: item.changeSinceTracked,
      hint: item.firstTrackedAt
        ? `Since ${formatShortDate(item.firstTrackedAt)}${
            item.trackedDays != null ? ` / ${item.trackedDays}d` : ""
          }`
        : item.trackedDays != null
          ? `${item.trackedDays}d tracked`
          : "",
    },
    {
      label: "From Low",
      percent: item.changeFromLowPct,
      delta: item.changeFromLow,
      hint:
        item.lowPrice != null
          ? `Low ${formatCurrency(item.lowPrice, item.currency)}${
              item.lowAt ? ` / ${formatShortDate(item.lowAt)}` : ""
            }`
          : "",
    },
    {
      label: "Vs Peak",
      percent: item.gapToPeakPct,
      delta: item.gapToPeak,
      hint:
        item.highPrice != null
          ? `Peak ${formatCurrency(item.highPrice, item.currency)}${
              item.highAt ? ` / ${formatShortDate(item.highAt)}` : ""
            }`
          : "",
    },
  ];
}

function dedupeAndFilter(stats: TrendStat[]): TrendStat[] {
  const meaningful = stats.filter((stat) => {
    if (stat.percent == null && stat.delta == null) return false;
    const pAbs = stat.percent != null ? Math.abs(stat.percent) : 0;
    const dAbs = stat.delta != null ? Math.abs(stat.delta) : 0;
    return pAbs >= 0.5 || dAbs >= 0.05;
  });

  const seen = new Set<string>();
  const result: TrendStat[] = [];
  for (let i = meaningful.length - 1; i >= 0; i -= 1) {
    const stat = meaningful[i];
    const key = `${stat.percent?.toFixed(2) ?? ""}|${stat.delta?.toFixed(2) ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.unshift(stat);
  }
  return result;
}

function MetricTile({
  label,
  percent,
  delta,
  hint,
  currency,
}: {
  label: string;
  percent: number | null;
  delta: number | null;
  hint: string;
  currency: "EUR" | "USD";
}) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] font-semibold uppercase tracking-[0.16em] leading-tight text-white/52">
          {label}
        </p>
        {percent != null ? (
          <p
            className={`shrink-0 text-right text-base font-bold tabular-nums leading-tight ${getToneClass(
              percent
            )}`}
          >
            {formatPercent(percent)}
          </p>
        ) : null}
      </div>
      {delta != null ? (
        <p
          className={`mt-1 truncate text-xs font-semibold tabular-nums leading-tight ${getToneClass(
            delta
          )}`}
        >
          {formatDelta(delta, currency)}
        </p>
      ) : null}
      {hint ? (
        <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/42">{hint}</p>
      ) : null}
    </div>
  );
}

export function MoverStatsSection({
  moverInsight,
}: {
  moverInsight: CollectionMoverItem | null | undefined;
}) {
  if (!moverInsight) return null;

  const trendStats = dedupeAndFilter(buildTrendStats(moverInsight));
  const grading = moverInsight.grading;
  const tcggo = moverInsight.tcggoScore;
  const tcggoMetrics = tcggo
    ? [
        { label: "Momentum", value: tcggo.momentum },
        { label: "Stability", value: tcggo.stability },
        { label: "Liquidity", value: tcggo.liquidity },
        { label: "Demand", value: tcggo.demand },
        { label: "Depth", value: tcggo.marketDepth },
        { label: "Premium", value: tcggo.gradePremium },
        { label: "RSI", value: tcggo.rsi },
      ].filter((m) => m.value != null)
    : [];

  const weightChips: Array<{ label: string; tone: "amber" | "neutral" }> = [];
  if (moverInsight.pullRateWeight != null) {
    weightChips.push({
      label: `Odds ${moverInsight.pullRateWeight.toFixed(2)}`,
      tone: "amber",
    });
  }
  if (moverInsight.specificPullOdds) {
    weightChips.push({ label: `Pull ${moverInsight.specificPullOdds}`, tone: "neutral" });
  }
  weightChips.push({ label: `Rarity ${moverInsight.rarityWeight.toFixed(2)}`, tone: "neutral" });
  weightChips.push({ label: `Price ${moverInsight.cheapnessWeight.toFixed(2)}`, tone: "neutral" });

  const hasContent =
    trendStats.length > 0 || grading != null || tcggo != null || weightChips.length > 0;
  if (!hasContent) return null;

  const headerChips: Array<{ label: string; tone: "emerald" | "amber" | "neutral" }> = [];
  if (grading?.valueMultiplier != null) {
    headerChips.push({
      label: `${grading.valueMultiplier.toFixed(2)}x grade`,
      tone: "emerald",
    });
  }
  if (grading?.valueGap != null) {
    headerChips.push({
      label: `${formatDelta(grading.valueGap, "EUR")} gap`,
      tone: "amber",
    });
  }
  headerChips.push({
    label: `Score ${formatScoreValue(moverInsight.moverScore)}`,
    tone: "neutral",
  });

  return (
    <section
      aria-label="Movers insights"
      className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
          Movers insights
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {headerChips.map((chip) => (
            <span
              key={chip.label}
              className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                chip.tone === "emerald"
                  ? "border-emerald-400/30 bg-emerald-400/[0.12] text-emerald-200"
                  : chip.tone === "amber"
                    ? "border-amber-400/30 bg-amber-400/[0.12] text-amber-200"
                    : "border-white/10 bg-white/[0.04] text-white/68"
              }`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      </div>

      {trendStats.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {trendStats.map((stat) => (
            <MetricTile
              key={stat.label}
              label={stat.label}
              percent={stat.percent}
              delta={stat.delta}
              currency={moverInsight.currency}
              hint={stat.hint}
            />
          ))}
        </div>
      ) : null}

      {tcggo ? (
        <div className="mt-3 rounded-xl border border-sky-400/22 bg-sky-400/[0.10] px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-200/72">
              TCGGo score
            </p>
            <span className="shrink-0 rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-sky-200">
              {formatScoreValue(tcggo.score)}
              {tcggo.tier ? ` / ${tcggo.tier}` : ""}
            </span>
          </div>
          {tcggoMetrics.length > 0 ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {tcggoMetrics.map((metric) => (
                <div key={metric.label} className="rounded-lg bg-white/[0.06] px-2.5 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-sky-100/55">
                    {metric.label}
                  </p>
                  <p className="mt-0.5 text-sm font-bold tabular-nums text-white">
                    {formatScoreValue(metric.value)}
                  </p>
                </div>
              ))}
            </div>
          ) : null}
          {tcggo.ath != null || tcggo.atl != null ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-sky-100/65">
              {tcggo.ath != null ? (
                <span>ATH {formatCurrency(tcggo.ath, "EUR")}</span>
              ) : null}
              {tcggo.atl != null ? (
                <span>ATL {formatCurrency(tcggo.atl, "EUR")}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {weightChips.length > 0 ? (
        <div className="mt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Weight
          </p>
          <div className="flex flex-wrap gap-1.5">
            {weightChips.map((chip) => (
              <span
                key={chip.label}
                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums ${
                  chip.tone === "amber"
                    ? "border-amber-400/30 bg-amber-400/[0.12] text-amber-200"
                    : "border-white/10 bg-white/[0.04] text-white/68"
                }`}
              >
                {chip.label}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

"use client";

interface PullRateHoverTableProps {
  className?: string;
  profile: {
    generated_at: string | null;
    cards_counted: number | null;
    psa_avg_gem_pct: number | null;
    rarities: Array<{
      id: string;
      rarity_name: string;
      card_count: number | null;
      pull_rate_denominator: number | null;
      specific_pull_denominator: number | null;
      psa_avg_gem_pct: number | null;
    }>;
  };
}

function formatOddsValue(value: number | null): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "--";
  const rounded = value >= 100 ? Math.round(value) : Number(value.toFixed(2));
  return `1/${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function formatPercentValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  const percentage = Math.abs(value) <= 1 ? value * 100 : value;
  return `${percentage.toFixed(1)}%`;
}

export default function PullRateHoverTable({
  profile,
  className = "",
}: PullRateHoverTableProps) {
  const sortedRarities = [...profile.rarities].sort((a, b) => {
    const aValue = a.specific_pull_denominator ?? a.pull_rate_denominator ?? 0;
    const bValue = b.specific_pull_denominator ?? b.pull_rate_denominator ?? 0;
    return bValue - aValue;
  });
  const generatedLabel = profile.generated_at
    ? String(profile.generated_at).split("T")[0]
    : null;

  const footerText = [
    generatedLabel ? `Generated ${generatedLabel}` : null,
    profile.cards_counted != null ? `${profile.cards_counted} cards counted` : null,
    profile.psa_avg_gem_pct != null
      ? `Avg GEM ${formatPercentValue(profile.psa_avg_gem_pct)}`
      : null,
  ]
    .filter(Boolean)
    .join(" / ");

  return (
    <div
      className={`group relative min-w-0 ${className}`}
      tabIndex={0}
      aria-label={`Pull-rate data: ${profile.rarities.length} rarity tiers`}
    >
      <div className="flex min-h-full min-w-0 cursor-default flex-wrap items-center justify-between gap-[var(--ui-header-action-gap)] rounded-[var(--ui-binder-metric-radius)] border border-amber-400/14 bg-amber-400/[0.055] px-[var(--ui-binder-metric-x)] py-[var(--ui-binder-metric-y)] text-gray-800 transition-colors group-hover:bg-amber-400/[0.075] group-focus-visible:ring-2 group-focus-visible:ring-amber-300/45 dark:text-amber-50">
        <div className="min-w-0">
          <p className="text-[length:var(--ui-binder-metric-label-size)] font-semibold uppercase tracking-[0.14em] text-amber-700/70 dark:text-amber-100/50">
            Pull Rate Data
          </p>
          <p className="mt-1.5 truncate text-[length:var(--ui-binder-metric-value-size)] font-bold leading-none tracking-tight text-gray-950 dark:text-white">
            {profile.rarities.length.toLocaleString("nl-NL")} rarity tiers
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center rounded-full border border-black/8 bg-white/60 px-[var(--ui-header-pill-x)] py-[var(--ui-header-pill-y)] text-[length:var(--ui-header-pill-font-size)] font-bold text-gray-600 transition-colors group-hover:bg-white/75 dark:border-white/8 dark:bg-white/[0.06] dark:text-white/68 dark:group-hover:bg-white/[0.09]">
          Hover
        </span>
      </div>

      <div className="pointer-events-none invisible absolute bottom-full right-0 z-[120] w-[min(36rem,calc(100vw-2rem))] translate-y-1 opacity-0 transition-[opacity,transform,visibility] duration-150 ease-out group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div
          className="max-h-[19rem] min-w-0 overflow-y-auto overflow-x-hidden rounded-[var(--ui-binder-metric-radius)] border border-amber-400/16 bg-[#17140d]/96 text-amber-50 shadow-2xl shadow-black/35 backdrop-blur-xl [scrollbar-width:thin]"
        >
          <table className="w-full table-fixed border-collapse text-[length:var(--ui-header-stat-hint-size)]">
            <thead className="bg-white/[0.035] text-[length:var(--ui-header-pill-font-size)] uppercase tracking-[0.12em] text-white/38">
              <tr>
                <th className="px-[var(--ui-binder-metric-x)] py-2 text-left font-semibold">
                  Rarity
                </th>
                <th className="w-20 px-2 py-2 text-right font-semibold">Cards</th>
                <th className="w-24 px-2 py-2 text-right font-semibold">Rarity</th>
                <th className="w-28 px-[var(--ui-binder-metric-x)] py-2 text-right font-semibold">
                  Specific
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/7">
              {sortedRarities.map((rarity) => (
                <tr key={rarity.id} className="text-white/76">
                  <td className="px-[var(--ui-binder-metric-x)] py-2.5 font-semibold text-white">
                    {rarity.rarity_name}
                    {rarity.psa_avg_gem_pct != null ? (
                      <span className="ml-2 text-[length:var(--ui-header-pill-font-size)] font-semibold text-violet-100/68">
                        GEM {formatPercentValue(rarity.psa_avg_gem_pct)}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-white/56">
                    {rarity.card_count ?? "--"}
                  </td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-white/56">
                    {formatOddsValue(rarity.pull_rate_denominator)}
                  </td>
                  <td className="px-[var(--ui-binder-metric-x)] py-2.5 text-right font-bold tabular-nums text-white">
                    {formatOddsValue(rarity.specific_pull_denominator)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {footerText ? (
            <p className="border-t border-white/8 px-[var(--ui-binder-metric-x)] py-[calc(var(--ui-binder-metric-y)*0.75)] text-[length:var(--ui-header-pill-font-size)] font-semibold text-white/50">
              {footerText}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

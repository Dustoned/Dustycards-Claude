"use client";

import { Dices } from "lucide-react";

interface PullRateHoverTableProps {
  className?: string;
  profile: {
    source: string;
    source_url: string | null;
    generated_at: string | null;
    prices_updated_at: string | null;
    cards_counted: number | null;
    booster_pack_ev_usd: number | null;
    booster_box_ev_usd: number | null;
    packs_per_booster_box: number | null;
    psa_avg_gem_pct: number | null;
    rarities: Array<{
      id: string;
      rarity_name: string;
      card_count: number | null;
      per_booster_box: number | null;
      pull_rate_denominator: number | null;
      specific_pull_denominator: number | null;
      avg_value_usd: number | null;
      ev_per_pack_usd: number | null;
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

function formatUsdValue(value: number | null): string {
  if (value == null || !Number.isFinite(value)) return "--";
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: value >= 10 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
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
  const pricesUpdatedLabel = profile.prices_updated_at
    ? String(profile.prices_updated_at).split("T")[0]
    : null;
  const sourceLabel = profile.source === "pricedex" ? "ThePriceDex" : "Collectrics";

  const footerText = [
    sourceLabel,
    pricesUpdatedLabel ? `Prices ${pricesUpdatedLabel}` : null,
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
      className={`group relative h-full min-w-0 ${className}`}
      tabIndex={0}
      aria-label={`Pull-rate data: ${profile.rarities.length} rarity tiers`}
      data-mobile-tooltip="Tap to show pull-rate details"
      onClick={(event) => event.currentTarget.focus()}
    >
      <div className="flex h-full min-w-0 cursor-default flex-col rounded-[var(--ui-header-stat-radius)] border border-white/9 bg-white/[0.045] p-[var(--ui-header-stat-padding)] shadow-sm shadow-black/20 transition-colors group-hover:bg-white/[0.07] group-focus-visible:ring-2 group-focus-visible:ring-amber-300/45 sm:min-h-[var(--ui-header-stat-min-height)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[length:var(--ui-header-stat-label-size)] font-semibold uppercase leading-tight tracking-[0.12em] text-white/40">
              Pull Rates & EV
            </p>
            <p className="mt-1.5 truncate whitespace-nowrap text-[length:var(--ui-header-stat-value-size)] font-bold leading-tight tracking-tight text-white">
              {profile.booster_pack_ev_usd != null
                ? `${formatUsdValue(profile.booster_pack_ev_usd)} EV`
                : `${profile.rarities.length.toLocaleString("en-US")} tiers`}
            </p>
          </div>
          <span
            className="inline-flex h-[var(--ui-header-stat-icon-box)] w-[var(--ui-header-stat-icon-box)] shrink-0 items-center justify-center rounded-2xl border border-amber-400/14 bg-amber-400/[0.07] text-amber-300"
          >
            <Dices className="h-[var(--ui-header-stat-icon-size)] w-[var(--ui-header-stat-icon-size)]" />
          </span>
        </div>
        <p className="mt-2 line-clamp-2 text-[length:var(--ui-header-stat-hint-size)] leading-snug text-white/48">
          {profile.booster_box_ev_usd != null
            ? `${formatUsdValue(profile.booster_box_ev_usd)} box EV`
            : (
                <>
                  <span className="hidden sm:inline">Hover for breakdown</span>
                  <span className="sm:hidden">Tap for breakdown</span>
                </>
              )}
        </p>
      </div>

      <div className="pointer-events-none invisible absolute bottom-full right-0 z-[120] w-[min(44rem,calc(100vw-2rem))] translate-y-1 opacity-0 transition-[opacity,transform,visibility] duration-150 ease-out group-hover:pointer-events-auto group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100">
        <div
          className="max-h-[22rem] min-w-0 overflow-y-auto overflow-x-auto rounded-[var(--ui-binder-metric-radius)] border border-[rgb(var(--dc-gold-rgb)/0.22)] bg-[var(--dc-surface-glass-strong)] text-amber-100 shadow-[0_18px_48px_var(--dc-shadow-color)] backdrop-blur-xl [scrollbar-width:thin]"
        >
          {profile.booster_pack_ev_usd != null ||
          profile.booster_box_ev_usd != null ||
          profile.packs_per_booster_box != null ? (
            <div className="grid min-w-[38rem] grid-cols-3 gap-2 border-b border-white/8 p-[var(--ui-binder-metric-x)]">
              <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                <p className="text-[length:var(--ui-header-pill-font-size)] font-semibold uppercase tracking-[0.12em] text-white/38">
                  Pack EV
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {formatUsdValue(profile.booster_pack_ev_usd)}
                </p>
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                <p className="text-[length:var(--ui-header-pill-font-size)] font-semibold uppercase tracking-[0.12em] text-white/38">
                  Box EV
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {formatUsdValue(profile.booster_box_ev_usd)}
                </p>
              </div>
              <div className="rounded-lg border border-white/8 bg-white/[0.035] px-3 py-2">
                <p className="text-[length:var(--ui-header-pill-font-size)] font-semibold uppercase tracking-[0.12em] text-white/38">
                  Packs
                </p>
                <p className="mt-1 text-sm font-bold text-white">
                  {profile.packs_per_booster_box ?? "--"}
                </p>
              </div>
            </div>
          ) : null}
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
                <th className="w-24 px-[var(--ui-binder-metric-x)] py-2 text-right font-semibold">
                  EV/Pack
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
                  <td className="px-[var(--ui-binder-metric-x)] py-2.5 text-right font-bold tabular-nums text-emerald-100">
                    {formatUsdValue(rarity.ev_per_pack_usd)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {footerText ? (
            <p className="border-t border-white/8 px-[var(--ui-binder-metric-x)] py-[calc(var(--ui-binder-metric-y)*0.75)] text-[length:var(--ui-header-pill-font-size)] font-semibold text-white/50">
              {profile.source_url ? (
                <a
                  href={profile.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber-100/70 underline decoration-amber-200/30 underline-offset-2"
                >
                  {footerText}
                </a>
              ) : (
                footerText
              )}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

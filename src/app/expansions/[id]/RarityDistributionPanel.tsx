import { Dices, Layers3 } from "lucide-react";
import { normalizeRarityLabel } from "@/lib/rarity";

interface RarityDistributionPanelProps {
  expansionName: string;
  rarityCounts: Array<{
    name: string;
    count: number;
  }>;
  profile: {
    source: string;
    source_url: string | null;
    cards_counted: number | null;
    rarities: Array<{
      id: string;
      rarity_name: string;
      card_count: number | null;
      per_booster_box: number | null;
      pull_rate_denominator: number | null;
      specific_pull_denominator: number | null;
    }>;
  };
}

const RARITY_TONES = [
  {
    segment: "bg-slate-400",
    chip: "border-slate-300/16 bg-slate-300/[0.055]",
    dot: "bg-slate-300",
  },
  {
    segment: "bg-sky-300",
    chip: "border-sky-300/16 bg-sky-300/[0.055]",
    dot: "bg-sky-300",
  },
  {
    segment: "bg-white/70",
    chip: "border-white/12 bg-white/[0.045]",
    dot: "bg-white/70",
  },
  {
    segment: "bg-violet-400",
    chip: "border-violet-300/18 bg-violet-400/[0.06]",
    dot: "bg-violet-300",
  },
  {
    segment: "bg-amber-300",
    chip: "border-amber-300/18 bg-amber-300/[0.06]",
    dot: "bg-amber-300",
  },
  {
    segment: "bg-pink-400",
    chip: "border-pink-300/18 bg-pink-400/[0.06]",
    dot: "bg-pink-300",
  },
  {
    segment: "bg-emerald-400",
    chip: "border-emerald-300/18 bg-emerald-400/[0.06]",
    dot: "bg-emerald-300",
  },
  {
    segment: "bg-orange-400",
    chip: "border-orange-300/18 bg-orange-400/[0.06]",
    dot: "bg-orange-300",
  },
] as const;

function formatOdds(value: number | null): string | null {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  const rounded = value >= 100 ? Math.round(value) : Number(value.toFixed(2));
  return `1/${rounded.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export default function RarityDistributionPanel({
  expansionName,
  rarityCounts,
  profile,
}: RarityDistributionPanelProps) {
  const pullRatesByRarity = new Map(
    profile.rarities.map((rarity) => [
      normalizeRarityLabel(rarity.rarity_name) ?? rarity.rarity_name,
      rarity,
    ])
  );
  const rarities = rarityCounts
    .filter((rarity) => rarity.count > 0)
    .map((rarity) => {
      const pullRate = pullRatesByRarity.get(rarity.name);
      return {
        id: pullRate?.id ?? `set-rarity:${rarity.name}`,
        rarity_name: rarity.name,
        card_count: rarity.count,
        per_booster_box: pullRate?.per_booster_box ?? null,
        pull_rate_denominator: pullRate?.pull_rate_denominator ?? null,
        specific_pull_denominator: pullRate?.specific_pull_denominator ?? null,
      };
    })
    .sort((a, b) => b.card_count - a.card_count);
  const total = rarities.reduce((sum, rarity) => sum + rarity.card_count, 0);

  if (rarities.length === 0 || total <= 0) return null;

  const sourceLabel = profile.source === "pricedex" ? "ThePriceDex" : "Collectrics";

  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-white/9 bg-[linear-gradient(145deg,rgba(20,20,29,0.88),rgba(9,9,14,0.92))] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.035)] sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-200/55">
            Set breakdown
          </p>
          <h2 className="mt-1 text-base font-extrabold text-white sm:text-lg">
            Rarity distribution & pull rates
          </h2>
          <p className="mt-1 text-xs text-white/42">
            See how {expansionName} is divided across its rarity tiers.
          </p>
        </div>
        <div className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-amber-300/22 bg-amber-300/[0.07] px-3 text-xs font-extrabold tabular-nums text-amber-200">
          <Layers3 className="h-4 w-4" aria-hidden="true" />
          {total.toLocaleString("en-US")} cards
        </div>
      </div>

      <div
        className="mt-4 flex h-8 w-full overflow-hidden rounded-xl border border-white/10 bg-white/[0.035] shadow-[inset_0_1px_8px_rgba(0,0,0,0.22)] sm:h-10"
        aria-label={`${expansionName} rarity distribution`}
      >
        {rarities.map((rarity, index) => {
          const count = rarity.card_count;
          const tone = RARITY_TONES[index % RARITY_TONES.length];
          return (
            <span
              key={rarity.id}
              className={`${tone.segment} min-w-[2px] border-r border-black/20 last:border-r-0`}
              style={{ width: `${(count / total) * 100}%` }}
              title={`${rarity.rarity_name}: ${count} cards`}
            />
          );
        })}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {rarities.map((rarity, index) => {
          const count = rarity.card_count;
          const tone = RARITY_TONES[index % RARITY_TONES.length];
          const rarityOdds = formatOdds(rarity.pull_rate_denominator);
          const specificOdds = formatOdds(rarity.specific_pull_denominator);
          const oddsLabel = specificOdds ?? rarityOdds;
          const secondaryLabel =
            rarity.per_booster_box != null && rarity.per_booster_box > 0
              ? `${Number(rarity.per_booster_box.toFixed(2))}/box`
              : oddsLabel;

          return (
            <div
              key={rarity.id}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 ${tone.chip}`}
              title={[
                `${rarity.rarity_name}: ${count} cards`,
                rarityOdds ? `Rarity odds ${rarityOdds}` : null,
                specificOdds ? `Specific card odds ${specificOdds}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
              <span className="min-w-0 flex-1 truncate text-xs font-bold text-white/82">
                {rarity.rarity_name}
              </span>
              {secondaryLabel ? (
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-white/38">
                  {secondaryLabel}
                </span>
              ) : null}
              <span className="inline-flex min-w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.08] px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white/68">
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-3 flex items-center gap-2 border-t border-white/7 pt-3 text-[10px] font-medium text-white/28">
        <Dices className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Counts and pull-rate estimates from {sourceLabel}.</span>
        {profile.source_url ? (
          <a
            href={profile.source_url}
            target="_blank"
            rel="noreferrer"
            className="ml-auto shrink-0 font-semibold text-violet-200/62 transition hover:text-violet-100"
          >
            Source
          </a>
        ) : null}
      </div>
    </section>
  );
}

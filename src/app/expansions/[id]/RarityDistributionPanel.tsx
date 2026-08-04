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
  { segment: "from-slate-300 to-slate-500", dot: "bg-slate-300" },
  { segment: "from-cyan-300 to-sky-500", dot: "bg-cyan-300" },
  { segment: "from-blue-300 to-indigo-500", dot: "bg-blue-300" },
  { segment: "from-violet-300 to-violet-600", dot: "bg-violet-300" },
  { segment: "from-fuchsia-300 to-fuchsia-600", dot: "bg-fuchsia-300" },
  { segment: "from-rose-300 to-rose-500", dot: "bg-rose-300" },
  { segment: "from-emerald-300 to-teal-500", dot: "bg-emerald-300" },
  { segment: "from-amber-200 to-amber-500", dot: "bg-amber-200" },
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
    <section className="mb-5 overflow-visible rounded-2xl border border-white/9 bg-[linear-gradient(145deg,rgba(18,18,27,0.9),rgba(8,8,13,0.94))] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.035)] sm:p-5">
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
        <div className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-violet-300/16 bg-violet-400/[0.07] px-3 text-xs font-extrabold tabular-nums text-violet-100">
          <Layers3 className="h-4 w-4" aria-hidden="true" />
          {total.toLocaleString("en-US")} cards
        </div>
      </div>

      <div className="relative mt-5">
        <div
          className="flex h-12 w-full gap-1 rounded-2xl border border-white/9 bg-black/20 p-1 shadow-[inset_0_1px_10px_rgba(0,0,0,0.28)] sm:h-14"
          aria-label={`${expansionName} rarity distribution`}
        >
          {rarities.map((rarity, index) => {
            const count = rarity.card_count;
            const share = (count / total) * 100;
            const tone = RARITY_TONES[index % RARITY_TONES.length];
            const rarityOdds = formatOdds(rarity.pull_rate_denominator);
            const specificOdds = formatOdds(rarity.specific_pull_denominator);
            const perBox =
              rarity.per_booster_box != null && rarity.per_booster_box > 0
                ? `${Number(rarity.per_booster_box.toFixed(2))}/box`
                : null;
            const tooltipPosition = index === 0
              ? "left-0"
              : index === rarities.length - 1
                ? "right-0"
                : "left-1/2 -translate-x-1/2";

            return (
              <button
                key={rarity.id}
                type="button"
                className="group/rarity relative min-w-[5px] rounded-xl outline-none transition-[filter,transform] hover:z-20 hover:brightness-110 focus-visible:z-20 focus-visible:brightness-110 active:scale-[0.98]"
                style={{ flexGrow: count, flexBasis: 0 }}
                aria-label={`${rarity.rarity_name}: ${count} cards, ${share.toFixed(1)} percent${perBox ? `, ${perBox}` : ""}${rarityOdds ? `, rarity odds ${rarityOdds}` : ""}${specificOdds ? `, specific card odds ${specificOdds}` : ""}`}
              >
                <span className={`absolute inset-0 rounded-xl bg-gradient-to-b ${tone.segment} opacity-80 shadow-[inset_0_1px_rgba(255,255,255,0.22)] transition-opacity group-hover/rarity:opacity-100 group-focus-visible/rarity:opacity-100`} />
                {share >= 7 ? (
                  <span className="relative z-10 text-[9px] font-black tabular-nums text-black/58 sm:text-[10px]">
                    {count}
                  </span>
                ) : null}
                <span
                  className={`pointer-events-none absolute bottom-[calc(100%+0.65rem)] ${tooltipPosition} z-30 w-max max-w-[15rem] rounded-xl border border-white/12 bg-[#101017]/96 px-3 py-2.5 text-left opacity-0 shadow-[0_18px_45px_rgba(0,0,0,0.48)] backdrop-blur-xl transition duration-150 group-hover/rarity:opacity-100 group-focus-visible/rarity:opacity-100`}
                >
                  <span className="flex items-center gap-2 text-xs font-extrabold text-white">
                    <span className={`h-2 w-2 rounded-full ${tone.dot}`} />
                    {rarity.rarity_name}
                  </span>
                  <span className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] font-semibold text-white/46">
                    <span>{count} cards</span>
                    <span>{share.toFixed(1)}% of set</span>
                    {perBox ? <span>{perBox}</span> : null}
                    {rarityOdds ? <span>Tier {rarityOdds}</span> : null}
                    {specificOdds ? <span className="col-span-2">Specific card {specificOdds}</span> : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className="mt-2.5 flex items-center justify-between gap-3 text-[9px] font-semibold text-white/28 sm:text-[10px]">
          <span>Hover or tap a segment for rarity and pull-rate details.</span>
          <span className="shrink-0 tabular-nums">{rarities.length} rarity tiers</span>
        </div>
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

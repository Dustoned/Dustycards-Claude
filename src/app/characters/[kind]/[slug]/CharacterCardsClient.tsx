"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import {
  ArrowLeft,
  BadgeEuro,
  CheckCircle2,
  Layers3,
  LibraryBig,
  Sparkles,
  UserRound,
} from "lucide-react";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import BackNavigationLink from "@/components/BackNavigationLink";
import type { CardCharacterData } from "@/components/card-modal/types";
import { HeaderStatCard, type HeaderStat } from "@/components/PageHeader";
import { formatCollectionCurrency } from "@/lib/collection";
import { getCardMarketValue } from "@/lib/price-history";
import type { CardData } from "@/types/card-data";

const ExpansionView = dynamic(() => import("@/app/expansions/[id]/ExpansionView"), {
  ssr: false,
  loading: () => (
    <div className="glass rounded-3xl p-8 text-sm text-gray-500 shadow-md shadow-black/5 dark:text-white/45">
      Loading character cards...
    </div>
  ),
});

export interface CharacterCardsClientProps {
  entity: CardCharacterData;
  cards: CardData[];
}

function getCharacterCardTotals(cards: readonly CardData[]) {
  const setIds = new Set<string>();
  let priced = 0;
  let marketValue = 0;

  for (const card of cards) {
    const setId = card.episode_id ?? card.episode_name;
    if (setId) setIds.add(setId);

    const value = getCardMarketValue(card.price);
    if (value == null) continue;

    priced += 1;
    marketValue += value;
  }

  return {
    priced,
    setCount: setIds.size,
    marketValue: priced > 0 ? Number(marketValue.toFixed(2)) : null,
  };
}

export default function CharacterCardsClient({
  entity,
  cards,
}: CharacterCardsClientProps) {
  const [visibleCards, setVisibleCards] = useState<CardData[]>(cards);
  const deferredVisibleCards = useDeferredValue(visibleCards);
  const showingFilteredSubset = deferredVisibleCards.length !== cards.length;
  const handleVisibleCardsChange = useCallback((nextCards: CardData[]) => {
    setVisibleCards((current) => (current === nextCards ? current : nextCards));
  }, []);

  const totals = useMemo(
    () => getCharacterCardTotals(deferredVisibleCards),
    [deferredVisibleCards]
  );
  const visibleCardCount = deferredVisibleCards.length;
  const entityKindLabel = entity.kind === "pokemon" ? "Pokémon" : "Trainer";
  const searchHref = `/search?q=${encodeURIComponent(entity.name)}&game=pokemon`;
  const stats = [
    {
      label: "Cards",
      value: visibleCardCount.toLocaleString("en-US"),
      hint: showingFilteredSubset ? "Visible after filters." : `Featuring ${entity.name}.`,
      Icon: LibraryBig,
      tone: "sky",
    },
    {
      label: "Priced",
      value: `${totals.priced.toLocaleString("en-US")} / ${visibleCardCount.toLocaleString("en-US")}`,
      hint:
        totals.priced === visibleCardCount
          ? "All visible cards priced."
          : `${Math.max(visibleCardCount - totals.priced, 0).toLocaleString("en-US")} without price.`,
      Icon: CheckCircle2,
      tone: "emerald",
    },
    {
      label: "Sets",
      value: totals.setCount.toLocaleString("en-US"),
      hint: "Expansions represented.",
      Icon: Layers3,
      tone: "violet",
    },
    {
      label: "Market",
      value: formatCollectionCurrency(totals.marketValue),
      hint: showingFilteredSubset ? "Filtered visible total." : "Current visible total.",
      Icon: BadgeEuro,
      tone: "amber",
    },
  ] satisfies HeaderStat[];

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-6">
      <section className="binder-panel relative w-full overflow-hidden rounded-[var(--ui-page-header-radius)] p-3 sm:p-4 lg:p-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.1fr)_minmax(22rem,0.9fr)] lg:items-stretch">
          <div className="flex min-h-[var(--ui-dashboard-header-panel-min-height)] min-w-0 flex-col rounded-[var(--ui-page-header-radius)] border border-white/8 bg-black/10 p-[var(--ui-page-header-padding)]">
            <BackNavigationLink
              href={searchHref}
              className="mb-4 inline-flex w-fit items-center gap-2 text-sm font-medium text-white/50 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to search
            </BackNavigationLink>

            <div className="flex min-w-0 flex-1 items-center gap-4 sm:gap-5">
              <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-violet-300/14 bg-violet-400/[0.07] shadow-inner shadow-black/20 sm:h-24 sm:w-24">
                {entity.spritePath ? (
                  <Image
                    src={entity.spritePath}
                    alt={`${entity.name} sprite`}
                    width={112}
                    height={112}
                    unoptimized
                    draggable={false}
                    className={`h-full w-full object-contain p-1${
                      entity.pixelArt ? " [image-rendering:pixelated]" : ""
                    }`}
                    priority
                  />
                ) : entity.kind === "pokemon" ? (
                  <Sparkles className="h-8 w-8 text-violet-200/70" aria-hidden="true" />
                ) : (
                  <UserRound className="h-8 w-8 text-violet-200/70" aria-hidden="true" />
                )}
              </span>

              <div className="min-w-0">
                <p className="text-[length:var(--ui-page-header-eyebrow-size)] font-semibold uppercase tracking-[0.14em] text-white/42">
                  {entityKindLabel} card library
                </p>
                <h1 className="mt-2 min-w-0 text-[length:var(--ui-page-header-title-size)] font-bold leading-tight tracking-tight text-white">
                  {entity.name}
                </h1>
                <p className="mt-2 max-w-xl text-[length:var(--ui-page-header-description-size)] leading-[var(--ui-page-header-description-leading)] text-white/56">
                  {`${cards.length.toLocaleString("en-US")} ${cards.length === 1 ? "card" : "cards"} featuring ${entity.name}, collected in one place.`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid min-w-0 grid-cols-2 gap-2 lg:auto-rows-fr">
            {stats.map((stat) => (
              <HeaderStatCard key={stat.label} {...stat} />
            ))}
          </div>
        </div>
      </section>

      <ExpansionView
        cards={cards}
        warmCardImages={false}
        onVisibleCardsChange={handleVisibleCardsChange}
        cardDetailBackLabel={`Back to ${entity.name}`}
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import CardModal, { type ModalCardData } from "@/components/CardModal";
import CollectionAddCardButton from "@/components/CollectionAddCardButton";
import { formatCollectionCurrency } from "@/lib/collection";
import { useSettings } from "@/components/SettingsProvider";

export interface CollectionCardViewItem {
  card_id: string;
  name: string;
  image_url: string | null;
  card_number: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  current_value: number | null;
  purchase_price: number | null;
  condition: string | null;
  grading_company: string | null;
  grading_grade: string | null;
  owned: boolean;
  owned_count?: number;
}

interface Props {
  items: CollectionCardViewItem[];
  blurMissing?: boolean;
  emptyTitle: string;
  emptyText: string;
}

const cardMinWidth = {
  small: { normal: "120px", wide: "160px" },
  medium: { normal: "160px", wide: "220px" },
  large: { normal: "220px", wide: "300px" },
} as const;

export default function CollectionCardsView({
  items,
  blurMissing = false,
  emptyTitle,
  emptyText,
}: Props) {
  const { settings } = useSettings();
  const [selectedCard, setSelectedCard] = useState<ModalCardData | null>(null);

  async function openCard(cardId: string) {
    try {
      const response = await fetch(`/api/cards/${encodeURIComponent(cardId)}`, {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data: ModalCardData = await response.json();
      setSelectedCard(data);
    } catch {
      // ignore
    }
  }

  if (items.length === 0) {
    return (
      <div className="glass rounded-3xl p-12 text-center shadow-md shadow-black/5">
        <p className="mb-1 font-medium text-gray-700 dark:text-gray-300">{emptyTitle}</p>
        <p className="text-sm text-gray-400">{emptyText}</p>
      </div>
    );
  }

  return (
    <>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${
            cardMinWidth[settings.cardSize][settings.widescreen ? "wide" : "normal"]
          }, 1fr))`,
        }}
      >
        {items.map((item, index) => {
          const missing = !item.owned;
          const imageClass =
            blurMissing && missing
              ? "object-contain scale-[1.02] blur-[2px] opacity-55"
              : "object-contain";
          const pnl =
            item.current_value != null && item.purchase_price != null
              ? Number((item.current_value - item.purchase_price).toFixed(2))
              : null;

          return (
            <button
              key={`${item.card_id}-${index}`}
              type="button"
              onClick={() => openCard(item.card_id)}
              className="group flex flex-col gap-1.5 text-left"
            >
              <div className="relative w-full aspect-[63/88] overflow-hidden rounded-xl shadow-md shadow-black/20 transition-all duration-200 group-hover:scale-[1.02] group-hover:shadow-xl group-hover:shadow-black/30">
                {item.image_url ? (
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    fill
                    className={imageClass}
                    sizes="180px"
                    loading={index < 18 ? "eager" : undefined}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-black/6 text-xs text-gray-300 dark:bg-white/6">
                    {item.name.slice(0, 2)}
                  </div>
                )}

                <div className="absolute left-2 top-2 right-2 flex items-start justify-between gap-2">
                  {blurMissing && missing ? (
                    <span className="rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                      Missing
                    </span>
                  ) : (
                    <div />
                  )}

                  <CollectionAddCardButton
                    card={{
                      id: item.card_id,
                      name: item.name,
                      image_url: item.image_url,
                      episode: {
                        id: item.episode_id,
                        name: item.episode_name,
                        code: item.episode_code,
                      },
                    }}
                    theme="dark"
                    className="h-8 w-8 bg-black/65 text-white hover:bg-black/78"
                  />
                </div>

                {item.owned_count && item.owned_count > 1 && (
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur">
                    x{item.owned_count}
                  </span>
                )}
              </div>

              <div className="px-0.5">
                <p className="truncate text-xs font-semibold leading-snug text-gray-900 dark:text-white">
                  {item.name}
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] tabular-nums">
                  <span className="text-gray-400 dark:text-gray-500">
                    {item.card_number ? `#${item.card_number}` : "--"}
                  </span>
                  {item.owned && item.current_value != null && (
                    <span className="text-gray-500 dark:text-gray-400">
                      {formatCollectionCurrency(item.current_value)}
                    </span>
                  )}
                </div>
                <Link
                  href={`/expansions/${item.episode_id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="mt-0.5 block truncate text-[10px] text-gray-400 transition-colors hover:text-gray-600 hover:underline dark:text-gray-500 dark:hover:text-gray-300"
                >
                  {item.episode_name}
                  {item.episode_code ? <span className="ml-1 opacity-60">({item.episode_code})</span> : null}
                </Link>
                {item.owned ? (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {item.purchase_price != null && (
                      <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                        Paid {formatCollectionCurrency(item.purchase_price)}
                      </span>
                    )}
                    {pnl != null && (
                      <span
                        className={`rounded-full px-2 py-1 ${
                          pnl >= 0
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                            : "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                        }`}
                      >
                        {pnl >= 0 ? "+" : ""}
                        {formatCollectionCurrency(pnl)}
                      </span>
                    )}
                    {item.condition && (
                      <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                        {item.condition}
                      </span>
                    )}
                    {item.grading_company && item.grading_grade && (
                      <span className="rounded-full bg-black/5 px-2 py-1 text-gray-500 dark:bg-white/8 dark:text-white/55">
                        {item.grading_company} {item.grading_grade}
                      </span>
                    )}
                  </div>
                ) : (
                  <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                    Not in your collection yet
                  </p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selectedCard && <CardModal card={selectedCard} onClose={() => setSelectedCard(null)} />}
    </>
  );
}

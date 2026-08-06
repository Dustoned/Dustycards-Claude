"use client";

import dynamic from "next/dynamic";
import type { UpcomingSingleItem } from "@/lib/upcoming-releases";

const CardThreeViewer = dynamic(
  () => import("@/app/expansions/[id]/CardThreeViewer"),
  { ssr: false }
);

export type UpcomingCardImageViewerItem = Pick<
  UpcomingSingleItem,
  | "id"
  | "name"
  | "imageUrl"
  | "cardNumber"
  | "rarity"
  | "episodeId"
  | "episodeName"
  | "episodeCode"
>;

export default function UpcomingCardImageViewer({
  item,
  onClose,
}: {
  item: UpcomingCardImageViewerItem;
  onClose: () => void;
}) {
  if (!item.imageUrl) return null;

  return (
    <CardThreeViewer
      card={{
        id: `upcoming-preview:${item.id}`,
        game: "pokemon",
        name: item.name,
        card_number: item.cardNumber,
        episode_id: item.episodeId ?? "upcoming-preview",
        episode_name: item.episodeName,
        episode_code: item.episodeCode,
        rarity: item.rarity,
        hp: null,
        supertype: "Pokémon",
        subtypes: null,
        artist: null,
        price_source_status: null,
        price_source_checked_at: null,
        price_fetched_at: null,
        price: null,
      }}
      frontImageUrl={item.imageUrl}
      cardMarketUrl={null}
      readOnly
      onClose={onClose}
    />
  );
}

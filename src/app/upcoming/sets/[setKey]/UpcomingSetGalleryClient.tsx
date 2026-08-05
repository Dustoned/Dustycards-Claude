"use client";

import Link from "next/link";
import { ExternalLink, Search, Sparkles } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import CachedImage from "@/components/CachedImage";
import { useSettings } from "@/components/SettingsProvider";
import { getCardGridImageSizes, getCardGridTemplateColumns } from "@/lib/display-scale";
import type { UpcomingSingleGroup } from "@/lib/upcoming-single-groups";
import { getUpcomingCardNumber } from "@/lib/upcoming-single-groups";
import type { UpcomingSingleItem, UpcomingSingleStatus } from "@/lib/upcoming-releases";

type GallerySort = "number-desc" | "number-asc" | "name-asc" | "name-desc";

const SORTS: Array<{ key: GallerySort; label: string }> = [
  { key: "number-desc", label: "Number high–low" },
  { key: "number-asc", label: "Number low–high" },
  { key: "name-asc", label: "Alphabetical A–Z" },
  { key: "name-desc", label: "Alphabetical Z–A" },
];

function statusStyle(status: UpcomingSingleStatus): string {
  if (status === "confirmed") return "border-emerald-400/24 bg-emerald-400/[0.1] text-emerald-100";
  if (status === "leak") return "border-amber-400/24 bg-amber-400/[0.1] text-amber-100";
  if (status === "reveal") return "border-sky-400/24 bg-sky-400/[0.1] text-sky-100";
  return "border-violet-400/24 bg-violet-400/[0.1] text-violet-100";
}

function titleStatus(status: UpcomingSingleStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function compareNumber(left: UpcomingSingleItem, right: UpcomingSingleItem, direction: "asc" | "desc"): number {
  const leftNumber = getUpcomingCardNumber(left.cardNumber);
  const rightNumber = getUpcomingCardNumber(right.cardNumber);
  if (leftNumber == null && rightNumber == null) return left.name.localeCompare(right.name, "en", { sensitivity: "base" });
  if (leftNumber == null) return 1;
  if (rightNumber == null) return -1;
  return direction === "desc" ? rightNumber - leftNumber : leftNumber - rightNumber;
}

function GalleryCard({ item, imageSizes }: { item: UpcomingSingleItem; imageSizes: string }) {
  const cardHref = item.libraryReference?.href ?? (item.episodeId && item.cardId
    ? `/expansions/${item.episodeId}?card=${item.cardId}`
    : null);
  const artwork = (
    <div className="relative aspect-[63/88] overflow-hidden rounded-[5%] bg-black/22 shadow-[0_16px_34px_rgba(0,0,0,0.3)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_42px_rgba(0,0,0,0.42)]">
      {item.imageUrl ? (
        <CachedImage
          sourceUrl={item.imageUrl}
          alt={item.name}
          fill
          sizes={imageSizes}
          className="object-contain"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-white/20"><Sparkles className="h-8 w-8" /></span>
      )}
      <span className={`absolute left-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] backdrop-blur-md sm:left-2 sm:top-2 sm:text-[8px] ${statusStyle(item.status)}`}>
        {titleStatus(item.status)}
      </span>
      {item.libraryReference ? (
        <span
          className="absolute bottom-1.5 right-1.5 rounded-full border border-emerald-300/22 bg-[#09150f]/88 px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-emerald-200 backdrop-blur-md sm:bottom-2 sm:right-2 sm:text-[8px]"
          title={item.libraryReference.label}
        >
          {item.libraryReference.kind === "name"
            ? `${item.libraryReference.count} ${item.libraryReference.count === 1 ? "print" : "prints"}`
            : "DB match"}
        </span>
      ) : null}
    </div>
  );

  return (
    <article className="group min-w-0">
      {cardHref ? (
        <Link href={cardHref} prefetch={false} className="block">{artwork}</Link>
      ) : item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="block">{artwork}</a>
      ) : artwork}
      <div className="px-0.5 pb-1 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <h2 className="line-clamp-2 text-[10px] font-bold leading-4 text-white/90 sm:text-xs">{item.name}</h2>
          {item.cardNumber ? <span className="shrink-0 text-[8px] font-bold tabular-nums text-white/38 sm:text-[9px]">#{item.cardNumber}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[8px] font-semibold text-white/36 sm:text-[9px]">
          {item.rarity ?? item.version ?? item.sourceName ?? "Card reveal"}
        </p>
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[8px] font-semibold text-violet-200/58 hover:text-violet-200 sm:text-[9px]">
            {item.sourceName ?? "Source"}<ExternalLink className="h-2.5 w-2.5" />
          </a>
        ) : null}
      </div>
    </article>
  );
}

export default function UpcomingSetGalleryClient({ group }: { group: UpcomingSingleGroup }) {
  const { displaySettings, isMobileViewport } = useSettings();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<GallerySort>("number-desc");
  const query = useDeferredValue(search).trim().toLowerCase();
  const visible = useMemo(() => group.items
    .filter((item) => {
      if (!query) return true;
      const haystack = [item.name, item.cardNumber, item.rarity, item.version, item.status, item.sourceName, item.libraryReference?.label]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
    })
    .sort((left, right) => {
      if (sort === "number-desc") return compareNumber(left, right, "desc");
      if (sort === "number-asc") return compareNumber(left, right, "asc");
      const compared = left.name.localeCompare(right.name, "en", { sensitivity: "base" });
      return sort === "name-desc" ? -compared : compared;
    }), [group.items, query, sort]);
  const gridTemplateColumns = getCardGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const imageSizes = getCardGridImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );

  return (
    <div className="space-y-4">
      <section className="glass rounded-2xl border border-white/8 p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(17rem,1fr)_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={`Search ${group.name}...`}
              className="h-11 w-full rounded-xl border border-white/9 bg-black/16 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/28 focus:border-violet-400/35"
            />
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/14 p-1 sm:grid-cols-4">
            {SORTS.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setSort(option.key)}
                className={`h-9 rounded-lg px-3 text-[10px] font-bold transition ${sort === option.key ? "bg-violet-600 text-white shadow-[0_8px_24px_rgba(124,92,255,0.24)]" : "text-white/46 hover:bg-white/[0.05] hover:text-white"}`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-[10px] font-semibold text-white/36">
          {visible.length} of {group.items.length} {group.items.length === 1 ? "card" : "cards"} shown
        </p>
      </section>

      {visible.length ? (
        <section className="rounded-[1.6rem] border border-white/8 bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.11),transparent_42%)] p-3 sm:p-5">
          <div
            className="grid gap-x-3 gap-y-5 sm:gap-x-4"
            style={{ gridTemplateColumns }}
          >
            {visible.map((item) => (
              <GalleryCard key={item.id} item={item} imageSizes={imageSizes} />
            ))}
          </div>
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-5 py-10 text-center text-sm text-white/42">
          No cards match this search.
        </div>
      )}
    </div>
  );
}

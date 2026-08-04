"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  Eye,
  Grid3X3,
  Layers3,
  Newspaper,
  Package,
  Search,
  Sparkles,
} from "lucide-react";
import CachedImage from "@/components/CachedImage";
import type { UpcomingSealedRelease } from "@/lib/sealed-movers";
import type {
  UpcomingSingleItem,
  UpcomingSourceStory,
  UpcomingSingleStatus,
  UpcomingStoryStatus,
} from "@/lib/upcoming-releases";
import {
  groupUpcomingSingles,
  type UpcomingSingleGroup,
} from "@/lib/upcoming-single-groups";

type ReleaseView = "all" | "sealed" | "singles" | "sources";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) return "Date pending";
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? DATE_FORMATTER.format(parsed) : value;
}

function matchesQuery(query: string, values: Array<string | null | undefined>): boolean {
  if (!query) return true;
  const tokens = query.split(/\s+/).filter(Boolean);
  const haystack = values.filter(Boolean).join(" ").toLowerCase();
  return tokens.every((token) => haystack.includes(token));
}

function singleStatusStyle(status: UpcomingSingleStatus): string {
  if (status === "confirmed") return "border-emerald-400/20 bg-emerald-400/[0.09] text-emerald-200";
  if (status === "leak") return "border-amber-400/20 bg-amber-400/[0.09] text-amber-200";
  if (status === "reveal") return "border-sky-400/20 bg-sky-400/[0.09] text-sky-200";
  return "border-violet-400/20 bg-violet-400/[0.09] text-violet-200";
}

function storyStatusStyle(status: UpcomingStoryStatus): string {
  if (status === "confirmed") return "border-emerald-400/20 bg-emerald-400/[0.09] text-emerald-200";
  if (status === "rumour") return "border-amber-400/20 bg-amber-400/[0.09] text-amber-200";
  if (status === "reveal") return "border-sky-400/20 bg-sky-400/[0.09] text-sky-200";
  return "border-violet-400/20 bg-violet-400/[0.09] text-violet-200";
}

function titleStatus(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function EmptyState({ children }: { children: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.025] px-5 py-8 text-center text-sm text-white/42">
      {children}
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
  count,
  Icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  count: number;
  Icon: typeof CalendarDays;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-4 sm:mb-4">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-violet-300/70">
          <Icon className="h-3.5 w-3.5" />
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-white sm:text-2xl">{title}</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-white/42 sm:text-sm">{description}</p>
      </div>
      <span className="shrink-0 rounded-full border border-white/9 bg-white/[0.045] px-2.5 py-1 text-[10px] font-bold tabular-nums text-white/58">
        {count}
      </span>
    </div>
  );
}

function SealedReleaseTile({ release }: { release: UpcomingSealedRelease }) {
  const mainHref = release.episodeId ? `/expansions/${release.episodeId}` : release.sourceUrl;
  const external = !release.episodeId && Boolean(release.sourceUrl);
  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden border-b border-white/7 bg-[radial-gradient(circle_at_50%_35%,rgba(124,92,255,0.13),transparent_62%)]">
        {release.imageUrl ? (
          <CachedImage
            sourceUrl={release.imageUrl}
            alt={release.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.025]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-white/22">
            <Package className="h-10 w-10" />
          </span>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-violet-400/18 bg-[#0d0b16]/82 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-violet-200 backdrop-blur-md">
          <Package className="h-3 w-3" /> Sealed
        </span>
      </div>
      <div className="flex min-h-[9.1rem] flex-col p-3.5 sm:p-4">
        <h3 className="line-clamp-2 text-[13px] font-bold leading-5 text-white sm:text-sm">{release.name}</h3>
        <p className="mt-1 line-clamp-1 text-[11px] text-white/38">
          {[release.episodeName, release.episodeCode].filter(Boolean).join(" · ") || "Product release"}
        </p>
        <div className="mt-auto flex items-end justify-between gap-3 pt-4">
          <div>
            <p className="text-xs font-bold text-violet-200">{formatDate(release.releaseDate)}</p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-white/38">
              <Clock3 className="h-3 w-3" />
              {release.daysUntil === 0 ? "Today" : `In ${release.daysUntil} days`}
            </p>
          </div>
          <span className="text-[10px] font-semibold text-white/46">{release.sourceName}</span>
        </div>
      </div>
    </>
  );

  const classes = "group overflow-hidden rounded-2xl border border-white/8 bg-white/[0.032] transition hover:border-violet-400/22 hover:bg-violet-400/[0.04]";
  return mainHref ? (
    external ? (
      <a href={mainHref} target="_blank" rel="noreferrer" className={classes}>{content}</a>
    ) : (
      <Link href={mainHref} prefetch={false} className={classes}>{content}</Link>
    )
  ) : (
    <article className={classes}>{content}</article>
  );
}

function BinderSingleTile({ item, interactive = true }: { item: UpcomingSingleItem; interactive?: boolean }) {
  const cardHref = item.episodeId && item.cardId
    ? `/expansions/${item.episodeId}?card=${item.cardId}`
    : null;
  const image = (
    <div className="relative aspect-[63/88] w-full overflow-hidden rounded-[5%] bg-black/22 shadow-[0_16px_32px_rgba(0,0,0,0.28)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_38px_rgba(0,0,0,0.38)]">
      {item.imageUrl ? (
        <CachedImage
          sourceUrl={item.imageUrl}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 30vw, (max-width: 1024px) 20vw, 160px"
          className="object-contain"
        />
      ) : (
        <span className="flex h-full items-center justify-center text-white/20"><Sparkles className="h-8 w-8" /></span>
      )}
      <span className={`absolute left-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] backdrop-blur-md sm:left-2 sm:top-2 sm:text-[8px] ${singleStatusStyle(item.status)}`}>
        {titleStatus(item.status)}
      </span>
    </div>
  );

  return (
    <article className="group min-w-0">
      {!interactive ? image : cardHref ? (
        <Link href={cardHref} prefetch={false} className="block">{image}</Link>
      ) : item.sourceUrl ? (
        <a href={item.sourceUrl} target="_blank" rel="noreferrer" className="block">{image}</a>
      ) : image}
      <div className="px-0.5 pb-1 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <h4 className="line-clamp-2 text-[10px] font-bold leading-4 text-white/88 sm:text-xs">{item.name}</h4>
          {item.cardNumber ? <span className="shrink-0 text-[8px] font-bold tabular-nums text-white/34 sm:text-[9px]">#{item.cardNumber}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[8px] font-semibold text-white/34 sm:text-[9px]">
          {item.rarity ?? item.version ?? item.sourceName ?? "Card reveal"}
        </p>
      </div>
    </article>
  );
}

function SingleSetSection({ group }: { group: UpcomingSingleGroup }) {
  const visibleItems = group.items.slice(0, 8);
  const setHref = `/upcoming/sets/${encodeURIComponent(group.key)}`;
  const progress = group.coverage == null ? null : Math.round(group.coverage * 100);
  const statusSummary = [
    group.statuses.confirmed ? `${group.statuses.confirmed} confirmed` : null,
    group.statuses.reveal ? `${group.statuses.reveal} revealed` : null,
    group.statuses.leak ? `${group.statuses.leak} early` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section className="overflow-hidden rounded-[1.6rem] border border-white/8 bg-white/[0.025]">
      <Link href={setHref} prefetch={false} className="group/header flex flex-col gap-3 border-b border-white/7 px-4 py-4 transition hover:bg-violet-400/[0.035] sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-violet-300/68">
              {group.nearComplete ? <Grid3X3 className="h-3.5 w-3.5" /> : <Layers3 className="h-3.5 w-3.5" />}
              {group.nearComplete ? "Near-complete gallery" : "Set gallery"}
            </span>
            {group.releaseDate ? <span className="rounded-full border border-white/8 bg-white/[0.035] px-2 py-0.5 text-[8px] font-bold text-white/42">{formatDate(group.releaseDate)}</span> : null}
          </div>
          <h3 className="mt-1.5 flex items-center gap-2 text-lg font-black tracking-tight text-white sm:text-xl">
            {group.name}<ArrowRight className="h-4 w-4 text-violet-300/48 transition group-hover/header:translate-x-0.5 group-hover/header:text-violet-200" />
          </h3>
          <p className="mt-1 text-[10px] text-white/42 sm:text-xs">
            {group.items.length} {group.items.length === 1 ? "card" : "cards"}{statusSummary ? ` · ${statusSummary}` : ""}
            {group.sources.length ? ` · ${group.sources.join(" + ")}` : ""}
          </p>
        </div>
        {group.nearComplete && progress != null ? (
          <div className="w-full shrink-0 sm:w-52">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[8px] font-black uppercase tracking-[0.14em] text-white/30">Numbered coverage</p>
                <p className="mt-0.5 text-[10px] font-semibold text-white/56">{group.numberedCount} of {group.numberingCeiling} positions</p>
              </div>
              <strong className="text-lg font-black tabular-nums text-violet-200">{progress}%</strong>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-400" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : (
          <span className="self-start rounded-full border border-violet-400/16 bg-violet-400/[0.07] px-2.5 py-1 text-[9px] font-bold tabular-nums text-violet-100 sm:self-center">
            {group.numberedCount || group.items.length} indexed
          </span>
        )}
      </Link>

      <Link
        href={setHref}
        prefetch={false}
        aria-label={`View all ${group.items.length} ${group.items.length === 1 ? "card" : "cards"} from ${group.name}`}
        className="group/row block bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.11),transparent_46%)] p-3 transition hover:bg-violet-400/[0.025] sm:p-5"
      >
        <div className="grid grid-cols-3 gap-x-3 sm:grid-cols-4 sm:gap-x-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {visibleItems.map((item, index) => (
            <div
              key={item.id}
              className={index === 3 ? "hidden sm:block" : index === 4 ? "hidden md:block" : index === 5 ? "hidden lg:block" : index === 6 ? "hidden xl:block" : index === 7 ? "hidden 2xl:block" : ""}
            >
              <BinderSingleTile item={item} interactive={false} />
            </div>
          ))}
        </div>
      </Link>
    </section>
  );
}

function StoryTile({ story }: { story: UpcomingSourceStory }) {
  return (
    <a
      href={story.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="group grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-2xl border border-white/8 bg-white/[0.032] p-3 transition hover:border-violet-400/22 hover:bg-violet-400/[0.04] sm:grid-cols-[5.5rem_minmax(0,1fr)]"
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border border-white/8 bg-[radial-gradient(circle_at_center,rgba(124,92,255,0.15),transparent_70%)]">
        {story.imageUrl ? (
          <CachedImage sourceUrl={story.imageUrl} alt="" fill sizes="88px" className="object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-violet-200/36"><Newspaper className="h-6 w-6" /></span>
        )}
      </div>
      <div className="min-w-0 py-0.5">
        <div className="flex items-center justify-between gap-2">
          <span className={`rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] ${storyStatusStyle(story.status)}`}>
            {titleStatus(story.status)}
          </span>
          <ExternalLink className="h-3 w-3 text-white/24 transition group-hover:text-violet-200" />
        </div>
        <h3 className="mt-2 line-clamp-2 text-xs font-bold leading-[1.1rem] text-white sm:text-[13px]">{story.title}</h3>
        <p className="mt-1 line-clamp-1 text-[9px] font-semibold text-white/34">
          {story.sourceName}{story.publishedAt ? ` · ${formatDate(story.publishedAt)}` : ""}
        </p>
      </div>
    </a>
  );
}

export default function UpcomingReleasesClient({
  sealed,
  singles,
  stories,
}: {
  sealed: UpcomingSealedRelease[];
  singles: UpcomingSingleItem[];
  stories: UpcomingSourceStory[];
}) {
  const [view, setView] = useState<ReleaseView>("all");
  const [search, setSearch] = useState("");
  const query = useDeferredValue(search).trim().toLowerCase();
  const filtered = useMemo(() => ({
    sealed: sealed.filter((item) => matchesQuery(query, [item.name, item.episodeName, item.episodeCode, item.sourceName])),
    singles: singles.filter((item) => matchesQuery(query, [item.name, item.episodeName, item.episodeCode, item.cardNumber, item.rarity, item.headline, item.sourceName])),
    stories: stories.filter((item) => matchesQuery(query, [item.title, item.description, item.sourceName, item.status])),
  }), [query, sealed, singles, stories]);
  const singleGroups = useMemo(() => groupUpcomingSingles(filtered.singles), [filtered.singles]);

  const tabs: Array<{ key: ReleaseView; label: string; count: number }> = [
    { key: "all", label: "All", count: sealed.length + singles.length + stories.length },
    { key: "sealed", label: "Sealed", count: sealed.length },
    { key: "singles", label: "Singles", count: singles.length },
    { key: "sources", label: "Source watch", count: stories.length },
  ];
  return (
    <div className="space-y-6">
      <div className="glass rounded-2xl border border-white/8 p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_auto] lg:items-center">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/32" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search product, set, card or source..."
              className="h-11 w-full rounded-xl border border-white/9 bg-black/16 pl-10 pr-4 text-sm text-white outline-none placeholder:text-white/28 focus:border-violet-400/35"
            />
          </label>
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-white/8 bg-black/14 p-1 sm:grid-cols-4">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-bold transition ${view === tab.key ? "bg-violet-600 text-white shadow-[0_8px_24px_rgba(124,92,255,0.24)]" : "text-white/48 hover:bg-white/[0.05] hover:text-white"}`}
              >
                {tab.label}<span className="text-[9px] opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(view === "all" || view === "sealed") ? (
        <section>
          <SectionTitle Icon={Package} eyebrow="Release calendar" title="Upcoming sealed" description="Confirmed products ordered by their own release date, not only by the set launch." count={filtered.sealed.length} />
          {filtered.sealed.length ? (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {filtered.sealed.map((release) => <SealedReleaseTile key={release.id} release={release} />)}
            </div>
          ) : <EmptyState>No sealed releases match this search.</EmptyState>}
        </section>
      ) : null}

      {(view === "all" || view === "singles") ? (
        <section>
          <SectionTitle Icon={Sparkles} eyebrow="Card watch" title="Revealed & leaked singles" description="Source images appear immediately; once a card is matched to the local library, its tile links directly to card detail." count={filtered.singles.length} />
          {filtered.singles.length ? (
            <div className="space-y-4 sm:space-y-5">
              {singleGroups.map((group) => <SingleSetSection key={group.key} group={group} />)}
            </div>
          ) : <EmptyState>No single-card reveals have been ingested yet. The background source scan fills this automatically.</EmptyState>}
        </section>
      ) : null}

      {(view === "all" || view === "sources") ? (
        <section>
          <SectionTitle Icon={Eye} eyebrow="Background scan" title="Latest source watch" description="Release and reveal reports ingested from Pokémon, PokeBeach, ICv2, Bill's Archive and the other trusted Signal Radar sources." count={filtered.stories.length} />
          {filtered.stories.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.stories.map((story) => <StoryTile key={story.id} story={story} />)}
            </div>
          ) : <EmptyState>The next scheduled source scan will add new release and reveal stories here.</EmptyState>}
        </section>
      ) : null}
    </div>
  );
}

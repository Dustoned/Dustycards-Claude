"use client";

import Link from "next/link";
import {
  useDeferredValue,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
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
import UpcomingCardImageViewer from "@/components/UpcomingCardImageViewer";
import { useSettings } from "@/components/SettingsProvider";
import {
  getCardGridImageSizes,
  getCardGridTrackWidth,
  getSealedProductGridTemplateColumns,
  getSealedProductImageSizes,
} from "@/lib/display-scale";
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

function SealedReleaseTile({
  release,
  imageSizes,
}: {
  release: UpcomingSealedRelease;
  imageSizes: string;
}) {
  const mainHref = release.episodeId ? `/expansions/${release.episodeId}` : release.sourceUrl;
  const justReleased = release.daysSinceRelease != null;
  const external = !release.episodeId && Boolean(release.sourceUrl);
  const content = (
    <>
      <div className="relative aspect-[4/3] overflow-hidden border-b border-white/7 bg-[radial-gradient(circle_at_50%_35%,rgba(124,92,255,0.13),transparent_62%)]">
        {release.imageUrl ? (
          <CachedImage
            sourceUrl={release.imageUrl}
            alt={release.name}
            fill
            sizes={imageSizes}
            className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.025]"
          />
        ) : (
          <span className="flex h-full items-center justify-center text-white/22">
            <Package className="h-10 w-10" />
          </span>
        )}
        <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full border border-[rgb(var(--dc-primary-rgb)/0.24)] bg-[var(--dc-surface-glass-strong)] px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--dc-primary)] backdrop-blur-md">
          <Package className="h-3 w-3" /> {justReleased ? "Just Released" : "Sealed"}
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
              {justReleased
                ? release.daysSinceRelease === 1 ? "Released yesterday" : `Released ${release.daysSinceRelease} days ago`
                : release.daysUntil === 0 ? "Today" : `In ${release.daysUntil} days`}
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

function BinderSingleTile({
  item,
  interactive = true,
  imageSizes,
  onPreview,
}: {
  item: UpcomingSingleItem;
  interactive?: boolean;
  imageSizes: string;
  onPreview?: (item: UpcomingSingleItem) => void;
}) {
  const cardHref = item.episodeId && item.cardId
    ? `/expansions/${item.episodeId}?card=${item.cardId}`
    : item.libraryReference?.kind !== "name"
      ? item.libraryReference?.href ?? null
      : null;
  const image = (
    <div className="relative aspect-[63/88] w-full overflow-hidden rounded-[5%] bg-black/22 shadow-[0_16px_32px_rgba(0,0,0,0.28)] transition duration-300 group-hover:-translate-y-1 group-hover:shadow-[0_20px_38px_rgba(0,0,0,0.38)]">
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
      <span className={`absolute left-1.5 top-1.5 rounded-full border px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.1em] backdrop-blur-md sm:left-2 sm:top-2 sm:text-[8px] ${singleStatusStyle(item.status)}`}>
        {titleStatus(item.status)}
      </span>
      {item.libraryReference ? (
        <span
          className="absolute bottom-1.5 right-1.5 rounded-full border border-[rgb(var(--dc-success-rgb)/0.3)] bg-[var(--dc-surface-glass-strong)] px-1.5 py-0.5 text-[7px] font-black uppercase tracking-[0.08em] text-[var(--dc-success)] backdrop-blur-md sm:bottom-2 sm:right-2 sm:text-[8px]"
          title={item.libraryReference.label}
        >
          {item.libraryReference.kind === "name"
            ? `${item.libraryReference.count} ${item.libraryReference.count === 1 ? "print" : "prints"}`
            : "DB match"}
        </span>
      ) : null}
    </div>
  );

  const tileContent = (
    <>
      {image}
      <div className="px-0.5 pb-1 pt-2">
        <div className="flex items-start justify-between gap-1.5">
          <h4 className="line-clamp-2 text-[10px] font-bold leading-4 text-white/88 sm:text-xs">{item.name}</h4>
          {item.cardNumber ? <span className="shrink-0 text-[8px] font-bold tabular-nums text-white/34 sm:text-[9px]">#{item.cardNumber}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[8px] font-semibold text-white/34 sm:text-[9px]">
          {item.rarity ?? item.version ?? item.sourceName ?? "Card reveal"}
        </p>
      </div>
    </>
  );
  const tileClassName =
    "group block min-w-0 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--dc-primary-rgb)/0.7)]";

  if (!interactive) {
    return <article className={tileClassName}>{tileContent}</article>;
  }

  if (cardHref) {
    return (
      <Link href={cardHref} prefetch={false} className={tileClassName}>
        {tileContent}
      </Link>
    );
  }

  if (item.imageUrl && onPreview) {
    return (
      <button
        type="button"
        onClick={() => onPreview(item)}
        className={`w-full ${tileClassName}`}
        aria-label={`View ${item.name} up close`}
      >
        {tileContent}
      </button>
    );
  }

  return <article className={tileClassName}>{tileContent}</article>;
}

function HorizontalCardRail({
  children,
  label,
  tileTrackWidth,
}: {
  children: ReactNode;
  label: string;
  tileTrackWidth: string;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const dragState = useRef({
    pointerId: -1,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
    blockClick: false,
  });

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth) return;

    dragState.current.pointerId = event.pointerId;
    dragState.current.startX = event.clientX;
    dragState.current.startScrollLeft = rail.scrollLeft;
    dragState.current.moved = false;
    dragState.current.blockClick = false;
    rail.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const state = dragState.current;
    if (!rail || state.pointerId !== event.pointerId) return;

    const distance = event.clientX - state.startX;
    if (!state.moved && Math.abs(distance) < 5) return;
    state.moved = true;
    event.preventDefault();
    rail.scrollLeft = state.startScrollLeft - distance;
  };

  const finishPointerDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railRef.current;
    const state = dragState.current;
    if (!rail || state.pointerId !== event.pointerId) return;

    state.blockClick = state.moved;
    state.pointerId = -1;
    if (rail.hasPointerCapture(event.pointerId)) {
      rail.releasePointerCapture(event.pointerId);
    }
    window.setTimeout(() => {
      dragState.current.blockClick = false;
    }, 0);
  };

  const blockDraggedClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!dragState.current.blockClick) return;
    event.preventDefault();
    event.stopPropagation();
    dragState.current.blockClick = false;
  };

  return (
    <div
      ref={railRef}
      role="region"
      aria-label={label}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={finishPointerDrag}
      onPointerCancel={finishPointerDrag}
      onClickCapture={blockDraggedClick}
      onDragStart={(event) => event.preventDefault()}
      className="grid cursor-grab select-none gap-x-3 overflow-x-auto overscroll-x-contain pb-2 active:cursor-grabbing sm:gap-x-4 [scrollbar-color:rgba(139,92,246,0.42)_rgba(255,255,255,0.06)] [scrollbar-width:thin]"
      style={{ gridAutoFlow: "column", gridAutoColumns: tileTrackWidth } as CSSProperties}
    >
      {children}
    </div>
  );
}

function SingleSetSection({
  group,
  tileTrackWidth,
  imageSizes,
  onPreview,
}: {
  group: UpcomingSingleGroup;
  tileTrackWidth: string;
  imageSizes: string;
  onPreview: (item: UpcomingSingleItem) => void;
}) {
  const setHref = `/upcoming/sets/${encodeURIComponent(group.key)}`;
  const progress = group.coverage == null ? null : Math.round(group.coverage * 100);
  const statusSummary = [
    group.statuses.confirmed ? `${group.statuses.confirmed} confirmed` : null,
    group.statuses.reveal ? `${group.statuses.reveal} revealed` : null,
    group.statuses.leak ? `${group.statuses.leak} early` : null,
    group.items.some((item) => item.libraryReference)
      ? `${group.items.filter((item) => item.libraryReference).length} database-linked`
      : null,
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

      <div className="bg-[radial-gradient(circle_at_50%_0%,rgba(124,92,255,0.11),transparent_46%)] p-3 sm:p-5">
        <HorizontalCardRail
          label={`Browse all ${group.items.length} ${group.items.length === 1 ? "card" : "cards"} from ${group.name}`}
          tileTrackWidth={tileTrackWidth}
        >
          {group.items.map((item) => (
            <div
              key={item.id}
              className="min-w-0 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
              style={{ contentVisibility: "auto", containIntrinsicSize: "auto 280px" }}
            >
              <BinderSingleTile item={item} imageSizes={imageSizes} onPreview={onPreview} />
            </div>
          ))}
        </HorizontalCardRail>
      </div>
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
  const { displaySettings, isMobileViewport } = useSettings();
  const [view, setView] = useState<ReleaseView>("all");
  const [search, setSearch] = useState("");
  const [visibleSingleGroupCount, setVisibleSingleGroupCount] = useState(4);
  const [previewItem, setPreviewItem] = useState<UpcomingSingleItem | null>(null);
  const query = useDeferredValue(search).trim().toLowerCase();
  const filtered = useMemo(() => ({
    sealed: sealed.filter((item) => matchesQuery(query, [item.name, item.episodeName, item.episodeCode, item.sourceName])),
    singles: singles.filter((item) => matchesQuery(query, [item.name, item.episodeName, item.episodeCode, item.cardNumber, item.rarity, item.headline, item.sourceName, item.libraryReference?.label])),
    stories: stories.filter((item) => matchesQuery(query, [item.title, item.description, item.sourceName, item.status])),
  }), [query, sealed, singles, stories]);
  const singleGroups = useMemo(() => groupUpcomingSingles(filtered.singles), [filtered.singles]);
  const visibleSingleGroups = query
    ? singleGroups
    : singleGroups.slice(0, visibleSingleGroupCount);
  const justReleased = filtered.sealed
    .filter((item) => item.daysSinceRelease != null)
    .sort((left, right) => right.releaseDate.localeCompare(left.releaseDate));
  const upcomingSealed = filtered.sealed.filter((item) => item.daysSinceRelease == null);
  const visibleSealed = view === "sealed" || query ? upcomingSealed : upcomingSealed.slice(0, 10);
  const visibleStories = view === "sources" || query ? filtered.stories : filtered.stories.slice(0, 6);
  const sealedGridTemplateColumns = getSealedProductGridTemplateColumns(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const sealedImageSizes = getSealedProductImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const singleImageSizes = getCardGridImageSizes(
    displaySettings.cardSize,
    displaySettings.widescreen,
    isMobileViewport
  );
  const singleTileTrackWidth = isMobileViewport
    ? singleImageSizes
    : getCardGridTrackWidth(displaySettings.cardSize, displaySettings.widescreen);

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
          <div className="flex flex-wrap items-center gap-1.5">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setView(tab.key)}
                aria-pressed={view === tab.key}
                className={`inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-3 text-[11px] font-bold transition-colors sm:flex-none ${
                  view === tab.key
                    ? "border-[rgb(var(--dc-primary-rgb)/0.38)] bg-[rgb(var(--dc-primary-rgb)/0.12)] text-[var(--dc-primary)] shadow-[inset_0_1px_0_var(--dc-sheen)]"
                    : "border-[rgb(var(--dc-border-rgb)/0.82)] bg-[rgb(var(--dc-surface-elevated-rgb)/0.7)] text-[rgb(var(--dc-text-primary-rgb)/0.58)] hover:border-[rgb(var(--dc-primary-rgb)/0.26)] hover:bg-[rgb(var(--dc-primary-rgb)/0.06)] hover:text-[var(--dc-text-primary)]"
                }`}
              >
                {tab.label}<span className="text-[9px] opacity-60">{tab.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {(view === "all" || view === "sealed") ? (
        <div className="space-y-6">
          {justReleased.length ? (
            <section>
              <SectionTitle Icon={Sparkles} eyebrow="Released this week" title="Just Released" description="New sealed products stay visible here for seven days after release." count={justReleased.length} />
              <div className="grid gap-3" style={{ gridTemplateColumns: sealedGridTemplateColumns }}>
                {justReleased.map((release) => (
                  <SealedReleaseTile key={release.id} release={release} imageSizes={sealedImageSizes} />
                ))}
              </div>
            </section>
          ) : null}
          <section>
          <SectionTitle Icon={Package} eyebrow="Release calendar" title="Upcoming sealed" description="Confirmed products ordered by their own release date, not only by the set launch." count={upcomingSealed.length} />
          {upcomingSealed.length ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: sealedGridTemplateColumns }}>
              {visibleSealed.map((release) => (
                <SealedReleaseTile key={release.id} release={release} imageSizes={sealedImageSizes} />
              ))}
            </div>
          ) : <EmptyState>No sealed releases match this search.</EmptyState>}
          </section>
        </div>
      ) : null}

      {(view === "all" || view === "singles") ? (
        <section>
          <SectionTitle Icon={Sparkles} eyebrow="Card watch" title="Revealed & leaked singles" description="Source images appear immediately; once a card is matched to the local library, its tile links directly to card detail." count={filtered.singles.length} />
          {filtered.singles.length ? (
            <>
              <div className="space-y-4 sm:space-y-5">
                {visibleSingleGroups.map((group) => (
                  <SingleSetSection
                    key={group.key}
                    group={group}
                    tileTrackWidth={singleTileTrackWidth}
                    imageSizes={singleImageSizes}
                    onPreview={setPreviewItem}
                  />
                ))}
              </div>
              {!query && visibleSingleGroups.length < singleGroups.length ? (
                <button
                  type="button"
                  onClick={() => setVisibleSingleGroupCount((count) => count + 4)}
                  className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl border border-violet-300/15 bg-violet-400/[0.055] px-4 text-sm font-bold text-violet-100/78 transition hover:border-violet-300/25 hover:bg-violet-400/[0.09] hover:text-white"
                >
                  Show more upcoming sets ({visibleSingleGroups.length} / {singleGroups.length})
                </button>
              ) : null}
            </>
          ) : <EmptyState>No single-card reveals have been ingested yet. The background source scan fills this automatically.</EmptyState>}
        </section>
      ) : null}

      {(view === "all" || view === "sources") ? (
        <section>
          <SectionTitle Icon={Eye} eyebrow="Background scan" title="Latest source watch" description="Release and reveal reports ingested from Pokémon, PokeBeach, ICv2, Bill's Archive and the other trusted Signal Radar sources." count={filtered.stories.length} />
          {filtered.stories.length ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleStories.map((story) => <StoryTile key={story.id} story={story} />)}
            </div>
          ) : <EmptyState>The next scheduled source scan will add new release and reveal stories here.</EmptyState>}
        </section>
      ) : null}

      {previewItem ? (
        <UpcomingCardImageViewer item={previewItem} onClose={() => setPreviewItem(null)} />
      ) : null}
    </div>
  );
}

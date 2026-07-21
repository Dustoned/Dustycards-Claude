import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Repeat2, ShoppingCart } from "lucide-react";
import CachedImage from "@/components/CachedImage";
import { getCardImageClassName, getCardImageFrameClassName } from "@/lib/card-image-display";
import { getCardDetailPayload } from "@/lib/card-detail-data";
import { buildCardEbaySearchUrl } from "@/lib/ebay-search-url";
import { formatCurrency } from "@/lib/format";
import { getExpansionHref } from "@/lib/games";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

type PrintingCard = {
  id: string;
  name: string;
  card_number: string | null;
  rarity: string | null;
  image_url: string | null;
  cardmarket_url: string | null;
  episode_id: string;
  episode_name: string;
  episode_code: string | null;
  episode_release_date: string | null;
  price: number | null;
  isCurrent: boolean;
};

function PrintingTile({
  printing,
  lowestPrice,
}: {
  printing: PrintingCard;
  lowestPrice: number | null;
}) {
  const detailHref = `${getExpansionHref(printing.episode_id)}?card=${encodeURIComponent(printing.id)}`;
  const ebayHref = buildCardEbaySearchUrl({
    name: printing.name,
    cardNumber: printing.card_number,
  });
  const isLowest = printing.price != null && printing.price === lowestPrice;

  return (
    <article className="group relative grid min-w-0 grid-cols-[7rem_minmax(0,1fr)] gap-3 rounded-2xl border border-black/8 bg-white/55 p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-violet-400/25 hover:shadow-lg dark:border-white/8 dark:bg-white/[0.035] dark:hover:bg-white/[0.05]">
      <Link
        href={detailHref}
        prefetch={false}
        className="absolute inset-0 z-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/70"
        aria-label={`Open ${printing.name} from ${printing.episode_name}`}
      />

      <div
        className={getCardImageFrameClassName(
          printing.image_url,
          "pointer-events-none relative z-10 aspect-[63/88] w-[7rem] overflow-hidden rounded-lg bg-black/5 drop-shadow-[0_10px_18px_rgba(0,0,0,0.22)]"
        )}
      >
        {printing.image_url ? (
          <CachedImage
            sourceUrl={printing.image_url}
            alt=""
            fill
            sizes="112px"
            className={getCardImageClassName(printing.image_url, "object-fill")}
            unoptimized
          />
        ) : null}
      </div>

      <div className="pointer-events-none relative z-10 flex min-w-0 flex-col py-0.5">
        <span className={`w-fit rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-[0.08em] ${
          printing.isCurrent
            ? "border-sky-400/20 bg-sky-400/[0.08] text-sky-700 dark:text-sky-200"
            : "border-violet-400/20 bg-violet-400/[0.09] text-violet-700 dark:text-violet-200"
        }`}>
          {printing.isCurrent ? "Current card" : "Reprint"}
        </span>

        <div className="mt-2 min-w-0">
          <h2 className="truncate text-sm font-black text-gray-950 transition group-hover:text-violet-700 dark:text-white dark:group-hover:text-violet-200">
            {printing.episode_name}
          </h2>
          <p className="mt-0.5 truncate text-[11px] font-medium text-gray-500 dark:text-white/42">
            {printing.episode_code ? `${printing.episode_code} · ` : ""}
            {printing.card_number ? `#${printing.card_number}` : "Unknown number"}
          </p>
          <p className="mt-1 truncate text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-white/30">
            {printing.rarity ?? "Standard printing"}
          </p>
        </div>

        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0">
            <p className={`text-lg font-black tabular-nums ${isLowest ? "text-emerald-700 dark:text-emerald-200" : "text-gray-950 dark:text-white"}`}>
              {formatCurrency(printing.price, "EUR")}
            </p>
            <p className="text-[9px] font-bold uppercase tracking-[0.08em] text-gray-400 dark:text-white/28">
              {isLowest ? "Lowest English NM" : "English NM"}
            </p>
          </div>
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-black/8 bg-white/70 text-gray-500 transition group-hover:border-violet-400/25 group-hover:text-violet-700 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/42 dark:group-hover:text-violet-200">
            <ArrowUpRight className="h-4 w-4" />
          </span>
        </div>

      </div>

      <div className={`relative z-20 col-span-full grid gap-2 ${printing.cardmarket_url ? "grid-cols-2" : "grid-cols-1"}`}>
        {printing.cardmarket_url ? (
          <a
            href={printing.cardmarket_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-black/8 bg-white/45 px-2 text-xs font-bold text-gray-600 transition hover:border-violet-400/25 hover:text-violet-700 dark:border-white/8 dark:bg-white/[0.025] dark:text-white/52 dark:hover:text-violet-200"
          >
            <ShoppingCart className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">CardMarket</span>
          </a>
        ) : null}
        <a
          href={ebayHref}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1.5 rounded-xl border border-black/8 bg-white/45 px-2 text-xs font-bold text-gray-600 transition hover:border-violet-400/25 hover:text-violet-700 dark:border-white/8 dark:bg-white/[0.025] dark:text-white/52 dark:hover:text-violet-200"
        >
          eBay Deals
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
        </a>
      </div>
    </article>
  );
}

export default async function CardReprintsPage({
  params,
  searchParams,
}: {
  params: Promise<{ cardId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { cardId } = await params;
  const { from } = await searchParams;
  const route = `/reprints/${encodeURIComponent(cardId)}${from === "radar" ? "?from=radar" : ""}`;
  const user = await requirePageUser(route);
  const card = await getCardDetailPayload(cardId, user.id);
  if (!card) notFound();

  const related = card.related_printings ?? [];
  const currentPrinting: PrintingCard = {
    id: card.id,
    name: card.name,
    card_number: card.card_number,
    rarity: card.rarity,
    image_url: card.image_url,
    cardmarket_url: card.cardmarket_url,
    episode_id: card.episode_id,
    episode_name: card.episode_name,
    episode_code: card.episode_code,
    episode_release_date: card.episode_release_date,
    price: card.price?.cm_en_lowest_nm ?? null,
    isCurrent: true,
  };
  const printings: PrintingCard[] = [
    currentPrinting,
    ...related.map((printing) => ({ ...printing, isCurrent: false })),
  ];
  const prices = printings
    .map((printing) => printing.price)
    .filter((price): price is number => price != null);
  const lowestPrice = prices.length > 0 ? Math.min(...prices) : null;
  const backHref = from === "radar"
    ? `/movers/signal-radar/${encodeURIComponent(card.id)}?game=${encodeURIComponent(card.game)}`
    : `${getExpansionHref(card.episode_id)}?card=${encodeURIComponent(card.id)}`;

  return (
    <main className="page-container binder-bottom-safe mx-auto max-w-[1200px] px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
      <Link
        href={backHref}
        prefetch={false}
        className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-black/8 bg-white/55 px-3.5 text-sm font-bold text-gray-600 transition hover:border-violet-400/25 hover:text-violet-700 dark:border-white/8 dark:bg-white/[0.035] dark:text-white/58 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to card
      </Link>

      <header className="mt-5 flex min-w-0 flex-col gap-3 border-b border-black/7 pb-5 dark:border-white/8 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-violet-700 dark:text-violet-300/80">
            <Repeat2 className="h-4 w-4" />
            <p className="text-[10px] font-black uppercase tracking-[0.16em]">Reprint comparison</p>
          </div>
          <h1 className="mt-2 truncate text-3xl font-black tracking-tight text-gray-950 dark:text-white sm:text-4xl">
            {card.name}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-gray-500 dark:text-white/48">
            The same card and artwork across another set or print treatment, together in one comparison.
          </p>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-2xl font-black tabular-nums text-gray-950 dark:text-white">
            {related.length}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-gray-400 dark:text-white/32">
            Verified {related.length === 1 ? "reprint" : "reprints"}
          </p>
        </div>
      </header>

      {related.length > 0 ? (
        <section className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={`${card.name} printings`}>
          {printings.map((printing) => (
            <PrintingTile key={printing.id} printing={printing} lowestPrice={lowestPrice} />
          ))}
        </section>
      ) : (
        <section className="binder-panel mt-5 rounded-3xl px-5 py-10 text-center">
          <Repeat2 className="mx-auto h-6 w-6 text-violet-500/70" />
          <h2 className="mt-3 text-lg font-black text-gray-950 dark:text-white">No other verified printing</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500 dark:text-white/45">
            No matching artwork and card data passed verification for this card.
          </p>
        </section>
      )}
    </main>
  );
}

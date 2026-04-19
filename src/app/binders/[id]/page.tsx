import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import CollectionBinderIcon from "@/components/CollectionBinderIcon";
import CollectionCardsView from "@/components/CollectionCardsView";
import PriceHistoryPanel from "@/components/PriceHistoryPanel";
import { formatCollectionCurrency } from "@/lib/collection";
import { getBinderPageData } from "@/lib/collection-data";

export const dynamic = "force-dynamic";

export default async function BinderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getBinderPageData(id);

  if (!data) {
    notFound();
  }

  const totalCardsLabel =
    data.metrics.totalCards != null
      ? `${data.metrics.ownedCount}/${data.metrics.totalCards}`
      : `${data.metrics.ownedCount}`;

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/?tab=binders"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to collection
      </Link>

      <div className="glass mb-8 rounded-3xl px-6 py-6 shadow-lg shadow-black/5 sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-3xl border border-black/8 bg-white/80 dark:border-white/10 dark:bg-white/8"
            style={{ color: data.binder.accent_color ?? "#8b5cf6" }}
          >
            {data.binder.episode?.logo_url ? (
              <div className="relative h-12 w-12">
                <Image
                  src={data.binder.episode.logo_url}
                  alt={data.binder.name}
                  fill
                  className="object-contain"
                  unoptimized
                />
              </div>
            ) : (
              <CollectionBinderIcon iconName={data.binder.icon_name} className="h-8 w-8" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
              {data.binder.name}
            </h1>
            <p className="mt-2 text-sm text-gray-500 dark:text-white/50">
              {data.binder.episode
                ? `${data.binder.episode.series ?? "Set"} / ${data.binder.episode.name}`
                : "Custom binder"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-gray-500 dark:text-white/50">
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                {data.metrics.totalCards != null ? "Set progress" : "Cards"} {totalCardsLabel}
              </span>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                Invested {formatCollectionCurrency(data.metrics.investment)}
              </span>
              <span className="rounded-full border border-black/8 bg-black/[0.03] px-3 py-1 dark:border-white/8 dark:bg-white/[0.04]">
                P&amp;L {data.metrics.pnl >= 0 ? "+" : ""}
                {formatCollectionCurrency(data.metrics.pnl)}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-6">
          <PriceHistoryPanel
            title="Binder Value"
            currency="EUR"
            points={data.chart}
            currentValue={data.metrics.currentValue}
            subtitle={`Current value ${formatCollectionCurrency(data.metrics.currentValue)}`}
            emptyText="Add cards to start tracking this binder"
          />
        </div>
      </div>

      <CollectionCardsView
        items={data.items}
        blurMissing={data.binder.type === "linked_set"}
        emptyTitle="No cards in this binder"
        emptyText={
          data.binder.type === "linked_set"
            ? "This linked binder has no cards in the source set yet."
            : "Add cards and assign them to this binder to see them here."
        }
      />
    </div>
  );
}

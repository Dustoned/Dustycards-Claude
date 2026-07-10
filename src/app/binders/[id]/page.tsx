import { notFound } from "next/navigation";
import BinderDetailClient from "./BinderDetailClient";
import {
  BINDER_HISTORY_RECENT_DAYS,
  getBinderPageData,
  type BinderHistoryRange,
} from "@/lib/collection-data";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function BinderDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ history?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const user = await requirePageUser(`/binders/${id}`);
  const historyRange: BinderHistoryRange = query.history === "all" ? "all" : "recent";
  const data = await getBinderPageData(id, user.id, { historyRange });

  if (!data) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <BinderDetailClient
        data={data}
        historyRange={historyRange}
        recentHistoryDays={BINDER_HISTORY_RECENT_DAYS}
      />
    </div>
  );
}

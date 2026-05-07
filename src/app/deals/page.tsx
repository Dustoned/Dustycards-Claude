import DealsBrowser from "@/app/deals/DealsBrowser";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cardId?: string; mode?: string; buying?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.cardId) query.set("cardId", params.cardId);
  if (params.mode) query.set("mode", params.mode);
  if (params.buying) query.set("buying", params.buying);

  await requirePageUser(`/deals${query.size > 0 ? `?${query}` : ""}`);

  return <DealsBrowser />;
}

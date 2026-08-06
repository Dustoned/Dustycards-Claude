import DealsBrowserLoader from "@/app/deals/DealsBrowserLoader";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    cardId?: string;
    productId?: string;
    mode?: string;
    buying?: string;
    condition?: string;
    sort?: string;
  }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.cardId) query.set("cardId", params.cardId);
  if (params.productId) query.set("productId", params.productId);
  if (params.mode) query.set("mode", params.mode);
  if (params.buying) query.set("buying", params.buying);
  if (params.condition) query.set("condition", params.condition);
  if (params.sort) query.set("sort", params.sort);

  await requirePageUser(`/deals${query.size > 0 ? `?${query}` : ""}`);

  return <DealsBrowserLoader key={query.toString()} />;
}

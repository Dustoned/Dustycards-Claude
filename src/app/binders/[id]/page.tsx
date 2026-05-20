import { notFound } from "next/navigation";
import BinderDetailClient from "./BinderDetailClient";
import { getBinderPageData } from "@/lib/collection-data";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function BinderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/binders/${id}`);
  const data = await getBinderPageData(id, user.id);

  if (!data) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <BinderDetailClient data={data} />
    </div>
  );
}

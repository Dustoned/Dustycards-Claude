import { notFound } from "next/navigation";
import WantBinderDetailClient from "./WantBinderDetailClient";
import { getWantBinderPageData } from "@/lib/collection-data";
import { requirePageUser } from "@/lib/page-auth";

export const dynamic = "force-dynamic";

export default async function WantBinderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser(`/wants/binders/${id}`);
  const data = await getWantBinderPageData(id, user.id);

  if (!data) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <WantBinderDetailClient data={data} />
    </div>
  );
}

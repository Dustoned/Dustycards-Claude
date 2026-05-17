import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/wants"
        prefetch={false}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to wants
      </Link>

      <WantBinderDetailClient data={data} />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import BinderDetailClient from "./BinderDetailClient";
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

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <Link
        href="/?tab=binders"
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 dark:text-white/50 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to collection
      </Link>

      <BinderDetailClient data={data} />
    </div>
  );
}

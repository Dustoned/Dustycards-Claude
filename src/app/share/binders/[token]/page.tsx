import { notFound } from "next/navigation";
import { getSharedBinderPageData } from "@/lib/binder-sharing";
import SharedBinderClient from "./SharedBinderClient";

export const dynamic = "force-dynamic";

export default async function SharedBinderPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getSharedBinderPageData(token);
  if (!data) notFound();

  return (
    <div className="page-container mx-auto max-w-7xl px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
      <SharedBinderClient data={data} />
    </div>
  );
}

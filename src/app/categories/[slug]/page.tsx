import { notFound } from "next/navigation";
import { getCardCategoryPageData } from "@/lib/card-categories";
import { requirePageUser } from "@/lib/page-auth";
import CategoryDetailClient from "./CategoryDetailClient";

export const dynamic = "force-dynamic";

export default async function CategoryDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const user = await requirePageUser(`/categories/${slug}`);
  const data = await getCardCategoryPageData(slug, user.id);

  if (!data) {
    notFound();
  }

  return (
    <div className="page-container mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-8 lg:px-8">
      <CategoryDetailClient
        category={data.category}
        items={data.items}
        priceSnapshots={data.priceSnapshots}
        totalCards={data.totalCards}
        ownedCards={data.ownedCards}
        setCount={data.setCount}
        pricedCards={data.pricedCards}
        estimatedValue={data.estimatedValue}
      />
    </div>
  );
}

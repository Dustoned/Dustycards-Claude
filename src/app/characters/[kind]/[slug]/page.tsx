import { notFound } from "next/navigation";
import { getCharacterPageData } from "@/lib/card-characters-server";
import { requirePageUser } from "@/lib/page-auth";
import CharacterCardsClient from "./CharacterCardsClient";

export const dynamic = "force-dynamic";

export default async function CharacterCardsPage({
  params,
}: {
  params: Promise<{ kind: string; slug: string }>;
}) {
  const { kind, slug } = await params;
  const returnPath = `/characters/${encodeURIComponent(kind)}/${encodeURIComponent(slug)}`;
  const user = await requirePageUser(returnPath);
  const data = await getCharacterPageData(kind, slug, user.id);

  if (!data) notFound();

  return (
    <main className="page-container mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <CharacterCardsClient entity={data.entity} cards={data.cards} />
    </main>
  );
}

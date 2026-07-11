import { PageHeroHeader } from "@/components/PageHeader";
import { requirePageUser } from "@/lib/page-auth";
import SubmitCardClient from "./SubmitCardClient";

export const dynamic = "force-dynamic";

export default async function SubmitCardPage() {
  await requirePageUser("/submit-card");

  return (
    <div className="page-container page-readable mx-auto px-4 py-8 sm:px-6 lg:px-8">
      <PageHeroHeader
        eyebrow="CardMarket"
        title="Submit Missing Card"
        description="Add a missing Pokemon or One Piece card from CardMarket without waiting for the normal TCGGO catalog."
        className="mb-6"
      />
      <SubmitCardClient />
    </div>
  );
}

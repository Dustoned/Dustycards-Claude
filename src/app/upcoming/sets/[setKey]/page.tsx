import Link from "next/link";
import { ArrowLeft, CalendarDays, Hash, Layers3, ShieldCheck } from "lucide-react";
import { notFound } from "next/navigation";
import BackNavigationLink from "@/components/BackNavigationLink";
import { PageHeroHeader } from "@/components/PageHeader";
import UpcomingSetGalleryClient from "@/app/upcoming/sets/[setKey]/UpcomingSetGalleryClient";
import { requirePageUser } from "@/lib/page-auth";
import { getUpcomingReleaseFeed } from "@/lib/upcoming-releases";
import { groupUpcomingSingles } from "@/lib/upcoming-single-groups";

export const dynamic = "force-dynamic";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

export default async function UpcomingSetPage({
  params,
}: {
  params: Promise<{ setKey: string }>;
}) {
  await requirePageUser("/upcoming");
  const { setKey } = await params;
  const feed = await getUpcomingReleaseFeed();
  const group = groupUpcomingSingles(feed.singles).find((candidate) => candidate.key === setKey);
  if (!group) notFound();
  const coverage = group.coverage == null ? null : Math.round(group.coverage * 100);

  return (
    <main className="page-container page-readable mx-auto max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex flex-col gap-5 sm:gap-6">
        <PageHeroHeader
          eyebrow="Upcoming set gallery"
          title={group.name}
          description="A focused binder-style view of every currently revealed card, without collection charts or unrelated market panels."
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/46">
              <BackNavigationLink href="/upcoming" className="inline-flex items-center gap-2 font-medium transition hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Back to Upcoming
              </BackNavigationLink>
              <Link href="/movers/signal-radar" prefetch={false} className="font-medium transition hover:text-white">Signal Radar</Link>
            </div>
          }
          stats={[
            {
              label: "Cards",
              value: group.items.length,
              hint: group.items.length === 1 ? "unique revealed card" : "unique revealed cards",
              Icon: Layers3,
              tone: "violet",
            },
            { label: "Numbered", value: group.numberedCount, hint: group.numberingCeiling ? `through #${group.numberingCeiling}` : "known numbers", Icon: Hash, tone: "sky" },
            { label: "Coverage", value: coverage == null ? "—" : `${coverage}%`, hint: group.nearComplete ? "near-complete numbering" : "current numbered coverage", Icon: ShieldCheck, tone: "emerald" },
            { label: "Release", value: group.releaseDate ? DATE_FORMATTER.format(new Date(group.releaseDate)) : "Pending", hint: group.sources.join(" + ") || "source watch", Icon: CalendarDays, tone: "amber" },
          ]}
        />
        <UpcomingSetGalleryClient group={group} />
      </div>
    </main>
  );
}

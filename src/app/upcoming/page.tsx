import Link from "next/link";
import { ArrowLeft, CalendarDays, Newspaper, Package, Sparkles } from "lucide-react";
import BackNavigationLink from "@/components/BackNavigationLink";
import { PageHeroHeader } from "@/components/PageHeader";
import UpcomingReleasesClient from "@/app/upcoming/UpcomingReleasesClient";
import { requirePageUser } from "@/lib/page-auth";
import { getUpcomingSealedReleases } from "@/lib/sealed-movers";
import { getUpcomingReleaseFeed } from "@/lib/upcoming-releases";

export const dynamic = "force-dynamic";

export default async function UpcomingReleasesPage() {
  await requirePageUser("/upcoming");
  const [sealed, feed] = await Promise.all([
    getUpcomingSealedReleases("pokemon"),
    getUpcomingReleaseFeed(),
  ]);

  return (
    <main className="page-container mx-auto max-w-[1760px] px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
      <div className="flex flex-col gap-5 sm:gap-6">
        <PageHeroHeader
          eyebrow="Release intelligence"
          title="Upcoming & Leaks"
          description="Upcoming sealed products, newly revealed singles and credible early reports in one clear timeline. Community reports stay labelled until an official source confirms them."
          backLinks={
            <div className="flex flex-wrap items-center gap-3 text-sm text-white/46">
              <BackNavigationLink href="/" className="inline-flex items-center gap-2 font-medium transition hover:text-white">
                <ArrowLeft className="h-4 w-4" /> Back to collection
              </BackNavigationLink>
              <Link href="/movers/signal-radar" prefetch={false} className="inline-flex items-center gap-2 font-medium transition hover:text-white">
                Signal Radar
              </Link>
            </div>
          }
          stats={[
            { label: "Sealed", value: sealed.length, hint: "scheduled products", Icon: Package, tone: "violet" },
            { label: "Singles", value: feed.singles.length, hint: "reveals and leaks", Icon: Sparkles, tone: "sky" },
            { label: "Sources", value: feed.stories.length, hint: "recent reports", Icon: Newspaper, tone: "amber" },
            { label: "Refresh", value: "Automatic", hint: "background source scan", Icon: CalendarDays, tone: "emerald" },
          ]}
        />
        <UpcomingReleasesClient sealed={sealed} singles={feed.singles} stories={feed.stories} />
      </div>
    </main>
  );
}

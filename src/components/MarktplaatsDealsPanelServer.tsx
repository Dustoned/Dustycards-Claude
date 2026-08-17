import MarktplaatsDealsPanel, {
  type MarktplaatsDealPanelItem,
  type MarktplaatsDealSearchParams,
  type MarktplaatsRadarSignalPreview,
} from "@/components/MarktplaatsDealsPanel";
import { db } from "@/lib/db";
import { readSignalRadarSnapshot } from "@/lib/signal-radar-snapshot-store";

const MIN_CARD_MARKET_VALUE_EUR = 5;
const eligibleValueWhere = {
  OR: [
    { kind: "expansion" },
    { market_value_eur: { gte: MIN_CARD_MARKET_VALUE_EUR } },
  ],
};

async function latestRun() {
  return db.marktplaatsScanRun.findFirst({
    where: { finished_at: { not: null } },
    orderBy: { started_at: "desc" },
  });
}

export async function getLatestMarktplaatsSelectionCount(): Promise<number> {
  const run = await latestRun();
  if (!run) return 0;
  return db.marktplaatsDeal.count({
    where: {
      scan_run_id: run.id,
      removed_at: null,
      AND: [eligibleValueWhere],
      match_status: { in: ["matched", "shortlist"] },
    },
  });
}

export default async function MarktplaatsDealsPanelServer({
  searchParams,
}: {
  searchParams: MarktplaatsDealSearchParams;
}) {
  const run = await latestRun();
  const rows = await db.marktplaatsDeal.findMany({
    where: {
      scan_run_id: run?.id ?? "__no_scan__",
      removed_at: null,
      AND: [eligibleValueWhere],
    },
    orderBy: [{ discount_percent: "desc" }, { savings_eur: "desc" }],
    take: 1_000,
    select: {
      id: true,
      kind: true,
      title: true,
      listing_url: true,
      listing_price_eur: true,
      shipping_eur: true,
      market_value_eur: true,
      savings_eur: true,
      discount_percent: true,
      condition: true,
      language: true,
      grading_company: true,
      grading_grade: true,
      match_confidence: true,
      match_status: true,
      description_summary: true,
      offer_contents: true,
      card: {
        select: {
          id: true,
          name: true,
          card_number: true,
          printed_card_number: true,
          image_url: true,
          episode: { select: { name: true, code: true } },
        },
      },
      episode: {
        select: { id: true, name: true, code: true, logo_url: true },
      },
    },
  });
  const allDeals: MarktplaatsDealPanelItem[] = rows;
  const radarSnapshot = await readSignalRadarSnapshot("pokemon");
  const radarSignals: MarktplaatsRadarSignalPreview[] = (
    radarSnapshot?.data.signals ?? []
  ).map((signal) => ({
    cardId: signal.cardId,
    rank: signal.rank,
    pressureLabel: signal.pressureLabel,
    externalScore: signal.externalScore,
    confidence: signal.confidence,
    reasons: signal.reasons,
    pressureExplanation: signal.pressureExplanation,
  }));

  return (
    <MarktplaatsDealsPanel
      initialSearchParams={searchParams}
      run={
        run
          ? {
              finishedAt: run.finished_at?.toISOString() ?? null,
              listingsChecked: run.listings_checked,
              warning: run.warning,
            }
          : null
      }
      allDeals={allDeals}
      radarSignals={radarSignals}
    />
  );
}

import "server-only";

import { db } from "@/lib/db";
import {
  MarktplaatsReportError,
  marktplaatsDealMateriallyChanged,
  normalizeMarktplaatsReport,
  type NormalizedMarktplaatsReport,
} from "@/lib/marktplaats-deals-core";

export interface ImportedMarktplaatsReport {
  scanRunId: string;
  dealsFound: number;
  newDealsFound: number;
  removedDeals: number;
  completeCoverage: boolean;
  collectionsInspected: number;
}

async function assertReferencedCatalogRecords(report: NormalizedMarktplaatsReport): Promise<void> {
  const cardIds = [...new Set(report.deals.map((deal) => deal.cardId).filter(Boolean))] as string[];
  const episodeIds = [
    ...new Set(report.deals.map((deal) => deal.episodeId).filter(Boolean)),
  ] as string[];
  const [cards, episodes] = await Promise.all([
    cardIds.length
      ? db.card.findMany({ where: { id: { in: cardIds } }, select: { id: true } })
      : [],
    episodeIds.length
      ? db.episode.findMany({ where: { id: { in: episodeIds } }, select: { id: true } })
      : [],
  ]);
  const knownCards = new Set(cards.map((card) => card.id));
  const knownEpisodes = new Set(episodes.map((episode) => episode.id));
  const missingCards = cardIds.filter((id) => !knownCards.has(id));
  const missingEpisodes = episodeIds.filter((id) => !knownEpisodes.has(id));
  if (missingCards.length || missingEpisodes.length) {
    throw new MarktplaatsReportError(
      [
        missingCards.length ? `Unknown card IDs: ${missingCards.slice(0, 5).join(", ")}` : null,
        missingEpisodes.length
          ? `Unknown expansion IDs: ${missingEpisodes.slice(0, 5).join(", ")}`
          : null,
      ]
        .filter(Boolean)
        .join(". ")
    );
  }
}

export async function importMarktplaatsReport(
  input: unknown
): Promise<ImportedMarktplaatsReport> {
  const report = normalizeMarktplaatsReport(input);
  await assertReferencedCatalogRecords(report);
  const inspectionCardIds = [...new Set(report.collections.flatMap((item) => item.cards.map((card) => card.cardId)).filter((id): id is string => Boolean(id)))];
  if (inspectionCardIds.length) {
    const cards = await db.card.findMany({ where: { id: { in: inspectionCardIds }, game: "pokemon" }, select: { id: true } });
    if (cards.length !== inspectionCardIds.length) throw new MarktplaatsReportError("Collection inspections must reference existing Pokémon cards; use cardId: null for unknown printings.");
  }

  const externalIds = report.deals.map((deal) => deal.externalId);
  const existingRows = externalIds.length
    ? await db.marktplaatsDeal.findMany({
        where: { external_id: { in: externalIds } },
        select: {
          external_id: true,
          listing_price_eur: true,
          shipping_eur: true,
          market_value_eur: true,
          match_status: true,
          first_seen_at: true,
          last_changed_at: true,
        },
      })
    : [];
  const existingById = new Map(existingRows.map((row) => [row.external_id, row]));
  const newDealsFound = report.deals.filter(
    (deal) => !existingById.has(deal.externalId)
  ).length;

  return db.$transaction(async (tx) => {
    await tx.marktplaatsScanRun.upsert({
      where: { id: report.scan.id },
      create: {
        id: report.scan.id,
        status: "importing",
        source: "codex",
        reference_exported_at: report.scan.referenceExportedAt,
        started_at: report.scan.startedAt,
        finished_at: null,
        listings_checked: report.scan.listingsChecked,
        deals_found: report.deals.length,
        new_deals_found: newDealsFound,
        warning: report.scan.warning,
        details_json: JSON.stringify({ completeCoverage: report.scan.completeCoverage }),
      },
      update: {
        status: "importing",
        reference_exported_at: report.scan.referenceExportedAt,
        started_at: report.scan.startedAt,
        finished_at: null,
        listings_checked: report.scan.listingsChecked,
        deals_found: report.deals.length,
        new_deals_found: newDealsFound,
        warning: report.scan.warning,
        details_json: JSON.stringify({ completeCoverage: report.scan.completeCoverage }),
      },
    });

    for (const deal of report.deals) {
      const existing = existingById.get(deal.externalId);
      const changed = existing ? marktplaatsDealMateriallyChanged(existing, deal) : true;
      const observedAt = report.scan.finishedAt;
      const values = {
        scan_run_id: report.scan.id,
        kind: deal.kind,
        title: deal.title,
        listing_url: deal.listingUrl,
        image_url: deal.imageUrl,
        seller_name: deal.sellerName,
        location: deal.location,
        card_id: deal.cardId,
        episode_id: deal.episodeId,
        listing_price_eur: deal.listingPriceEur,
        shipping_eur: deal.shippingEur,
        market_value_eur: deal.marketValueEur,
        savings_eur: deal.savingsEur,
        discount_percent: deal.discountPercent,
        condition: deal.condition,
        language: deal.language,
        grading_company: deal.gradingCompany,
        grading_grade: deal.gradingGrade,
        match_confidence: deal.matchConfidence,
        match_status: deal.matchStatus,
        match_notes: deal.matchNotes,
        description_checked: deal.descriptionChecked,
        description_summary: deal.descriptionSummary,
        offer_contents: deal.offerContents,
        source_published_at: deal.sourcePublishedAt,
        last_seen_at: observedAt,
        last_changed_at: changed ? observedAt : (existing?.last_changed_at ?? observedAt),
        removed_at: null,
      };

      await tx.marktplaatsDeal.upsert({
        where: { external_id: deal.externalId },
        create: {
          external_id: deal.externalId,
          first_seen_at: observedAt,
          ...values,
        },
        update: values,
      });
    }

    let removedDeals = 0;
    // A separate catalogue permits bid-only/unknown-value collections without weakening deal validation.
    for (const collection of report.collections) {
      await tx.marktplaatsCollectionInspection.upsert({
        where: { external_id: collection.externalId },
        create: { external_id: collection.externalId, scan_run_id: report.scan.id, report_json: JSON.stringify(collection), observed_at: report.scan.finishedAt },
        update: { scan_run_id: report.scan.id, report_json: JSON.stringify(collection), observed_at: report.scan.finishedAt, removed_at: null },
      });
    }
    if (report.removedCollectionIds.length) {
      await tx.marktplaatsCollectionInspection.updateMany({
        where: { external_id: { in: report.removedCollectionIds } }, data: { removed_at: report.scan.finishedAt },
      });
    }
    if (report.scan.removedExternalIds.length) {
      const explicitRemoval = await tx.marktplaatsDeal.updateMany({
        where: {
          external_id: { in: report.scan.removedExternalIds },
          removed_at: null,
        },
        data: { removed_at: report.scan.finishedAt },
      });
      removedDeals += explicitRemoval.count;
    }
    if (report.scan.completeCoverage) {
      const removal = await tx.marktplaatsDeal.updateMany({
        where: {
          removed_at: null,
          ...(externalIds.length ? { external_id: { notIn: externalIds } } : {}),
        },
        data: { removed_at: report.scan.finishedAt },
      });
      removedDeals += removal.count;
    }

    await tx.marktplaatsScanRun.update({
      where: { id: report.scan.id },
      data: {
        status: report.scan.warning ? "partial" : "success",
        finished_at: report.scan.finishedAt,
      },
    });

    return {
      scanRunId: report.scan.id,
      dealsFound: report.deals.length,
      newDealsFound,
      removedDeals,
      completeCoverage: report.scan.completeCoverage,
      collectionsInspected: report.collections.length,
    };
  });
}

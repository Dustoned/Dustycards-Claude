-- Version 3.13.1 removed every automatic same-expansion relation. Requeue
-- same-name cards within one expansion so the artwork-aware matcher can
-- restore genuine reprints while keeping distinct rarity artwork separate.
UPDATE "CardPrintingEvidence"
SET
  "match_status" = NULL,
  "matched_at" = NULL,
  "updated_at" = CURRENT_TIMESTAMP
WHERE "card_id" IN (
  SELECT source_card."id"
  FROM "Card" AS source_card
  WHERE source_card."game" = 'pokemon'
    AND source_card."image_url" IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "Card" AS candidate
      WHERE candidate."id" <> source_card."id"
        AND candidate."game" = source_card."game"
        AND candidate."episode_id" = source_card."episode_id"
        AND candidate."name" = source_card."name"
        AND coalesce(candidate."supertype", '') = coalesce(source_card."supertype", '')
        AND candidate."image_url" IS NOT NULL
    )
);

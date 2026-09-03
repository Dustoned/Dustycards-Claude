-- Same-expansion print families require matching, known illustrator credits.
-- Remove any automatically restored pair that does not meet that rule.
DELETE FROM "CardPrintingRelation"
WHERE "match_method" <> 'manual-include'
  AND EXISTS (
    SELECT 1
    FROM "Card" AS source_card
    JOIN "Card" AS target_card
      ON target_card."id" = "CardPrintingRelation"."target_card_id"
    WHERE source_card."id" = "CardPrintingRelation"."source_card_id"
      AND source_card."episode_id" = target_card."episode_id"
      AND (
        nullif(trim(source_card."artist"), '') IS NULL
        OR nullif(trim(target_card."artist"), '') IS NULL
        OR lower(trim(source_card."artist")) <> lower(trim(target_card."artist"))
      )
  );

-- Requeue the remaining same-name, same-set, same-illustrator candidates so
-- the artwork threshold can rebuild only verified relationships.
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
    AND nullif(trim(source_card."artist"), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM "Card" AS candidate
      WHERE candidate."id" <> source_card."id"
        AND candidate."game" = source_card."game"
        AND candidate."episode_id" = source_card."episode_id"
        AND candidate."name" = source_card."name"
        AND coalesce(candidate."supertype", '') = coalesce(source_card."supertype", '')
        AND lower(trim(candidate."artist")) = lower(trim(source_card."artist"))
        AND candidate."image_url" IS NOT NULL
    )
);

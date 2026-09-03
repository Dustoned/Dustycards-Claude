-- A print family represents a card issued again in another expansion.
-- Remove automatically generated same-expansion rarity/artwork variants while
-- preserving pairs that an admin explicitly verified.
DELETE FROM "CardPrintingRelation"
WHERE "match_method" <> 'manual-include'
  AND EXISTS (
    SELECT 1
    FROM "Card" AS source_card
    JOIN "Card" AS target_card
      ON target_card."id" = "CardPrintingRelation"."target_card_id"
    WHERE source_card."id" = "CardPrintingRelation"."source_card_id"
      AND source_card."episode_id" = target_card."episode_id"
  );

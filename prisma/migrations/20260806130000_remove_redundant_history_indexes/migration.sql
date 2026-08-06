-- Every removed index is a strict left-prefix duplicate of an index that
-- remains. SQLite can use the longer index for the same card lookup, while the
-- production database no longer has to store and update hundreds of MB of
-- duplicate B-trees.
DROP INDEX IF EXISTS "CardGradedPrice_card_id_idx";
DROP INDEX IF EXISTS "CardGradedPriceSnapshot_card_id_idx";
DROP INDEX IF EXISTS "CardEbaySoldGradedPrice_card_id_idx";
DROP INDEX IF EXISTS "CardEbaySoldGradedPriceSnapshot_card_id_idx";
DROP INDEX IF EXISTS "Price_card_id_idx";
DROP INDEX IF EXISTS "Price_card_id_fetched_at_idx";

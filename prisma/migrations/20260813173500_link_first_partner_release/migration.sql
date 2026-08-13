-- The publisher release name contains a Pokémon TCG prefix and an em dash,
-- while the marketplace catalogue uses a plain product title. This is the
-- same unambiguous identity used by the automatic sealed-release matcher.
UPDATE "SealedReleaseWatch"
SET "matched_product_id" = '50639',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = 'pokemon-44295c320a657dd38d79'
  AND "matched_product_id" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "SealedProduct"
    WHERE "id" = '50639'
      AND "name" = 'First Partner Illustration Collection Series 3'
  );

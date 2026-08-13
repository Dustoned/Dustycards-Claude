UPDATE "SealedProduct"
SET "release_date" = '2026-08-07T12:00:00.000Z',
    "release_date_source" = 'Pokemon.com',
    "release_date_source_url" = 'https://www.pokemon.com/us/pokemon-tcg/product-gallery/first-partner-illustration-collection-series-3',
    "release_date_confidence" = 1,
    "release_date_checked_at" = CURRENT_TIMESTAMP
WHERE "id" = '50639'
  AND "release_date" IS NULL;

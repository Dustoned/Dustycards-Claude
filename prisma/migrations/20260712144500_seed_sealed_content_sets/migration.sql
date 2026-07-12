INSERT OR IGNORE INTO "SealedProductContentSet" (
    "product_id",
    "episode_id",
    "source_name",
    "confidence",
    "created_at",
    "updated_at"
)
SELECT
    "id",
    "episode_id",
    'TCGGO episode catalog',
    0.9,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "SealedProduct";

INSERT INTO "SealedPriceSnapshot" (
    "id",
    "product_id",
    "episode_id",
    "fetched_at",
    "cm_lowest",
    "cm_lowest_eu",
    "cm_lowest_de",
    "cm_lowest_fr",
    "cm_lowest_es",
    "cm_lowest_it",
    "cm_avg_7d",
    "cm_avg_30d"
)
SELECT
    'seed-' || sp."id" || '-' || strftime('%s', COALESCE(sp."synced_at", CURRENT_TIMESTAMP)),
    sp."id",
    sp."episode_id",
    COALESCE(sp."synced_at", CURRENT_TIMESTAMP),
    sp."cm_lowest",
    sp."cm_lowest_eu",
    sp."cm_lowest_de",
    sp."cm_lowest_fr",
    sp."cm_lowest_es",
    sp."cm_lowest_it",
    sp."cm_avg_7d",
    sp."cm_avg_30d"
FROM "SealedProduct" sp
WHERE NOT EXISTS (
    SELECT 1
    FROM "SealedPriceSnapshot" snapshot
    WHERE snapshot."product_id" = sp."id"
);

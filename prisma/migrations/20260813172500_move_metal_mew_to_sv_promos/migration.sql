-- The UPC metal Mew is a standalone promo product which reuses 151 #205/165.
-- Keep its own market history and wants, but stop treating it as a second 151
-- checklist card by placing it with the Scarlet & Violet-era promos.
UPDATE "Card"
SET "episode_id" = '23',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "id" = '47943'
  AND "version" = 'Metal Card';

-- This want was generated solely because the duplicate lived inside the 151
-- linked-set checklist. It can be recreated manually if the user wants the
-- metal promo as a separate item.
DELETE FROM "CollectionWant"
WHERE "card_id" = '47943'
  AND "source" = 'binder_missing';

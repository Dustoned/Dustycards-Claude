-- These four Mew VMAX cards have the same HP, stage, attacks and effects.
-- Their regular, rainbow, alternate-art and trainer-gallery treatments form
-- one print family even though the credited artwork differs.
INSERT OR REPLACE INTO "CardPrintingOverride" (
  "id",
  "user_id",
  "source_card_id",
  "target_card_id",
  "decision",
  "reason",
  "created_at",
  "updated_at"
)
SELECT
  'seed-mew-vmax-' || left_card."id" || '-' || right_card."id",
  NULL,
  left_card."id",
  right_card."id",
  'include',
  'Verified exact-rule Mew VMAX print family',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Card" AS left_card
JOIN "Episode" AS left_episode ON left_episode."id" = left_card."episode_id"
JOIN "Card" AS right_card ON right_card."id" > left_card."id"
JOIN "Episode" AS right_episode ON right_episode."id" = right_card."episode_id"
WHERE left_card."game" = 'pokemon'
  AND right_card."game" = 'pokemon'
  AND left_card."name" = 'Mew VMAX'
  AND right_card."name" = 'Mew VMAX'
  AND (
    (left_episode."code" = 'LOR' AND left_card."card_number" = 'TG30')
    OR (left_episode."code" = 'FST' AND left_card."card_number" IN ('114', '268', '269'))
  )
  AND (
    (right_episode."code" = 'LOR' AND right_card."card_number" = 'TG30')
    OR (right_episode."code" = 'FST' AND right_card."card_number" IN ('114', '268', '269'))
  );

INSERT OR REPLACE INTO "CardPrintingRelation" (
  "source_card_id",
  "target_card_id",
  "match_type",
  "match_method",
  "image_similarity",
  "model_version",
  "matched_at"
)
SELECT
  source_card."id",
  target_card."id",
  'reprint',
  'manual-include',
  1,
  'reprint-v12-exact-rules',
  CURRENT_TIMESTAMP
FROM "Card" AS source_card
JOIN "Episode" AS source_episode ON source_episode."id" = source_card."episode_id"
JOIN "Card" AS target_card ON target_card."id" <> source_card."id"
JOIN "Episode" AS target_episode ON target_episode."id" = target_card."episode_id"
WHERE source_card."game" = 'pokemon'
  AND target_card."game" = 'pokemon'
  AND source_card."name" = 'Mew VMAX'
  AND target_card."name" = 'Mew VMAX'
  AND (
    (source_episode."code" = 'LOR' AND source_card."card_number" = 'TG30')
    OR (source_episode."code" = 'FST' AND source_card."card_number" IN ('114', '268', '269'))
  )
  AND (
    (target_episode."code" = 'LOR' AND target_card."card_number" = 'TG30')
    OR (target_episode."code" = 'FST' AND target_card."card_number" IN ('114', '268', '269'))
  );

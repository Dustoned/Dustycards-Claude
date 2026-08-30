-- Fusion Strike #269 is a separate artwork/collector variant and must not be
-- presented as a reprint of FST #114, FST #268 or Lost Origin TG30.
-- Replace the earlier seeded include decisions with permanent exclusions so
-- the background matcher cannot recreate the incorrect family links.
DELETE FROM "CardPrintingRelation"
WHERE (
  "source_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND episode."code" = 'FST'
      AND card."card_number" = '269'
  )
  AND "target_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND (
        (episode."code" = 'LOR' AND card."card_number" = 'TG30')
        OR (episode."code" = 'FST' AND card."card_number" IN ('114', '268'))
      )
  )
)
OR (
  "target_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND episode."code" = 'FST'
      AND card."card_number" = '269'
  )
  AND "source_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND (
        (episode."code" = 'LOR' AND card."card_number" = 'TG30')
        OR (episode."code" = 'FST' AND card."card_number" IN ('114', '268'))
      )
  )
);

DELETE FROM "CardPrintingOverride"
WHERE (
  "source_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND episode."code" = 'FST'
      AND card."card_number" = '269'
  )
  AND "target_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND (
        (episode."code" = 'LOR' AND card."card_number" = 'TG30')
        OR (episode."code" = 'FST' AND card."card_number" IN ('114', '268'))
      )
  )
)
OR (
  "target_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND episode."code" = 'FST'
      AND card."card_number" = '269'
  )
  AND "source_card_id" IN (
    SELECT card."id"
    FROM "Card" AS card
    JOIN "Episode" AS episode ON episode."id" = card."episode_id"
    WHERE card."game" = 'pokemon'
      AND card."name" = 'Mew VMAX'
      AND (
        (episode."code" = 'LOR' AND card."card_number" = 'TG30')
        OR (episode."code" = 'FST' AND card."card_number" IN ('114', '268'))
      )
  )
);

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
  'seed-mew-vmax-exclude-269-' ||
    CASE WHEN card_269."id" < family_card."id" THEN card_269."id" ELSE family_card."id" END || '-' ||
    CASE WHEN card_269."id" < family_card."id" THEN family_card."id" ELSE card_269."id" END,
  NULL,
  CASE WHEN card_269."id" < family_card."id" THEN card_269."id" ELSE family_card."id" END,
  CASE WHEN card_269."id" < family_card."id" THEN family_card."id" ELSE card_269."id" END,
  'exclude',
  'Fusion Strike #269 is not part of the Mew VMAX reprint family',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "Card" AS card_269
JOIN "Episode" AS episode_269 ON episode_269."id" = card_269."episode_id"
JOIN "Card" AS family_card ON family_card."id" <> card_269."id"
JOIN "Episode" AS family_episode ON family_episode."id" = family_card."episode_id"
WHERE card_269."game" = 'pokemon'
  AND card_269."name" = 'Mew VMAX'
  AND episode_269."code" = 'FST'
  AND card_269."card_number" = '269'
  AND family_card."game" = 'pokemon'
  AND family_card."name" = 'Mew VMAX'
  AND (
    (family_episode."code" = 'LOR' AND family_card."card_number" = 'TG30')
    OR (family_episode."code" = 'FST' AND family_card."card_number" IN ('114', '268'))
  );

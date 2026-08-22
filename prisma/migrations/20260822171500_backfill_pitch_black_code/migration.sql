UPDATE "Episode"
SET "code" = 'PBL'
WHERE "game" = 'pokemon'
  AND LOWER(TRIM("name")) = 'pitch black'
  AND ("code" IS NULL OR TRIM("code") = '');

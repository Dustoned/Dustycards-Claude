-- Seed the two durable Bill's Archive entry points into the existing catalyst
-- backlog. The scheduler scrapes them with the same budget, classification and
-- card-matching rules as every other trusted community source.
INSERT OR IGNORE INTO "ExternalCatalystSource" (
  "id",
  "canonical_url",
  "url_hash",
  "domain",
  "game",
  "source_type",
  "title",
  "description",
  "first_seen_at",
  "last_seen_at",
  "scrape_status",
  "created_at",
  "updated_at"
) VALUES (
  'source-bills-archive-calendar',
  'https://billsarchive.com/calendar.html',
  'a843d94aab155509308d2030b78ff0b096ec47058dc383c9c13680c807e817f5',
  'billsarchive.com',
  'pokemon',
  'community',
  'Pokemon TCG Release Calendar',
  'English, Japanese and Chinese Pokemon TCG release calendar.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'pending',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

-- Bootstrap two current reveal reports with the same compact metadata shape
-- the source scanner writes after a scrape. This makes the native Singles feed
-- useful immediately after deploy; later scheduler passes refresh the source
-- and replace this snapshot with newly extracted reveals.
INSERT OR IGNORE INTO "ExternalCatalystSource" (
  "id", "canonical_url", "url_hash", "domain", "game", "source_type",
  "title", "description", "published_at", "first_seen_at", "last_seen_at",
  "scrape_status", "metadata_json", "created_at", "updated_at"
) VALUES (
  'source-bills-archive-worlds-promos-2026',
  'https://billsarchive.com/articles/naic-2026-worlds-promo-cards.html',
  'aefe2f14f90feb5799f50556fe19e51b9278d5d85bf7e621288051060038255e',
  'billsarchive.com', 'pokemon', 'community',
  '2026 Worlds and PokemonXP Promo Cards Revealed',
  'Four upcoming event promos revealed for the 2026 World Championships and PokemonXP.',
  '2026-06-15T12:00:00.000Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending',
  '{"upcomingReveals":[{"name":"2026 Paradise Resort","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/worlds_promos/paradise_resort_092_world_championship.webp","cardNumber":"092","rarity":"Worlds promo","episodeName":"2026 Pokemon World Championships","releaseDate":"2026-08-28","status":"reveal"},{"name":"PokemonXP Rayquaza","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/worlds_promos/rayquaza_153_pxpstamp.webp","cardNumber":"153","rarity":"PokemonXP promo","episodeName":"2026 PokemonXP","releaseDate":"2026-08-28","status":"reveal"},{"name":"2026 Worlds Pikachu","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/worlds_promos/pikachu_093_world_championship.webp","cardNumber":"093","rarity":"Worlds promo","episodeName":"2026 Pokemon World Championships","releaseDate":"2026-08-28","status":"reveal"},{"name":"2026 Worlds Pikachu Winner","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/worlds_promos/pikachu_093_winner_playstamp.webp","cardNumber":"093","rarity":"Winner promo","episodeName":"2026 Pokemon World Championships","releaseDate":"2026-08-28","status":"reveal"}]}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "ExternalCatalystSource" (
  "id", "canonical_url", "url_hash", "domain", "game", "source_type",
  "title", "description", "published_at", "first_seen_at", "last_seen_at",
  "scrape_status", "metadata_json", "created_at", "updated_at"
) VALUES (
  'source-bills-archive-storm-emeralda',
  'https://billsarchive.com/storm-emeralda',
  '6b7c00c6b3b5fe97c9c2892d82f2be6e1132a4ae9c8315c5b9d41e55887d589b',
  'billsarchive.com', 'pokemon', 'community',
  'Storm Emeralda Card Gallery and Delta Reign Preview',
  'Revealed Japanese cards that preview the English Delta Reign release.',
  '2026-07-31T12:00:00.000Z', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 'pending',
  '{"upcomingReveals":[{"name":"Mega Golisopod ex","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/tcgdex_cards_jp/m6/m6-107_mega-golisopod-ex.webp","cardNumber":"107","rarity":"Special Art Rare","episodeName":"Delta Reign / Storm Emeralda","releaseDate":"2026-11-06","status":"reveal"},{"name":"Raikou ex","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/tcgdex_cards_jp/m6/m6-108_raikou-ex.webp","cardNumber":"108","rarity":"Special Art Rare","episodeName":"Delta Reign / Storm Emeralda","releaseDate":"2026-11-06","status":"reveal"},{"name":"Mega Golurk ex","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/tcgdex_cards_jp/m6/m6-109_mega-golurk-ex.webp","cardNumber":"109","rarity":"Special Art Rare","episodeName":"Delta Reign / Storm Emeralda","releaseDate":"2026-11-06","status":"reveal"},{"name":"Aarune","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/tcgdex_cards_jp/m6/m6-111_aarune.webp","cardNumber":"111","rarity":"Special Art Rare","episodeName":"Delta Reign / Storm Emeralda","releaseDate":"2026-11-06","status":"reveal"},{"name":"Zinnia''s Trust","imageUrl":"https://bills-archive.nyc3.cdn.digitaloceanspaces.com/tcgdex_cards_jp/m6/m6-112_zinnias-trust.webp","cardNumber":"112","rarity":"Special Art Rare","episodeName":"Delta Reign / Storm Emeralda","releaseDate":"2026-11-06","status":"reveal"}]}',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO "ExternalCatalystSource" (
  "id",
  "canonical_url",
  "url_hash",
  "domain",
  "game",
  "source_type",
  "title",
  "description",
  "first_seen_at",
  "last_seen_at",
  "scrape_status",
  "created_at",
  "updated_at"
) VALUES (
  'source-bills-archive-upcoming',
  'https://billsarchive.com/articles/upcoming-releases.html',
  '0b0e9aab6fab9eacf616067351c487a2ea01f74524c0bf719dcb5bc6e5672138',
  'billsarchive.com',
  'pokemon',
  'community',
  'Upcoming Pokemon TCG Releases',
  'Confirmed dates, early reveals and clearly labelled rumours for upcoming Pokemon releases.',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  'pending',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

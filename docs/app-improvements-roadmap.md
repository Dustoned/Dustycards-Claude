# DustyCards roadmap

Rebuilt from scratch on 2026-06-12 after a full desktop + mobile walkthrough of the
running app (screenshots in `screenshots-ui/audit-desktop` and `audit-mobile`).

**Rule for this file:** an item only lands here after it is verified against the
*running app* — not from reading code or from an AI audit. When something ships,
it gets one line under "Shipped" and the details live in git history. No status
soup, no completed items lingering at the top.

Baseline at rebuild: typecheck clean, lint clean, 297 unit tests green,
production build green, working tree committed.

---

## Now — Search polish — shipped 2026-06-12

All three gaps built and verified on the running app (screenshots
`verify-search-*.png`): recent searches (last 8 in localStorage, shown on the
empty search page, stable-query + result-click heuristics so type-ahead
prefixes are not stored), section count chips that narrow the results view,
and a sort menu (Best match / Price high→low / Price low→high / Newest set —
release date added to the search API payload for that).

Still intentionally not doing: rarity/set filters on search results (expansion
pages have the full filter bar) and ranking/fuzzy changes (works well).

---

## Next — verify first, then build

- ~~**Grid performance at collection scale.**~~ Measured 2026-06-12 on the
  production build: the fully mounted 309-card expansion grid (6,364 DOM
  nodes, 310 images) scrolled with **zero long tasks, 17ms worst frame
  (60fps), 10–15MB JS heap**; the collection view keeps the DOM at ~1.4k nodes
  via incremental batching. Virtualization is not needed — verified fine, do
  not rebuild this.
- ~~**Smoke test depth.**~~ Covered by `npm run e2e:verify`
  (scripts/e2e-verify.mjs): 24 live-app checks across login throttling,
  forgot-password silent throttle, scheduler secrets, all data-quality
  endpoints + drill-down UI (incl. the clean-dupes state), a real backup via
  Backup now, watch-list CRUD + URL validation, a collection add/remove
  mutation cycle, and search behaviour. Requires a freshly started server.

The current queue is the 2026-07-07 audit section below (added at Dustin's
request as an explicit exception to the "no AI-audit items" rule: every bug
claim was adversarially verified by an independent agent against the actual
code, and refuted claims were dropped).

---

## Queued — 2026-07-07 full audit (7 dimensions, adversarially verified)

Work the blocks top-to-bottom. When something ships: delete the line here and
add one line under Shipped. Tags: **[S/M/L]** effort, **[verified]** = confirmed
by an independent verifier agent, **[plausible]** = verifier crashed mid-check,
re-confirm while picking it up.

### Block 1 — Critical: security + wrong numbers users can see

- [ ] **Password-reset link poisoning (account takeover).** [S][verified]
  `getPublicOrigin()` falls back to attacker-controlled `X-Forwarded-Host`/`Host`
  because `APP_URL` is NOT set in the deployed `.env`. Reset mails can be made to
  point at an attacker host that harvests the token. Fix: require/set `APP_URL`
  on the server and never derive mail origins from request headers
  (`src/app/api/auth/forgot-password/route.ts:75`, `src/lib/mail.ts`).
- [ ] **Phantom full-value "drop" in collection value drivers.** [S][verified]
  When a card's newest Price row has all-null CM columns (45 cards today; 101k
  such rows exist), `current_value ?? 0` reports the card as dropping to €0 and
  inflates dropsTotal/totalChange. Fix: `continue` on null current value (cards
  + sealed), matching the all-cards guard (`src/lib/collection-data.ts:1478`).
- [ ] **All-cards drivers: missing baseline-age guard.** [S][plausible]
  Weeks-old baselines can be presented as the 1–2 day change in the all-cards
  scope (collection scope has the guard, all-cards does not)
  (`src/lib/collection-data.ts:2417`).
- [ ] **Rate-limit bypass via spoofed X-Forwarded-For.** [S][verified]
  All per-IP throttles key off the client-controlled first XFF hop; registration
  has no per-account backstop. Fix: derive IP from the trusted proxy hop only
  (`src/lib/rate-limit.ts:63`).
- [ ] **Password change doesn't revoke other sessions.** [S][verified]
  Unlike reset-password and admin-reset. Fix: `session.deleteMany` + fresh
  cookie after change (`src/app/api/auth/change-password/route.ts:37`).

### Block 2 — Resilience: never repeat the 2026-07-01 corruption

- [ ] **Pre-deploy backup is a raw `cp` of the live WAL db — backups themselves
  can be torn.** [S][verified] Replace with `VACUUM INTO` (online, consistent,
  no app stop) + `quick_check` on the result
  (`scripts/deploy-production.ps1:147`).
- [ ] **Count-based backup rotation: 8 rapid deploys wipe the whole retention
  window.** [S][verified] Switch to age-tiered retention (all <24h, daily 14d,
  weekly 8w) (`scripts/deploy-production.ps1:99`).
- [ ] **Restore/materialize next to a stale `-wal` replays foreign WAL frames →
  instant corruption.** [S][verified] `ensureLiveDbFile` must delete
  `-wal`/`-shm` before copying; add a documented `scripts/restore-db.sh`
  (`src/lib/db-paths.ts:19`). Likely a contributor to the 07-01 incident.
- [ ] **Deploy concurrency lock.** [S] `flock` guard at the top of the remote
  script so overlapping deploys can't interleave build/restart/prune
  (`scripts/deploy-production.ps1:74`).
- [ ] **Build out-of-place.** [M] `npm install && npm run build` currently run
  in-place under the live app (crash loops + OOM risk — plausible sshd-killer).
  Build in the release dir, then stop → swap → start
  (`scripts/deploy-production.ps1:191`).
- [ ] **Automated off-server backups.** [M] Nightly `VACUUM INTO` via systemd
  timer + a scheduled pull to the local PC (`db-backups/`). Everything today
  dies with the server (`src/lib/backups.ts:105`).
- [ ] **Graceful shutdown.** [S] SIGTERM handler: flag sync loops, close
  better-sqlite3 (checkpoints WAL) before exit (`src/instrumentation.ts`).
- [ ] **/api/health + external uptime monitor.** [S] `SELECT 1`, WAL size,
  scheduler heartbeat age; point a free monitor at it. Today's incident was
  found by hand (`src/lib/sync/scheduler.ts:76`).
- [ ] **Boot-reconcile failure is swallowed → syncs wedge up to 2h.** [S][verified]
  Retry with backoff + treat pre-boot "running" logs as stale
  (`src/lib/sync/boot-reconcile.ts:35`).
- [ ] **Migrate-skip on "unknown" is silent.** [S][verified] Compare shipped
  migration dirs against the last applied list instead of skipping blind
  (`scripts/deploy-production.ps1:222`).

### Block 3 — Performance: the remaining slow pages

- [ ] **Category detail ships the full price history of every card** (no cutoff,
  no cache; biggest category ≈ 100k+ rows serialized). Add 120d cutoff +
  `createSwrCache` + slim payload (`src/lib/card-categories.ts:1104`). [M]
- [ ] **Illustrator detail: 70k+ rows uncached** for big artists. Same fix
  (cutoff + cache keyed `${game}:${artist}`)
  (`src/app/illustrators/[artist]/page.tsx:153`). [S]
- [ ] **Binder page: unbounded history, serialized raw.** Pass the existing
  120d cutoff at both call sites + slim rows
  (`src/lib/collection-data.ts:3135`). [S]
- [ ] **Home page always loads ALL six tabs' detailed data** (`activeTab`
  hardcoded to `'overview'`; the gating code is dead as called). Pass the real
  tab (`src/app/page.tsx:430`). [M]
- [ ] **Expansion detail serializes the whole set's snapshot history** (31k rows
  worst case) into the client payload every request. Cutoff inside
  `getEpisodeSetPriceSnapshotRows` + ship aggregated series only
  (`src/app/expansions/[id]/page.tsx:242`). [M]
- [ ] **Wants page runs a WRITE sync transaction on every GET.** Render with the
  read-only `needsPlannerSync` check; sync via background POST only when needed
  (`src/app/wants/page.tsx:43`). [S]
- [ ] **Categories index: 26–39 COUNT scans per request** for identical-for-everyone
  data → `createSwrCache` per game (`src/lib/card-categories.ts:867`). [S]
- [ ] **Illustrators index recomputes whole-catalog aggregate per request** →
  cache per game (`src/app/illustrators/page.tsx:87`). [S]
- [ ] **Missing indexes:** `Card(artist)` and `Card(game, rarity)`
  (`prisma/schema.prisma`). [S]
- [ ] **fetchCollectionCards pages serially in 200-row chunks** (6 sequential
  round-trips × nested includes for the top user). Single query or parallel
  chunks (`src/lib/collection-data.ts:640`). [S]
- [ ] **Auto-price snapshot cache stampede:** cache the in-flight promise, not
  the resolved value (or reuse `createSwrCache`) (`src/lib/sync.ts:3011`). [S]

### Block 4 — UX correctness & polish

- [ ] **Global gradient rule repaints neutral controls purple** via substring
  matches on `dark:bg-white/8` + `hover:text-gray-900` (the recurring "paarse
  dingen" complaint — this is the structural fix). Require token-boundary
  matches or add `:not(input):not(textarea):not(select)` + opt-out class
  (`src/app/globals.css:1003`). [M][verified — second instance; form-input
  instance plausible]
- [ ] **Card/Sealed modals: no Escape-close, no focus trap, no initial focus.**
  Shared `useModalA11y` hook (`src/components/CardModal.tsx:477`). [S][verified]
- [ ] **Dutch strings in the English UI:** "Binder opslaan mislukt" etc. in
  binder buttons + deals empty state. [S][verified]
- [ ] **Want-heart fails silently on network error** — brief error state/retry
  hint (`src/components/CollectionWantButton.tsx:93`). [S][verified]
- [ ] **Touch targets:** deals row actions ~24px; clear-search X ~16px in six
  toolbars → min 40px hit areas + `aria-label` on the icon-only reset. [S]
- [ ] **One shared `<InlineError>`** instead of four inconsistent error styles. [S]
- [ ] **Delete dead `{false && …}` toolbar blocks** in CollectionCardsView +
  ExpansionView, and unused HomePageSection. [S]

### Block 5 — Cleanup / tech debt (do when touching the area)

- [ ] **Fix the 2 movers tests** (root cause found: stale local DB crossed the
  45-day lookback → tests went vacuous; production scope logic is correct).
  Seed time-relative fixtures + assert `movers.length > 0` so staleness fails
  loudly (`src/lib/movers.test.ts`). [S][verified]
- [ ] **Delete dead code:** `HeaderNav.tsx` (474 lines), `SyncAllButton.tsx`
  (202 lines), 4 unused lib exports (getSocialCollectionData, getCollectionMovers,
  getCardCategory, resolveCardMarketCardUrl). [S]
- [ ] **movers/page-data.ts: replace its hand-rolled cache** with
  `createSwrCache` (~110 lines → 2). [S]
- [ ] **Extract shared ExpansionTile/overview header** — Pokémon vs One Piece
  overview pages are ~200-line copy-paste forks; detail pages duplicate the
  CardData mapping 4×. [M]
- [ ] **Continue the sync.ts split** (5,170 lines; `src/lib/sync/` pattern
  already proven) and **split CollectionCardsView** (2,600 lines) along its
  selection/dialog seams. [L]
- [ ] **History sync `date_from` uses ANY Price row** → permanently hides
  native-history gaps; track the native-history watermark separately
  (`src/lib/sync.ts:1451`). [M][verified]
- [ ] **Quota-pause message overstates progress** (counts unfetched cards as
  processed) (`src/lib/sync.ts:1582`). [S][verified]
- [ ] **Sudden-drops shows up-to-45-day declines as "2-day" drops** — compute
  covered days from the anchor date (`src/lib/home-sudden-drops-server.ts:506`).
  [S][verified]
- [ ] **API routes: 400 on malformed JSON** instead of 500
  (`src/app/api/collection/cards/route.ts:56` + siblings). [S][verified]

### Block 6 — Feature ideas (all build on existing data; graded by value/effort)

- [ ] **Set completion on expansion pages** — owned x/y, % complete,
  missing-only filter, cost-to-complete. The single most collection-app thing
  the app doesn't do yet. [M, high]
- [ ] **Wants price-drop watch** — third movers scope `'wants'` reusing the
  whole pipeline: "a card you want just dropped". [S, high]
- [ ] **CSV export** of collection/sealed/wants (no export exists at all). [S, high]
- [ ] **eBay watch list: "ends in…" countdown + ended state** — end date is
  already stored, never rendered. [S, high]
- [ ] **Weekly value-digest e-mail** — value drivers + mailer + scheduler all
  exist; retention feature for both users. [M]
- [ ] **Tag filter in collection view** — tags are stored/edited but nothing
  filters on them; toolbar already supports filter sections. [S]
- [ ] **Duplicates (2+) quick filter** — the "what can I trade?" view. [S]
- [ ] **"Worth grading?" panel** — owned raw cards with 3×+ graded upside
  (math already in movers). [M]

---

## Tech debt — do when touching that area, not as standalone projects

- `src/components/card-modal/CardModalSections.tsx` (~3,000 lines) and
  `src/lib/sync.ts` (~5,000 lines) — split into modules the next time a feature
  lands there.
- The three modal families (card-modal / sealed-modal / collection-sealed) each
  define their own SectionShell/MetricTile/format utils — extract shared
  primitives on the next modal change.
- Pokémon vs One Piece expansion pages duplicate grouping/snapshot/tile logic —
  extract a shared layer the next time either side changes.

---

## Decisions needed (Dustin)

- **`data/dustycards.app.db` (39 MB) is tracked in git** and bloats history on
  every snapshot refresh. Keep (convenient clone-and-run) or move to an
  external artifact? If kept: refresh the snapshot less often.
- **`prisma migrate dev` is broken** in this repo (shadow-DB replay fails on an
  old migration that assumed a `db push`-created table). Current workflow:
  hand-write `migration.sql`, apply with `prisma db execute`, then
  `prisma migrate resolve --applied`. Either keep that documented workflow or
  invest in repairing/squashing the migration history.

---

## Verified fine — do not re-audit these

From the 2026-06-12 walkthrough, these old roadmap ideas turned out to already
exist and need nothing:

- Portfolio: Collection Allocation mix (raw/binder/graded/sealed), Priced Items
  coverage, ROI/spend tiles, per-binder paid cost + P&L, sold P&L, per-game tabs.
- Deals: delta vs base, deal tone, match confidence + reason, ignore/override,
  seller feedback, live filters (type/buying/condition/sort).
- Movers: BUY/HOLD signals, source badges, riser/dropper explanations.
- Mobile UX: bottom nav, compact tiles, settings tabs, wants/movers layout —
  all polished; the old "mobile UX polish" item is dropped.
- Search: relevance ranking, fuzzy matching, game tabs, sectioned results.

Note on local data: price snapshots/local sync are intentionally disabled on
this machine, so value drivers/movers show stale windows locally. That is
expected, not a bug.

---

## Shipped (2026-06-12 rebuild day)

- Data Quality Center upstream-aware signals: investigated against the live DB
  — all 862 no-price cards are `price_source_status = unavailable` (TCGgo has
  no price) and all 827 "duplicates" were variants (distinct source URLs /
  images / rarities; true dupes: 0). No-price and stale now exclude
  known-unavailable cards, dupes require an identical source URL, and the
  source-unpriced cards moved to an informational footnote with its own
  drill-down. Open signals dropped 13,264 → 10,650 (remainder is mostly
  stale-prices, which is the local sync-off situation).

- Security pass: rate limiting on all auth endpoints, timing-safe scheduler
  secrets, error-leak fixes, silent-failure fix in collection card opens.
- Auto price refresh job: wall-clock deadline, heartbeat during slow batches,
  resume cooldown; failed-log pruning.
- Data Quality Center v2: stale-prices + empty-history signals, click-through
  drill-down per signal (`/api/admin/data-quality`).
- Backups panel: restore points + Backup now via `VACUUM INTO`
  (`/api/admin/backups`).
- eBay deal watch list (`EbayWatchedListing` + `/api/ebay/watched-listings`).
- Portfolio: cost-basis coverage on the Overall Spend tile; value-driver source
  breakdown (Raw/Graded/eBay sold/Sealed) in the drivers header.
- README rewritten; deploy host moved out of the repo into `.env`.

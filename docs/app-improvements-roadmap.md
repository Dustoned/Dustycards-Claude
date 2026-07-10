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

## Execution waves — started 2026-07-08

Work in waves so every release has one clear job, a small verification surface,
and a clean patch note. A wave is done only when it is built, verified, deployed,
and the shipped lines are removed from the queue below.

### Wave 1 — Trust: security + wrong numbers users can see

Goal: no account-risk issues and no obvious false money movement.

Pull from:
- Block 1 completely.
- Block 5 small correctness items that touch visible numbers or API safety:
  sudden-drops covered days, malformed JSON 400s, movers test fixtures.

Ship criteria:
- Auth/session/security changes have tests where practical.
- Collection value-driver totals cannot treat missing prices as EUR 0.
- Sudden Drops labels match the actual covered window.
- No user-facing money number becomes less reliable.

### Wave 2 — Resilience: backups, deploys, health

Goal: never repeat the 2026-07-01 database corruption/deploy pain.

Pull from:
- Block 2 completely, in this order: consistent backups, stale WAL cleanup,
  deploy lock, health endpoint, boot reconcile, migration check, then larger
  out-of-place build/off-server backup work.

Ship criteria:
- A deploy cannot create a torn predeploy backup.
- Restores/materialization cannot attach stale WAL files.
- `/api/health` proves DB + scheduler basics are alive.
- Deployment has a lock and a safer rollback story.

### Wave 3 — Speed: remaining slow pages

Goal: all large catalog pages keep payloads bounded and cacheable.

Pull from:
- Block 3 completely.

Order:
1. Lowest-risk caches and cutoffs: illustrators index/detail, categories index.
2. History payload cutoffs: binder, category detail, expansion detail.
3. Heavier data-flow fixes: home active tab, wants GET write, collection chunking.
4. Index migration and sync cache stampede.

Ship criteria:
- Production build remains clean.
- At least one representative heavy page is timed before/after per cluster.
- No page ships unbounded history to the client when a 120d/aggregated view is enough.

### Wave 4 — Polish: UI correctness and accessibility

Goal: remove the recurring rough edges users feel every day.

Pull from:
- Block 4 completely.
- Only the cleanup items from Block 5 that are already touched by those files.

Ship criteria:
- Purple-control regression has a structural fix.
- Card/sealed modal basics work with keyboard: Escape, focus, initial focus.
- Dutch/English UI copy is consistent.
- Touch targets and inline errors feel app-level instead of incidental.

### Wave 5 — Product wins: high-value features

Goal: ship visible features that make the app more useful, not just safer/faster.

Pull from:
- Block 6 high-value items first:
  set completion, wants price-drop watch, CSV export, eBay countdown, tag filter,
  duplicates filter, then grading helper.

Ship criteria:
- Each feature gets a small dedicated patch note.
- Features reuse existing data and UI patterns before adding new abstractions.
- Mobile and desktop happy paths are checked.

### Wave 6 — Structural cleanup while touching areas

Goal: reduce code weight without turning cleanup into a risky standalone project.

Pull from:
- Block 5 remaining cleanup/tech-debt items.
- The "Tech debt" section at the bottom only when a feature already touches
  that module.

Ship criteria:
- No large refactor without a feature/fix reason.
- Tests or smoke checks cover the extracted path.
- Deleted dead code is verified unused by `rg` and build.

---

## Queued — 2026-07-07 full audit (7 dimensions, adversarially verified)

Work the blocks top-to-bottom. When something ships: delete the line here and
add one line under Shipped. Tags: **[S/M/L]** effort, **[verified]** = confirmed
by an independent verifier agent, **[plausible]** = verifier crashed mid-check,
re-confirm while picking it up.

### Block 2 — Resilience: never repeat the 2026-07-01 corruption

- [ ] **Build out-of-place.** [M] `npm install && npm run build` currently run
  in-place under the live app (crash loops + OOM risk — plausible sshd-killer).
  Build in the release dir, then stop → swap → start
  (`scripts/deploy-production.ps1:191`).
- [ ] **Automated off-server backups.** [M] Nightly `VACUUM INTO` via systemd
  timer + a scheduled pull to the local PC (`db-backups/`). Everything today
  dies with the server (`src/lib/backups.ts:105`).
- [ ] **Graceful shutdown.** [S] SIGTERM handler: flag sync loops, close
  better-sqlite3 (checkpoints WAL) before exit (`src/instrumentation.ts`).

### Block 3 ? Performance: the remaining slow pages

- [ ] **fetchCollectionCards pages serially in 200-row chunks** (6 sequential
  round-trips ? nested includes for the top user). Single query or parallel
  chunks (`src/lib/collection-data.ts:640`). [S]

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

- 2026-07-10 Sudden Price Drops now uses the exact latest price-refresh window
  plus a compact changed-at timestamp, so unchanged old drops disappear without
  generating duplicate price-history rows.
- 2026-07-08 Wave 1A auth hardening: APP_URL-only auth email origins, trusted
  proxy-hop rate-limit keys, and password-change session revocation.
- 2026-07-08 Wave 1B/C trust fixes: value-driver null/current guards,
  all-cards baseline freshness, honest sudden-drop covered-days labels,
  malformed JSON 400s, and deterministic movers scope fixtures.
- 2026-07-08 Wave 2A resilience hardening: VACUUM INTO pre-deploy backups
  with quick_check, deploy flock, age-tiered backup retention, WAL-safe DB
  restore/materialization, public scrubbed `/api/health`, boot-reconcile
  retries, fail-closed unknown migration checks, and lighter production build
  tracing for runtime caches/backups/screenshots.
- 2026-07-08 Wave 3A catalog speed: category and illustrator pages now use
  per-game/per-artist SWR caches, 120d price-history payloads, and Card indexes
  for artist and game+rarity. Local heavy-artist history rows dropped 67%.
- 2026-07-08 Wave 3B heavy-page payloads: binder and expansion history are
  bounded, expansion grids no longer receive raw set snapshot history, direct
  home tab links use the real active-tab data gate, Wants page render is
  read-only, and auto-price status snapshot scans are single-flight per game.

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

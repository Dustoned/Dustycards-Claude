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

- **Grid performance at collection scale.** CollectionCardsView and
  ExpansionView batch-render via IntersectionObserver but keep every rendered
  tile in the DOM. The complete-collection view holds 1,076 cards. Before
  adding any virtualization: measure scroll/jank on that view; only build
  windowing if it is actually slow.
- **Smoke test depth.** Largely covered 2026-06-12 by `npm run e2e:verify`
  (scripts/e2e-verify.mjs): 21 live-app checks across login throttling,
  forgot-password silent throttle, scheduler secrets, all data-quality
  endpoints + drill-down UI, a real backup via Backup now, watch-list CRUD +
  URL validation, and search (release_date payload, hostile-query safety,
  404s). Requires a freshly started server. Remaining nice-to-have: a
  collection-mutation check (add/remove a card).

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

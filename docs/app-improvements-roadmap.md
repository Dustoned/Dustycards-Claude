# DustyCards roadmap

Rebuilt 2026-06-12 from a full-codebase audit (sync engine, API/auth, frontend, repo hygiene).
Completed items were removed; everything below is real, verified work. Baseline at audit time:
typecheck clean, lint clean, 289/289 unit tests passing.

---

## 1. Now — security & correctness fixes

All shipped 2026-06-12 — see the Done section. Next priority is section 2/3 below.

---

## 2. Next — features & UX (carried over, still wanted)

### 2.1 Deals & movers intelligence
Show *why* a deal/mover matters: delta vs market, confidence, seller/condition hints, source context, quick hide/save actions. Pairs with the existing eBay deals browser.

### 2.2 Portfolio depth
Clearer value mix, cost-basis coverage, unpriced holdings, graded/raw split, better explanations for value changes.

### 2.3 Search polish
Ranking, fuzzy matching, game/product tabs, recent searches, filters reachable from results.

### 2.4 Mobile UX polish
Mobile navigation, sticky search, compact card actions, settings density.

---

## 3. Next — performance

### 3.1 Virtualize large grids
`CollectionCardsView.tsx` (2.7k lines) batch-renders via IntersectionObserver but still keeps every tile in the DOM; 500+ card collections will jank on mid-range devices. Same pattern in `ExpansionView.tsx` for 300+ card sets. Add real windowing (or measure first, then decide).

### 3.2 ~~Parallelize client fetch waterfalls~~ — verified, no fix needed (2026-06-12)
SubmitCardClient already fires both initial fetches in parallel (fire-and-forget, no await between them); DealsBrowser effects run concurrently on mount. The audit claim was wrong.

### 3.3 Prefetch the sealed tab on expansion detail — deprioritized (2026-06-12)
The tab is a server-component navigation; Next already prefetches the link, and always loading both tabs would double DB work for a tab that often stays closed. Only revisit if tab switches feel slow in practice.

---

## 4. Later — refactors & tech debt

### 4.1 Split the god-files
- `src/components/card-modal/CardModalSections.tsx` — 2,966 lines (pricing, history, listings, metadata all in one file).
- `src/lib/sync.ts` — 5,068 lines; extract per-job helpers into `src/lib/sync/` modules (the folder already exists).

### 4.2 De-duplicate modal families
`card-modal`, `sealed-modal`, and `collection-sealed` each define their own `SectionShell` / `MetricTile` / format utils. Extract one shared module to stop style drift.

### 4.3 De-duplicate Pokémon vs One Piece pages
`src/app/expansions/**` and `src/app/one-piece/expansions/**` repeat grouping, price-snapshot, and tile logic. Extract a shared expansion list/detail layer with a game parameter.

### 4.4 ~~Sync engine small leaks~~ — done (2026-06-12)
- Image-warmer map: verified no leak — entries are deleted in `.finally()`. Audit claim was wrong.
- Failed/cancelled auto-refresh logs are now pruned after 14 days (recent ones kept for diagnostics).

---

## 5. Repo hygiene

- ~~`scripts/deploy-production.ps1` hardcoded server IP~~ — done (2026-06-12): host now resolves from `-HostName` param → `DUSTYCARDS_DEPLOY_HOST` env var → `.env` entry; the IP lives in the untracked `.env` (note: it remains in old git history).
- ~~Undocumented one-off scripts~~ — done (2026-06-12): `backfill:ebay-sold-graded`, `ui:screenshots`, `ui:expansion-shot` added to package.json.
- ~~`package.json` overrides~~ — verified (2026-06-12): both pins are active transitive deps (`@hono/node-server` via `prisma → @prisma/dev`; `postcss` via tailwind/next/vite). Keep them.
- `data/dustycards.app.db` (39 MB) is tracked in git and grows history on every snapshot refresh — decide: keep (convenient) vs external artifact. If kept, snapshot less often.
- Commit the pending working-tree changes (30+ modified files incl. deleted create-next-app SVGs) in logical chunks.
- Playwright smoke coverage is a single spec (`tests/smoke/app.spec.ts`); add a couple of API-level smoke checks (login, collection mutate, search).

---

## Done (removed from this roadmap)

- Backups visibility (2026-06-12): new Backups panel in Settings → System with restore-point list and a "Backup now" button. Backups are made with SQLite `VACUUM INTO` (validated on the live DB: ~295 MB in ~6 s), manual backups keep the newest 5. New `src/lib/backups.ts` + `/api/admin/backups`; the local `../dustycards-db-backups` folder is now auto-detected and `DUSTYCARDS_BACKUP_DIR` is documented in `.env.example`.
- Data Quality Center v2 (2026-06-12): added stale-prices (14+ days unchecked) and empty-history (single price snapshot) metrics, and click-to-drill-down on every signal — new admin endpoint `/api/admin/data-quality?issue=<key>` lists the affected cards/sealed with links to their set. Validated against live DB (827 duplicate candidates, 1,560 empty-history cards found).
- Failed/cancelled auto-price-refresh logs now pruned after 14 days (`pruneAutoPriceRefreshLogs`).
- Security & correctness pass (2026-06-12):
  - Rate limiting on login (per-IP + per-email, failures only), register, forgot-password and resend-verification (silent throttle, no enumeration leak). New `src/lib/rate-limit.ts` + tests.
  - Auto price refresh job: 45-min wall-clock deadline, 60s heartbeat timer during slow batches, 60s cooldown on the resume loop.
  - Timing-safe scheduler-secret comparison shared via `src/lib/scheduler-secret.ts`; fixed `sync-pricedex-pull-rates`, de-duplicated `sync-scheduler`.
  - Internal error messages no longer returned to clients (cards refresh + search routes).
  - `CollectionCardsView` now shows a dismissible error when opening a card fails (was a silent no-op).
  - Verified, no fix needed: DealsBrowser already surfaces card-open errors; "at least one active admin" already holds (self-demote/self-disable are blocked and disabled admins lose their session).
- Card detail clarity — source freshness, market/language, eBay sold context, stale-price handling shipped.
- Health dashboard MVP — version, uptime, scheduler health, quota, DB size, latest backup in Settings.
- README rewritten from create-next-app boilerplate (2026-06-12).
- Typecheck fixed: `price-history.test.ts` fixtures missing `cm_market_jp` (2026-06-12).

# DustyCards app improvements roadmap

This file tracks the non-sync improvements we want to tackle step by step.

## 1. Data Quality Center

Build an admin-only view for missing images, missing source URLs, missing prices, stale prices, empty histories, duplicate-ish data, cards without rarity, and sealed products without prices.

Status: Next. Keep this behind admin tooling so regular users do not see internal diagnostics noise.

## 2. Portfolio depth

The app already has collection value, P&L, binders, sealed, movers, and value drivers. The improvement is to make it more portfolio-like: clearer value mix, cost basis coverage, unpriced holdings, graded/raw split, and better explanations for value changes.

## 3. Card detail clarity

Make each card detail page show last price update, source status, price completeness, trend context, unavailable state, and refresh confidence more clearly.

Status: Completed. Card and sealed detail now show source freshness, selected market/language, eBay sold sample context, stale-price handling, and raw-vs-graded safeguards.

## 4. Health dashboard

Add a compact admin health page with app version, uptime, database size, latest backup, scheduler status, quota, recent errors, and audit/build status.

Status: MVP complete in Settings. Shows app version, uptime, scheduler health, scraper quota, database size, latest backup, and recent running/failure state. Audit/build history is still not persisted separately.

## 5. Search polish

Improve ranking, fuzzy matching, game/product tabs, recent searches, and filter access directly from search results.

## 6. Deals and movers intelligence

Show why a deal or mover matters: delta versus market, confidence, seller/condition hints, source context, and quick hide/save actions.

Status: Next. This is the next user-facing price intelligence pass after the admin-only data quality center.

## 7. Backups visibility

Expose latest backup, backup size, restore points, and a manual backup action in admin settings.

## 8. Mobile UX polish

Improve mobile navigation, sticky search, compact card actions, and settings density.

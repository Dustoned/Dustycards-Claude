# DustyCards roadmap

Last updated: 2026-08-03.

This file contains only work that is still useful and not already live. Completed
work belongs in patch notes and git history. Audit evidence and temporary execution
waves are not part of the active roadmap.

## Product roadmap

### Next

- **Collection import and export** — import CSV or pasted lists with a preview,
  matching and duplicate detection; export collection, binders, sealed and wants.

### Planned

- **Sealed origin for owned cards** — keep single-card and bulk-add forms compact
  while allowing an optional sealed-product source per copy. When selected, the
  source can be used as a price basis and is shown with that copy in the Card
  Detail owned-copies section.
- **Price alerts beyond single cards** — card alerts with e-mail sweeps are live;
  extend targets to sealed products, wants and whole binders.
- **Binder next-buy guidance** — rank missing cards by price, rarity, completion
  impact and affordability. (The Wants planner already syncs missing binder cards;
  this adds the ranking layer.)
- **eBay watch countdowns** — show time remaining, ended state and the final known
  result for watched listings.
- **Shareable binder links** — create revocable read-only links for selected
  binders without granting collection access. (Friend-to-friend sharing with an
  account exists via Social; this is for people without an account.)
- **Consistent blurred fullscreen backdrops** — replace solid-black fullscreen
  popup overlays with a clean translucent blur while preserving contrast,
  responsive behavior and accessible focus handling.

## Engineering queue

These are reliability tasks, not user-facing promises:

- Build releases out of place before swapping the live application directory.
- Keep an automated off-server database backup in addition to the local backup
  directory rotation that already exists.
- Finish graceful shutdown for in-flight sync work and SQLite WAL checkpointing
  (database disconnect and boot reconciliation are live).
- Apply the sealed anchor-based history gap repair (3.8.36) to card history too,
  so card gaps can be repaired instead of only extended forward.
- Make quota-pause progress messages count only work actually completed.
- Split very large modules only while a related feature or fix already touches them.

## Not on the active roadmap

- Completed UI audit waves, responsive fixes, modal work and performance work.
- Japanese pricing until a reliable upstream source exists.
- Light/System themes until a real light theme is intentionally designed.
- Speculative dashboards, widgets or analytics already covered by the current app.

The roadmap should remain short. Before adding an item, confirm that it is not
already available and that it has a clear user or reliability outcome.

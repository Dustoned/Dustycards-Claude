# DustyCards roadmap

Last cleaned: 2026-07-12.

This file contains only work that is still useful and not already live. Completed
work belongs in patch notes and git history. Audit evidence and temporary execution
waves are not part of the active roadmap.

## Product roadmap

### Next

- **Collection import and export** — import CSV or pasted lists with a preview,
  matching and duplicate detection; export collection, binders, sealed and wants.

### Planned

- **Target price alerts** — set a target for cards, sealed products, wants or a
  binder and surface meaningful price movement without noisy notifications.
- **Binder next-buy guidance** — rank missing cards by price, rarity, completion
  impact and affordability.
- **eBay watch countdowns** — show time remaining, ended state and the final known
  result for watched listings.
- **Shareable binder links** — create revocable read-only links for selected
  binders without granting collection access.

## Engineering queue

These are reliability tasks, not user-facing promises:

- Build releases out of place before swapping the live application directory.
- Keep an automated off-server database backup in addition to server backups.
- Finish graceful shutdown for sync work and SQLite WAL checkpointing.
- Track native price-history watermarks separately so gaps can be repaired.
- Make quota-pause progress messages count only work actually completed.
- Split very large modules only while a related feature or fix already touches them.

## Not on the active roadmap

- Completed UI audit waves, responsive fixes, modal work and performance work.
- Japanese pricing until a reliable upstream source exists.
- Light/System themes until a real light theme is intentionally designed.
- Speculative dashboards, widgets or analytics already covered by the current app.

The roadmap should remain short. Before adding an item, confirm that it is not
already available and that it has a clear user or reliability outcome.

# DustyCards roadmap

Last updated: 2026-08-04.

This file contains only work that is still useful and not already live. Completed
work belongs in patch notes and git history. Audit evidence and temporary execution
waves are not part of the active roadmap.

## Product roadmap

### Next

- **eBay watch countdowns** — show time remaining, ended state and the final known
  result for watched listings.

### Planned

- **Collection import and export** — keep this for later, once a representative
  Collectr export is available to design and verify CSV/list matching, duplicate
  review and export around real-world data instead of assumptions.

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

# DustyCards roadmap

Last updated: 2026-08-23.

This file contains only work that is still useful and not already live. Completed
work belongs in patch notes and git history. Audit evidence and temporary execution
waves are not part of the active roadmap.

## Product roadmap

### Planned

- **Collection import and export** — keep this for later, once a representative
  Collectr export is available to design and verify CSV/list matching, duplicate
  review and export around real-world data instead of assumptions.

## Engineering queue

These are reliability tasks, not user-facing promises:

- Build releases out of place before swapping the live application directory.
- Finish graceful shutdown for in-flight sync work and SQLite WAL checkpointing
  (database disconnect and boot reconciliation are live).
- Split very large modules only while a related feature or fix already touches them.

## Not on the active roadmap

- Completed UI audit waves, responsive fixes, modal work and performance work.
- Japanese pricing until a reliable upstream source exists.
- Light/System themes until a real light theme is intentionally designed.
- Speculative dashboards, widgets or analytics already covered by the current app.

The roadmap should remain short. Before adding an item, confirm that it is not
already available and that it has a clear user or reliability outcome.

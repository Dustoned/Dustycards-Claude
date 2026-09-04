# DustyCards

Self-hosted trading card collection tracker for Pokémon and One Piece. Tracks your
collection, binders, sealed products and want lists, with market prices, price history,
movers, eBay deals and a 3D card viewer.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4
- Prisma 7 with the better-sqlite3 adapter (single SQLite database)
- Background sync engine (scheduler + jobs) for catalog, prices, card history and eBay sold data
- External Codex-driven Marktplaats deal reports for raw ENG, graded and complete expansions
- Session-cookie auth with `user`/`admin` roles; mail via nodemailer
- three.js for the 3D card viewer; Firecrawl for card submissions

## Getting started

```bash
npm install
cp .env.example .env   # fill in secrets
npm run auth:bootstrap # create the initial admin account
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Database files

- `data/dustycards.app.db` is the tracked app snapshot that ships with the repo.
- `dustycards.db` is the local live database, created automatically from that snapshot if missing.
- Collection data lives in the live database; copy `dustycards.db` to move your collection to another machine.
- Refresh the tracked snapshot from your live database with `npm run db:snapshot`.

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server (Turbopack); `dev:webpack` for the webpack fallback |
| `npm run build` / `npm start` | Production build / serve |
| `npm test` | Vitest unit tests |
| `npm run smoke` | Playwright smoke test |
| `npm run lint` | ESLint |
| `npm run db:snapshot` | Refresh `data/dustycards.app.db` from the live DB |
| `npm run db:snapshot:sanitize` | Inspect or safely sanitize an existing app snapshot |
| `npm run images:cache` | Pre-cache card images locally |
| `npm run sync:one-piece*` | One Piece catalog/metadata/price sync helpers |
| `npm run backfill:*` | One-off data backfills (artists, printed card numbers) |

Snapshot sanitation is a read-only dry run unless `--apply` is supplied. Applying
requires a new backup path, verifies that backup as SQLite, and never overwrites an
existing file:

```bash
npm run db:snapshot:sanitize -- --database data/dustycards.app.db
npm run db:snapshot:sanitize -- --database data/dustycards.app.db \
  --backup backups/dustycards.app.before-sanitize.db --apply
```

The HTTP security regression tests in `tests/smoke/security.spec.ts` require
`DUSTYCARDS_DATABASE_PATH` to point to a migrated, disposable test database shared
with the local server. Set the same test-only `AUTH_MFA_ENCRYPTION_KEY` on the server
and test runner to include the recovery-code case. Run them with
`npm run smoke -- tests/smoke/security.spec.ts --workers=1`; they use HTTP requests
and do not require a browser installation. CI prepares this database and runs them
automatically. Never point these tests at the production database.

## Docs

New logins persist on the device for 90 days (30 days for administrators),
including across browser restarts. Existing sessions keep their original expiry
until the next login. Logging out revokes that device; password changes revoke
all existing sessions and issue a replacement for the current device. Sensitive
administrator actions still require authentication within the last 15 minutes.

- [Roadmap](docs/app-improvements-roadmap.md) — prioritized fixes and planned features.

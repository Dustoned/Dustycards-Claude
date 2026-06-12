# DustyCards

Self-hosted trading card collection tracker for Pokémon and One Piece. Tracks your
collection, binders, sealed products and want lists, with market prices, price history,
movers, eBay deals and a 3D card viewer.

## Stack

- Next.js 16 (App Router) + React 19 + Tailwind 4
- Prisma 7 with the better-sqlite3 adapter (single SQLite database)
- Background sync engine (scheduler + jobs) for catalog, prices, card history and eBay sold data
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
| `npm run images:cache` | Pre-cache card images locally |
| `npm run sync:one-piece*` | One Piece catalog/metadata/price sync helpers |
| `npm run backfill:*` | One-off data backfills (artists, printed card numbers) |

## Docs

- [Roadmap](docs/app-improvements-roadmap.md) — prioritized fixes and planned features.

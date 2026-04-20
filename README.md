# Cursed Crew

*A shared ledger for doomed scoundrels playing Pirate Borg at a physical table.*

Cursed Crew is a persistent, real-time shared ship's ledger for one Pirate
Borg crew. Ship HP, cargo, factions, bounties, session log, and character
stats — all in sync across every device at the table, and surviving between
sessions. It lives on a laptop or tablet on the table and on players'
phones, with a single shared URL as the only key.

See [design-doc.md](./design-doc.md) for the full specification — this
repository is an implementation of that spec.

---

## Feel it out

```bash
# Terminal 1 — server on :8080
cd server
npm install
npm run dev

# Terminal 2 — client dev server on :5173 (proxies /api and /ws to :8080)
cd client
npm install
npm run dev

# Open http://localhost:5173
```

The landing page offers two doors:

- **Raise the Black Flag** — create a crew. You'll get a three-word URL like
  `/c/bloody-kraken-rum`. Bookmark it.
- **Step Aboard** — paste a crew code or URL to rejoin.

Open the same crew URL in two browsers (or a phone + a laptop) to watch the
real-time sync: edit HP on one, watch it change on the other within ~100ms.

---

## Stack

| Concern           | Choice                                                         |
| ----------------- | -------------------------------------------------------------- |
| Server            | Node.js 20 · Express 4 · `ws` · `better-sqlite3` (WAL mode)    |
| Client            | SvelteKit 2 (Svelte 5) · static adapter · plain CSS            |
| Transport         | WebSocket for live sync; REST only for crew creation + preview |
| Identity          | HttpOnly cookie (192-bit CSPRNG token) — no passwords, no email|
| Persistence       | Single SQLite file at `/data/cursedcrew.db` (mountable volume) |
| Tests             | Node's built-in `--test` runner · 58 server tests · 6 client   |
| Aesthetic         | Mörk Borg / Pirate Borg; four self-hosted fonts; dark default  |

### Shared reducer

The mutation reducer lives in `server/src/reducer.ts`. A tiny script
`client/scripts/sync-shared.mjs` copies it (and `types.ts`) into
`client/src/lib/shared/` at `predev` / `prebuild` time so the client's
optimistic path and the server's authoritative path apply the exact same
function. The generated files carry a header warning not to edit them.

If the client ever needs to diverge from the server reducer, replace the
sync with an explicit adapter layer — don't let the two copies quietly
drift apart.

---

## Data model

Three tables, everything else is a JSON blob on `crews.data`:

- **`crews`** — `code` (PK, three-word), `name`, `data` (full `CrewData` JSON),
  `version` (bumped on every mutation), timestamps.
- **`users`** — `id` (cookie-bound, base64url), `display_name`, timestamps.
  Identifies a browser across visits so "known crews" can be surfaced on the
  landing page.
- **`crew_members`** — composite PK `(crew_code, user_id)` with FK cascades.
  One row per browser that has ever joined a crew. Holds `role`
  (`captain` or `crew`), a per-crew display name, and last-seen timestamp.

All three are `STRICT` tables with `ON DELETE CASCADE` on the foreign keys,
`WAL` journal mode, and the full set of prepared statements cached in
`server/src/db.ts`.

---

## Run it

### Development

```bash
# Server
cd server && npm install && npm run dev
# Client (proxies /api and /ws to :8080)
cd client && npm install && npm run dev
```

### Tests

```bash
cd server && npm test    # reducer, db, names, protocol, ws integration
cd client && npm test    # markdown-lite escaping
```

### Production build (local)

```bash
cd client && npm run build     # writes to client/build/ (SPA + /fonts + /glyphs)
cd server && npm run build     # writes to server/dist/
node server/dist/index.js      # Express serves everything on :8080
```

### Container

```bash
mkdir -p data
docker compose build
docker compose up -d
curl http://localhost:8080/healthz    # → OK
```

The compose file binds to `127.0.0.1:8080` so the service is only reachable
from the host — Cloudflare Tunnel does the public exposure. Runtime image is
~480 MB on `node:20-alpine` with the compiled `better-sqlite3` native module.

---

## Deploy on Ubuntu behind Cloudflare Tunnel

Assumes you already have `cloudflared` running with a tunnel configured.

1. Clone the repo on the host and `cd cursed-crew`.
2. `mkdir -p data` — this is the SQLite volume mount point.
3. `docker compose build && docker compose up -d`.
4. Confirm: `curl http://localhost:8080/healthz` returns `OK`.
5. Add an ingress rule to your `cloudflared` config:

   ```yaml
   # ~/.cloudflared/config.yml
   ingress:
     - hostname: cursedcrew.example.com
       service: http://localhost:8080
     - service: http_status:404
   ```

   WebSocket support in Cloudflare Tunnel is on by default — no extra flags.

6. `systemctl restart cloudflared` (or `cloudflared tunnel run …` if you
   launch it manually).
7. Visit the public hostname, create a crew, share the URL with your group.

### Backup

The entire state is `./data/cursedcrew.db`. A nightly copy is the whole
strategy:

```bash
0 3 * * *  cd /srv/cursed-crew && cp data/cursedcrew.db backups/cursedcrew-$(date +\%F).db
```

### Upgrading

```bash
git pull
docker compose build
docker compose up -d
```

The schema migrations are idempotent `CREATE TABLE IF NOT EXISTS`. If a
future version needs a real migration, add a numbered step to `server/src/db.ts`.

---

## Environment

| Variable         | Default                       | Meaning                                                      |
| ---------------- | ----------------------------- | ------------------------------------------------------------ |
| `PORT`           | `8080`                        | HTTP + WS port                                               |
| `DB_PATH`        | `./data/cursedcrew.db`        | SQLite file (mount a volume at `/data` in the container)     |
| `CLIENT_DIR`     | `../client/build`             | Static bundle served by Express (SPA fallback to `index.html`) |
| `NODE_ENV`       | —                             | `production` tightens cookie defaults                        |
| `TRUST_PROXY`    | `0` dev, `1` prod             | Trust `X-Forwarded-*` from Cloudflare                        |
| `COOKIE_SECURE`  | follows `NODE_ENV`            | Set the `Secure` flag on identity cookies                    |
| `COOKIE_NAME`    | `cc_uid`                      | Cookie name                                                  |
| `COOKIE_MAX_AGE_MS` | 10 years                   | How long the identity cookie persists                        |

---

## File layout

```
cursed-crew/
├── design-doc.md              # The authoritative spec
├── Dockerfile
├── docker-compose.yml
├── server/                    # Node + Express + ws + SQLite
│   ├── src/
│   │   ├── index.ts           # HTTP + WS boot, shutdown
│   │   ├── config.ts          # env vars in one place
│   │   ├── db.ts              # schema, prepared statements, handle
│   │   ├── identity.ts        # cookie-based user minting
│   │   ├── routes.ts          # POST /api/crew, GET /api/crew/:code, /api/me
│   │   ├── static.ts          # static asset + SPA fallback
│   │   ├── ws.ts              # upgrade, rooms, message dispatch
│   │   ├── rooms.ts           # in-memory per-crew state
│   │   ├── protocol.ts        # wire messages + validation
│   │   ├── reducer.ts         # pure CrewData mutation reducer (isomorphic)
│   │   ├── crew.ts            # defaults for a newly-created crew
│   │   ├── types.ts           # shared types (isomorphic)
│   │   ├── names.ts           # three-word thematic crew code generator
│   │   ├── ids.ts             # uuid + CSPRNG user token
│   │   └── *.test.ts          # unit + integration tests
│   ├── scripts/run-tests.mjs
│   ├── package.json
│   └── tsconfig.json
└── client/                    # SvelteKit static
    ├── src/
    │   ├── app.html · app.css · app.d.ts
    │   ├── routes/
    │   │   ├── +layout.{ts,svelte}
    │   │   ├── +page.svelte            # landing
    │   │   └── c/[code]/+page.svelte   # the ledger
    │   └── lib/
    │       ├── api.ts                   # REST client
    │       ├── markdownLite.ts          # XSS-safe tiny renderer
    │       ├── toasts.svelte.ts
    │       ├── ws-session.svelte.ts     # reactive WS client + reducer
    │       ├── useDebounce.svelte.ts
    │       ├── shared/                  # auto-synced from server/src
    │       ├── components/              # Ship · Characters · CharacterCard · Manifest · Reckoning · Log · Bounties · Presence · Adrift · Toasts · Stepper · CompassRose · ThemeToggle
    │       └── design/tokens.css · type.css · components.css
    ├── static/fonts/                    # 5 self-hosted woff2 files
    ├── static/glyphs/                   # compass, divider, anchor, skull
    ├── scripts/
    │   ├── sync-shared.mjs              # copies reducer.ts + types.ts from server
    │   └── run-tests.mjs
    └── svelte.config.js · vite.config.ts
```

---

## Non-goals

Explicitly out of scope — see design-doc §2:

- Dice rolling, character generation, naval combat tracking, voyage engines,
  rules reference — those are different tools.
- Accounts, passwords, email. The crew URL is the access token.
- Offline-first / PWA. Nice later, not MVP.
- Operational-transform or CRDT conflict resolution — last-writer-wins per
  mutation, globally ordered by the server.

## License / credits

Fonts (OFL):
- [Pirata One](https://fonts.google.com/specimen/Pirata+One)
- [Cormorant Unicase](https://fonts.google.com/specimen/Cormorant+Unicase)
- [IM Fell English](https://fonts.google.com/specimen/IM+Fell+English)
- [Special Elite](https://fonts.google.com/specimen/Special+Elite)

This tool is an independent fan project. Not affiliated with Limithron LLC,
Ockult Örtmästare Games, Stockholm Kartell, or Free League Publishing.
Pirate Borg is published under the Mörk Borg Third Party License — see
[limithron.com/license](https://limithron.com/license) before including any
Limithron/Pirate Borg artwork, book text, or logos.

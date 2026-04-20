# CURSED CREW

*A shared ledger for doomed scoundrels playing Pirate Borg at a physical table.*

---

## 0. Purpose of this document

This is a build spec for **Claude Code** to implement a small web app called **Cursed Crew**. Target environment: Ubuntu server, Docker container, public access via Cloudflare Tunnel.

The reader should finish this doc knowing:

- What the thing is and what it explicitly is not
- The exact data model and real-time protocol
- The visual language (colors, typography, layout rules)
- How persistence and multi-user sync work
- The exact file layout and dependencies
- How to build, run, and deploy the container

If the implementing agent finds itself about to add a feature not listed here, it should stop. This is a tool for a group of friends. It is not a platform.

---

## 1. What it is

Cursed Crew is a persistent shared "ship's ledger" for one Pirate Borg crew. It lives on the table — usually on a laptop or tablet, also on players' phones — and stays in sync across every connected device. It survives between sessions. It replaces the loose-paper bookkeeping that sprawls across a GM's table: ship HP, cargo slots, faction standing, bounties, session log, character HP/Luck.

It does **not** try to be a VTT, a character generator, a naval combat tracker, or a rules reference.

### Success criteria

- Multiple players can open the same crew URL on their own devices during a session and see each other's edits in real time
- Opening the app on session night is faster than shuffling through papers
- Nothing gets lost between sessions
- It looks right — the app feels like an object from the game world, not a SaaS dashboard
- A first-time visitor following a shared link understands what they are looking at within about ten seconds

---

## 2. Non-goals

Hard no on all of these, to keep scope honest:

- Dice rolling (players have physical dice)
- Character generation (Jolly Rogenerator and the official generator already solve this)
- Naval combat tracking (hex maps, firing arcs, crew action cycling — different tool)
- Voyage / hexcrawl engine (different tool)
- Rules reference / spell lookup (the book is on the table)
- Passwords, email, accounts (a shared crew code is the access token; names are cosmetic)
- Fine-grained conflict resolution / OT / CRDTs (last-writer-wins per operation is fine)
- Permissions or roles (anyone with the link can edit)
- Mobile native apps (responsive web only)
- Offline-first / PWA (nice later, not MVP)
- VTT integration

---

## 3. Users and flows

### Primary flow: existing crew, session night, multiple devices

1. Someone opens the bookmarked crew URL on the table laptop
2. Other players open the same URL on their phones or laptops
3. Each client on first load is prompted for a display name (or picks one automatically from previous visits, remembered in localStorage)
4. Ledger loads with last session's state intact
5. Every edit propagates to every connected client within ~200ms
6. Presence indicator shows who is currently connected
7. Auto-saves on every change
8. Browsers are closed at end of session; state persists

### Secondary flow: new crew creation

1. A player visits the root URL
2. Clicks "Raise the Black Flag" (new crew)
3. Names the crew, optionally names the ship
4. Gets a crew URL: `https://<host>/c/<crew-code>`
5. Shares the URL with the rest of the group

### Tertiary flow: joining an existing crew

1. Player receives a shared URL
2. Opens it, enters a display name, sees the ledger
3. Can view and edit freely

There is no login, no password recovery, no email. If everyone loses the URL, the crew is lost. A warning on creation makes this explicit (bookmark the URL). Display names are remembered per browser in localStorage — no server-side user record.

---

## 4. MVP feature list

Six modules, visible as tabs or a scrolling page on desktop, and stacked panels on mobile. Plus a small always-visible presence strip.

### 4.0 Presence strip

A thin bar (top of screen on desktop, collapsible drawer on mobile) showing the display names of currently connected clients. Appears as a row of name tags styled like wax seals or stamps. Tapping your own name opens a small "change name" affordance.

No chat. No cursors. Just presence — enough to know "Alice is here, Bob is here" without intruding.

### 4.1 The Ship

One ship per crew. Fields:

- Name (string)
- Class (string; free-text, but a dropdown of the 18 book vessels is convenient: Sloop, Brigantine, Frigate, Galleon, etc.)
- HP / Max HP (integer steppers)
- Hull tier (enum: `Light (-d2)`, `Medium (-d4)`, `Heavy (-d6)`)
- Speed (integer)
- Skill (integer)
- Crew count / Min / Max crew (three integers)
- Cargo used / Cargo max (two integers, shown as a fraction; `cargoUsed` is derived from the manifest but cached in state)
- Upgrades (free-text list; add/remove items)
- Notes (free-text, multiline)

UI treatment: this is the most prominent module. It looks like a ship's stat block from the book — framed in a heavy border with the ship's name in display type across the top.

### 4.2 The Crew (characters)

Up to 8 character cards. Each card has:

- Name (string)
- Class (enum: Rapscallion, Swashbuckler, Brute, Zealot, Sorcerer, Buccaneer, plus optional Tall Tale, Haunted Soul; allow "Other" for homebrew)
- Level (integer, default 0)
- HP / Max HP (integer steppers)
- Four core ability scores: Agility, Presence, Strength, Toughness. Also: Spirit.
- Silver (integer)
- Devil's Luck (integer; cap at 6 unless player overrides)
- Conditions (multi-select tags: Broken, Bleeding, Infected, Poisoned, Stunned, Drunk, Cursed; allow custom)
- Class feature notes (free-text, multiline — player jots their class ability, weapon special, etc.)
- Inventory (simple string list; slots aren't tracked numerically in MVP, just text)

UI: cards are compact on mobile (one per screen-width), arranged in a 2- or 3-column grid on desktop. HP and Luck have large tap targets (+/- buttons ≥ 44px). Conditions render as small wax-seal-style stamps on the card.

A "dead" toggle — when a character dies, keep their card but cross it out and move to a "Davy Jones' Locker" section at the bottom. Do not delete.

### 4.3 The Manifest (shared inventory)

Three sub-sections:

- **Doubloons**: one big number. Stepper with +/-, and a "set to exact value" input.
- **Cargo**: list of `{ name, slots, notes }`. Slot total is summed and compared to ship's cargo max. Over-capacity state is indicated with a warning treatment (not blocked — overloading happens).
- **Relics**: list of `{ name, description, usesLeft, status }`. `usesLeft` is a manual integer. Status enum: `active`, `depleted`, `destroyed`.

### 4.4 The Reckoning (faction standing)

Six default factions, each with a single status enum:

`Allied` / `Friendly` / `Neutral` / `Watched` / `Wanted` / `Kill On Sight`

Default factions (Dark Caribbean):

- British Crown
- Spanish Crown
- French Crown
- Dutch Republic
- Pirate Nation
- Indigenous Peoples

The list is editable: rename, remove, add custom factions.

Each faction also has an optional free-text note ("Why they want us").

UI: each faction is a row with the status as a color-coded label and a cycle-through button (tap to advance to next status).

### 4.5 The Log

Chronological session journal. Each entry:

- Session number (auto-incremented; editable)
- Date (user-entered or today by default)
- Title (short string, optional)
- Body (multi-line text; markdown-lite rendering — bold, italic, line breaks; no full markdown parser)
- Author (auto-populated from the current user's display name; editable)

Entries display newest-first, but numbered forward (Session 1 at the bottom). Each entry looks like a logbook page: date stamp, title, body. No reactions, no comments, no edit history.

### 4.6 The Bounties

List of active bounties. Each:

- Target (string, usually a PC name)
- Amount (integer, in silver)
- Issuer (string — a faction, a named NPC, etc.)
- Reason (free-text short string)
- Status (enum: `Active` / `Paid Off` / `Cleared`)

Cleared/paid bounties are archived to a collapsible "Resolved" section but not deleted.

---

## 5. Data model

### 5.1 Server-side: SQLite

One file at `/data/cursedcrew.db`, mounted as a Docker volume. Single table:

```sql
CREATE TABLE IF NOT EXISTS crews (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  data            TEXT NOT NULL,       -- JSON blob of CrewData
  version         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,    -- unix epoch ms
  updated_at      INTEGER NOT NULL,
  last_seen_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_crews_last_seen ON crews (last_seen_at);
```

`version` increments on every mutation. Clients use it to detect and recover from missed broadcasts.

Use `better-sqlite3` (synchronous, blazing, perfect for this scale — a handful of tables, a handful of writes per second peak).

### 5.2 In-memory state (server)

The server keeps the parsed `CrewData` for each actively connected crew in memory, plus the set of connected WebSocket clients. On last disconnect, the in-memory copy is flushed and cleared. Every mutation is persisted to SQLite immediately (synchronously — it's fast).

### 5.3 CrewData shape

```typescript
type CrewData = {
  schemaVersion: 1;
  ship: Ship;
  characters: Character[];
  deceased: Character[];
  manifest: Manifest;
  factions: Faction[];
  log: LogEntry[];
  bounties: Bounty[];
  bountiesResolved: Bounty[];
};

type Ship = {
  name: string;
  class: string;
  hp: number;
  maxHp: number;
  hullTier: 'light' | 'medium' | 'heavy';
  speed: number;
  skill: number;
  crewCount: number;
  minCrew: number;
  maxCrew: number;
  cargoMax: number;
  upgrades: string[];
  notes: string;
};

type Character = {
  id: string;            // uuid
  name: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  agility: number;
  presence: number;
  strength: number;
  toughness: number;
  spirit: number;
  silver: number;
  devilsLuck: number;
  conditions: string[];
  featureNotes: string;
  inventory: string[];
};

type Manifest = {
  doubloons: number;
  cargo: { id: string; name: string; slots: number; notes: string }[];
  relics: {
    id: string;
    name: string;
    description: string;
    usesLeft: number | null;
    status: 'active' | 'depleted' | 'destroyed';
  }[];
};

type Faction = {
  id: string;
  name: string;
  status: 'allied' | 'friendly' | 'neutral' | 'watched' | 'wanted' | 'kos';
  note: string;
};

type LogEntry = {
  id: string;
  session: number;
  date: string;          // ISO date, no time
  title: string;
  body: string;
  author: string;
};

type Bounty = {
  id: string;
  target: string;
  amount: number;
  issuer: string;
  reason: string;
  status: 'active' | 'paid' | 'cleared';
};
```

### 5.4 Defaults on crew creation

- Ship: un-named Sloop, 8/8 HP, Light hull, speed 3, cargo max 4
- One empty character card
- 0 doubloons, empty cargo and relics
- Six default factions, all `neutral`
- Empty log, empty bounties

---

## 6. Visual design

This is the part that differentiates Cursed Crew from every generic RPG tracker. Get this right or the tool will feel wrong.

### 6.1 Tone

Pirate Borg primarily, with Mörk Borg's brutalism intact. That means:

- Aged-paper backgrounds dominant, not pure black
- Heavy blood red as the primary accent, not acid yellow
- Deep black ink for type and rules
- Muted brass/gold used sparingly for highlights
- Sharp edges everywhere — no rounded corners, no drop shadows, no gradients
- Intentional roughness — hand-drawn borders, faint paper grain, rules that don't all sit perfectly straight
- Numbers should look *stamped*, not typed

Avoid at all costs:

- The Notion aesthetic (soft shadows, rounded corners, pastel chips)
- Material Design anything
- Bootstrap default components
- Lucide icons used as-is (they read too polished)
- Gradient buttons
- Border-radius greater than 0 anywhere

### 6.2 Color tokens

```css
:root {
  --ink:            #0A0A0A;
  --parchment:      #EFE3C8;
  --parchment-dim:  #E3D5B5;
  --parchment-deep: #D9C9A3;
  --blood:          #8B1A1A;
  --blood-bright:   #C41E1E;
  --brass:          #B38A2A;
  --bone:           #F5EBD3;
  --void:           #1A1612;

  --status-allied:   #4A6B3A;
  --status-neutral:  #6B5F3A;
  --status-watched:  #8A6B2A;
  --status-wanted:   #8B1A1A;
  --status-kos:      #3A0606;
}
```

Default light mode is parchment-on-black-ink. A dark mode is a nice-to-have; if included, it should lean black-on-bone rather than invert.

### 6.3 Typography

All fonts are free (Google Fonts or self-hosted):

- **Display / titles**: `Pirata One` — pirate-themed blackletter. Crew name, major headers. Large sizes only (≥ 2rem).
- **Section headers / labels**: `Cormorant Unicase` at 600 weight, or `IM Fell DW Pica SC` for small caps.
- **Body / notes**: `IM Fell English` — weathered serif, period-appropriate. Log entries, notes, descriptions.
- **Stats / numbers**: `Special Elite` — typewriter. All numeric values (HP, Luck, silver counts).

Do not use Helvetica, Inter, or any modern geometric sans anywhere. If a fallback is needed, use Georgia or Times.

Self-host the font files in the container to avoid Google Fonts hits from behind the tunnel. Bundle them in `/client/static/fonts/` and reference from CSS with `@font-face`.

### 6.4 Layout rules

- **Grid**: 12-column on desktop, fluid. Minimum usable width: 320px.
- **Spacing**: 4px base grid but permit intentional misalignment — a stat block can sit 2–3px off from its neighbor.
- **Borders**: thick ink-black borders (2px or 3px) rather than Material elevation. Nested cards use double-line borders in places.
- **Dividers**: between sections, use an ornamental rule — a skull glyph flanked by horizontal lines, or a compass rose. Custom SVG, not icon fonts.
- **Rotation**: major section headers can tilt slightly (0.5–1.5 degrees). Character cards can tilt alternating directions. Do not rotate form inputs.

### 6.5 Component treatments

- **Buttons**: rectangular, thick border, flat fill. Primary button is blood-red fill with bone-color text; hover darkens the blood. Secondary button is parchment fill with ink text and blood border.
- **Inputs**: no rounded corners. Bottom border only when inline, full border when block. Focus state is a blood-red border and nothing else.
- **Number steppers**: square +/- buttons with the number between them. Tap targets minimum 44×44px. The number is in Special Elite, large (1.5–2rem).
- **Status tags**: rectangular pills with 0 border radius. Color from `--status-*` tokens. Uppercase small caps.
- **Presence tags**: circular or hexagonal wax-seal style, blood-red fill, bone text, with the initial or first 6 chars of the user's display name.
- **Toasts / feedback**: rare, and in-character. On save: "Entered in the ledger." On crew creation: "A new black flag rises." On character death: "To Davy Jones' locker with ye." No emoji.
- **Loading states**: a small rotating compass rose SVG, not a spinner.
- **Connection states**: when WebSocket drops, a persistent bar at the top — "Adrift. Reconnecting..." in bone on blood. Clears when reconnected.

### 6.6 Responsive behavior

- Mobile (< 640px): modules stack vertically; full-width cards; sticky top bar with crew name, collapsed presence drawer, and a simple module selector.
- Tablet (640–1024px): two-column grid for character cards; other modules full width.
- Desktop (≥ 1024px): three-column grid for characters; Ship + Manifest side-by-side; Log and Bounties in their own rows; presence strip across the top.

A single scrolling page is fine. Tab navigation is fine. Either works.

### 6.7 Iconography

No icon font. No Lucide. Either:

- Custom inline SVGs (skull, anchor, cutlass, coin, compass rose, scroll) in a consistent rough-hewn style — about 6 to 10 glyphs total
- Or no icons at all, relying on typography alone

Either is acceptable. Do not mix and match styles.

---

## 7. Tech stack

Single container, everything together. Node.js as the server, static frontend served by the same Node process on the same port.

### 7.1 Backend

- **Node.js 20** (LTS)
- **Express** for HTTP routing (or Fastify if preferred — minor)
- **ws** for WebSocket handling (the `ws` package, not `socket.io` — lower overhead, adequate for this)
- **better-sqlite3** for SQLite access (synchronous, fast)
- **nanoid** for crew code generation (12 chars, URL-safe alphabet)

No ORM. Raw SQL against SQLite is fine for one table.

### 7.2 Frontend

- **SvelteKit** with the static adapter (`@sveltejs/adapter-static`)
- **TypeScript**
- Plain CSS with custom properties — no Tailwind, no component library
- The built static output lives at `/client/build/` and is served by Express as static files, with a fallback to `index.html` for client-side routing

### 7.3 Container

- Base image: `node:20-alpine`
- Multi-stage build: build client, build server, runtime stage copies only what's needed
- Runtime image exposes one HTTP port (default `8080`)
- SQLite file at `/data/cursedcrew.db`, mounted as a Docker volume
- No TLS in the container — Cloudflare Tunnel handles that externally

### 7.4 Deployment

- Docker Compose on the Ubuntu host
- Cloudflare Tunnel (`cloudflared`) points at `http://localhost:8080` (or whatever port is mapped)
- No reverse proxy, no nginx — the Node process serves everything

### 7.5 Full dependency list (resist adding more)

Backend:

- `express`
- `ws`
- `better-sqlite3`
- `nanoid`

Frontend:

- `@sveltejs/kit`
- `@sveltejs/adapter-static`
- `svelte`
- `typescript`

Dev only: `vite`, whatever SvelteKit needs, `@types/*` as needed.

That's the list. No `marked`, no `date-fns`, no `zod`, no `tailwindcss`, no `socket.io`. Write the small stuff yourself.

---

## 8. File layout

```
/app
  /server
    index.ts              # Express + WebSocket entrypoint
    db.ts                 # SQLite setup, prepared statements
    crew.ts               # CrewData type, defaults, mutation reducer
    ws.ts                 # WebSocket protocol handler
    routes.ts             # HTTP routes
    package.json
    tsconfig.json
  /client
    src/
      routes/
        +layout.svelte
        +page.svelte              # landing: create / rejoin
        c/[code]/+page.svelte     # the ledger
        c/[code]/+page.ts         # load: fetch initial state
      lib/
        stores.ts                 # crew state store, presence store
        ws.ts                     # WebSocket client wrapper
        types.ts                  # shared types (mirror of server)
        components/
          Ship.svelte
          Characters.svelte
          CharacterCard.svelte
          Manifest.svelte
          Reckoning.svelte
          Log.svelte
          Bounties.svelte
          Presence.svelte
          Stepper.svelte
          StatusTag.svelte
          CompassRose.svelte       # SVG spinner
        design/
          tokens.css
          type.css
          components.css
      app.css
    static/
      fonts/
        ImFellEnglish-Regular.woff2
        Pirata-Regular.woff2
        CormorantUnicase-SemiBold.woff2
        SpecialElite-Regular.woff2
      glyphs/
        skull.svg
        anchor.svg
        compass.svg
        ...
    svelte.config.js
    vite.config.ts
    package.json
    tsconfig.json
  Dockerfile
  docker-compose.yml
  .dockerignore
  README.md
```

Server and client are separate npm workspaces (or separate projects — workspaces are nicer but add a small amount of config). Either works.

---

## 9. Real-time sync

### 9.1 Connection

Client connects to `ws://<host>/ws?code=<crewCode>&name=<displayName>`.

On connect:

- Server authenticates by crew code only (verify the crew exists in SQLite; reject if not)
- Server adds the socket to that crew's broadcast set
- Server sends a `hello` message with the current full state and version number
- Server broadcasts a `presence` update to all clients of that crew

On disconnect:

- Server removes the socket
- Server broadcasts presence update
- If no clients remain for that crew, the in-memory state is released

### 9.2 Message protocol

All messages are JSON. Message types, client → server:

```typescript
// First message after connect — auth/handshake
{ t: 'hello', crewCode: string, displayName: string }

// Mutation request
{ t: 'mutate', id: string, action: Action }

// Presence heartbeat (every 30s)
{ t: 'ping' }

// Update own name
{ t: 'rename', displayName: string }
```

Server → client:

```typescript
// Response to hello — full state snapshot
{ t: 'snapshot', version: number, data: CrewData, presence: PresenceEntry[] }

// Acknowledge a mutation from this client
{ t: 'ack', id: string, version: number }

// Broadcast a mutation from any client (including self)
{ t: 'mutation', version: number, action: Action, by: string }

// Presence changed (someone connected, disconnected, renamed)
{ t: 'presence', presence: PresenceEntry[] }

// Version desync — client should request full snapshot
{ t: 'resync', version: number, data: CrewData }

// Error
{ t: 'error', message: string }

// Keepalive
{ t: 'pong' }

type PresenceEntry = { clientId: string; displayName: string }
```

### 9.3 Action vocabulary

Actions are the mutation primitives. The server has a reducer that applies each action to `CrewData` and returns the new state.

```typescript
type Action =
  // Ship
  | { kind: 'ship.set'; field: keyof Ship; value: unknown }
  | { kind: 'ship.addUpgrade'; text: string }
  | { kind: 'ship.removeUpgrade'; index: number }

  // Characters
  | { kind: 'character.create' }
  | { kind: 'character.update'; id: string; fields: Partial<Character> }
  | { kind: 'character.die'; id: string }
  | { kind: 'character.revive'; id: string }
  | { kind: 'character.remove'; id: string }        // permanent delete, rare

  // Manifest
  | { kind: 'doubloons.set'; value: number }
  | { kind: 'doubloons.adjust'; delta: number }
  | { kind: 'cargo.add'; item: Omit<CargoItem, 'id'> }
  | { kind: 'cargo.update'; id: string; fields: Partial<CargoItem> }
  | { kind: 'cargo.remove'; id: string }
  | { kind: 'relic.add'; relic: Omit<Relic, 'id'> }
  | { kind: 'relic.update'; id: string; fields: Partial<Relic> }
  | { kind: 'relic.remove'; id: string }

  // Factions
  | { kind: 'faction.add'; name: string }
  | { kind: 'faction.update'; id: string; fields: Partial<Faction> }
  | { kind: 'faction.remove'; id: string }

  // Log
  | { kind: 'log.add'; entry: Omit<LogEntry, 'id'> }
  | { kind: 'log.update'; id: string; fields: Partial<LogEntry> }
  | { kind: 'log.remove'; id: string }

  // Bounties
  | { kind: 'bounty.add'; bounty: Omit<Bounty, 'id'> }
  | { kind: 'bounty.update'; id: string; fields: Partial<Bounty> }
  | { kind: 'bounty.resolve'; id: string; status: 'paid' | 'cleared' }
  | { kind: 'bounty.remove'; id: string }
```

This list is the complete mutation surface of the app. If a feature needs an action not in this list, add one new action type — do not shove things into `ship.set`.

### 9.4 Reducer guarantees

- Pure function: `(state, action) => newState`. No side effects inside the reducer.
- Server applies reducer, increments version, writes `{ data, version }` to SQLite, then broadcasts.
- Invalid actions (unknown IDs, out-of-range values) are no-ops that return the previous state and emit an error to the originating client only. Do not crash.
- The reducer is defined once in `/server/crew.ts` and not duplicated on the client. The client optimistically applies actions locally, and reconciles via the `mutation` broadcast.

### 9.5 Optimistic updates

On the client:

1. User edits something
2. Client dispatches action locally (updates store immediately)
3. Client sends `mutate` to server with a client-side `id`
4. Server applies action, broadcasts `mutation` with the action and new version
5. Client receives broadcast — if it's the action it just sent (matched by id), confirm; if it's from someone else, apply to the store

If the client's `version` ever lags behind (missed a broadcast, reconnect), the client requests a resync and replaces its local state.

### 9.6 Conflict handling

Last-writer-wins, per action, globally ordered by the server. If Alice and Bob both adjust the ship's HP in the same tick, the server processes them in arrival order and both broadcasts go out. Neither edit is "lost" in the sense that both are applied; the final value is whoever wrote last.

This is adequate. Collaborative editing of a shared free-text field (log entries, notes) is the only place where it feels rough, and the solution there is "don't edit the same log entry simultaneously, they're short." Field-level locking is explicitly out of scope.

### 9.7 Persistence cadence

- Every mutation triggers an immediate write to SQLite
- `better-sqlite3` in WAL mode makes this effectively free at this scale
- No batching, no debouncing on the server side — reliability beats cleverness

---

## 10. HTTP routes

- `GET /` — landing page (SvelteKit static asset)
- `GET /c/<code>` — ledger (SvelteKit static asset, client-side fetches initial state via WebSocket)
- `GET /api/crew/<code>` — returns `{ exists: boolean, name: string }` for link preview; does not return full state (that comes via WS)
- `POST /api/crew` — body `{ name: string, shipName?: string }` — creates crew, returns `{ code }`
- `GET /ws` — WebSocket upgrade endpoint, query params `code` and `name`
- `GET /healthz` — returns 200 OK for container health checks
- `GET /*` — fall-through to SvelteKit's `index.html` for client routing

Static files from `/client/build/` served directly by Express with appropriate caching headers (fonts and glyphs: long cache; HTML: no-cache).

---

## 11. Deployment

### 11.1 Dockerfile skeleton

```dockerfile
# --- build stage ---
FROM node:20-alpine AS build

WORKDIR /build

# Install build deps (better-sqlite3 needs python/make/g++)
RUN apk add --no-cache python3 make g++

# Client
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client/ ./client/
RUN cd client && npm run build

# Server
COPY server/package*.json ./server/
RUN cd server && npm ci
COPY server/ ./server/
RUN cd server && npm run build

# --- runtime stage ---
FROM node:20-alpine AS runtime

WORKDIR /app

# Runtime deps only
COPY server/package*.json ./
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev \
  && apk del python3 make g++

COPY --from=build /build/server/dist ./dist
COPY --from=build /build/client/build ./client

ENV NODE_ENV=production
ENV PORT=8080
ENV DB_PATH=/data/cursedcrew.db
ENV CLIENT_DIR=/app/client

VOLUME ["/data"]
EXPOSE 8080

CMD ["node", "dist/index.js"]
```

### 11.2 docker-compose.yml skeleton

```yaml
services:
  cursedcrew:
    build: .
    container_name: cursedcrew
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:8080"    # bind to loopback only; cloudflared reaches it
    volumes:
      - ./data:/data
    environment:
      - PORT=8080
      - DB_PATH=/data/cursedcrew.db
```

### 11.3 Cloudflare Tunnel

The user already runs `cloudflared`. Point a tunnel ingress rule at `http://localhost:8080`:

```yaml
# ~/.cloudflared/config.yml (example fragment)
ingress:
  - hostname: cursedcrew.example.com
    service: http://localhost:8080
  - service: http_status:404
```

WebSocket support in Cloudflare Tunnel is on by default; no extra configuration needed.

### 11.4 First-run checklist

1. `git clone` the repo on the Ubuntu host
2. `mkdir data` in the project root
3. `docker compose build`
4. `docker compose up -d`
5. `curl http://localhost:8080/healthz` → expect `OK`
6. Add the tunnel ingress rule, reload `cloudflared`
7. Visit the public hostname, create a crew, share the URL with the group

### 11.5 Backup

The entire state is one SQLite file. Cron a nightly `cp data/cursedcrew.db backups/cursedcrew-$(date +%F).db` and call it a backup strategy.

---

## 12. Accessibility

The brutalist aesthetic does not excuse inaccessibility.

- All interactive elements must be keyboard-reachable
- Number steppers must have accessible labels and work with keyboard arrows
- Status color tags must not rely on color alone — include the text ("Wanted", "Allied") always
- Minimum contrast: blood-red (#8B1A1A) on parchment (#EFE3C8) passes WCAG AA for large text; verify all combinations
- Character cards use semantic headings (h2 or h3)
- Focus states must be visible — the blood-red border is sufficient, but it must actually appear
- Connection status changes are announced via `aria-live="polite"`

---

## 13. What a working MVP looks like

A user can:

- Visit the root URL, create a crew, get a shareable link
- Set up their ship (name, class, HP, stats)
- Add 4 characters with full stats
- Share the URL with three friends who open it on their phones
- All four see each other's edits in real time — one person adjusts HP, everyone sees it
- The presence strip shows all four display names
- One player loses connection; the presence strip updates; their name reappears when they reconnect
- Log a session entry
- Close every browser; reopen the link tomorrow; all state is intact
- Mark a character dead and see them move to Davy Jones' Locker
- Cycle a faction from Neutral to Wanted

And it looks like it belongs in the Dark Caribbean.

Anything beyond this is scope creep for v1.1.

---

## 14. V1.1 candidate features (not MVP)

- Dark mode (black page, bone type, full Mörk Borg treatment)
- Custom crew avatar / ship sigil (upload or generate)
- Export ledger to printable PDF
- Condition auto-effects (marking "Broken" dims the whole card)
- Simple shared timer / watch tracker for ship watches
- Relic-from-book picker (pre-populated with the 20 book relics)
- Class feature templates (pre-filled by class choice)
- Session attendance tracker
- "Panic roll" — a one-tap random event from a curated table
- Crew export/import as JSON (for backup and porting)
- Edit secret — second crew-code-sized token required for write operations (if ever needed)
- Chat (only if the group actually wants it; skip otherwise)

---

## 15. Build order for Claude Code

A reasonable session-by-session plan. Each step is a coherent unit of work that should compile and run before moving on.

1. **Project scaffold**: repo skeleton, `/server` and `/client` dirs, SvelteKit init, Express init, TypeScript configs. `npm install` in both. "Hello world" endpoint and SvelteKit page.
2. **Database layer**: SQLite setup, `crews` table, prepared statements, simple create/read functions. Unit test crew creation in isolation.
3. **HTTP routes**: `POST /api/crew`, `GET /api/crew/:code`, `GET /healthz`. Static file serving for SvelteKit build. Test via curl.
4. **Landing page**: `+page.svelte` with "Raise the Black Flag" and "Rejoin" actions. Hook up crew creation; redirect to `/c/<code>`.
5. **Visual system**: CSS tokens, font imports (self-hosted), one hand-drawn divider SVG, one compass rose SVG. Base layout styles. Verify on a dummy page.
6. **WebSocket server**: `/ws` upgrade, connection management, crew rooms, presence tracking. Test with `wscat` or a simple browser client.
7. **Reducer**: implement `applyAction(state, action)` for all action kinds. Pure function; write tests for every action kind.
8. **WebSocket client wrapper**: reconnect logic, message dispatch, Svelte store integration.
9. **Ship module**: stat block UI, number steppers, two-way binding to the store, dispatch `ship.set` actions.
10. **Crew module**: character cards, HP/Luck steppers, condition tags, dead/revive flow.
11. **Manifest module**: doubloons, cargo list with slot tally, relics list.
12. **Reckoning**: faction rows, status cycling, add/remove/rename.
13. **Log**: add/edit/remove entries, session numbering, markdown-lite rendering (bold, italic, line breaks only — write it inline, don't add a parser dep).
14. **Bounties**: add, resolve, archive.
15. **Presence strip**: display names as wax-seal tags, connection status banner.
16. **Responsive pass**: mobile layout, touch targets, collapsible presence.
17. **Accessibility pass**: keyboard, focus states, aria-live for connection status.
18. **Containerize**: Dockerfile, docker-compose.yml, test locally.
19. **Deploy**: push to Ubuntu host, wire up Cloudflare Tunnel, smoke test from phone on cellular.

Steps 1–8 are infrastructure and unglamorous. Steps 9–14 are the features a user sees. Step 15–17 are polish. Steps 18–19 are deployment. Don't skip around.

---

## 16. decisions (flag to the user as needed)

1. **Framework**: SvelteKit is proposed. User confirmed.
2. **Identity depth**: current proposal is a display name remembered in localStorage, no server record. Upgrade path would be a `users` table keyed by a cookie. MVP skips this. - User: please create a users table
3. **Port**: `8080` is the default. Change in `docker-compose.yml` if it conflicts with something else on the Ubuntu host.
4. **Hostname**: the user provides this — it's just a Cloudflare Tunnel ingress rule.
5. Dark mode in MVP
6. **Abandonment cleanup**: the `last_seen_at` column is there for eventual housekeeping (purge crews unused for N months). No cron yet; add in V1.1 if the DB grows.

---

*This tool is an independent fan project and is not affiliated with Limithron LLC, Ockult Örtmästare Games, Stockholm Kartell, or Free League Publishing. Pirate Borg is published under the Mörk Borg Third Party License. Do not include any Limithron artwork, text from the Pirate Borg or Mörk Borg books, or the Pirate Borg / Limithron logos without following the license terms at limithron.com/license.*

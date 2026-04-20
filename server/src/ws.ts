/**
 * WebSocket server — the sync layer.
 *
 * Connection lifecycle:
 *   1. HTTP upgrade on /ws?code=<crew-code>[&name=<display-name>]
 *   2. Server validates the code shape, resolves the cookie-bound user id,
 *      and (optionally) reads the requested display name.
 *   3. The WebSocket upgrade completes and the room is acquired.
 *   4. Server immediately sends `snapshot` and broadcasts presence.
 *   5. Client exchanges `ping/pong` and `mutate/ack+mutation` messages until
 *      disconnect. On close, the server broadcasts presence and releases the
 *      room if it was the last client.
 *
 * The reducer is the one place mutations are applied; every ok:true result is
 * persisted before the broadcast goes out, so reconnecting clients always
 * resume from a post-broadcast snapshot.
 */

import type { IncomingMessage, Server as HttpServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { parse as parseCookie } from 'cookie';

import type { Config } from './config.js';
import type { DbHandle } from './db.js';
import { uuid } from './ids.js';
import { isValidCrewCodeShape } from './names.js';
import {
  RoomManager,
  presenceOf,
  type Client,
  type Room
} from './rooms.js';
import {
  normalizeDisplayName,
  parseClientMessage,
  WS_MAX_FRAME_BYTES,
  type ClientMessage,
  type ServerMessage
} from './protocol.js';
import { applyAction } from './reducer.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

// ----------------------------------------------------------------------------
// Wire helpers
// ----------------------------------------------------------------------------

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState !== ws.OPEN) return;
  ws.send(JSON.stringify(msg));
}

function broadcast(room: Room, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
  }
}

function broadcastExcept(room: Room, except: Client, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const c of room.clients) {
    if (c === except) continue;
    if (c.ws.readyState === c.ws.OPEN) c.ws.send(payload);
  }
}

// ----------------------------------------------------------------------------
// Upgrade context
// ----------------------------------------------------------------------------

type UpgradeContext = {
  code: string;
  userId: string;
  initialName: string;
};

// ----------------------------------------------------------------------------
// Main attach
// ----------------------------------------------------------------------------

export function attachWebSocket(
  server: HttpServer,
  db: DbHandle,
  config: Config
): { close: () => void; rooms: RoomManager } {
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: WS_MAX_FRAME_BYTES
  });
  const rooms = new RoomManager(db);

  // ----- HTTP → WS upgrade routing --------------------------------------
  server.on('upgrade', (req, socket, head) => {
    if (!req.url) {
      socket.destroy();
      return;
    }
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    const code = url.searchParams.get('code') ?? '';
    if (!isValidCrewCodeShape(code) || !db.crewExists(code)) {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    const cookies = parseCookie(req.headers.cookie ?? '');
    const rawUserId = cookies[config.cookieName];
    if (typeof rawUserId !== 'string' || !/^[A-Za-z0-9_-]{20,64}$/.test(rawUserId)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    const initialName = url.searchParams.get('name') ?? '';

    const ctx: UpgradeContext = { code, userId: rawUserId, initialName };
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req, ctx);
    });
  });

  // ----- Connection setup -----------------------------------------------
  wss.on(
    'connection',
    (ws: WebSocket, _req: IncomingMessage, ctx: UpgradeContext) => {
      const room = rooms.acquire(ctx.code);
      if (!room) {
        ws.close(1011, 'crew_not_found');
        return;
      }

      // Reuse the browser's last known display name when the URL didn't carry
      // one — makes returning users show up correctly on reconnect.
      const existingUser = db.getUser(ctx.userId);
      const displayName = normalizeDisplayName(
        ctx.initialName || existingUser?.displayName || ''
      );

      const client: Client = {
        clientId: uuid(),
        userId: ctx.userId,
        displayName,
        ws,
        isAlive: true,
        lastPingAt: Date.now(),
        seenMutations: new Set()
      };
      room.clients.add(client);

      // Persist membership + last_seen. If this is the first time this user
      // joins this crew, a fresh crew_members row is created.
      const now = Date.now();
      db.upsertUser(client.userId, displayName, now);
      db.upsertMember(room.code, client.userId, 'crew', displayName, now);
      db.touchCrewLastSeen(room.code, now);

      // Protocol-level ping/pong for dead-peer detection. The 'ping' /
      // 'pong' application messages in protocol.ts are a separate, optional
      // courtesy for clients that want to measure round-trip latency.
      ws.on('pong', () => {
        client.isAlive = true;
      });

      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          send(ws, { t: 'error', code: 'binary_not_supported' });
          return;
        }
        let raw: unknown;
        try {
          raw = JSON.parse(data.toString('utf8'));
        } catch {
          send(ws, { t: 'error', code: 'bad_json' });
          return;
        }

        const parsed = parseClientMessage(raw);
        if (!parsed.ok) {
          send(ws, { t: 'error', code: parsed.reason });
          return;
        }

        handleMessage(db, room, client, parsed.msg);
      });

      ws.on('close', () => {
        room.clients.delete(client);
        broadcast(room, { t: 'presence', presence: presenceOf(room) });
        rooms.releaseIfEmpty(room);
      });

      ws.on('error', (err) => {
        console.warn('[ws] socket error', err?.message ?? err);
        try {
          ws.terminate();
        } catch {
          /* noop */
        }
      });

      // Initial snapshot + presence broadcast.
      send(ws, {
        t: 'snapshot',
        version: room.version,
        data: room.data,
        presence: presenceOf(room)
      });
      broadcastExcept(room, client, {
        t: 'presence',
        presence: presenceOf(room)
      });
    }
  );

  // ----- Heartbeat sweep: terminate dead peers every interval -----------
  const sweep = setInterval(() => {
    for (const room of rooms.all()) {
      for (const c of room.clients) {
        if (!c.isAlive) {
          try {
            c.ws.terminate();
          } catch {
            /* noop */
          }
          continue;
        }
        c.isAlive = false;
        try {
          c.ws.ping();
        } catch {
          /* noop */
        }
      }
    }
  }, HEARTBEAT_INTERVAL_MS);
  sweep.unref();

  return {
    rooms,
    close: () => {
      clearInterval(sweep);
      wss.close();
    }
  };
}

// ----------------------------------------------------------------------------
// Message dispatch
// ----------------------------------------------------------------------------

function handleMessage(
  db: DbHandle,
  room: Room,
  client: Client,
  msg: ClientMessage
): void {
  switch (msg.t) {
    case 'ping': {
      client.lastPingAt = Date.now();
      send(client.ws, { t: 'pong' });
      return;
    }
    case 'hello': {
      if (msg.crewCode && msg.crewCode !== room.code) {
        send(client.ws, { t: 'error', code: 'wrong_crew' });
        return;
      }
      if (typeof msg.displayName === 'string' && msg.displayName.trim().length > 0) {
        renameClient(db, room, client, msg.displayName);
      }
      return;
    }
    case 'rename': {
      renameClient(db, room, client, msg.displayName);
      return;
    }
    case 'mutate': {
      // Idempotency: if this id was already applied on this socket, re-ack
      // at the current version without re-running the reducer. Destructive
      // actions (bounty.resolve, character.die) fail on second application,
      // so a naive re-run would mis-report "unknown" to a perfectly-behaved
      // mutation that the network simply duplicated.
      if (client.seenMutations.has(msg.id)) {
        send(client.ws, { t: 'ack', id: msg.id, version: room.version });
        return;
      }
      const result = applyAction(room.data, msg.action);
      if (!result.ok) {
        send(client.ws, { t: 'error', code: result.reason });
        return;
      }
      room.data = result.state;
      room.version += 1;
      const now = Date.now();
      try {
        db.saveCrewData(room.code, room.data, room.version, now);
      } catch (err) {
        console.error('[ws] saveCrewData failed', err);
        send(client.ws, { t: 'error', code: 'save_failed' });
        // Roll back in-memory version so we don't broadcast an unsaved change.
        room.version -= 1;
        return;
      }
      db.touchMember(room.code, client.userId, now);
      client.seenMutations.add(msg.id);

      send(client.ws, { t: 'ack', id: msg.id, version: room.version });
      broadcastExcept(room, client, {
        t: 'mutation',
        version: room.version,
        action: msg.action,
        by: client.displayName
      });
      return;
    }
    default: {
      const _never: never = msg;
      void _never;
    }
  }
}

function renameClient(
  db: DbHandle,
  room: Room,
  client: Client,
  nextName: string
): void {
  const normalized = normalizeDisplayName(nextName);
  if (normalized === client.displayName) return;
  client.displayName = normalized;
  const now = Date.now();
  db.setMemberDisplayName(room.code, client.userId, normalized, now);
  db.setUserDisplayName(client.userId, normalized, now);
  broadcast(room, { t: 'presence', presence: presenceOf(room) });
}

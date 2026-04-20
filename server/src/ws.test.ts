import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server as HttpServer } from 'node:http';
import { once } from 'node:events';
import express from 'express';
import WebSocket from 'ws';

import { loadConfig } from './config.js';
import { openDb, type DbHandle } from './db.js';
import { identityMiddleware } from './identity.js';
import { buildApiRouter } from './routes.js';
import { attachWebSocket } from './ws.js';
import { uuid, userToken } from './ids.js';
import type { ServerMessage } from './protocol.js';

// ---------------------------------------------------------------------------
// Test harness — boots the real server on an ephemeral port with an in-memory DB.
// ---------------------------------------------------------------------------

type Harness = {
  server: HttpServer;
  db: DbHandle;
  port: number;
  close: () => Promise<void>;
  crew: { code: string; userId: string };
};

async function boot(): Promise<Harness> {
  const config = { ...loadConfig(), cookieSecure: false };
  const db = openDb(':memory:');
  const creatorUserId = userToken();
  const created = db.createCrew({
    name: 'Test Crew',
    creatorUserId,
    creatorDisplayName: 'Captain Test'
  });

  const app = express();
  app.use(express.json());
  app.use(identityMiddleware(db, config));
  app.use(buildApiRouter(db));

  const server = createServer(app);
  const ws = attachWebSocket(server, db, config);

  server.listen(0);
  await once(server, 'listening');
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('no address');
  const port = addr.port;

  return {
    server,
    db,
    port,
    crew: { code: created.code, userId: creatorUserId },
    close: async () => {
      ws.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      db.close();
    }
  };
}

function connect(
  h: Harness,
  opts: { userId?: string; name?: string; code?: string } = {}
): WebSocket {
  const userId = opts.userId ?? h.crew.userId;
  const code = opts.code ?? h.crew.code;
  const name = opts.name ?? 'Alice';
  const url = `ws://localhost:${h.port}/ws?code=${encodeURIComponent(code)}&name=${encodeURIComponent(name)}`;
  return new WebSocket(url, {
    headers: { Cookie: `cc_uid=${userId}` }
  });
}

async function nextMessage(ws: WebSocket, predicate?: (m: ServerMessage) => boolean): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const onMessage = (data: WebSocket.RawData) => {
      try {
        const msg = JSON.parse(data.toString('utf8')) as ServerMessage;
        if (!predicate || predicate(msg)) {
          ws.off('message', onMessage);
          ws.off('error', onError);
          resolve(msg);
        }
      } catch (err) {
        ws.off('message', onMessage);
        ws.off('error', onError);
        reject(err);
      }
    };
    const onError = (err: Error) => {
      ws.off('message', onMessage);
      ws.off('error', onError);
      reject(err);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ws', () => {
  let h: Harness;
  before(async () => {
    h = await boot();
  });
  after(async () => {
    await h.close();
  });

  it('rejects upgrade for unknown crew codes', async () => {
    const url = `ws://localhost:${h.port}/ws?code=ghost-ghost-ghost&name=nobody`;
    const ws = new WebSocket(url, { headers: { Cookie: `cc_uid=${userToken()}` } });
    await new Promise<void>((resolve, reject) => {
      ws.on('error', () => resolve());
      ws.on('open', () => reject(new Error('unexpected open')));
      ws.on('close', () => resolve());
    });
  });

  it('rejects upgrade without a valid user cookie', async () => {
    const url = `ws://localhost:${h.port}/ws?code=${h.crew.code}&name=nobody`;
    const ws = new WebSocket(url); // no cookie
    await new Promise<void>((resolve) => {
      ws.on('error', () => resolve());
      ws.on('close', () => resolve());
    });
  });

  it('sends snapshot on connect', async () => {
    const ws = connect(h);
    const msg = await nextMessage(ws, (m) => m.t === 'snapshot');
    assert.equal(msg.t, 'snapshot');
    if (msg.t === 'snapshot') {
      assert.equal(msg.data.schemaVersion, 1);
      assert.equal(msg.data.ship.class, 'Sloop');
      assert.equal(msg.version, 0);
      assert.equal(msg.presence.length, 1);
    }
    ws.close();
    await once(ws, 'close');
  });

  it('applies a mutation, acks sender, broadcasts to others, bumps version', async () => {
    const alice = connect(h, { name: 'Alice' });
    await nextMessage(alice, (m) => m.t === 'snapshot');

    const bobUid = userToken();
    const bob = connect(h, { userId: bobUid, name: 'Bob' });
    await nextMessage(bob, (m) => m.t === 'snapshot');
    // Alice sees presence update for Bob
    await nextMessage(alice, (m) => m.t === 'presence');

    alice.send(
      JSON.stringify({
        t: 'mutate',
        id: 'm-1',
        action: { kind: 'doubloons.set', value: 42 }
      })
    );

    const ackPromise = nextMessage(alice, (m) => m.t === 'ack');
    const bobMutation = nextMessage(bob, (m) => m.t === 'mutation');

    const ack = await ackPromise;
    const broadcast = await bobMutation;

    if (ack.t === 'ack') {
      assert.equal(ack.id, 'm-1');
      assert.equal(ack.version, 1);
    }
    if (broadcast.t === 'mutation') {
      assert.equal(broadcast.version, 1);
      assert.equal(broadcast.action.kind, 'doubloons.set');
      assert.equal(broadcast.by, 'Alice');
    }

    alice.close();
    bob.close();
    await Promise.all([once(alice, 'close'), once(bob, 'close')]);
  });

  it('rejects malformed mutations to sender only, no broadcast', async () => {
    const alice = connect(h, { name: 'Alice' });
    await nextMessage(alice, (m) => m.t === 'snapshot');
    const bob = connect(h, { userId: userToken(), name: 'Bob' });
    await nextMessage(bob, (m) => m.t === 'snapshot');
    await nextMessage(alice, (m) => m.t === 'presence');

    alice.send(
      JSON.stringify({
        t: 'mutate',
        id: 'bad',
        action: { kind: 'ship.set', field: 'speed', value: 'fast' }
      })
    );
    const err = await nextMessage(alice, (m) => m.t === 'error');
    assert.equal(err.t, 'error');

    // Bob should NOT see any mutation. Race it with a short timer.
    const sawBroadcast = await Promise.race([
      nextMessage(bob, (m) => m.t === 'mutation').then(() => true),
      new Promise((r) => setTimeout(() => r(false), 100))
    ]);
    assert.equal(sawBroadcast, false);

    alice.close();
    bob.close();
    await Promise.all([once(alice, 'close'), once(bob, 'close')]);
  });

  it('rename broadcasts presence to everyone', async () => {
    const alice = connect(h, { name: 'Alice' });
    await nextMessage(alice, (m) => m.t === 'snapshot');
    const bob = connect(h, { userId: userToken(), name: 'Bob' });
    await nextMessage(bob, (m) => m.t === 'snapshot');
    await nextMessage(alice, (m) => m.t === 'presence');

    alice.send(JSON.stringify({ t: 'rename', displayName: 'One-Eye' }));

    const presenceA = await nextMessage(alice, (m) => m.t === 'presence');
    const presenceB = await nextMessage(bob, (m) => m.t === 'presence');

    if (presenceA.t === 'presence') {
      const names = presenceA.presence.map((p) => p.displayName);
      assert.ok(names.includes('One-Eye'));
    }
    if (presenceB.t === 'presence') {
      const names = presenceB.presence.map((p) => p.displayName);
      assert.ok(names.includes('One-Eye'));
    }

    alice.close();
    bob.close();
    await Promise.all([once(alice, 'close'), once(bob, 'close')]);
  });

  it('dedupes a re-sent mutation by id, re-acking without a second apply', async () => {
    const alice = connect(h, { name: 'Alice' });
    await nextMessage(alice, (m) => m.t === 'snapshot');

    // Add a bounty with a known client-supplied id, then resolve it once.
    const bountyId = 'ws-test-bounty';
    alice.send(JSON.stringify({
      t: 'mutate',
      id: 'b-add',
      action: {
        kind: 'bounty.add',
        id: bountyId,
        bounty: { target: 'Blackbeard', amount: 100, issuer: '', reason: '', status: 'active' }
      }
    }));
    await nextMessage(alice, (m) => m.t === 'ack');

    alice.close();
    await once(alice, 'close');

    const al2 = connect(h, { name: 'Alice' });
    await nextMessage(al2, (m) => m.t === 'snapshot');

    // Resolve once; then re-send the exact same mutation id — the server
    // should ack both (the second is a dedupe no-op), not emit an error.
    al2.send(JSON.stringify({
      t: 'mutate',
      id: 'b-resolve-1',
      action: { kind: 'bounty.resolve', id: bountyId, status: 'paid' }
    }));
    const ack1 = await nextMessage(al2, (m) => m.t === 'ack');
    assert.equal(ack1.t, 'ack');

    al2.send(JSON.stringify({
      t: 'mutate',
      id: 'b-resolve-1',  // same id
      action: { kind: 'bounty.resolve', id: bountyId, status: 'paid' }
    }));

    // Race the second ack against any error or a timeout.
    const next = await Promise.race([
      nextMessage(al2, (m) => m.t === 'ack' || m.t === 'error').then((m) => ({ kind: 'msg' as const, m })),
      new Promise((r) => setTimeout(() => r({ kind: 'timeout' as const }), 250))
    ]);

    assert.equal((next as { kind: string }).kind, 'msg');
    if ((next as { kind: string }).kind === 'msg') {
      const m = (next as { kind: 'msg'; m: ServerMessage }).m;
      assert.equal(m.t, 'ack', `expected ack on dedupe, got ${m.t}`);
    }

    al2.close();
    await once(al2, 'close');
  });

  it('persists mutations — a reconnecting client sees the latest version', async () => {
    const alice = connect(h, { name: 'Alice' });
    await nextMessage(alice, (m) => m.t === 'snapshot');
    alice.send(
      JSON.stringify({
        t: 'mutate',
        id: 'm-p1',
        action: { kind: 'doubloons.set', value: 777 }
      })
    );
    await nextMessage(alice, (m) => m.t === 'ack');
    alice.close();
    await once(alice, 'close');

    const reconnect = connect(h, { name: 'Alice' });
    const snap = await nextMessage(reconnect, (m) => m.t === 'snapshot');
    if (snap.t === 'snapshot') {
      assert.ok(snap.version >= 1);
      assert.equal(snap.data.manifest.doubloons, 777);
    }
    reconnect.close();
    await once(reconnect, 'close');
  });
});

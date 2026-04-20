/**
 * Per-crew in-memory room state.
 *
 * The server caches a loaded CrewData for every crew with at least one live
 * WebSocket client. When the last client disconnects, the room is released —
 * the DB remains the sole source of truth.
 *
 * Each `Room` is accessed only from the WebSocket handler on the main thread,
 * so there is no locking story: Node's single-threaded event loop serializes
 * mutation-apply, version-bump, DB-write, and broadcast into one atomic unit.
 */

import type { WebSocket } from 'ws';

import type { DbHandle } from './db.js';
import type { CrewData, PresenceEntry } from './types.js';

export type Client = {
  /** Stable for the lifetime of this socket; used in PresenceEntry. */
  clientId: string;
  /** Cookie-identified browser. Multiple sockets can share a userId (same browser, multiple tabs). */
  userId: string;
  /** Currently-displayed name for this connection. */
  displayName: string;
  /** The live WebSocket. */
  ws: WebSocket;
  /** Heartbeat bookkeeping for the idle-sweep. */
  isAlive: boolean;
  /** Wall-clock of the most recent application-level ping. Diagnostic only. */
  lastPingAt: number;
  /**
   * Mutation ids already processed on this socket. Prevents re-applying a
   * mutation if the client re-sends the same id (which would typically be a
   * bug, but destructive actions like `bounty.resolve` fail on the second
   * application and would kick the offending client into an unnecessary
   * resync). Bounded implicitly by how many mutations one socket can send
   * before reconnecting — fine for a crew-at-a-table scale.
   */
  seenMutations: Set<string>;
};

export type Room = {
  code: string;
  version: number;
  data: CrewData;
  clients: Set<Client>;
};

export class RoomManager {
  private readonly rooms = new Map<string, Room>();

  constructor(private readonly db: DbHandle) {}

  /** Number of live rooms. Used for diagnostics / future admin endpoints. */
  size(): number {
    return this.rooms.size;
  }

  /**
   * Get or hydrate a room. Returns null when the crew is not in the DB —
   * callers should reject the connection in that case.
   */
  acquire(code: string): Room | null {
    const existing = this.rooms.get(code);
    if (existing) return existing;

    const loaded = this.db.getCrew(code);
    if (!loaded) return null;

    const room: Room = {
      code,
      version: loaded.row.version,
      data: loaded.data,
      clients: new Set()
    };
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Release the room when the last client leaves. No-op if clients remain.
   */
  releaseIfEmpty(room: Room): void {
    if (room.clients.size === 0) {
      this.rooms.delete(room.code);
    }
  }

  /** Iterate rooms — used by the heartbeat sweeper. */
  all(): IterableIterator<Room> {
    return this.rooms.values();
  }
}

export function presenceOf(room: Room): PresenceEntry[] {
  const out: PresenceEntry[] = [];
  for (const c of room.clients) {
    out.push({ clientId: c.clientId, displayName: c.displayName });
  }
  // Stable order by join (Set preserves insertion order).
  return out;
}

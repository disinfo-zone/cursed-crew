/**
 * CrewSession — the reactive bridge between a `/c/<code>` page and the server.
 *
 * Lifecycle:
 *   page mounts → new CrewSession(code) → .connect() → snapshot arrives →
 *   user edits → dispatch() (optimistic + send) → ack or mutation broadcast →
 *   on disconnect: outbox retains unsent mutations, banner shows "Adrift" →
 *   on reconnect: snapshot replaces local state, outbox is flushed →
 *   page unmounts → .dispose()
 *
 * Guarantees:
 *   - The local `data` is always either a pristine server snapshot or a
 *     snapshot-plus-optimistic edits applied through the same reducer the
 *     server runs.
 *   - On WebSocket close, every in-flight mutate is kept in `outbox` and
 *     replayed after the next successful connect.
 *   - Version gaps are detected on every `mutation` broadcast; a gap triggers
 *     a reconnect (the server will re-send a snapshot on open).
 */

import { applyAction } from '$lib/shared/reducer';
import type { Action, CrewData, PresenceEntry } from '$lib/shared/types';
import { toasts } from '$lib/toasts.svelte';

// ----------------------------------------------------------------------------
// Wire message shapes (mirror /server/src/protocol.ts)
// ----------------------------------------------------------------------------

type ServerMessage =
  | { t: 'snapshot'; version: number; data: CrewData; presence: PresenceEntry[] }
  | { t: 'ack'; id: string; version: number }
  | { t: 'mutation'; version: number; action: Action; by: string }
  | { t: 'presence'; presence: PresenceEntry[] }
  | { t: 'resync'; version: number; data: CrewData }
  | { t: 'error'; code: string; message?: string }
  | { t: 'pong' };

type ClientMessage =
  | { t: 'hello'; crewCode?: string; displayName?: string }
  | { t: 'mutate'; id: string; action: Action }
  | { t: 'rename'; displayName: string }
  | { t: 'ping' };

// ----------------------------------------------------------------------------
// Connection state — drives the "Adrift" banner and other UI affordances.
// ----------------------------------------------------------------------------

export type ConnState = 'idle' | 'connecting' | 'connected' | 'adrift' | 'error';

// ----------------------------------------------------------------------------
// Pending mutation — kept locally so we can re-send after reconnect.
// ----------------------------------------------------------------------------

type Pending = {
  id: string;
  action: Action;
};

// ----------------------------------------------------------------------------
// Reconnect backoff — gentle enough not to thunder the server, short enough
// that a table of players doesn't feel stranded.
// ----------------------------------------------------------------------------

const BACKOFF_MS = [500, 1000, 2000, 4000, 8000, 15000];
function backoffDelay(attempt: number): number {
  const base = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)] ?? 15000;
  return base + Math.floor(Math.random() * 300);
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------

let sessionSerial = 0;

export class CrewSession {
  // ─── Reactive state ─────────────────────────────────────────────────
  state = $state<ConnState>('idle');
  version = $state(0);
  data = $state<CrewData | null>(null);
  presence = $state<PresenceEntry[]>([]);
  displayName = $state<string>('');
  lastError = $state<string | null>(null);

  // ─── Internals ──────────────────────────────────────────────────────
  readonly code: string;
  private ws: WebSocket | null = null;
  /** Mutations applied locally, awaiting server ack. */
  private outbox: Pending[] = [];
  /** Ids the active socket has already shipped. Prevents double-sending the
   *  same mutation on the next dispatch (the prior bug caused the server to
   *  re-apply a destructive action, fail on dup, and trigger a resync). */
  private sentIds: Set<string> = new Set();
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private mutationCounter = 0;
  private readonly sessionId = ++sessionSerial;

  constructor(code: string, initialName = '') {
    this.code = code;
    this.displayName = initialName;
  }

  // ─── Public API ─────────────────────────────────────────────────────

  connect(): void {
    if (this.disposed) return;
    if (this.state === 'connecting' || this.state === 'connected') return;
    this.openSocket();
  }

  dispose(): void {
    this.disposed = true;
    this.clearReconnect();
    this.stopHeartbeat();
    if (this.ws) {
      try {
        this.ws.onopen = null;
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        /* noop */
      }
      this.ws = null;
    }
    this.state = 'idle';
  }

  /**
   * Dispatch a mutation. Applies it optimistically through the shared reducer,
   * then sends it to the server. If the local apply fails (client-side
   * validation tripped before we even got to the wire), nothing is sent and
   * a toast surfaces the reason.
   */
  dispatch(action: Action): void {
    if (!this.data) {
      toasts.push('The ledger is not yet loaded.', 'grim');
      return;
    }
    const localResult = applyAction(this.data, action);
    if (!localResult.ok) {
      toasts.push(copyForError(localResult.reason), 'grim');
      return;
    }
    this.data = localResult.state;
    const id = `m${this.sessionId}-${++this.mutationCounter}`;
    const item: Pending = { id, action };
    this.outbox.push(item);
    this.sendOne(item);
  }

  rename(nextName: string): void {
    const trimmed = nextName.trim();
    if (!trimmed || trimmed === this.displayName) return;
    this.displayName = trimmed;
    this.sendSafe({ t: 'rename', displayName: trimmed });
  }

  // ─── Socket management ──────────────────────────────────────────────

  private openSocket(): void {
    this.clearReconnect();
    this.state = this.reconnectAttempt === 0 ? 'connecting' : 'adrift';

    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(`${proto}//${location.host}/ws`);
    url.searchParams.set('code', this.code);
    if (this.displayName) url.searchParams.set('name', this.displayName);

    let ws: WebSocket;
    try {
      ws = new WebSocket(url.toString());
    } catch (err) {
      console.error('[ws] construct failed', err);
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      if (this.disposed) {
        ws.close();
        return;
      }
      this.reconnectAttempt = 0;
      this.state = 'connected';
      this.startHeartbeat();
      // A fresh socket has sent nothing yet. Flush anything still pending
      // from before the disconnect.
      this.sentIds = new Set();
      this.sendOutbox();
    };

    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') return;
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    };

    ws.onerror = () => {
      // Let onclose drive the reconnect; browsers fire both.
    };

    ws.onclose = () => {
      this.stopHeartbeat();
      if (this.disposed) return;
      this.state = 'adrift';
      this.ws = null;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    const delay = backoffDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => this.openSocket(), delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.sendSafe({ t: 'ping' });
    }, 25_000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ─── Send ───────────────────────────────────────────────────────────

  private sendSafe(msg: ClientMessage): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn('[ws] send failed', err);
    }
  }

  /** Send a single pending mutation, marking it as sent on this socket so it
   *  isn't re-emitted on the next dispatch. */
  private sendOne(item: Pending): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    if (this.sentIds.has(item.id)) return;
    this.sentIds.add(item.id);
    this.sendSafe({ t: 'mutate', id: item.id, action: item.action });
  }

  /** Flush the whole outbox — only called on a fresh connection. */
  private sendOutbox(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    for (const item of this.outbox) this.sendOne(item);
  }

  // ─── Server → Client ────────────────────────────────────────────────

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.t) {
      case 'snapshot':
        this.data = msg.data;
        this.version = msg.version;
        this.presence = msg.presence;
        this.outbox = []; // server is authoritative now
        this.sentIds = new Set();
        this.lastError = null;
        return;

      case 'ack': {
        this.version = msg.version;
        this.outbox = this.outbox.filter((p) => p.id !== msg.id);
        this.sentIds.delete(msg.id);
        return;
      }

      case 'mutation': {
        if (msg.version <= this.version) {
          // already applied or stale — ignore
          return;
        }
        if (msg.version > this.version + 1) {
          // Version gap — missed a broadcast. Force a fresh snapshot by
          // reconnecting (cheap for a small blob).
          this.requestResync();
          return;
        }
        if (!this.data) return;
        const r = applyAction(this.data, msg.action);
        if (r.ok) {
          this.data = r.state;
          this.version = msg.version;
        } else {
          // Our local reducer refused the server's mutation — schemas are
          // out of sync. Force resync.
          this.requestResync();
        }
        return;
      }

      case 'presence':
        this.presence = msg.presence;
        return;

      case 'resync':
        this.data = msg.data;
        this.version = msg.version;
        this.outbox = [];
        this.sentIds = new Set();
        return;

      case 'error': {
        this.lastError = msg.code;
        // Only surface and resync for *semantic* errors from the server. If
        // the error is for a malformed frame we'd log and continue — these
        // codes come from the protocol parser before the reducer runs.
        const parserCodes = new Set([
          'bad_json', 'malformed', 'missing_type', 'unknown_type',
          'bad_id', 'bad_action', 'bad_action_kind', 'bad_name',
          'binary_not_supported', 'wrong_crew'
        ]);
        if (parserCodes.has(msg.code)) {
          console.warn('[ws] protocol error:', msg.code);
          return;
        }
        toasts.push(copyForError(msg.code), 'grim');
        // The server state is authoritative; a fresh snapshot realigns us.
        this.requestResync();
        return;
      }

      case 'pong':
        return;
    }
  }

  private requestResync(): void {
    // The simplest reliable resync: drop the socket; the reconnect will
    // deliver a fresh snapshot from the server. For a crew-sized blob, the
    // cost is negligible.
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        /* noop */
      }
    }
  }
}

// ----------------------------------------------------------------------------
// Error copy — in-character phrasing for every reducer/server error code.
// Fallback is intentionally terse; if it's a code we don't know yet, we want
// the bug-report to contain the raw code.
// ----------------------------------------------------------------------------

const ERROR_COPY: Record<string, string> = {
  crew_full: 'No bunk remains. The crew is full.',
  cargo_full: 'The hold cannot take another barrel.',
  relics_full: 'The relics have overrun the ledger.',
  factions_full: 'Too many factions to track.',
  bounties_full: 'The bounty board is overrun.',
  log_full: 'The log is packed to the binding.',
  too_many_upgrades: 'The ship can bear no more upgrades.',
  unknown_character: 'No such soul in these waters.',
  unknown_cargo: 'No such cargo in the hold.',
  unknown_relic: 'No such relic in the ledger.',
  unknown_faction: 'No such faction on this chart.',
  unknown_log: 'No such entry in the log.',
  unknown_bounty: 'No such bounty in the margins.',
  unknown_action: 'The scribe refuses — unknown rite.',
  unknown_field: 'The scribe refuses — unknown field.',
  out_of_range: 'That value is beyond what the ledger allows.',
  bad_index: 'Out of range.',
  malformed: 'Garbled message.',
  wrong_crew: 'That signal does not belong to this crew.',
  save_failed: 'The scriptorium has stumbled. Try again.',
  binary_not_supported: 'Binary messages are not a tongue we speak.'
};

function copyForError(code: string): string {
  if (ERROR_COPY[code]) return ERROR_COPY[code];
  if (code.startsWith('invalid_')) {
    const what = code.slice('invalid_'.length).replace(/_/g, ' ');
    return `That ${what} is not what the ledger expects.`;
  }
  return `The ledger refused the entry (${code}).`;
}

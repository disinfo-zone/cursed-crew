/**
 * Wire protocol between the server and the client WebSocket.
 *
 * Design-doc §9.2 is the canonical description; this file is the machine
 * enforcement. Every inbound message is validated before it reaches the
 * reducer or the DB, every outbound message is shaped by a builder.
 */

import type { Action, CrewData, PresenceEntry } from './types.js';

// ----------------------------------------------------------------------------
// Client → Server
// ----------------------------------------------------------------------------

export type ClientMessage =
  | { t: 'hello'; crewCode?: string; displayName?: string }
  | { t: 'mutate'; id: string; action: Action }
  | { t: 'rename'; displayName: string }
  | { t: 'ping' };

// ----------------------------------------------------------------------------
// Server → Client
// ----------------------------------------------------------------------------

export type ServerMessage =
  | { t: 'snapshot'; version: number; data: CrewData; presence: PresenceEntry[] }
  | { t: 'ack'; id: string; version: number }
  | { t: 'mutation'; version: number; action: Action; by: string }
  | { t: 'presence'; presence: PresenceEntry[] }
  | { t: 'resync'; version: number; data: CrewData }
  | { t: 'error'; code: string; message?: string }
  | { t: 'pong' };

// ----------------------------------------------------------------------------
// Limits (defense against oversized frames / flood)
// ----------------------------------------------------------------------------

export const WS_MAX_FRAME_BYTES = 64 * 1024; // 64KB — actions are tiny
export const WS_MAX_DISPLAY_NAME = 40;
export const WS_MAX_MUTATION_ID = 64;

// ----------------------------------------------------------------------------
// Inbound validation — produces a ClientMessage or null.
// Rejection logs the raw reason for the caller to surface as an error reply.
// ----------------------------------------------------------------------------

export type ParseResult =
  | { ok: true; msg: ClientMessage }
  | { ok: false; reason: string };

export function parseClientMessage(raw: unknown): ParseResult {
  if (typeof raw !== 'object' || raw === null) return { ok: false, reason: 'malformed' };
  const m = raw as Record<string, unknown>;
  const t = m.t;
  if (typeof t !== 'string') return { ok: false, reason: 'missing_type' };

  switch (t) {
    case 'hello': {
      const hello: ClientMessage = { t: 'hello' };
      if (typeof m.crewCode === 'string') hello.crewCode = m.crewCode.slice(0, 64);
      if (typeof m.displayName === 'string') hello.displayName = m.displayName.slice(0, WS_MAX_DISPLAY_NAME);
      return { ok: true, msg: hello };
    }
    case 'mutate': {
      if (typeof m.id !== 'string' || m.id.length === 0 || m.id.length > WS_MAX_MUTATION_ID) {
        return { ok: false, reason: 'bad_id' };
      }
      if (typeof m.action !== 'object' || m.action === null) {
        return { ok: false, reason: 'bad_action' };
      }
      const a = m.action as Record<string, unknown>;
      if (typeof a.kind !== 'string') return { ok: false, reason: 'bad_action_kind' };
      // Deeper per-kind validation happens in the reducer. Here we only enforce
      // the envelope.
      return {
        ok: true,
        msg: { t: 'mutate', id: m.id, action: m.action as Action }
      };
    }
    case 'rename': {
      if (typeof m.displayName !== 'string') return { ok: false, reason: 'bad_name' };
      return {
        ok: true,
        msg: { t: 'rename', displayName: m.displayName.slice(0, WS_MAX_DISPLAY_NAME) }
      };
    }
    case 'ping': {
      return { ok: true, msg: { t: 'ping' } };
    }
    default:
      return { ok: false, reason: 'unknown_type' };
  }
}

/**
 * Normalize a user-supplied display name. Empty-after-trim collapses to a
 * themed default — never ship a blank presence tag.
 */
export function normalizeDisplayName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\x00-\x1F\x7F]/g, '').replace(/\s+/g, ' ').trim();
  const bounded = cleaned.slice(0, WS_MAX_DISPLAY_NAME);
  return bounded.length === 0 ? 'Unnamed Sailor' : bounded;
}

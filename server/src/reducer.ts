/**
 * The pure mutation reducer for CrewData.
 *
 * Every WebSocket mutation and every bit of optimistic-update hell flows
 * through this one function. It MUST be:
 *   - Pure: no side effects, no IO, no timestamps-from-now (caller supplies).
 *   - Defensive: any ill-formed action returns ok:false, never throws.
 *   - Structural: returns a fresh CrewData on every ok:true result.
 *
 * The server imports this; the client optimistically applies with the same
 * function (once we wire that up in task 8).
 */

import type {
  Action,
  ApplyResult,
  Bounty,
  BountyStatus,
  CargoItem,
  Character,
  CrewData,
  Faction,
  FactionStatus,
  HullTier,
  InventoryItem,
  LogEntry,
  Relic,
  RelicStatus,
  Ship
} from './types.js';

// globalThis.crypto.randomUUID() is available in Node 19+ and all modern
// browsers. Using it here — instead of node:crypto — keeps this module
// isomorphic so the client can import the very same file for its optimistic
// reducer without any bundling shims.
function uuid(): string {
  return globalThis.crypto.randomUUID();
}

/**
 * Validate a client-supplied id for a new item. Accepts uuid-like strings
 * and any short alphanumeric/hyphen id. Returns null for malformed input.
 */
function validId(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (v.length < 1 || v.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(v)) return null;
  return v;
}

// ----------------------------------------------------------------------------
// Bounds. Kept loose enough for normal play and for the GM to improvise —
// tight enough to refuse obvious garbage or abuse.
// ----------------------------------------------------------------------------

const MAX_CHARS_LIVING = 8;
const MAX_NAME = 80;
const MAX_SHORT = 200;
const MAX_LONG = 8000;
const MAX_LIST_ITEM = 200;
const MAX_INVENTORY = 60;
const MAX_CONDITIONS = 24;
const MAX_UPGRADES = 40;
const MAX_SHANTIES = 40;
const MAX_FACTIONS = 32;
const MAX_CARGO = 80;
const MAX_RELICS = 40;
const MAX_BOUNTIES = 60;
const MAX_BOUNTIES_RESOLVED = 200;
const MAX_LOG = 500;

const STAT_MIN = -10;
const STAT_MAX = 30;
const HP_MIN = -99;
const HP_MAX = 9999;
const CREW_COUNT_MIN = 0;
const CREW_COUNT_MAX = 9999;
const SPEED_MIN = 0;
const SPEED_MAX = 999;
const SILVER_MIN = 0;
const SILVER_MAX = 999_999_999;
const LUCK_MIN = 0;
const LUCK_MAX = 99;
const LEVEL_MIN = 0;
const LEVEL_MAX = 20;
const DOUBLOONS_MIN = 0;
const DOUBLOONS_MAX = 999_999_999;
const CARGO_SLOTS_MIN = 0;
const CARGO_SLOTS_MAX = 99;
const RELIC_USES_MIN = -1;
const RELIC_USES_MAX = 999;
const SESSION_MIN = 0;
const SESSION_MAX = 9999;

const FACTION_STATUSES = ['allied', 'friendly', 'neutral', 'watched', 'wanted', 'kos'] as const;
const RELIC_STATUSES = ['active', 'depleted', 'destroyed'] as const;
const BOUNTY_STATUSES = ['active', 'paid', 'cleared'] as const;
const HULL_TIERS = ['light', 'medium', 'heavy'] as const;

// ----------------------------------------------------------------------------
// Validation primitives. Return null on failure; caller treats null as reject.
// ----------------------------------------------------------------------------

function str(v: unknown, max: number, allowEmpty = false): string | null {
  if (typeof v !== 'string') return null;
  // Strip control chars (except \n and \t) and normalize whitespace edges lightly.
  // eslint-disable-next-line no-control-regex
  const cleaned = v.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  if (cleaned.length > max) return null;
  if (!allowEmpty && cleaned.trim().length === 0) return null;
  return cleaned;
}

function int(v: unknown, min: number, max: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v)) return null;
  if (v < min || v > max) return null;
  return v;
}

function oneOf<T extends string>(v: unknown, set: readonly T[]): T | null {
  return typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : null;
}

function isoDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const [y, m, d] = v.split('-').map((s) => Number(s));
  if (!y || !m || !d) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return v;
}

function stringList(v: unknown, maxItems: number, maxItemLen: number): string[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > maxItems) return null;
  const out: string[] = [];
  for (const item of v) {
    const s = str(item, maxItemLen, true);
    if (s === null) return null;
    out.push(s);
  }
  return out;
}

/**
 * Validate an inventory array. Accepts legacy string items from older clients
 * and upgrades them in place — the server is authoritative, so the next
 * broadcast carries the canonical shape.
 */
function inventoryList(v: unknown): InventoryItem[] | null {
  if (!Array.isArray(v)) return null;
  if (v.length > MAX_INVENTORY) return null;
  const out: InventoryItem[] = [];
  for (const raw of v) {
    if (typeof raw === 'string') {
      const name = str(raw, MAX_LIST_ITEM, true);
      if (name === null) return null;
      out.push({ id: uuid(), name, notes: '' });
      continue;
    }
    if (typeof raw !== 'object' || raw === null) return null;
    const rec = raw as Record<string, unknown>;
    const name = str(rec.name, MAX_LIST_ITEM, true);
    if (name === null) return null;
    const notes = str(rec.notes ?? '', MAX_SHORT, true);
    if (notes === null) return null;
    const id =
      typeof rec.id === 'string' && rec.id.length > 0 && rec.id.length <= 64
        ? rec.id
        : uuid();
    out.push({ id, name, notes });
  }
  return out;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function reject(reason: string): ApplyResult {
  return { ok: false, reason };
}

function ok(state: CrewData): ApplyResult {
  return { ok: true, state };
}

// ----------------------------------------------------------------------------
// Field whitelists for *.update actions — only these keys are allowed to
// be written through a partial update. Anything else in `fields` is ignored.
// ----------------------------------------------------------------------------

const CHARACTER_UPDATABLE: Array<keyof Character> = [
  'name', 'class', 'level', 'hp', 'maxHp',
  'agility', 'presence', 'strength', 'toughness', 'spirit',
  'silver', 'devilsLuck', 'conditions', 'featureNotes', 'inventory'
];

const CARGO_UPDATABLE: Array<keyof CargoItem> = ['name', 'slots', 'notes'];
const RELIC_UPDATABLE: Array<keyof Relic> = ['name', 'description', 'usesLeft', 'status'];
const FACTION_UPDATABLE: Array<keyof Faction> = ['name', 'status', 'note'];
const LOG_UPDATABLE: Array<keyof LogEntry> = ['session', 'date', 'title', 'body', 'author'];
const BOUNTY_UPDATABLE: Array<keyof Bounty> = ['target', 'amount', 'issuer', 'reason', 'status'];

// ----------------------------------------------------------------------------
// Sub-validators that turn an arbitrary partial payload into a safe patch.
// Return null on any invalid field (strict: one bad field rejects the whole
// update — keeps behavior predictable for the UI).
// ----------------------------------------------------------------------------

function validateShipValue(field: keyof Ship, value: unknown):
  | { ok: true; applied: Partial<Ship> }
  | { ok: false; reason: string } {
  switch (field) {
    case 'name':
    case 'class':
    case 'notes': {
      const v = str(value, field === 'notes' ? MAX_LONG : MAX_NAME, true);
      return v === null ? { ok: false, reason: 'invalid_string' } : { ok: true, applied: { [field]: v } };
    }
    case 'hp':
    case 'maxHp': {
      const v = int(value, HP_MIN, HP_MAX);
      return v === null ? { ok: false, reason: 'invalid_hp' } : { ok: true, applied: { [field]: v } };
    }
    case 'speed': {
      const v = int(value, SPEED_MIN, SPEED_MAX);
      return v === null ? { ok: false, reason: 'invalid_speed' } : { ok: true, applied: { speed: v } };
    }
    case 'skill': {
      const v = int(value, STAT_MIN, STAT_MAX);
      return v === null ? { ok: false, reason: 'invalid_skill' } : { ok: true, applied: { skill: v } };
    }
    case 'agility': {
      const v = int(value, STAT_MIN, STAT_MAX);
      return v === null ? { ok: false, reason: 'invalid_agility' } : { ok: true, applied: { agility: v } };
    }
    case 'broadsides':
    case 'smallArms':
    case 'ram': {
      const v = int(value, 0, 12);
      return v === null ? { ok: false, reason: 'invalid_die_size' } : { ok: true, applied: { [field]: v } };
    }
    case 'crewCount':
    case 'minCrew':
    case 'maxCrew': {
      const v = int(value, CREW_COUNT_MIN, CREW_COUNT_MAX);
      return v === null ? { ok: false, reason: 'invalid_crew_count' } : { ok: true, applied: { [field]: v } };
    }
    case 'cargoMax': {
      const v = int(value, CARGO_SLOTS_MIN, 9999);
      return v === null ? { ok: false, reason: 'invalid_cargo_max' } : { ok: true, applied: { cargoMax: v } };
    }
    case 'hullTier': {
      const v = oneOf(value, HULL_TIERS);
      return v === null ? { ok: false, reason: 'invalid_hull_tier' } : { ok: true, applied: { hullTier: v as HullTier } };
    }
    case 'upgrades': {
      const v = stringList(value, MAX_UPGRADES, MAX_LIST_ITEM);
      return v === null ? { ok: false, reason: 'invalid_upgrades' } : { ok: true, applied: { upgrades: v } };
    }
    case 'shanties': {
      const v = stringList(value, MAX_SHANTIES, MAX_LIST_ITEM);
      return v === null ? { ok: false, reason: 'invalid_shanties' } : { ok: true, applied: { shanties: v } };
    }
    default:
      return { ok: false, reason: 'unknown_field' };
  }
}

function validateCharacterPatch(input: Partial<Character>):
  | { ok: true; patch: Partial<Character> }
  | { ok: false; reason: string } {
  const patch: Partial<Character> = {};
  for (const key of CHARACTER_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'name':
      case 'class':
      case 'featureNotes': {
        const s = str(v, key === 'featureNotes' ? MAX_LONG : MAX_NAME, true);
        if (s === null) return { ok: false, reason: `invalid_${key}` };
        patch[key] = s;
        break;
      }
      case 'level': {
        const n = int(v, LEVEL_MIN, LEVEL_MAX);
        if (n === null) return { ok: false, reason: 'invalid_level' };
        patch.level = n;
        break;
      }
      case 'hp':
      case 'maxHp': {
        const n = int(v, HP_MIN, HP_MAX);
        if (n === null) return { ok: false, reason: `invalid_${key}` };
        patch[key] = n;
        break;
      }
      case 'agility':
      case 'presence':
      case 'strength':
      case 'toughness':
      case 'spirit': {
        const n = int(v, STAT_MIN, STAT_MAX);
        if (n === null) return { ok: false, reason: `invalid_${key}` };
        patch[key] = n;
        break;
      }
      case 'silver': {
        const n = int(v, SILVER_MIN, SILVER_MAX);
        if (n === null) return { ok: false, reason: 'invalid_silver' };
        patch.silver = n;
        break;
      }
      case 'devilsLuck': {
        const n = int(v, LUCK_MIN, LUCK_MAX);
        if (n === null) return { ok: false, reason: 'invalid_luck' };
        patch.devilsLuck = n;
        break;
      }
      case 'conditions': {
        const list = stringList(v, MAX_CONDITIONS, MAX_NAME);
        if (list === null) return { ok: false, reason: 'invalid_conditions' };
        patch.conditions = list;
        break;
      }
      case 'inventory': {
        const list = inventoryList(v);
        if (list === null) return { ok: false, reason: 'invalid_inventory' };
        patch.inventory = list;
        break;
      }
    }
  }
  return { ok: true, patch };
}

function validateCargoPatch(input: Partial<CargoItem>):
  | { ok: true; patch: Partial<CargoItem> }
  | { ok: false; reason: string } {
  const patch: Partial<CargoItem> = {};
  for (const key of CARGO_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'name': {
        const s = str(v, MAX_NAME, false);
        if (s === null) return { ok: false, reason: 'invalid_name' };
        patch.name = s;
        break;
      }
      case 'slots': {
        const n = int(v, CARGO_SLOTS_MIN, CARGO_SLOTS_MAX);
        if (n === null) return { ok: false, reason: 'invalid_slots' };
        patch.slots = n;
        break;
      }
      case 'notes': {
        const s = str(v, MAX_SHORT, true);
        if (s === null) return { ok: false, reason: 'invalid_notes' };
        patch.notes = s;
        break;
      }
    }
  }
  return { ok: true, patch };
}

function validateRelicPatch(input: Partial<Relic>):
  | { ok: true; patch: Partial<Relic> }
  | { ok: false; reason: string } {
  const patch: Partial<Relic> = {};
  for (const key of RELIC_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'name': {
        const s = str(v, MAX_NAME, false);
        if (s === null) return { ok: false, reason: 'invalid_name' };
        patch.name = s;
        break;
      }
      case 'description': {
        const s = str(v, MAX_LONG, true);
        if (s === null) return { ok: false, reason: 'invalid_description' };
        patch.description = s;
        break;
      }
      case 'usesLeft': {
        if (v === null) {
          patch.usesLeft = null;
        } else {
          const n = int(v, RELIC_USES_MIN, RELIC_USES_MAX);
          if (n === null) return { ok: false, reason: 'invalid_uses' };
          patch.usesLeft = n;
        }
        break;
      }
      case 'status': {
        const s = oneOf(v, RELIC_STATUSES);
        if (s === null) return { ok: false, reason: 'invalid_status' };
        patch.status = s as RelicStatus;
        break;
      }
    }
  }
  return { ok: true, patch };
}

function validateFactionPatch(input: Partial<Faction>):
  | { ok: true; patch: Partial<Faction> }
  | { ok: false; reason: string } {
  const patch: Partial<Faction> = {};
  for (const key of FACTION_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'name': {
        const s = str(v, MAX_NAME, false);
        if (s === null) return { ok: false, reason: 'invalid_name' };
        patch.name = s;
        break;
      }
      case 'status': {
        const s = oneOf(v, FACTION_STATUSES);
        if (s === null) return { ok: false, reason: 'invalid_status' };
        patch.status = s as FactionStatus;
        break;
      }
      case 'note': {
        const s = str(v, MAX_SHORT, true);
        if (s === null) return { ok: false, reason: 'invalid_note' };
        patch.note = s;
        break;
      }
    }
  }
  return { ok: true, patch };
}

function validateLogPatch(input: Partial<LogEntry>):
  | { ok: true; patch: Partial<LogEntry> }
  | { ok: false; reason: string } {
  const patch: Partial<LogEntry> = {};
  for (const key of LOG_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'session': {
        const n = int(v, SESSION_MIN, SESSION_MAX);
        if (n === null) return { ok: false, reason: 'invalid_session' };
        patch.session = n;
        break;
      }
      case 'date': {
        const s = isoDate(v);
        if (s === null) return { ok: false, reason: 'invalid_date' };
        patch.date = s;
        break;
      }
      case 'title': {
        const s = str(v, MAX_NAME, true);
        if (s === null) return { ok: false, reason: 'invalid_title' };
        patch.title = s;
        break;
      }
      case 'body': {
        const s = str(v, MAX_LONG, true);
        if (s === null) return { ok: false, reason: 'invalid_body' };
        patch.body = s;
        break;
      }
      case 'author': {
        const s = str(v, MAX_NAME, true);
        if (s === null) return { ok: false, reason: 'invalid_author' };
        patch.author = s;
        break;
      }
    }
  }
  return { ok: true, patch };
}

function validateBountyPatch(input: Partial<Bounty>):
  | { ok: true; patch: Partial<Bounty> }
  | { ok: false; reason: string } {
  const patch: Partial<Bounty> = {};
  for (const key of BOUNTY_UPDATABLE) {
    if (!(key in input)) continue;
    const v = input[key];
    switch (key) {
      case 'target':
      case 'issuer': {
        const s = str(v, MAX_NAME, true);
        if (s === null) return { ok: false, reason: `invalid_${key}` };
        patch[key] = s;
        break;
      }
      case 'amount': {
        const n = int(v, 0, SILVER_MAX);
        if (n === null) return { ok: false, reason: 'invalid_amount' };
        patch.amount = n;
        break;
      }
      case 'reason': {
        const s = str(v, MAX_SHORT, true);
        if (s === null) return { ok: false, reason: 'invalid_reason' };
        patch.reason = s;
        break;
      }
      case 'status': {
        const s = oneOf(v, BOUNTY_STATUSES);
        if (s === null) return { ok: false, reason: 'invalid_status' };
        patch.status = s as BountyStatus;
        break;
      }
    }
  }
  return { ok: true, patch };
}

// ----------------------------------------------------------------------------
// The reducer proper.
// ----------------------------------------------------------------------------

export function applyAction(state: CrewData, action: Action): ApplyResult {
  const next = clone(state);

  switch (action.kind) {
    // ======================== Ship ========================================
    case 'ship.set': {
      const v = validateShipValue(action.field, action.value);
      if (!v.ok) return reject(v.reason);
      next.ship = { ...next.ship, ...v.applied };
      return ok(next);
    }

    case 'ship.addUpgrade': {
      const text = str(action.text, MAX_LIST_ITEM, false);
      if (!text) return reject('invalid_text');
      if (next.ship.upgrades.length >= MAX_UPGRADES) return reject('too_many_upgrades');
      next.ship.upgrades = [...next.ship.upgrades, text];
      return ok(next);
    }

    case 'ship.removeUpgrade': {
      const i = int(action.index, 0, MAX_UPGRADES - 1);
      if (i === null || i >= next.ship.upgrades.length) return reject('bad_index');
      next.ship.upgrades = next.ship.upgrades.filter((_, idx) => idx !== i);
      return ok(next);
    }

    case 'ship.addShanty': {
      const text = str(action.text, MAX_LIST_ITEM, false);
      if (!text) return reject('invalid_text');
      if (next.ship.shanties.length >= MAX_SHANTIES) return reject('too_many_shanties');
      next.ship.shanties = [...next.ship.shanties, text];
      return ok(next);
    }

    case 'ship.removeShanty': {
      const i = int(action.index, 0, MAX_SHANTIES - 1);
      if (i === null || i >= next.ship.shanties.length) return reject('bad_index');
      next.ship.shanties = next.ship.shanties.filter((_, idx) => idx !== i);
      return ok(next);
    }

    // ==================== Characters ======================================
    case 'character.create': {
      if (next.characters.length >= MAX_CHARS_LIVING) return reject('crew_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (
        next.characters.some((c) => c.id === id) ||
        next.deceased.some((c) => c.id === id)
      ) return reject('id_collision');
      const blank: Character = {
        id,
        name: '',
        class: 'Rapscallion',
        level: 0,
        hp: 4,
        maxHp: 4,
        agility: 0,
        presence: 0,
        strength: 0,
        toughness: 0,
        spirit: 0,
        silver: 0,
        devilsLuck: 0,
        conditions: [],
        featureNotes: '',
        inventory: []
      };
      next.characters = [...next.characters, blank];
      return ok(next);
    }

    case 'character.update': {
      const idx = next.characters.findIndex((c) => c.id === action.id);
      const poolIsLiving = idx >= 0;
      const deceasedIdx = poolIsLiving ? -1 : next.deceased.findIndex((c) => c.id === action.id);
      if (!poolIsLiving && deceasedIdx < 0) return reject('unknown_character');
      const result = validateCharacterPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      const pool = poolIsLiving ? next.characters : next.deceased;
      const i = poolIsLiving ? idx : deceasedIdx;
      const current = pool[i];
      if (!current) return reject('unknown_character');
      pool[i] = { ...current, ...result.patch };
      return ok(next);
    }

    case 'character.die': {
      const idx = next.characters.findIndex((c) => c.id === action.id);
      if (idx < 0) return reject('unknown_character');
      const victim = next.characters[idx];
      if (!victim) return reject('unknown_character');
      next.characters = next.characters.filter((_, i) => i !== idx);
      next.deceased = [...next.deceased, victim];
      return ok(next);
    }

    case 'character.revive': {
      if (next.characters.length >= MAX_CHARS_LIVING) return reject('crew_full');
      const idx = next.deceased.findIndex((c) => c.id === action.id);
      if (idx < 0) return reject('unknown_character');
      const risen = next.deceased[idx];
      if (!risen) return reject('unknown_character');
      next.deceased = next.deceased.filter((_, i) => i !== idx);
      next.characters = [...next.characters, risen];
      return ok(next);
    }

    case 'character.remove': {
      const beforeLiving = next.characters.length;
      const beforeDead = next.deceased.length;
      next.characters = next.characters.filter((c) => c.id !== action.id);
      next.deceased = next.deceased.filter((c) => c.id !== action.id);
      if (next.characters.length === beforeLiving && next.deceased.length === beforeDead) {
        return reject('unknown_character');
      }
      return ok(next);
    }

    // ===================== Manifest =======================================
    case 'doubloons.set': {
      const v = int(action.value, DOUBLOONS_MIN, DOUBLOONS_MAX);
      if (v === null) return reject('invalid_doubloons');
      next.manifest.doubloons = v;
      return ok(next);
    }

    case 'doubloons.adjust': {
      const d = int(action.delta, -DOUBLOONS_MAX, DOUBLOONS_MAX);
      if (d === null) return reject('invalid_delta');
      const sum = next.manifest.doubloons + d;
      if (sum < DOUBLOONS_MIN || sum > DOUBLOONS_MAX) return reject('out_of_range');
      next.manifest.doubloons = sum;
      return ok(next);
    }

    case 'cargo.add': {
      if (next.manifest.cargo.length >= MAX_CARGO) return reject('cargo_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (next.manifest.cargo.some((c) => c.id === id)) return reject('id_collision');
      const name = str(action.item?.name, MAX_NAME, false);
      if (!name) return reject('invalid_name');
      const slots = int(action.item?.slots, CARGO_SLOTS_MIN, CARGO_SLOTS_MAX);
      if (slots === null) return reject('invalid_slots');
      const notes = str(action.item?.notes ?? '', MAX_SHORT, true);
      if (notes === null) return reject('invalid_notes');
      const item: CargoItem = { id, name, slots, notes };
      next.manifest.cargo = [...next.manifest.cargo, item];
      return ok(next);
    }

    case 'cargo.update': {
      const idx = next.manifest.cargo.findIndex((c) => c.id === action.id);
      if (idx < 0) return reject('unknown_cargo');
      const result = validateCargoPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      const current = next.manifest.cargo[idx];
      if (!current) return reject('unknown_cargo');
      next.manifest.cargo[idx] = { ...current, ...result.patch };
      return ok(next);
    }

    case 'cargo.remove': {
      const len = next.manifest.cargo.length;
      next.manifest.cargo = next.manifest.cargo.filter((c) => c.id !== action.id);
      if (next.manifest.cargo.length === len) return reject('unknown_cargo');
      return ok(next);
    }

    case 'relic.add': {
      if (next.manifest.relics.length >= MAX_RELICS) return reject('relics_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (next.manifest.relics.some((r) => r.id === id)) return reject('id_collision');
      const name = str(action.relic?.name, MAX_NAME, false);
      if (!name) return reject('invalid_name');
      const description = str(action.relic?.description ?? '', MAX_LONG, true);
      if (description === null) return reject('invalid_description');
      const status = oneOf(action.relic?.status ?? 'active', RELIC_STATUSES);
      if (!status) return reject('invalid_status');
      let usesLeft: number | null;
      const raw = action.relic?.usesLeft;
      if (raw === null || raw === undefined) {
        usesLeft = null;
      } else {
        const n = int(raw, RELIC_USES_MIN, RELIC_USES_MAX);
        if (n === null) return reject('invalid_uses');
        usesLeft = n;
      }
      const relic: Relic = { id, name, description, usesLeft, status: status as RelicStatus };
      next.manifest.relics = [...next.manifest.relics, relic];
      return ok(next);
    }

    case 'relic.update': {
      const idx = next.manifest.relics.findIndex((r) => r.id === action.id);
      if (idx < 0) return reject('unknown_relic');
      const result = validateRelicPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      const current = next.manifest.relics[idx];
      if (!current) return reject('unknown_relic');
      next.manifest.relics[idx] = { ...current, ...result.patch };
      return ok(next);
    }

    case 'relic.remove': {
      const len = next.manifest.relics.length;
      next.manifest.relics = next.manifest.relics.filter((r) => r.id !== action.id);
      if (next.manifest.relics.length === len) return reject('unknown_relic');
      return ok(next);
    }

    // ===================== Factions =======================================
    case 'faction.add': {
      if (next.factions.length >= MAX_FACTIONS) return reject('factions_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (next.factions.some((f) => f.id === id)) return reject('id_collision');
      const name = str(action.name, MAX_NAME, false);
      if (!name) return reject('invalid_name');
      const faction: Faction = { id, name, status: 'neutral', note: '' };
      next.factions = [...next.factions, faction];
      return ok(next);
    }

    case 'faction.update': {
      const idx = next.factions.findIndex((f) => f.id === action.id);
      if (idx < 0) return reject('unknown_faction');
      const result = validateFactionPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      const current = next.factions[idx];
      if (!current) return reject('unknown_faction');
      next.factions[idx] = { ...current, ...result.patch };
      return ok(next);
    }

    case 'faction.remove': {
      const len = next.factions.length;
      next.factions = next.factions.filter((f) => f.id !== action.id);
      if (next.factions.length === len) return reject('unknown_faction');
      return ok(next);
    }

    // ========================= Log ========================================
    case 'log.add': {
      if (next.log.length >= MAX_LOG) return reject('log_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (next.log.some((l) => l.id === id)) return reject('id_collision');
      const session = int(action.entry?.session, SESSION_MIN, SESSION_MAX);
      if (session === null) return reject('invalid_session');
      const date = isoDate(action.entry?.date);
      if (!date) return reject('invalid_date');
      const title = str(action.entry?.title ?? '', MAX_NAME, true);
      if (title === null) return reject('invalid_title');
      const body = str(action.entry?.body ?? '', MAX_LONG, true);
      if (body === null) return reject('invalid_body');
      const author = str(action.entry?.author ?? '', MAX_NAME, true);
      if (author === null) return reject('invalid_author');
      const entry: LogEntry = { id, session, date, title, body, author };
      next.log = [...next.log, entry];
      return ok(next);
    }

    case 'log.update': {
      const idx = next.log.findIndex((l) => l.id === action.id);
      if (idx < 0) return reject('unknown_log');
      const result = validateLogPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      const current = next.log[idx];
      if (!current) return reject('unknown_log');
      next.log[idx] = { ...current, ...result.patch };
      return ok(next);
    }

    case 'log.remove': {
      const len = next.log.length;
      next.log = next.log.filter((l) => l.id !== action.id);
      if (next.log.length === len) return reject('unknown_log');
      return ok(next);
    }

    // ======================== Bounties ====================================
    case 'bounty.add': {
      if (next.bounties.length >= MAX_BOUNTIES) return reject('bounties_full');
      const id = validId(action.id);
      if (!id) return reject('invalid_id');
      if (
        next.bounties.some((b) => b.id === id) ||
        next.bountiesResolved.some((b) => b.id === id)
      ) return reject('id_collision');
      const target = str(action.bounty?.target, MAX_NAME, false);
      if (!target) return reject('invalid_target');
      const amount = int(action.bounty?.amount, 0, SILVER_MAX);
      if (amount === null) return reject('invalid_amount');
      const issuer = str(action.bounty?.issuer ?? '', MAX_NAME, true);
      if (issuer === null) return reject('invalid_issuer');
      const reason = str(action.bounty?.reason ?? '', MAX_SHORT, true);
      if (reason === null) return reject('invalid_reason');
      const status = oneOf(action.bounty?.status ?? 'active', BOUNTY_STATUSES);
      if (!status) return reject('invalid_status');
      const bounty: Bounty = {
        id,
        target,
        amount,
        issuer,
        reason,
        status: status as BountyStatus
      };
      next.bounties = [...next.bounties, bounty];
      return ok(next);
    }

    case 'bounty.update': {
      const idx = next.bounties.findIndex((b) => b.id === action.id);
      const resIdx = idx < 0 ? next.bountiesResolved.findIndex((b) => b.id === action.id) : -1;
      if (idx < 0 && resIdx < 0) return reject('unknown_bounty');
      const result = validateBountyPatch(action.fields ?? {});
      if (!result.ok) return reject(result.reason);
      if (idx >= 0) {
        const current = next.bounties[idx];
        if (!current) return reject('unknown_bounty');
        next.bounties[idx] = { ...current, ...result.patch };
      } else {
        const current = next.bountiesResolved[resIdx];
        if (!current) return reject('unknown_bounty');
        next.bountiesResolved[resIdx] = { ...current, ...result.patch };
      }
      return ok(next);
    }

    case 'bounty.resolve': {
      const idx = next.bounties.findIndex((b) => b.id === action.id);
      if (idx < 0) return reject('unknown_bounty');
      const target = next.bounties[idx];
      if (!target) return reject('unknown_bounty');
      const s = oneOf(action.status, ['paid', 'cleared'] as const);
      if (!s) return reject('invalid_status');
      const resolved: Bounty = { ...target, status: s };
      next.bounties = next.bounties.filter((_, i) => i !== idx);
      next.bountiesResolved = [resolved, ...next.bountiesResolved].slice(
        0,
        MAX_BOUNTIES_RESOLVED
      );
      return ok(next);
    }

    case 'bounty.remove': {
      const lenA = next.bounties.length;
      const lenB = next.bountiesResolved.length;
      next.bounties = next.bounties.filter((b) => b.id !== action.id);
      next.bountiesResolved = next.bountiesResolved.filter((b) => b.id !== action.id);
      if (next.bounties.length === lenA && next.bountiesResolved.length === lenB) {
        return reject('unknown_bounty');
      }
      return ok(next);
    }

    default: {
      // Exhaustiveness check: if the Action union gains a kind, TypeScript
      // will refuse to compile this file until a case is added above.
      const _never: never = action;
      void _never;
      return reject('unknown_action');
    }
  }
}

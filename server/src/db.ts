import DatabaseCtor, { type Database as SqliteDb } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { defaultCrewData } from './crew.js';
import { uuid } from './ids.js';
import {
  generateCrewCodeCandidate,
  isValidCrewCodeShape
} from './names.js';
import type { CrewData, CrewRow } from './types.js';

// ----------------------------------------------------------------------------
// Schema
// ----------------------------------------------------------------------------

/**
 * SQLite schema. STRICT tables enforce column types (SQLite 3.37+). Foreign
 * keys are declared ON DELETE CASCADE so tearing down a crew tears down its
 * membership rows, and removing a user tears down their memberships. CHECK
 * constraints pin the small string enums at write time.
 *
 * Any change to this schema belongs in a numbered migration, not inline. We
 * don't have a migration runner yet — add one the first time it's needed.
 */
const SCHEMA_SQL = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS crews (
  code          TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  data          TEXT NOT NULL,
  version       INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_crews_last_seen ON crews (last_seen_at);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  display_name  TEXT NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
) STRICT;

CREATE INDEX IF NOT EXISTS idx_users_last_seen ON users (last_seen_at);

CREATE TABLE IF NOT EXISTS crew_members (
  crew_code     TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'crew',
  display_name  TEXT NOT NULL DEFAULT '',
  joined_at     INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL,
  PRIMARY KEY (crew_code, user_id),
  FOREIGN KEY (crew_code) REFERENCES crews(code) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (role IN ('captain', 'crew'))
) STRICT;

CREATE INDEX IF NOT EXISTS idx_crew_members_user ON crew_members (user_id);
CREATE INDEX IF NOT EXISTS idx_crew_members_seen ON crew_members (crew_code, last_seen_at);
`;

// ----------------------------------------------------------------------------
// Row shapes (raw SQLite rows)
// ----------------------------------------------------------------------------

type CrewSqlRow = {
  code: string;
  name: string;
  data: string;
  version: number;
  created_at: number;
  updated_at: number;
  last_seen_at: number;
};

type UserSqlRow = {
  id: string;
  display_name: string;
  created_at: number;
  last_seen_at: number;
};

type MemberSqlRow = {
  crew_code: string;
  user_id: string;
  role: 'captain' | 'crew';
  display_name: string;
  joined_at: number;
  last_seen_at: number;
};

// ----------------------------------------------------------------------------
// Domain shapes exposed to callers
// ----------------------------------------------------------------------------

export type UserRow = {
  id: string;
  displayName: string;
  createdAt: number;
  lastSeenAt: number;
};

export type MemberRow = {
  crewCode: string;
  userId: string;
  role: 'captain' | 'crew';
  displayName: string;
  joinedAt: number;
  lastSeenAt: number;
};

export type LoadedCrew = {
  row: CrewRow;
  data: CrewData;
};

export type CreateCrewInput = {
  name: string;
  shipName?: string;
  creatorUserId: string;
  creatorDisplayName?: string;
};

export type CreateCrewResult = {
  code: string;
  row: CrewRow;
  data: CrewData;
};

// ----------------------------------------------------------------------------
// DbHandle: everything the rest of the server needs from persistence.
// ----------------------------------------------------------------------------

export type DbHandle = {
  raw: SqliteDb;

  createCrew(input: CreateCrewInput, now?: number): CreateCrewResult;
  getCrew(code: string): LoadedCrew | null;
  crewExists(code: string): boolean;
  saveCrewData(code: string, data: CrewData, nextVersion: number, now?: number): void;
  touchCrewLastSeen(code: string, now?: number): void;

  upsertUser(id: string, displayName: string, now?: number): UserRow;
  getUser(id: string): UserRow | null;
  setUserDisplayName(id: string, displayName: string, now?: number): void;

  upsertMember(
    crewCode: string,
    userId: string,
    role: 'captain' | 'crew',
    displayName: string,
    now?: number
  ): void;
  touchMember(crewCode: string, userId: string, now?: number): void;
  setMemberDisplayName(crewCode: string, userId: string, displayName: string, now?: number): void;
  listMembers(crewCode: string): MemberRow[];
  listUserCrews(userId: string): CrewRow[];

  close(): void;
};

// ----------------------------------------------------------------------------
// Row mappers
// ----------------------------------------------------------------------------

function mapCrewRow(r: CrewSqlRow): CrewRow {
  return {
    code: r.code,
    name: r.name,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastSeenAt: r.last_seen_at
  };
}

function mapCrewLoaded(r: CrewSqlRow): LoadedCrew {
  const data = normalizeCrewData(JSON.parse(r.data) as CrewData);
  return { row: mapCrewRow(r), data };
}

/**
 * Upgrade older-shape data in place as it's read. The JSON blob is treated as
 * mutable: as the schema evolves we convert legacy shapes to the current one
 * here, and the very next broadcast writes the canonical form back to disk.
 * Cheaper than a migration runner for a single-table persistence layer.
 */
function normalizeCrewData(data: CrewData): CrewData {
  const pools: Array<CrewData['characters']> = [data.characters, data.deceased];
  for (const pool of pools) {
    for (const c of pool) {
      if (Array.isArray(c.inventory)) {
        c.inventory = c.inventory.map((item) => {
          if (typeof item === 'string') {
            return { id: uuid(), name: item, notes: '' };
          }
          return item;
        });
      }
    }
  }
  return data;
}

function mapUserRow(r: UserSqlRow): UserRow {
  return {
    id: r.id,
    displayName: r.display_name,
    createdAt: r.created_at,
    lastSeenAt: r.last_seen_at
  };
}

function mapMemberRow(r: MemberSqlRow): MemberRow {
  return {
    crewCode: r.crew_code,
    userId: r.user_id,
    role: r.role,
    displayName: r.display_name,
    joinedAt: r.joined_at,
    lastSeenAt: r.last_seen_at
  };
}

// ----------------------------------------------------------------------------
// Errors
// ----------------------------------------------------------------------------

export class CrewCodeCollisionError extends Error {
  constructor() {
    super('Could not allocate a unique crew code after many attempts.');
    this.name = 'CrewCodeCollisionError';
  }
}

export class CrewNotFoundError extends Error {
  constructor(public readonly code: string) {
    super(`Crew not found: ${code}`);
    this.name = 'CrewNotFoundError';
  }
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

export type OpenDbOptions = {
  /**
   * Custom RNG for crew-code generation. Useful in tests to force collisions.
   */
  codeRng?: () => number;
  /**
   * Max attempts to generate a unique crew code before giving up. Default 50;
   * space is ~125k so we effectively never hit this in production.
   */
  codeMaxAttempts?: number;
};

export function openDb(filename: string, opts: OpenDbOptions = {}): DbHandle {
  if (filename !== ':memory:') {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new DatabaseCtor(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  db.exec(SCHEMA_SQL);

  const codeRng = opts.codeRng ?? Math.random;
  const codeMaxAttempts = opts.codeMaxAttempts ?? 50;

  // --- prepared statements (built once, reused forever) ---
  const stmts = {
    insertCrew: db.prepare<
      [string, string, string, number, number, number]
    >(`
      INSERT INTO crews (code, name, data, created_at, updated_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `),
    selectCrewByCode: db.prepare<[string], CrewSqlRow>(`
      SELECT code, name, data, version, created_at, updated_at, last_seen_at
      FROM crews WHERE code = ?
    `),
    selectCrewExists: db.prepare<[string], { n: number }>(`
      SELECT 1 AS n FROM crews WHERE code = ? LIMIT 1
    `),
    updateCrewData: db.prepare<[string, number, number, number, string]>(`
      UPDATE crews
      SET data = ?, version = ?, updated_at = ?, last_seen_at = ?
      WHERE code = ?
    `),
    touchCrewLastSeen: db.prepare<[number, string]>(`
      UPDATE crews SET last_seen_at = ? WHERE code = ?
    `),

    upsertUser: db.prepare<[string, string, number, number]>(`
      INSERT INTO users (id, display_name, created_at, last_seen_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        display_name = CASE
          WHEN excluded.display_name = '' THEN users.display_name
          ELSE excluded.display_name
        END,
        last_seen_at = excluded.last_seen_at
    `),
    selectUser: db.prepare<[string], UserSqlRow>(`
      SELECT id, display_name, created_at, last_seen_at
      FROM users WHERE id = ?
    `),
    updateUserDisplayName: db.prepare<[string, number, string]>(`
      UPDATE users SET display_name = ?, last_seen_at = ? WHERE id = ?
    `),

    upsertMember: db.prepare<
      [string, string, 'captain' | 'crew', string, number, number]
    >(`
      INSERT INTO crew_members
        (crew_code, user_id, role, display_name, joined_at, last_seen_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(crew_code, user_id) DO UPDATE SET
        display_name = CASE
          WHEN excluded.display_name = '' THEN crew_members.display_name
          ELSE excluded.display_name
        END,
        last_seen_at = excluded.last_seen_at
    `),
    touchMember: db.prepare<[number, string, string]>(`
      UPDATE crew_members SET last_seen_at = ?
      WHERE crew_code = ? AND user_id = ?
    `),
    updateMemberDisplayName: db.prepare<[string, number, string, string]>(`
      UPDATE crew_members SET display_name = ?, last_seen_at = ?
      WHERE crew_code = ? AND user_id = ?
    `),
    selectMembers: db.prepare<[string], MemberSqlRow>(`
      SELECT crew_code, user_id, role, display_name, joined_at, last_seen_at
      FROM crew_members WHERE crew_code = ?
      ORDER BY joined_at ASC
    `),
    selectUserCrews: db.prepare<[string], CrewSqlRow>(`
      SELECT c.code, c.name, c.data, c.version, c.created_at, c.updated_at, c.last_seen_at
      FROM crews c
      INNER JOIN crew_members m ON m.crew_code = c.code
      WHERE m.user_id = ?
      ORDER BY m.last_seen_at DESC
    `)
  };

  function generateUniqueCode(): string {
    for (let i = 0; i < codeMaxAttempts; i++) {
      const candidate = generateCrewCodeCandidate(codeRng);
      if (!isValidCrewCodeShape(candidate)) continue;
      const hit = stmts.selectCrewExists.get(candidate);
      if (!hit) return candidate;
    }
    throw new CrewCodeCollisionError();
  }

  const createCrewTx = db.transaction(
    (input: CreateCrewInput, now: number): CreateCrewResult => {
      const code = generateUniqueCode();
      const data = defaultCrewData(input.shipName);
      const serialized = JSON.stringify(data);

      stmts.insertCrew.run(code, input.name, serialized, now, now, now);

      // Ensure creator user exists (a no-op if already registered).
      stmts.upsertUser.run(
        input.creatorUserId,
        input.creatorDisplayName ?? '',
        now,
        now
      );
      stmts.upsertMember.run(
        code,
        input.creatorUserId,
        'captain',
        input.creatorDisplayName ?? '',
        now,
        now
      );

      const row = stmts.selectCrewByCode.get(code);
      if (!row) throw new Error('race: crew vanished right after insert');
      return { code, ...mapCrewLoaded(row) };
    }
  );

  return {
    raw: db,

    createCrew(input, now = Date.now()) {
      return createCrewTx(input, now);
    },

    getCrew(code) {
      const r = stmts.selectCrewByCode.get(code);
      return r ? mapCrewLoaded(r) : null;
    },

    crewExists(code) {
      return Boolean(stmts.selectCrewExists.get(code));
    },

    saveCrewData(code, data, nextVersion, now = Date.now()) {
      const info = stmts.updateCrewData.run(
        JSON.stringify(data),
        nextVersion,
        now,
        now,
        code
      );
      if (info.changes === 0) throw new CrewNotFoundError(code);
    },

    touchCrewLastSeen(code, now = Date.now()) {
      stmts.touchCrewLastSeen.run(now, code);
    },

    upsertUser(id, displayName, now = Date.now()) {
      stmts.upsertUser.run(id, displayName, now, now);
      const row = stmts.selectUser.get(id);
      if (!row) throw new Error('race: user vanished right after upsert');
      return mapUserRow(row);
    },

    getUser(id) {
      const r = stmts.selectUser.get(id);
      return r ? mapUserRow(r) : null;
    },

    setUserDisplayName(id, displayName, now = Date.now()) {
      stmts.updateUserDisplayName.run(displayName, now, id);
    },

    upsertMember(crewCode, userId, role, displayName, now = Date.now()) {
      stmts.upsertMember.run(crewCode, userId, role, displayName, now, now);
    },

    touchMember(crewCode, userId, now = Date.now()) {
      stmts.touchMember.run(now, crewCode, userId);
    },

    setMemberDisplayName(crewCode, userId, displayName, now = Date.now()) {
      stmts.updateMemberDisplayName.run(displayName, now, crewCode, userId);
    },

    listMembers(crewCode) {
      return stmts.selectMembers.all(crewCode).map(mapMemberRow);
    },

    listUserCrews(userId) {
      return stmts.selectUserCrews.all(userId).map(mapCrewRow);
    },

    close() {
      db.close();
    }
  };
}

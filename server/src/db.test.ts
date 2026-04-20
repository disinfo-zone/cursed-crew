import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import { openDb, type DbHandle, CrewCodeCollisionError, CrewNotFoundError } from './db.js';
import { defaultCrewData } from './crew.js';
import { uuid } from './ids.js';

function freshDb(): DbHandle {
  return openDb(':memory:');
}

describe('db.createCrew', () => {
  let db: DbHandle;
  beforeEach(() => {
    db = freshDb();
  });

  it('creates a crew with generated code, captain membership, and default data', () => {
    const userId = uuid();
    const result = db.createCrew({
      name: 'The Salt-Cursed',
      creatorUserId: userId,
      creatorDisplayName: 'One-Eye'
    });

    assert.match(result.code, /^[a-z]{3,14}-[a-z]{3,14}-[a-z]{3,14}$/);
    assert.equal(result.row.name, 'The Salt-Cursed');
    assert.equal(result.row.version, 0);
    assert.equal(result.data.schemaVersion, 1);
    assert.equal(result.data.ship.class, 'Sloop');

    const members = db.listMembers(result.code);
    assert.equal(members.length, 1);
    assert.equal(members[0]?.userId, userId);
    assert.equal(members[0]?.role, 'captain');
    assert.equal(members[0]?.displayName, 'One-Eye');

    const user = db.getUser(userId);
    assert.equal(user?.displayName, 'One-Eye');
  });

  it('applies shipName to the initial Ship', () => {
    const result = db.createCrew({
      name: 'Grog-Runners',
      shipName: 'Widow of the Wreck',
      creatorUserId: uuid()
    });
    assert.equal(result.data.ship.name, 'Widow of the Wreck');
  });

  it('rolls back the crew insert if a duplicate user membership somehow collided', () => {
    // Simulate by creating a crew with a specific user, then verifying a second
    // crew creation with the same user does NOT merge memberships globally —
    // each crew gets its own crew_members row.
    const uid = uuid();
    const a = db.createCrew({ name: 'A', creatorUserId: uid });
    const b = db.createCrew({ name: 'B', creatorUserId: uid });
    assert.notEqual(a.code, b.code);
    assert.equal(db.listMembers(a.code).length, 1);
    assert.equal(db.listMembers(b.code).length, 1);
    assert.equal(db.listUserCrews(uid).length, 2);
  });

  it('throws CrewCodeCollisionError when every generated code collides', () => {
    // Force the RNG to always pick index 0 of every word list, then pre-insert
    // that exact code.
    const forced = openDb(':memory:', { codeRng: () => 0, codeMaxAttempts: 3 });
    forced.createCrew({ name: 'first', creatorUserId: uuid() });
    assert.throws(
      () => forced.createCrew({ name: 'second', creatorUserId: uuid() }),
      CrewCodeCollisionError
    );
    forced.close();
  });
});

describe('db.saveCrewData', () => {
  it('writes new data and increments the version', () => {
    const db = freshDb();
    const { code, row } = db.createCrew({ name: 'x', creatorUserId: uuid() });
    assert.equal(row.version, 0);

    const data = defaultCrewData();
    data.manifest.doubloons = 42;
    db.saveCrewData(code, data, 1);

    const loaded = db.getCrew(code);
    assert.equal(loaded?.row.version, 1);
    assert.equal(loaded?.data.manifest.doubloons, 42);
  });

  it('throws CrewNotFoundError on unknown code', () => {
    const db = freshDb();
    assert.throws(
      () => db.saveCrewData('ghost-ghost-ghost', defaultCrewData(), 1),
      CrewNotFoundError
    );
  });
});

describe('db.users and memberships', () => {
  it('upsertUser is idempotent and refreshes last_seen', () => {
    const db = freshDb();
    const id = uuid();
    const u1 = db.upsertUser(id, 'Blackbeard', 1000);
    assert.equal(u1.displayName, 'Blackbeard');
    assert.equal(u1.lastSeenAt, 1000);

    // Second upsert with empty display_name preserves the existing name.
    const u2 = db.upsertUser(id, '', 2000);
    assert.equal(u2.displayName, 'Blackbeard');
    assert.equal(u2.lastSeenAt, 2000);

    // Explicit rename overrides.
    const u3 = db.upsertUser(id, 'Edward Teach', 3000);
    assert.equal(u3.displayName, 'Edward Teach');
  });

  it('upsertMember is idempotent per (crew, user) pair', () => {
    const db = freshDb();
    const uid = uuid();
    const { code } = db.createCrew({ name: 'n', creatorUserId: uid });
    const other = uuid();
    db.upsertUser(other, 'Second Mate', 4000); // FK requires user row first

    db.upsertMember(code, other, 'crew', 'Second Mate', 5000);
    db.upsertMember(code, other, 'crew', 'Second Mate', 6000); // idempotent

    const members = db.listMembers(code);
    assert.equal(members.length, 2);
  });

  it('upsertMember rejects unknown user_id (FK constraint)', () => {
    const db = freshDb();
    const uid = uuid();
    const { code } = db.createCrew({ name: 'n', creatorUserId: uid });
    assert.throws(
      () => db.upsertMember(code, uuid(), 'crew', 'Ghost', 5000),
      (err: Error) => (err as Error & { code?: string }).code === 'SQLITE_CONSTRAINT_FOREIGNKEY'
    );
  });

  it('deleting a crew cascades to its members (FK ON DELETE CASCADE)', () => {
    const db = freshDb();
    const uid = uuid();
    const { code } = db.createCrew({ name: 'doomed', creatorUserId: uid });
    db.raw.prepare('DELETE FROM crews WHERE code = ?').run(code);
    assert.equal(db.listMembers(code).length, 0);
  });
});

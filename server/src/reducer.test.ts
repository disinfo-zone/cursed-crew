import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyAction } from './reducer.js';
import { defaultCrewData } from './crew.js';
import type { Action, CrewData } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function state(): CrewData {
  return defaultCrewData();
}

function step(s: CrewData, a: Action): CrewData {
  const r = applyAction(s, a);
  if (!r.ok) throw new Error(`action "${a.kind}" unexpectedly rejected: ${r.reason}`);
  return r.state;
}

function rejectWith(s: CrewData, a: Action, reason: string): void {
  const r = applyAction(s, a);
  if (r.ok) throw new Error(`action "${a.kind}" unexpectedly accepted`);
  assert.equal(r.reason, reason, `expected reason "${reason}", got "${r.reason}"`);
}

// ---------------------------------------------------------------------------
// Purity
// ---------------------------------------------------------------------------

describe('reducer.purity', () => {
  it('does not mutate the input state', () => {
    const s = state();
    const snapshot = JSON.stringify(s);
    step(s, { kind: 'doubloons.set', value: 777 });
    assert.equal(JSON.stringify(s), snapshot);
  });

  it('returns a fresh reference even on logically-unchanged edits', () => {
    const s = state();
    const next = step(s, { kind: 'ship.set', field: 'speed', value: s.ship.speed });
    assert.notStrictEqual(next, s);
    assert.notStrictEqual(next.ship, s.ship);
  });

  it('rejects a kind that is not in the union without crashing', () => {
    const s = state();
    // Casting to bypass TS — simulates a malicious/broken client.
    const r = applyAction(s, { kind: 'ship.explode' } as unknown as Action);
    assert.equal(r.ok, false);
  });
});

// ---------------------------------------------------------------------------
// Ship
// ---------------------------------------------------------------------------

describe('reducer.ship', () => {
  it('sets typed fields', () => {
    let s = state();
    s = step(s, { kind: 'ship.set', field: 'name', value: 'Widow of the Wreck' });
    s = step(s, { kind: 'ship.set', field: 'speed', value: 5 });
    s = step(s, { kind: 'ship.set', field: 'hullTier', value: 'heavy' });
    assert.equal(s.ship.name, 'Widow of the Wreck');
    assert.equal(s.ship.speed, 5);
    assert.equal(s.ship.hullTier, 'heavy');
  });

  it('rejects wrong-type values', () => {
    const s = state();
    rejectWith(s, { kind: 'ship.set', field: 'speed', value: 'fast' }, 'invalid_speed');
    rejectWith(s, { kind: 'ship.set', field: 'hullTier', value: 'titanium' }, 'invalid_hull_tier');
    rejectWith(s, { kind: 'ship.set', field: 'hp', value: 1.5 }, 'invalid_hp');
  });

  it('rejects unknown fields', () => {
    const s = state();
    rejectWith(
      s,
      { kind: 'ship.set', field: 'captain' as unknown as 'name', value: 'One-Eye' },
      'unknown_field'
    );
  });

  it('adds and removes upgrades', () => {
    let s = state();
    s = step(s, { kind: 'ship.addUpgrade', text: 'Iron-banded hull' });
    s = step(s, { kind: 'ship.addUpgrade', text: 'Ram prow' });
    assert.deepEqual(s.ship.upgrades, ['Iron-banded hull', 'Ram prow']);
    s = step(s, { kind: 'ship.removeUpgrade', index: 0 });
    assert.deepEqual(s.ship.upgrades, ['Ram prow']);
  });

  it('rejects empty upgrade text and out-of-range indexes', () => {
    let s = state();
    rejectWith(s, { kind: 'ship.addUpgrade', text: '  ' }, 'invalid_text');
    s = step(s, { kind: 'ship.addUpgrade', text: 'rig' });
    rejectWith(s, { kind: 'ship.removeUpgrade', index: 99 }, 'bad_index');
  });
});

// ---------------------------------------------------------------------------
// Characters
// ---------------------------------------------------------------------------

describe('reducer.characters', () => {
  it('creates up to the living cap and rejects beyond it', () => {
    let s = state();
    // default already has 1
    for (let i = 0; i < 7; i++) s = step(s, { kind: 'character.create', id: `c-${i}` });
    assert.equal(s.characters.length, 8);
    rejectWith(s, { kind: 'character.create', id: 'c-overflow' }, 'crew_full');
  });

  it('updates known fields and ignores unknown ones', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, {
      kind: 'character.update',
      id,
      fields: {
        name: 'Blackbeard',
        hp: 7,
        devilsLuck: 3,
        conditions: ['Bleeding'],
        // @ts-expect-error: unknown field ignored by whitelist
        email: 'bb@example.com'
      }
    });
    const c = s.characters[0]!;
    assert.equal(c.name, 'Blackbeard');
    assert.equal(c.hp, 7);
    assert.equal(c.devilsLuck, 3);
    assert.deepEqual(c.conditions, ['Bleeding']);
    // @ts-expect-error: email shouldn't be on Character
    assert.equal(c.email, undefined);
  });

  it('accepts inventory items with notes and preserves supplied ids', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, {
      kind: 'character.update',
      id,
      fields: {
        inventory: [
          { id: 'keep-me', name: 'Cutlass', notes: 'notched from the last boarding' },
          { id: '', name: 'Rum', notes: '' }
        ]
      }
    });
    const inv = s.characters[0]!.inventory;
    assert.equal(inv.length, 2);
    assert.equal(inv[0]!.id, 'keep-me');
    assert.equal(inv[0]!.notes, 'notched from the last boarding');
    // Empty-string id gets replaced with a fresh uuid.
    assert.ok(inv[1]!.id.length > 0);
    assert.notEqual(inv[1]!.id, '');
  });

  it('upgrades legacy string-array inventory to the object shape', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, {
      kind: 'character.update',
      id,
      fields: {
        inventory: ['cutlass', 'rope', 'rum'] as unknown as []
      }
    });
    const inv = s.characters[0]!.inventory;
    assert.equal(inv.length, 3);
    assert.equal(inv[0]!.name, 'cutlass');
    assert.equal(inv[0]!.notes, '');
    assert.ok(inv[0]!.id.length > 0);
  });

  it('rejects update on unknown id', () => {
    const s = state();
    rejectWith(s, { kind: 'character.update', id: 'nope', fields: {} }, 'unknown_character');
  });

  it('dies and revives a character, maintaining cap', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, { kind: 'character.die', id });
    assert.equal(s.characters.length, 0);
    assert.equal(s.deceased.length, 1);
    s = step(s, { kind: 'character.revive', id });
    assert.equal(s.characters.length, 1);
    assert.equal(s.deceased.length, 0);
  });

  it('rejects revive when living cap is reached', () => {
    let s = state();
    for (let i = 0; i < 7; i++) s = step(s, { kind: 'character.create', id: `c-${i}` });
    assert.equal(s.characters.length, 8);
    // Kill one of the 8
    const idToKill = s.characters[0]!.id;
    s = step(s, { kind: 'character.die', id: idToKill });
    // Now fill back up to 8 living with a new create
    s = step(s, { kind: 'character.create', id: 'c-replacement' });
    assert.equal(s.characters.length, 8);
    // Revive should now be rejected
    rejectWith(s, { kind: 'character.revive', id: idToKill }, 'crew_full');
  });

  it('updates a deceased character (notes, epitaph)', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, { kind: 'character.die', id });
    s = step(s, {
      kind: 'character.update',
      id,
      fields: { featureNotes: 'Lost to the kraken.' }
    });
    assert.equal(s.deceased[0]!.featureNotes, 'Lost to the kraken.');
  });

  it('remove deletes from either pool', () => {
    let s = state();
    const id = s.characters[0]!.id;
    s = step(s, { kind: 'character.remove', id });
    assert.equal(s.characters.length, 0);
    rejectWith(s, { kind: 'character.remove', id }, 'unknown_character');
  });
});

// ---------------------------------------------------------------------------
// Manifest — doubloons, cargo, relics
// ---------------------------------------------------------------------------

describe('reducer.manifest', () => {
  it('sets and adjusts doubloons within bounds', () => {
    let s = state();
    s = step(s, { kind: 'doubloons.set', value: 100 });
    s = step(s, { kind: 'doubloons.adjust', delta: 20 });
    s = step(s, { kind: 'doubloons.adjust', delta: -50 });
    assert.equal(s.manifest.doubloons, 70);
    rejectWith(s, { kind: 'doubloons.adjust', delta: -999 }, 'out_of_range');
    rejectWith(s, { kind: 'doubloons.set', value: -1 }, 'invalid_doubloons');
  });

  it('adds, updates, removes cargo', () => {
    let s = state();
    s = step(s, {
      kind: 'cargo.add',
      id: 'cargo-1',
      item: { name: 'Rum barrels', slots: 2, notes: 'for the voyage' }
    });
    const id = s.manifest.cargo[0]!.id;
    assert.equal(id, 'cargo-1');
    s = step(s, { kind: 'cargo.update', id, fields: { slots: 3 } });
    assert.equal(s.manifest.cargo[0]!.slots, 3);
    s = step(s, { kind: 'cargo.remove', id });
    assert.equal(s.manifest.cargo.length, 0);
  });

  it('rejects invalid cargo inputs', () => {
    const s = state();
    rejectWith(
      s,
      { kind: 'cargo.add', id: 'c-bad1', item: { name: '', slots: 1, notes: '' } },
      'invalid_name'
    );
    rejectWith(
      s,
      { kind: 'cargo.add', id: 'c-bad2', item: { name: 'X', slots: 9999, notes: '' } },
      'invalid_slots'
    );
  });

  it('rejects cargo.add with a missing or duplicate id', () => {
    let s = state();
    rejectWith(
      s,
      { kind: 'cargo.add', id: '', item: { name: 'X', slots: 1, notes: '' } } as never,
      'invalid_id'
    );
    s = step(s, {
      kind: 'cargo.add',
      id: 'dup',
      item: { name: 'Rum', slots: 1, notes: '' }
    });
    rejectWith(
      s,
      { kind: 'cargo.add', id: 'dup', item: { name: 'Sugar', slots: 1, notes: '' } },
      'id_collision'
    );
  });

  it('adds relics and cycles their status', () => {
    let s = state();
    s = step(s, {
      kind: 'relic.add',
      id: 'relic-1',
      relic: {
        name: 'Ashen Compass',
        description: 'Points to your death.',
        usesLeft: 3,
        status: 'active'
      }
    });
    const id = s.manifest.relics[0]!.id;
    s = step(s, { kind: 'relic.update', id, fields: { status: 'depleted', usesLeft: 0 } });
    assert.equal(s.manifest.relics[0]!.status, 'depleted');
    s = step(s, { kind: 'relic.remove', id });
    assert.equal(s.manifest.relics.length, 0);
  });

  it('accepts relic usesLeft: null', () => {
    let s = state();
    s = step(s, {
      kind: 'relic.add',
      id: 'relic-null',
      relic: {
        name: 'Worm-eaten book',
        description: '',
        usesLeft: null,
        status: 'active'
      }
    });
    assert.equal(s.manifest.relics[0]!.usesLeft, null);
  });
});

// ---------------------------------------------------------------------------
// Factions
// ---------------------------------------------------------------------------

describe('reducer.factions', () => {
  it('adds, updates, removes factions', () => {
    let s = state();
    const before = s.factions.length;
    s = step(s, { kind: 'faction.add', id: 'cult-drowned', name: 'The Cult of the Drowned' });
    assert.equal(s.factions.length, before + 1);
    const id = s.factions.at(-1)!.id;
    assert.equal(id, 'cult-drowned');
    s = step(s, {
      kind: 'faction.update',
      id,
      fields: { status: 'wanted', note: 'They hold a grudge.' }
    });
    assert.equal(s.factions.at(-1)!.status, 'wanted');
    s = step(s, { kind: 'faction.remove', id });
    assert.equal(s.factions.length, before);
  });

  it('rejects invalid status on update', () => {
    const s = state();
    const id = s.factions[0]!.id;
    rejectWith(
      s,
      {
        kind: 'faction.update',
        id,
        fields: { status: 'annoyed' as unknown as 'allied' }
      },
      'invalid_status'
    );
  });
});

// ---------------------------------------------------------------------------
// Log
// ---------------------------------------------------------------------------

describe('reducer.log', () => {
  it('adds, updates, removes entries', () => {
    let s = state();
    s = step(s, {
      kind: 'log.add',
      id: 'log-1',
      entry: {
        session: 1,
        date: '2026-04-20',
        title: 'Cold start',
        body: 'We set out at dawn.',
        author: 'One-Eye'
      }
    });
    assert.equal(s.log.length, 1);
    const id = s.log[0]!.id;
    s = step(s, { kind: 'log.update', id, fields: { title: 'First blood' } });
    assert.equal(s.log[0]!.title, 'First blood');
    s = step(s, { kind: 'log.remove', id });
    assert.equal(s.log.length, 0);
  });

  it('rejects malformed dates', () => {
    const s = state();
    rejectWith(
      s,
      {
        kind: 'log.add',
        id: 'log-bad',
        entry: { session: 1, date: '2026/04/20', title: '', body: '', author: '' }
      },
      'invalid_date'
    );
  });
});

// ---------------------------------------------------------------------------
// Bounties
// ---------------------------------------------------------------------------

describe('reducer.bounties', () => {
  it('adds a bounty, resolves it to archive, then removes it from archive', () => {
    let s = state();
    s = step(s, {
      kind: 'bounty.add',
      id: 'b-1',
      bounty: {
        target: 'Blackbeard',
        amount: 5000,
        issuer: 'British Crown',
        reason: 'Piracy, on multiple counts',
        status: 'active'
      }
    });
    const id = s.bounties[0]!.id;
    assert.equal(id, 'b-1');
    s = step(s, { kind: 'bounty.resolve', id, status: 'paid' });
    assert.equal(s.bounties.length, 0);
    assert.equal(s.bountiesResolved.length, 1);
    assert.equal(s.bountiesResolved[0]!.status, 'paid');
    s = step(s, { kind: 'bounty.remove', id });
    assert.equal(s.bountiesResolved.length, 0);
  });

  it('uses the client-supplied id so the originator can follow up on the same item', () => {
    // This is the regression test for the bug where client and server each
    // generated a UUID, then any resolve/remove against the new item failed.
    let s = state();
    const wantId = 'client-supplied-id';
    s = step(s, {
      kind: 'bounty.add',
      id: wantId,
      bounty: { target: 'X', amount: 1, issuer: '', reason: '', status: 'active' }
    });
    assert.equal(s.bounties[0]!.id, wantId);
    s = step(s, { kind: 'bounty.resolve', id: wantId, status: 'paid' });
    assert.equal(s.bountiesResolved[0]!.id, wantId);
  });

  it('can update resolved bounties in place (clarify reason, etc.)', () => {
    let s = state();
    s = step(s, {
      kind: 'bounty.add',
      id: 'b-upd',
      bounty: {
        target: 'Blackbeard',
        amount: 5000,
        issuer: 'Crown',
        reason: '',
        status: 'active'
      }
    });
    const id = s.bounties[0]!.id;
    s = step(s, { kind: 'bounty.resolve', id, status: 'cleared' });
    s = step(s, {
      kind: 'bounty.update',
      id,
      fields: { reason: 'Pardoned by the governor' }
    });
    assert.equal(s.bountiesResolved[0]!.reason, 'Pardoned by the governor');
  });

  it('rejects resolve with invalid status', () => {
    let s = state();
    s = step(s, {
      kind: 'bounty.add',
      id: 'b-reject',
      bounty: {
        target: 'X',
        amount: 1,
        issuer: '',
        reason: '',
        status: 'active'
      }
    });
    const id = s.bounties[0]!.id;
    rejectWith(
      s,
      { kind: 'bounty.resolve', id, status: 'elsewhere' as unknown as 'paid' },
      'invalid_status'
    );
  });
});

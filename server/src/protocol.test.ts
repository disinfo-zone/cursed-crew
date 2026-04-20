import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeDisplayName, parseClientMessage } from './protocol.js';

describe('protocol.parseClientMessage', () => {
  it('rejects non-objects and missing type', () => {
    assert.equal(parseClientMessage(null).ok, false);
    assert.equal(parseClientMessage('hi').ok, false);
    assert.equal(parseClientMessage({}).ok, false);
  });

  it('parses hello with crewCode and displayName', () => {
    const r = parseClientMessage({ t: 'hello', crewCode: 'x', displayName: 'Alice' });
    assert.equal(r.ok, true);
    if (r.ok) assert.equal(r.msg.t, 'hello');
  });

  it('rejects mutate with missing id or action', () => {
    const a = parseClientMessage({ t: 'mutate' });
    const b = parseClientMessage({ t: 'mutate', id: 'x' });
    const c = parseClientMessage({ t: 'mutate', id: '', action: { kind: 'x' } });
    assert.equal(a.ok, false);
    assert.equal(b.ok, false);
    assert.equal(c.ok, false);
  });

  it('parses a well-formed mutate', () => {
    const r = parseClientMessage({
      t: 'mutate',
      id: 'm1',
      action: { kind: 'doubloons.set', value: 7 }
    });
    assert.equal(r.ok, true);
    if (r.ok && r.msg.t === 'mutate') {
      assert.equal(r.msg.id, 'm1');
      assert.equal(r.msg.action.kind, 'doubloons.set');
    }
  });

  it('parses ping and rename', () => {
    assert.equal(parseClientMessage({ t: 'ping' }).ok, true);
    assert.equal(
      parseClientMessage({ t: 'rename', displayName: 'Bob' }).ok,
      true
    );
    assert.equal(parseClientMessage({ t: 'rename' }).ok, false);
  });

  it('rejects unknown message types', () => {
    assert.equal(parseClientMessage({ t: 'hack' }).ok, false);
  });
});

describe('protocol.normalizeDisplayName', () => {
  it('falls back to a themed default on empty input', () => {
    assert.equal(normalizeDisplayName(''), 'Unnamed Sailor');
    assert.equal(normalizeDisplayName('   '), 'Unnamed Sailor');
  });

  it('trims and caps length', () => {
    assert.equal(normalizeDisplayName('  Blackbeard  '), 'Blackbeard');
    const long = 'x'.repeat(60);
    assert.equal(normalizeDisplayName(long).length, 40);
  });
});

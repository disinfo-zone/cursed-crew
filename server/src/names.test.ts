import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  generateCrewCodeCandidate,
  isValidCrewCodeShape,
  RESERVED_CREW_CODES
} from './names.js';

describe('names.isValidCrewCodeShape', () => {
  it('accepts well-formed three-word codes', () => {
    assert.equal(isValidCrewCodeShape('bloody-kraken-rum'), true);
    assert.equal(isValidCrewCodeShape('salt-serpent-compass'), true);
  });

  it('rejects empty, too short, too few or too many words', () => {
    assert.equal(isValidCrewCodeShape(''), false);
    assert.equal(isValidCrewCodeShape('ab-cd-ef'), false); // words too short
    assert.equal(isValidCrewCodeShape('one-two'), false);
    assert.equal(isValidCrewCodeShape('one-two-three-four'), false);
  });

  it('rejects non-ASCII-lowercase input', () => {
    assert.equal(isValidCrewCodeShape('Bloody-Kraken-Rum'), false);
    assert.equal(isValidCrewCodeShape('bloody-kraken-r0m'), false);
    assert.equal(isValidCrewCodeShape('bloody_kraken_rum'), false);
    assert.equal(isValidCrewCodeShape('bloody--kraken-rum'), false);
  });

  it('rejects anything in the reserved set', () => {
    for (const reserved of RESERVED_CREW_CODES) {
      assert.equal(
        isValidCrewCodeShape(reserved),
        false,
        `reserved "${reserved}" should not validate`
      );
    }
  });
});

describe('names.generateCrewCodeCandidate', () => {
  it('always produces shape-valid codes across many draws', () => {
    for (let i = 0; i < 500; i++) {
      const code = generateCrewCodeCandidate();
      assert.equal(
        isValidCrewCodeShape(code),
        true,
        `generated code "${code}" failed shape check`
      );
    }
  });

  it('is deterministic with a fixed RNG', () => {
    const seeded = () => 0;
    const a = generateCrewCodeCandidate(seeded);
    const b = generateCrewCodeCandidate(seeded);
    assert.equal(a, b);
  });
});

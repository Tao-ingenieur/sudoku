'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/engine/core.js');
const i18n = require('../src/ui/i18n.js');

const emptyValues = new Array(81).fill(0);
function candidates(entries) {
  const cands = new Uint16Array(81);
  for (const [cell, digits] of entries) {
    for (const digit of digits) cands[cell] |= core.bit(digit);
  }
  return cands;
}
function load(id) {
  return require('../src/engine/techniques/' + id + '.js');
}
function assertStep(id, entries) {
  const cands = candidates(entries);
  const step = load(id).find(emptyValues, cands);
  assert.ok(step, id + ' should find its pattern');
  assert.equal(step.technique, id);
  assert.equal(step.tier, load(id).tier);
  assert.ok(step.explainKey, 'explanation key required');
  for (const code of i18n.LANGUAGES) {
    i18n.setLang(code);
    const text = i18n.explain(step);
    assert.ok(text.length > 10, code + ' explanation too short');
    assert.doesNotMatch(text, /undefined|\{[a-zA-Z0-9_]+\}/);
  }
  i18n.setLang('en');
  assert.ok(Array.isArray(step.highlights.candidates));
  for (const elimination of step.eliminations) {
    assert.ok(cands[elimination.cell] & core.bit(elimination.digit), 'elimination must target a live candidate');
  }
  for (const placement of step.placements) {
    assert.ok(cands[placement.cell] & core.bit(placement.digit), 'placement must be a live candidate');
  }
  return step;
}

test('naked single places the only candidate', () => {
  const step = assertStep('nakedSingle', [[0, [5]]]);
  assert.deepEqual(step.placements, [{ cell: 0, digit: 5 }]);
});

test('hidden single finds the only position in a unit', () => {
  const step = assertStep('hiddenSingle', [[5, [3, 4]], [10, [3]]]);
  assert.deepEqual(step.placements, [{ cell: 5, digit: 3 }]);
});

test('naked pair removes both digits from the rest of the unit', () => {
  const step = assertStep('nakedPair', [[0, [1, 2]], [1, [1, 2]], [2, [2, 3]]]);
  assert.deepEqual(step.eliminations, [{ cell: 2, digit: 2 }]);
});

test('hidden pair removes other candidates from the two locked cells', () => {
  const step = assertStep('hiddenPair', [[0, [1, 2, 3]], [1, [1, 2]], [2, [3]]]);
  assert.ok(step.eliminations.some((e) => e.cell === 0 && e.digit === 3));
});

test('naked triple removes three digits from the rest of the unit', () => {
  const step = assertStep('nakedTriple', [[0, [1, 2]], [1, [2, 3]], [2, [1, 3]], [3, [1, 4]]]);
  assert.ok(step.eliminations.some((e) => e.cell === 3 && e.digit === 1));
});

test('hidden triple removes unrelated candidates from the three cells', () => {
  const step = assertStep('hiddenTriple', [
    [0, [1, 2, 3, 4]], [1, [1, 2]], [2, [2, 3]], [3, [4, 5]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 0 && e.digit === 4));
});

test('locked candidates pointing removes along the line', () => {
  const step = assertStep('lockedCandidatesPointing', [[0, [4]], [1, [4]], [3, [4, 5]]]);
  assert.deepEqual(step.eliminations, [{ cell: 3, digit: 4 }]);
});

test('locked candidates claiming removes from the box', () => {
  const step = assertStep('lockedCandidatesClaiming', [[0, [5]], [1, [5]], [10, [5, 6]]]);
  assert.deepEqual(step.eliminations, [{ cell: 10, digit: 5 }]);
});

test('X-Wing removes from both cover lines', () => {
  const step = assertStep('xWing', [
    [0, [7]], [2, [7]], [9, [7]], [11, [7]], [18, [7, 8]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 18 && e.digit === 7));
});

test('Swordfish removes from the cover columns', () => {
  const step = assertStep('swordfish', [
    [0, [4]], [2, [4]], [10, [4]], [11, [4]], [18, [4]], [19, [4]], [27, [4, 8]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 27 && e.digit === 4));
});

test('Jellyfish removes from the cover lines', () => {
  const step = assertStep('jellyfish', [
    [0, [6]], [1, [6]], [10, [6]], [11, [6]], [20, [6]], [21, [6]],
    [27, [6]], [30, [6]], [36, [6, 8]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 36 && e.digit === 6));
});

test('Y-Wing removes the shared wing digit from common peers', () => {
  const step = assertStep('yWing', [[0, [1, 2]], [1, [1, 3]], [9, [2, 3]], [10, [3, 4]]]);
  assert.ok(step.eliminations.some((e) => e.cell === 10 && e.digit === 3));
});

test('XYZ-Wing removes the shared digit from cells seeing pivot and wings', () => {
  const step = assertStep('xyzWing', [[0, [1, 2, 3]], [1, [1, 3]], [9, [2, 3]], [10, [3, 4]]]);
  assert.ok(step.eliminations.some((e) => e.cell === 10 && e.digit === 3));
});

test('Skyscraper removes from cells seeing both roofs', () => {
  const step = assertStep('skyscraper', [
    [0, [8]], [3, [8]], [9, [8]], [13, [8]], [21, [8, 1]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 21 && e.digit === 8));
});

test('Two-String Kite removes from a cell seeing both free ends', () => {
  const step = assertStep('twoStringKite', [
    [0, [9]], [1, [9]], [11, [9]], [47, [9]], [45, [9, 1]],
  ]);
  assert.ok(step.eliminations.length > 0);
  assert.ok(step.eliminations.every((e) => e.digit === 9));
});

test('Unique Rectangle removes the deadly pair from the extra cell', () => {
  const step = assertStep('uniqueRectangle', [
    [0, [1, 2]], [3, [1, 2]], [9, [1, 2]], [12, [1, 2, 3]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 12 && e.digit === 1));
  assert.ok(step.eliminations.some((e) => e.cell === 12 && e.digit === 2));
});

test('Simple Colouring finds a candidate seeing both colours', () => {
  const step = assertStep('simpleColouring', [[0, [3]], [1, [3]], [3, [3, 4]], [28, [3]]]);
  assert.ok(step.eliminations.some((e) => e.cell === 3 && e.digit === 3));
});

test('W-Wing removes the shared candidate from common peers', () => {
  const step = assertStep('wWing', [
    [0, [1, 2]], [13, [1, 2]], [8, [1]], [17, [1]], [4, [2, 4]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 4 && e.digit === 2));
});

test('XY-Chain relays truth between bivalue endpoints', () => {
  const step = assertStep('xyChain', [
    [0, [1, 2]], [1, [2, 3]], [10, [3, 4]], [19, [4, 1]], [2, [1, 5]],
  ]);
  assert.ok(step.eliminations.some((e) => e.cell === 2 && e.digit === 1));
});

test('all technique modules expose unique ids and valid tiers', () => {
  const engine = require('../src/engine/index.js');
  assert.ok(engine.techniques.length >= 12);
  const ids = new Set();
  for (const technique of engine.techniques) {
    assert.ok(!ids.has(technique.id), 'duplicate id ' + technique.id);
    ids.add(technique.id);
    assert.ok(technique.tier >= 1 && technique.tier <= 4);
    assert.equal(typeof technique.find, 'function');
  }
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/engine/core.js');

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const UNSOLVABLE = '531.7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

test('parse accepts digits, dots, zeroes and whitespace', () => {
  assert.equal(core.parse('0'.repeat(81)).length, 81);
  assert.equal(core.parse('.'.repeat(81)).length, 81);
  assert.equal(core.parse(EASY.replace(/(.{9})/g, '$1 ')).filter(Boolean).length, 30);
  assert.throws(() => core.parse('123'), /81/);
  assert.throws(() => core.parse('x'.repeat(81)), /invalid character/);
});

test('puzzle string round-trips', () => {
  const values = core.parse(EASY);
  assert.equal(core.toPuzzleString(values), EASY.replace(/0/g, '.'));
  assert.deepEqual(core.fromRows(core.toRows(values)), values);
});

test('conflicts reports every cell involved in a duplicate', () => {
  const values = new Array(81).fill(0);
  values[0] = 5;
  values[1] = 5;
  const bad = core.conflicts(values);
  assert.deepEqual(bad.sort((a, b) => a - b), [0, 1]);
  assert.equal(core.isValid(values), false);
});

test('candidates exclude values already visible in a peer', () => {
  const values = core.parse(EASY);
  const cands = core.candidates(values);
  assert.equal(cands[2] & core.bit(5), 0, '5 is in row 1');
  assert.equal(cands[2] & core.bit(3), 0, '3 is in the box');
  assert.ok(cands.filter((m) => m !== 0).length > 0);
});

test('countSolutions detects unique and multiple solutions', () => {
  assert.equal(core.countSolutions(core.parse(EASY), 2), 1);
  assert.equal(core.countSolutions(core.parse('.'.repeat(81)), 2), 2);
  assert.equal(core.countSolutions(core.parse(UNSOLVABLE), 2), 0);
});

test('solve returns the unique solution and isSolved validates it', () => {
  const solution = core.solve(core.parse(EASY));
  assert.ok(solution);
  assert.equal(core.isSolved(solution), true);
  assert.equal(core.isSolved(new Array(81).fill(0)), false);
  assert.equal(core.solve(core.parse(UNSOLVABLE)), null);
});

test('difficulty bands are based on technique tiers', () => {
  assert.equal(core.difficultyForTier(1), 'easy');
  assert.equal(core.difficultyForTier(2), 'medium');
  assert.equal(core.difficultyForTier(3), 'medium');
  assert.equal(core.difficultyForTier(4), 'hard');
});

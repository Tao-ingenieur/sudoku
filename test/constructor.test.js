'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/engine/core.js');
const constructor = require('../src/constructor/index.js');

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const UNSOLVABLE = '531.7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const MULTIPLE = '5'.padEnd(81, '.');

test('detects row/column/box conflicts immediately', () => {
  const values = new Array(81).fill(0);
  values[0] = 4;
  values[1] = 4;
  const result = constructor.analyze(values);
  assert.equal(result.status, 'conflict');
  assert.deepEqual(result.conflicts.sort((a, b) => a - b), [0, 1]);
});

test('detects multiple solutions', () => {
  assert.equal(constructor.analyze(MULTIPLE).status, 'multiple');
  assert.equal(constructor.analyze(new Array(81).fill(0)).status, 'multiple');
});

test('detects no solution', () => {
  const result = constructor.analyze(UNSOLVABLE);
  assert.equal(result.status, 'none');
  assert.equal(result.count, 0);
});

test('detects a unique solution and returns it', () => {
  const result = constructor.analyze(EASY);
  assert.equal(result.status, 'unique');
  assert.equal(result.count, 1);
  assert.ok(result.solution);
  assert.equal(core.isSolved(result.solution), true);
  assert.equal(result.clueCount, undefined);
  assert.equal(result.emptyCount, 51);
});

test('a completely filled valid board is unique', () => {
  const solution = core.solve(core.parse(EASY));
  const result = constructor.analyze(solution);
  assert.equal(result.status, 'unique');
  assert.deepEqual(result.solution, solution);
});

test('invalid strings are reported as invalid', () => {
  assert.equal(constructor.analyzeString('12345').status, 'invalid');
  assert.equal(constructor.analyzeString('x'.repeat(81)).status, 'invalid');
});

test('rating analysis is optional and reports technique difficulty', () => {
  const result = constructor.analyze(EASY, { rate: true });
  assert.equal(result.status, 'unique');
  assert.equal(result.rating.solved, true);
  assert.equal(result.rating.difficulty, 'easy');
});

test('toGame only accepts a unique puzzle and carries notes', () => {
  const result = constructor.analyze(EASY);
  const notes = new Array(81).fill(0);
  const game = constructor.toGame(result, notes);
  assert.equal(game.puzzle.length, 81);
  assert.equal(game.solution.length, 81);
  assert.equal(game.clueCount, 30);
  assert.notEqual(game.notes, notes);
  assert.throws(() => constructor.toGame({ status: 'multiple' }), /uniquely/);
});

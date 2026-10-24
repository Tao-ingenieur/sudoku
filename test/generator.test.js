'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/engine/core.js');
const generator = require('../src/generator/index.js');

const BANDS = {
  easy: [1, 1],
  medium: [2, 3],
  hard: [4, 4],
};

test('seeded random number generator is deterministic', () => {
  const a = generator.mulberry32(42);
  const b = generator.mulberry32(42);
  const seqA = Array.from({ length: 8 }, a);
  const seqB = Array.from({ length: 8 }, b);
  assert.deepEqual(seqA, seqB);
  assert.notDeepEqual(seqA, Array.from({ length: 8 }, generator.mulberry32(43)));
});

test('generates unique puzzles in each technique-based difficulty band', () => {
  for (const difficulty of ['easy', 'medium', 'hard']) {
    for (const seed of [101, 202]) {
      const result = generator.generate(difficulty, seed, { timeLimitMs: 12000, maxAttempts: 800 });
      assert.equal(result.ok, true, difficulty + ' seed ' + seed + ' should generate');
      const values = core.parse(result.puzzle);
      const solution = core.parse(result.solution);
      assert.equal(values.length, 81);
      assert.equal(core.countSolutions(values, 2), 1, 'generated puzzle must be unique');
      assert.deepEqual(core.solve(values), solution);
      assert.equal(result.rating.solved, true);
      const [minTier, maxTier] = BANDS[difficulty];
      assert.ok(result.rating.maxTier >= minTier, difficulty + ' must require a harder technique');
      assert.ok(result.rating.maxTier <= maxTier, difficulty + ' must not require a harder tier');
      assert.equal(result.rating.difficulty, difficulty);
      assert.ok(result.clueCount >= 17 && result.clueCount <= 50);
      assert.equal(result.clueCount, values.filter(Boolean).length);
    }
  }
});

test('every generated elimination respects the known solution', () => {
  const result = generator.generate('hard', 303, { timeLimitMs: 12000, maxAttempts: 800 });
  assert.equal(result.ok, true);
  const solution = core.parse(result.solution);
  const engine = require('../src/engine/index.js');
  let values = core.parse(result.puzzle);
  let candidates = core.candidates(values);
  for (const step of result.steps) {
    for (const placement of step.placements) {
      assert.equal(solution[placement.cell], placement.digit);
    }
    for (const elimination of step.eliminations) {
      assert.notEqual(solution[elimination.cell], elimination.digit);
    }
    const applied = engine.applyStep(values, candidates, step);
    assert.equal(applied.contradiction, false);
    values = applied.values;
    candidates = applied.candidates;
  }
  assert.deepEqual(values, solution);
});

test('accepts() rejects ratings outside the requested band', () => {
  assert.equal(generator.accepts('easy', { solved: true, maxTier: 1 }), true);
  assert.equal(generator.accepts('easy', { solved: true, maxTier: 2 }), false);
  assert.equal(generator.accepts('medium', { solved: true, maxTier: 3 }), true);
  assert.equal(generator.accepts('medium', { solved: true, maxTier: 4 }), false);
  assert.equal(generator.accepts('hard', { solved: true, maxTier: 4 }), true);
  assert.equal(generator.accepts('hard', { solved: false, maxTier: 4 }), false);
});

test('unknown difficulties fail clearly', () => {
  assert.throws(() => generator.generatePuzzle({ difficulty: 'expert' }), /Unknown difficulty/);
});

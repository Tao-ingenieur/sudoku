'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/engine/core.js');
const engine = require('../src/engine/index.js');
const i18n = require('../src/ui/i18n.js');

const EASY = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const HARD = '93.72......6.4..5.41....7.3....6.....91...4..3..5.........98.72.....45.8...2.76..';
const STALLED = '100007090030020008009600500005300900010080002600004000300000010040000007007000300';

function assertTraceMatchesSolution(trace, solution) {
  let values = trace.initial.values.slice();
  let cands = Uint16Array.from(trace.initial.candidates);
  for (const step of trace.steps) {
    for (const placement of step.placements) {
      assert.equal(solution[placement.cell], placement.digit, 'placement must match the real solution');
    }
    for (const elimination of step.eliminations) {
      assert.notEqual(solution[elimination.cell], elimination.digit, 'a true digit must never be eliminated');
    }
    const applied = engine.applyStep(values, cands, step);
    assert.equal(applied.contradiction, false);
    values = applied.values;
    cands = applied.candidates;
  }
  assert.deepEqual(values, solution);
}

test('solves an easy puzzle with singles only', () => {
  const trace = engine.solveHuman(EASY);
  assert.equal(trace.solved, true);
  assert.equal(trace.difficulty, 'easy');
  assert.equal(trace.maxTier, 1);
  assert.ok(trace.steps.length > 10);
  assert.deepEqual(trace.values, core.solve(core.parse(EASY)));
  assertTraceMatchesSolution(trace, core.solve(core.parse(EASY)));
});

test('solves a hard puzzle with advanced techniques', () => {
  const trace = engine.solveHuman(HARD);
  assert.equal(trace.solved, true);
  assert.equal(trace.difficulty, 'hard');
  assert.equal(trace.maxTier, 4);
  const used = new Set(trace.steps.map((s) => s.technique));
  assert.ok(used.has('xyChain') || used.has('wWing') || used.has('simpleColouring') || used.has('uniqueRectangle'));
  assertTraceMatchesSolution(trace, core.solve(core.parse(HARD)));
});

test('all real trace steps contain explanations in all six languages and highlights', () => {
  const trace = engine.solveHuman(HARD);
  for (const step of trace.steps) {
    assert.ok(step.explainKey);
    for (const code of i18n.LANGUAGES) {
      i18n.setLang(code);
      const text = i18n.explain(step);
      assert.ok(text.length > 5, code + ' explanation missing');
      assert.doesNotMatch(text, /\{[a-zA-Z0-9_]+\}/);
    }
    assert.ok(Array.isArray(step.highlights.primary));
    assert.ok(Array.isArray(step.highlights.candidates));
    assert.ok(step.placements.length || step.eliminations.length);
  }
  i18n.setLang('en');
});

test('replay and stateAfter reproduce the solved board', () => {
  const trace = engine.solveHuman(EASY);
  const state = engine.stateAfter(trace.initial, trace.steps, trace.steps.length);
  assert.deepEqual(state.values, trace.values);
  const replayed = engine.replay(EASY, trace.steps);
  assert.deepEqual(replayed.values, trace.values);
  const halfway = engine.stateAfter(trace.initial, trace.steps, Math.floor(trace.steps.length / 2));
  assert.equal(core.isSolved(halfway.values), false);
});

test('applyStep does not mutate its inputs and preserves earlier eliminations', () => {
  const values = core.parse(EASY);
  const cands = core.candidates(values);
  const step = engine.findNextStep(values, cands);
  assert.ok(step);
  const beforeValues = values.slice();
  const beforeCands = Uint16Array.from(cands);
  const applied = engine.applyStep(values, cands, step);
  assert.deepEqual(values, beforeValues);
  assert.deepEqual(cands, beforeCands);
  assert.notDeepEqual(Array.from(applied.candidates), Array.from(cands));
  // Reapplying an old elimination must not resurrect candidates after a placement.
  if (step.placements.length) {
    const placed = step.placements[0];
    const peer = core.PEERS[placed.cell].find((cell) => !applied.values[cell]);
    assert.ok(peer !== undefined);
    assert.equal(applied.candidates[peer] & core.bit(placed.digit), 0);
  }
});

test('reports stalled positions without pretending to solve them', () => {
  const trace = engine.solveHuman(STALLED);
  assert.equal(trace.solved, false);
  assert.equal(trace.stalled, true);
  assert.equal(trace.contradiction, false);
  assert.ok(trace.steps.length > 0);
});

test('rejects malformed and conflicting boards', () => {
  assert.equal(engine.solveHuman('123').solved, false);
  const conflict = new Array(81).fill(0);
  conflict[0] = 1;
  conflict[1] = 1;
  const trace = engine.solveHuman(conflict);
  assert.equal(trace.solved, false);
  assert.ok(trace.error);
});

test('maxTier limits the techniques available to the solver', () => {
  const trace = engine.solveHuman(HARD, { maxTier: 2 });
  assert.equal(trace.solved, false);
  assert.equal(trace.maxTier <= 2, true);
});

test('findNextStep exposes the technique order and a valid first step', () => {
  const values = core.parse(EASY);
  const cands = core.candidates(values);
  const step = engine.findNextStep(values, cands);
  assert.ok(step);
  assert.equal(step.tier, 1);
  assert.ok(engine.techniqueIds.length >= 15);
  assert.ok(engine.techniqueIds.includes('xyChain'));
});

'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const replay = require('../src/replay/index.js');
const stats = require('../src/stats/index.js');

function board(value) {
  const values = new Array(81).fill(0);
  const notes = new Array(81).fill(0);
  if (value) values[0] = value;
  return { values, notes };
}

test('replay records every action as an exact snapshot and starts from the initial board', () => {
  const initial = board(0);
  const recording = replay.createRecording({
    id: 'r1', puzzle: '.'.repeat(81), solution: '1'.repeat(81), values: initial.values,
    notes: initial.notes, difficulty: 'easy', startedAt: 1000,
  });
  replay.recordAction(recording, { type: 'value', cell: 0, digit: 4, durationMs: 1200, snapshot: board(4) });
  const notes = new Array(81).fill(0);
  notes[3] = 5;
  replay.recordAction(recording, { type: 'notes', cell: 3, digit: 1, durationMs: 2400, snapshot: { values: new Array(81).fill(0), notes } });
  replay.recordAction(recording, { type: 'erase', cell: 0, durationMs: 3000, snapshot: board(0) });

  assert.equal(recording.actions.length, 3);
  assert.equal(recording.durationMs, 3000);
  assert.equal(replay.snapshotAt(recording, 0).values[0], 0);
  assert.equal(replay.snapshotAt(recording, 1).values[0], 4);
  assert.equal(replay.snapshotAt(recording, 2).notes[3], 5);
  assert.equal(replay.snapshotAt(recording, 3).values[0], 0);
  assert.equal(replay.snapshotAt(recording, 99).values[0], 0);
});

test('replay survives JSON serialization and normalization', () => {
  const recording = replay.createRecording({
    id: 'r2', puzzle: '.'.repeat(81), solution: '', values: new Array(81).fill(0),
    notes: new Array(81).fill(0), difficulty: 'hard', startedAt: 123,
  });
  replay.recordAction(recording, { type: 'value', cell: 1, digit: 9, snapshot: board(9) });
  replay.markEnded(recording, 'completed', 5000);
  const restored = replay.normalizeRecording(JSON.parse(JSON.stringify(recording)));
  assert.ok(restored);
  assert.equal(restored.status, 'completed');
  assert.equal(restored.durationMs, 5000);
  assert.equal(restored.actions[0].digit, 9);
  assert.equal(replay.snapshotAt(restored, 1).values[0], 9);
  assert.equal(replay.normalizeRecording({ broken: true }), null);
});

test('completion statistics track total, per-difficulty, fastest and average', () => {
  let state = stats.emptyStats();
  state = stats.recordCompletion(state, { difficulty: 'easy', timeMs: 60000, completedAt: 1 });
  state = stats.recordCompletion(state, { difficulty: 'easy', timeMs: 30000, completedAt: 2 });
  state = stats.recordCompletion(state, { difficulty: 'hard', timeMs: 120000, completedAt: 3 });
  const summary = stats.summary(state);
  assert.equal(summary.completed, 3);
  assert.equal(summary.bestMs, 30000);
  assert.equal(summary.averageMs, 70000);
  assert.equal(summary.byDifficulty.easy.completed, 2);
  assert.equal(summary.byDifficulty.easy.bestMs, 30000);
  assert.equal(summary.byDifficulty.easy.averageMs, 45000);
  assert.equal(summary.byDifficulty.medium.completed, 0);
  assert.equal(summary.byDifficulty.hard.completed, 1);
  assert.equal(summary.recent.length, 3);
});

test('statistics normalize malformed persisted data', () => {
  const safe = stats.normalize({ completed: -1, totalMs: 'x', byDifficulty: { easy: { completed: 2 } } });
  assert.equal(safe.completed, 0);
  assert.equal(safe.byDifficulty.easy.completed, 2);
  assert.equal(stats.summary(null).completed, 0);
});

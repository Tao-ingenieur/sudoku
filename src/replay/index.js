/*
 * Platform-independent replay recording. A recording starts with the puzzle's
 * initial board and stores a complete board/notes snapshot after every player
 * action. Snapshots make playback deterministic and let undo/hint/reveal be
 * replayed exactly as the player saw them.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Sudoku = root.Sudoku || {}; root.Sudoku.replay = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const MAX_ACTIONS = 800;

  function copy(values) {
    return Array.from(values || []);
  }

  function createRecording(options) {
    const startedAt = options.startedAt || Date.now();
    return {
      version: VERSION,
      id: options.id || String(startedAt) + '-' + Math.random().toString(36).slice(2, 7),
      puzzle: options.puzzle,
      solution: options.solution,
      difficulty: options.difficulty || 'easy',
      maxTier: options.maxTier || 0,
      startedAt,
      updatedAt: startedAt,
      status: 'playing',
      durationMs: options.durationMs || 0,
      initial: {
        values: copy(options.values),
        notes: copy(options.notes),
      },
      actions: [],
      truncated: false,
    };
  }

  /**
   * Append one player action. `snapshot` is the full board state after applying
   * that action. The same function is used by the web UI and mini program.
   */
  function recordAction(recording, action) {
    if (!recording || !action || !action.snapshot) return recording;
    const values = copy(action.snapshot.values);
    const notes = copy(action.snapshot.notes);
    if (values.length !== 81 || notes.length !== 81) return recording;
    recording.actions.push({
      type: action.type,
      cell: typeof action.cell === 'number' ? action.cell : null,
      digit: typeof action.digit === 'number' ? action.digit : null,
      technique: typeof action.technique === 'string' ? action.technique : null,
      at: action.at || Date.now(),
      durationMs: typeof action.durationMs === 'number' ? action.durationMs : recording.durationMs,
      snapshot: { values, notes },
    });
    if (recording.actions.length > MAX_ACTIONS) {
      recording.actions.shift();
      recording.truncated = true;
    }
    recording.updatedAt = Date.now();
    if (typeof action.durationMs === 'number') recording.durationMs = action.durationMs;
    return recording;
  }

  function snapshotAt(recording, index) {
    if (!recording) return { values: new Array(81).fill(0), notes: new Array(81).fill(0) };
    const safe = Math.max(0, Math.min(recording.actions.length, index | 0));
    if (safe === 0) {
      return {
        values: copy(recording.initial.values),
        notes: copy(recording.initial.notes),
      };
    }
    const snapshot = recording.actions[safe - 1].snapshot;
    return { values: copy(snapshot.values), notes: copy(snapshot.notes) };
  }

  function markEnded(recording, status, durationMs) {
    if (!recording) return recording;
    recording.status = status;
    if (typeof durationMs === 'number') recording.durationMs = Math.max(0, durationMs);
    recording.updatedAt = Date.now();
    recording.endedAt = Date.now();
    return recording;
  }

  function actionCount(recording) {
    return recording && Array.isArray(recording.actions) ? recording.actions.length : 0;
  }

  /** Accept older/partial JSON but guarantee the fields the UI reads. */
  function normalizeRecording(input) {
    if (!input || typeof input !== 'object' || !Array.isArray(input.actions)) return null;
    if (!input.initial || !Array.isArray(input.initial.values) || !Array.isArray(input.initial.notes)) return null;
    if (input.initial.values.length !== 81 || input.initial.notes.length !== 81) return null;
    return {
      version: VERSION,
      id: input.id || String(input.startedAt || Date.now()),
      puzzle: input.puzzle || input.initial.values.map((v) => v || '.').join(''),
      solution: input.solution || '',
      difficulty: ['easy', 'medium', 'hard'].includes(input.difficulty) ? input.difficulty : 'easy',
      maxTier: Number(input.maxTier) || 0,
      startedAt: Number(input.startedAt) || Date.now(),
      updatedAt: Number(input.updatedAt) || Number(input.startedAt) || Date.now(),
      endedAt: input.endedAt ? Number(input.endedAt) : undefined,
      status: input.status || 'playing',
      durationMs: Math.max(0, Number(input.durationMs) || 0),
      initial: {
        values: copy(input.initial.values),
        notes: copy(input.initial.notes),
      },
      actions: input.actions.filter((action) => action && action.snapshot &&
        Array.isArray(action.snapshot.values) && Array.isArray(action.snapshot.notes) &&
        action.snapshot.values.length === 81 && action.snapshot.notes.length === 81)
        .slice(-MAX_ACTIONS).map((action) => ({
          type: action.type || 'unknown',
          cell: typeof action.cell === 'number' ? action.cell : null,
          digit: typeof action.digit === 'number' ? action.digit : null,
          technique: typeof action.technique === 'string' ? action.technique : null,
          at: Number(action.at) || Number(input.startedAt) || Date.now(),
          durationMs: Math.max(0, Number(action.durationMs) || 0),
          snapshot: {
            values: copy(action.snapshot.values),
            notes: copy(action.snapshot.notes),
          },
        })),
      truncated: !!input.truncated,
    };
  }

  return {
    VERSION,
    MAX_ACTIONS,
    createRecording,
    recordAction,
    snapshotAt,
    markEnded,
    actionCount,
    normalizeRecording,
  };
});

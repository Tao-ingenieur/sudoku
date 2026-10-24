/*
 * Local completion statistics shared by the web app and the WeChat mini
 * program. Storage is intentionally left to each platform (localStorage vs.
 * wx.setStorageSync), while calculations and schema stay identical.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Sudoku = root.Sudoku || {}; root.Sudoku.stats = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = 1;
  const DIFFICULTIES = ['easy', 'medium', 'hard'];
  const MAX_RECENT = 30;

  function bucket() {
    return { completed: 0, totalMs: 0, bestMs: null };
  }

  function emptyStats() {
    return {
      version: VERSION,
      completed: 0,
      totalMs: 0,
      bestMs: null,
      byDifficulty: { easy: bucket(), medium: bucket(), hard: bucket() },
      recent: [],
    };
  }

  function normalize(input) {
    if (!input || typeof input !== 'object') return emptyStats();
    const out = emptyStats();
    out.completed = Math.max(0, Number(input.completed) || 0);
    out.totalMs = Math.max(0, Number(input.totalMs) || 0);
    out.bestMs = input.bestMs === null || input.bestMs === undefined ? null : Math.max(0, Number(input.bestMs));
    for (const difficulty of DIFFICULTIES) {
      const source = input.byDifficulty && input.byDifficulty[difficulty];
      if (!source) continue;
      out.byDifficulty[difficulty] = {
        completed: Math.max(0, Number(source.completed) || 0),
        totalMs: Math.max(0, Number(source.totalMs) || 0),
        bestMs: source.bestMs === null || source.bestMs === undefined ? null : Math.max(0, Number(source.bestMs)),
      };
    }
    out.recent = Array.isArray(input.recent) ? input.recent.filter((item) =>
      item && DIFFICULTIES.includes(item.difficulty) && Number.isFinite(Number(item.timeMs)))
      .slice(0, MAX_RECENT).map((item) => ({
        difficulty: item.difficulty,
        timeMs: Math.max(0, Number(item.timeMs)),
        completedAt: Number(item.completedAt) || Date.now(),
      })) : [];
    return out;
  }

  /** Record exactly one successful completion. */
  function recordCompletion(input, completion) {
    const stats = normalize(input);
    const difficulty = DIFFICULTIES.includes(completion.difficulty) ? completion.difficulty : 'easy';
    const timeMs = Math.max(0, Math.round(Number(completion.timeMs) || 0));
    const completedAt = Number(completion.completedAt) || Date.now();

    stats.completed++;
    stats.totalMs += timeMs;
    stats.bestMs = stats.bestMs === null ? timeMs : Math.min(stats.bestMs, timeMs);

    const diff = stats.byDifficulty[difficulty];
    diff.completed++;
    diff.totalMs += timeMs;
    diff.bestMs = diff.bestMs === null ? timeMs : Math.min(diff.bestMs, timeMs);

    stats.recent.unshift({ difficulty, timeMs, completedAt });
    stats.recent = stats.recent.slice(0, MAX_RECENT);
    return stats;
  }

  function average(total, count) {
    return count > 0 ? Math.round(total / count) : null;
  }

  function summary(input) {
    const stats = normalize(input);
    const byDifficulty = {};
    for (const difficulty of DIFFICULTIES) {
      const item = stats.byDifficulty[difficulty];
      byDifficulty[difficulty] = {
        completed: item.completed,
        averageMs: average(item.totalMs, item.completed),
        bestMs: item.bestMs,
      };
    }
    return {
      completed: stats.completed,
      averageMs: average(stats.totalMs, stats.completed),
      bestMs: stats.bestMs,
      byDifficulty,
      recent: stats.recent,
    };
  }

  function reset() {
    return emptyStats();
  }

  return { VERSION, DIFFICULTIES, MAX_RECENT, emptyStats, normalize, recordCompletion, summary, reset };
});

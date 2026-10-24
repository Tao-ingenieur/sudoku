/*
 * Unique-puzzle generator. Difficulty is *not* based on the number of holes:
 * every candidate puzzle is solved by the human engine and only accepted when
 * its hardest required technique falls in the requested band.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../engine/core.js'), require('../engine/index.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.generator = factory(root.Sudoku.core, root.Sudoku.engine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, engine) {
  'use strict';

  const CONFIG = {
    easy: {
      clues: [38, 44],
      description: 'singles only',
      accepts: (rating) => rating.solved && rating.maxTier <= 1,
    },
    medium: {
      clues: [29, 34],
      description: 'pairs, locked candidates and intermediate line logic',
      accepts: (rating) => rating.solved && rating.maxTier >= 2 && rating.maxTier <= 3,
    },
    hard: {
      clues: [23, 28],
      description: 'advanced patterns, colouring or chains',
      accepts: (rating) => rating.solved && rating.maxTier >= 4,
    },
  };

  function mulberry32(seed) {
    let state = seed >>> 0;
    return function random() {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function randomSolution(rng) {
    const board = new Array(81).fill(0);
    const rowMask = new Uint16Array(9);
    const colMask = new Uint16Array(9);
    const boxMask = new Uint16Array(9);
    function fill(pos) {
      if (pos === 81) return true;
      const r = core.rowOf(pos);
      const c = core.colOf(pos);
      const b = core.boxOf(pos);
      const available = core.ALL & ~(rowMask[r] | colMask[c] | boxMask[b]);
      const digits = shuffle(core.digits(available), rng);
      for (const digit of digits) {
        const m = core.bit(digit);
        board[pos] = digit;
        rowMask[r] |= m; colMask[c] |= m; boxMask[b] |= m;
        if (fill(pos + 1)) return true;
        rowMask[r] ^= m; colMask[c] ^= m; boxMask[b] ^= m;
        board[pos] = 0;
      }
      return false;
    }
    fill(0);
    return board;
  }

  function dig(solution, targetClues, rng) {
    const puzzle = solution.slice();
    let clues = 81;
    const order = shuffle(Array.from({ length: 81 }, (_, i) => i), rng);
    for (const cell of order) {
      if (clues <= targetClues) break;
      const saved = puzzle[cell];
      if (!saved) continue;
      puzzle[cell] = 0;
      if (core.countSolutions(puzzle, 2) !== 1) {
        puzzle[cell] = saved;
      } else {
        clues--;
      }
    }
    return { puzzle, clues };
  }

  function rate(puzzle) {
    return engine.solveHuman(puzzle);
  }

  function accepts(difficulty, rating) {
    return CONFIG[difficulty] && CONFIG[difficulty].accepts(rating);
  }

  /**
   * Search for a unique puzzle that matches the technique band. The process is
   * randomized; `timeLimitMs` and `maxAttempts` keep UI calls responsive.
   */
  function generatePuzzle(options) {
    options = options || {};
    const difficulty = options.difficulty || 'medium';
    if (!CONFIG[difficulty]) throw new Error('Unknown difficulty: ' + difficulty);
    const rng = options.rng || (Number.isFinite(options.seed) ? mulberry32(options.seed) : Math.random);
    const timeLimit = options.timeLimitMs || 15000;
    const maxAttempts = options.maxAttempts || 600;
    const started = Date.now();
    let attempts = 0;
    let last = null;
    const config = CONFIG[difficulty];

    while (attempts < maxAttempts && (Date.now() - started) < timeLimit) {
      attempts++;
      const solution = randomSolution(rng);
      const low = config.clues[0];
      const high = config.clues[1];
      const targetClues = low + Math.floor(rng() * (high - low + 1));
      const dug = dig(solution, targetClues, rng);
      const rating = rate(dug.puzzle);
      last = { puzzle: dug.puzzle, solution, rating, clues: dug.clues };
      if (options.onProgress) options.onProgress(attempts, last);
      if (accepts(difficulty, rating)) {
        return {
          ok: true,
          difficulty,
          clueCount: dug.clues,
          puzzle: core.toPuzzleString(dug.puzzle),
          solution: core.toPuzzleString(solution),
          values: dug.puzzle,
          solutionValues: solution,
          steps: rating.steps,
          rating,
          attempts,
          elapsedMs: Date.now() - started,
        };
      }
    }
    return {
      ok: false,
      difficulty,
      reason: 'No puzzle matched the difficulty band in time',
      attempts,
      elapsedMs: Date.now() - started,
      last: last ? {
        puzzle: core.toPuzzleString(last.puzzle),
        solution: core.toPuzzleString(last.solution),
        clues: last.clues,
        rating: {
          solved: last.rating.solved,
          maxTier: last.rating.maxTier,
          difficulty: last.rating.difficulty,
        },
      } : null,
    };
  }

  /** Convenience wrapper for tests and CLI tooling. */
  function generate(difficulty, seed, extra) {
    return generatePuzzle(Object.assign({ difficulty, seed }, extra || {}));
  }

  return {
    CONFIG,
    mulberry32,
    shuffle,
    randomSolution,
    dig,
    rate,
    accepts,
    generatePuzzle,
    generate,
  };
});

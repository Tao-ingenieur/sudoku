/*
 * Constructor validation: conflicts, solution count and one-click handoff.
 * The same core solver is used by the web and desktop builds.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../engine/core.js'), require('../engine/index.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.constructor = factory(root.Sudoku.core, root.Sudoku.engine);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, engine) {
  'use strict';

  function normalize(input) {
    if (typeof input === 'string') return core.parse(input);
    return Array.from(input);
  }

  /**
   * @returns {status: 'invalid'|'conflict'|'none'|'multiple'|'unique'}
   */
  function analyze(input, options) {
    options = options || {};
    let values;
    try {
      values = normalize(input);
    } catch (error) {
      return { status: 'invalid', error: error.message, conflicts: [] };
    }
    const validation = core.validate(values);
    if (!validation.ok) {
      return {
        status: validation.conflicts && validation.conflicts.length ? 'conflict' : 'invalid',
        error: validation.error,
        conflicts: validation.conflicts || [],
        values,
      };
    }
    const emptyCount = values.filter((v) => !v).length;
    if (emptyCount === 0) {
      return { status: 'unique', solution: values.slice(), count: 1, emptyCount, values };
    }
    const count = core.countSolutions(values, 2);
    if (count === 0) {
      return { status: 'none', count: 0, emptyCount, values };
    }
    if (count > 1) {
      return { status: 'multiple', count: '2+', emptyCount, values };
    }
    const solution = core.solve(values);
    let rating = null;
    if (options.rate) rating = engine.solveHuman(values);
    return { status: 'unique', count: 1, emptyCount, solution, values, rating };
  }

  /** Validate a pasted string, returning a UI-friendly status object. */
  function analyzeString(text, options) {
    return analyze(text, options);
  }

  /** Bundle a validated board into a playable game. */
  function toGame(analysis, notes) {
    if (!analysis || analysis.status !== 'unique') {
      throw new Error('Only uniquely solvable puzzles can start a game');
    }
    return {
      puzzle: core.toPuzzleString(analysis.values),
      solution: core.toPuzzleString(analysis.solution),
      values: analysis.values.slice(),
      solutionValues: analysis.solution.slice(),
      clueCount: analysis.values.filter((v) => v).length,
      notes: notes ? notes.slice() : new Array(81).fill(0),
    };
  }

  return { analyze, analyzeString, toGame };
});

/*
 * Human-style solver orchestrator. Each technique lives in its own file; this
 * module applies one logical deduction at a time so the UI can replay every
 * placement and candidate elimination.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./util.js'), [
      require('./techniques/nakedSingle.js'),
      require('./techniques/hiddenSingle.js'),
      require('./techniques/lockedCandidatesPointing.js'),
      require('./techniques/lockedCandidatesClaiming.js'),
      require('./techniques/nakedPair.js'),
      require('./techniques/hiddenPair.js'),
      require('./techniques/nakedTriple.js'),
      require('./techniques/hiddenTriple.js'),
      require('./techniques/xWing.js'),
      require('./techniques/swordfish.js'),
      require('./techniques/yWing.js'),
      require('./techniques/xyzWing.js'),
      require('./techniques/skyscraper.js'),
      require('./techniques/twoStringKite.js'),
      require('./techniques/jellyfish.js'),
      require('./techniques/uniqueRectangle.js'),
      require('./techniques/simpleColouring.js'),
      require('./techniques/wWing.js'),
      require('./techniques/xyChain.js'),
    ]);
  } else {
    root.Sudoku = root.Sudoku || {};
    const T = root.Sudoku.Techniques || {};
    root.Sudoku.engine = factory(root.Sudoku.core, root.Sudoku.util, [
      T.nakedSingle, T.hiddenSingle, T.lockedCandidatesPointing, T.lockedCandidatesClaiming,
      T.nakedPair, T.hiddenPair, T.nakedTriple, T.hiddenTriple, T.xWing, T.swordfish,
      T.yWing, T.xyzWing, T.skyscraper, T.twoStringKite, T.jellyfish,
      T.uniqueRectangle, T.simpleColouring, T.wWing, T.xyChain,
    ]);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H, techniques) {
  'use strict';

  // Detection order is intentionally simple-to-complex. It determines the
  // "easiest next move" and the difficulty rating of a puzzle.
  const ORDER = [
    'nakedSingle', 'hiddenSingle',
    'lockedCandidatesPointing', 'lockedCandidatesClaiming', 'nakedPair', 'hiddenPair',
    'nakedTriple', 'hiddenTriple', 'xWing', 'swordfish', 'skyscraper',
    'yWing', 'xyzWing', 'twoStringKite',
    'jellyfish', 'uniqueRectangle', 'simpleColouring', 'wWing', 'xyChain',
  ];
  const byId = new Map(techniques.filter(Boolean).map((t) => [t.id, t]));
  const ordered = ORDER.map((id) => byId.get(id)).filter(Boolean);
  const TECHNIQUE_IDS = ordered.map((t) => t.id);

  function findNextStep(values, cands, options) {
    options = options || {};
    const maxTier = options.maxTier || 4;
    const assumeUnique = options.assumeUnique !== false;
    for (const technique of ordered) {
      if (technique.tier > maxTier) continue;
      if (!assumeUnique && technique.id === 'uniqueRectangle') continue;
      const step = technique.find(values, cands);
      if (step) return step;
    }
    return null;
  }

  /**
   * Apply a step. Candidate eliminations are persistent: after a placement we
   * remove the digit from peers instead of recomputing from scratch, because
   * that preserves earlier logical eliminations.
   */
  function applyStep(values, cands, step) {
    const valueCopy = Array.from(values);
    const candCopy = Uint16Array.from(cands);
    let contradiction = false;
    for (const placement of step.placements || []) {
      const { cell, digit } = placement;
      if (valueCopy[cell] && valueCopy[cell] !== digit) {
        contradiction = true;
        continue;
      }
      valueCopy[cell] = digit;
      candCopy[cell] = 0;
      for (const peer of core.PEERS[cell]) {
        if (!valueCopy[peer]) {
          candCopy[peer] &= ~core.bit(digit);
          if (candCopy[peer] === 0) contradiction = true;
        }
      }
    }
    for (const elimination of step.eliminations || []) {
      if (!valueCopy[elimination.cell]) {
        candCopy[elimination.cell] &= ~core.bit(elimination.digit);
        if (candCopy[elimination.cell] === 0) contradiction = true;
      }
    }
    return { values: valueCopy, candidates: candCopy, contradiction };
  }

  function makeCounter() {
    const counts = {};
    for (const id of TECHNIQUE_IDS) counts[id] = 0;
    return counts;
  }

 /**
   * Solve with human logic only. Returns the full trace and a difficulty
   * classification based on the hardest technique that was actually required.
   */
  function solveHuman(input, options) {
    options = options || {};
    let values;
    if (typeof input === 'string') {
      try { values = core.parse(input); } catch (error) {
        return { solved: false, error: error.message, steps: [] };
      }
    } else {
      values = Array.from(input);
    }
    const validation = core.validate(values);
    if (!validation.ok) {
      return { solved: false, error: validation.error, conflicts: validation.conflicts || [], steps: [] };
    }
    const cands = core.candidates(values);
    if (Array.from(cands).some((mask, cell) => !values[cell] && mask === 0)) {
      return { solved: false, error: 'A cell has no candidates', steps: [] };
    }
    const initial = {
      values: values.slice(),
      candidates: Uint16Array.from(cands),
    };
    const steps = [];
    const counts = makeCounter();
    let maxTier = 0;
    let contradiction = false;
    const limit = options.maxSteps || 2000;

    while (!core.isSolved(values) && steps.length < limit) {
      const step = findNextStep(values, cands, {
        maxTier: options.maxTier || 4,
        assumeUnique: options.assumeUnique !== false,
      });
      if (!step) break;
      const applied = applyStep(values, cands, step);
      if (applied.contradiction) {
        contradiction = true;
        break;
      }
      values = applied.values;
      cands.set(applied.candidates);
      counts[step.technique] = (counts[step.technique] || 0) + 1;
      maxTier = Math.max(maxTier, step.tier);
      steps.push(step);
    }

    const solved = core.isSolved(values);
    const difficulty = solved ? core.difficultyForTier(maxTier) : null;
    return {
      solved,
      contradiction,
      stalled: !solved && !contradiction,
      steps,
      counts,
      maxTier,
      difficulty,
      tierCounts: {
        1: steps.filter((s) => s.tier === 1).length,
        2: steps.filter((s) => s.tier === 2).length,
        3: steps.filter((s) => s.tier === 3).length,
        4: steps.filter((s) => s.tier === 4).length,
      },
      initial,
      values,
      candidates: Array.from(cands),
      stepCount: steps.length,
    };
  }

  /** Apply a list of steps without solving; used by replay and tests. */
  function replay(input, steps) {
    let values = Array.isArray(input) ? Array.from(input) : core.parse(input);
    let cands = core.candidates(values);
    for (const step of steps) {
      const applied = applyStep(values, cands, step);
      values = applied.values;
      cands = applied.candidates;
    }
    return { values, candidates: cands };
  }

  /** Return the candidate state after a prefix of the trace. */
  function stateAfter(initial, steps, count) {
    let values = Array.from(initial.values);
    let cands = Uint16Array.from(initial.candidates);
    for (let i = 0; i < count; i++) {
      const applied = applyStep(values, cands, steps[i]);
      values = applied.values;
      cands = applied.candidates;
    }
    return { values, candidates: cands };
  }

  return {
    techniques: ordered,
    techniqueIds: TECHNIQUE_IDS,
    findNextStep,
    applyStep,
    solveHuman,
    replay,
    stateAfter,
  };
});

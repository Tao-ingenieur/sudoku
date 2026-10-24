/*
 * Human-solver helpers shared by all techniques. Explanations are stored as a
 * locale-independent key plus structured references; the UI/i18n layer turns
 * them into text in the selected language.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'));
  } else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.util = factory(root.Sudoku.core);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  const { PEER_SETS, UNITS, bit, countBits, digits } = core;

  function cellName(cell) {
    return 'R' + (core.rowOf(cell) + 1) + 'C' + (core.colOf(cell) + 1);
  }

  // Language-neutral references consumed by i18n.formatVars().
  const refCell = (index) => ({ kind: 'cell', index });
  const refCells = (list) => ({ kind: 'cells', list: list.slice() });
  const refDigits = (list) => ({ kind: 'digits', list: list.slice() });
  const refCands = (list) => ({ kind: 'cands', list: list.map((item) => ({ cell: item.cell, digit: item.digit })) });
  const refUnit = (type, index) => ({ kind: 'unit', type, index });
  const refUnits = (type, indices) => ({ kind: 'units', type, indices: indices.slice() });
  const refChain = (list) => ({ kind: 'chain', list: list.map((item) => ({ cell: item.cell, digits: item.digits.slice() })) });

  function sees(a, b) {
    return PEER_SETS[a].has(b);
  }

  function commonPeers(a, b) {
    const out = [];
    for (const peer of PEER_SETS[a]) if (PEER_SETS[b].has(peer) && peer !== a && peer !== b) out.push(peer);
    return out;
  }

  function positionsInUnit(unitIndex, digit, cands) {
    const out = [];
    for (const cell of UNITS[unitIndex]) {
      if (cands[cell] & bit(digit)) out.push(cell);
    }
    return out;
  }

  function cellsInUnit(unitIndex, cands) {
    return UNITS[unitIndex].filter((cell) => cands[cell] !== 0);
  }

  function digitMasksInUnit(unitIndex, cands) {
    const out = new Map();
    for (const cell of UNITS[unitIndex]) {
      if (!cands[cell]) continue;
      for (const digit of digits(cands[cell])) {
        if (!out.has(digit)) out.set(digit, []);
        out.get(digit).push(cell);
      }
    }
    return out;
  }

  /** Cartesian positions for choosing k items out of n. */
  function combinations(n, k) {
    const out = [];
    const chosen = [];
    function walk(start) {
      if (chosen.length === k) {
        out.push(chosen.slice());
        return;
      }
      for (let i = start; i <= n - (k - chosen.length); i++) {
        chosen.push(i);
        walk(i + 1);
        chosen.pop();
      }
    }
    walk(0);
    return out;
  }

  function uniqueEliminations(list, cands) {
    const seen = new Set();
    return list.filter((e) => {
      if (!cands[e.cell] || !(cands[e.cell] & bit(e.digit))) return false;
      const key = e.cell + ':' + e.digit;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function highlightedCandidates(entries, role) {
    return entries.map((e) => ({ cell: e.cell, digit: e.digit, role: role || 'pattern' }));
  }

  /**
   * Construct a normalized step. `highlights.primary` is the pattern that
   * establishes the deduction, `secondary` provides supporting cells, and
   * every elimination target is added automatically.
   */
  function makeStep(technique, tier, details) {
    const placements = details.placements || [];
    const eliminations = details.eliminations || [];
    const primary = details.highlights && details.highlights.primary ? details.highlights.primary : [];
    const secondary = details.highlights && details.highlights.secondary ? details.highlights.secondary : [];
    const highlightCandidates = (details.highlights && details.highlights.candidates) || [];
    return {
      technique,
      tier,
      placements,
      eliminations,
      highlights: {
        primary,
        secondary,
        cells: Array.from(new Set(primary.concat(secondary))),
        candidates: highlightCandidates.concat(highlightedCandidates(eliminations, 'eliminate')),
        units: (details.highlights && details.highlights.units) || [],
      },
      explainKey: details.explainKey,
      explainVars: details.explainVars || {},
      data: details.data || {},
    };
  }

  function placementStep(technique, tier, cell, digit, explainKey, explainVars, extra) {
    return makeStep(technique, tier, Object.assign({
      placements: [{ cell, digit }],
      highlights: { primary: [cell], candidates: [{ cell, digit, role: 'place' }] },
      explainKey,
      explainVars: explainVars || { cell: refCell(cell), digit },
    }, extra || {}));
  }

  function candidateCount(cands) {
    return countBits(cands);
  }

  return {
    cellName, refCell, refCells, refDigits, refCands, refUnit, refUnits, refChain,
    sees, commonPeers, positionsInUnit, cellsInUnit, digitMasksInUnit,
    combinations, uniqueEliminations, highlightedCandidates,
    makeStep, placementStep, candidateCount,
  };
});

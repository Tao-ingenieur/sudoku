(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.lockedCandidatesClaiming = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'lockedCandidatesClaiming',
    tier: 2,
    find(values, cands) {
      for (let line = 0; line < 18; line++) {
        for (let digit = 1; digit <= 9; digit++) {
          const spots = H.positionsInUnit(line, digit, cands);
          if (spots.length < 2) continue;
          const box = core.boxOf(spots[0]);
          if (!spots.every((cell) => core.boxOf(cell) === box)) continue;
          const eliminations = [];
          for (const cell of core.UNITS[18 + box]) {
            if (line < 9 ? core.rowOf(cell) === line : core.colOf(cell) === line - 9) continue;
            if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
          }
          if (!eliminations.length) continue;
          const lineMeta = core.UNIT_NAMES[line];
          const boxMeta = core.UNIT_NAMES[18 + box];
          return H.makeStep('lockedCandidatesClaiming', 2, {
            eliminations,
            highlights: {
              primary: spots,
              secondary: eliminations.map((e) => e.cell),
              units: [line, 18 + box],
              candidates: spots.map((cell) => ({ cell, digit, role: 'pattern' })),
            },
            explainKey: 'explain.lockedCandidatesClaiming',
            explainVars: {
              line: H.refUnit(lineMeta.type, lineMeta.index),
              box: H.refUnit(boxMeta.type, boxMeta.index),
              digit,
              spots: H.refCells(spots),
              eliminations: H.refCands(eliminations),
            },
            data: { line, box: 18 + box, digit },
          });
        }
      }
      return null;
    },
  };
});

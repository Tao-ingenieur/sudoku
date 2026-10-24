(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.lockedCandidatesPointing = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'lockedCandidatesPointing',
    tier: 2,
    find(values, cands) {
      for (let box = 18; box < 27; box++) {
        for (let digit = 1; digit <= 9; digit++) {
          const spots = H.positionsInUnit(box, digit, cands);
          if (spots.length < 2) continue;
          const boxIdx = box - 18;
          const row = core.boxOf(spots[0]) === boxIdx ? core.rowOf(spots[0]) : -1;
          const sameRow = spots.every((cell) => core.rowOf(cell) === core.rowOf(spots[0]));
          const sameCol = spots.every((cell) => core.colOf(cell) === core.colOf(spots[0]));
          if (!sameRow && !sameCol) continue;
          const line = sameRow ? core.ROW_UNITS[core.rowOf(spots[0])] : core.COL_UNITS[core.colOf(spots[0])];
          const eliminations = [];
          for (const cell of core.UNITS[line]) {
            if (core.boxOf(cell) === boxIdx) continue;
            if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
          }
          if (!eliminations.length) continue;
          const lineMeta = core.UNIT_NAMES[line];
          const boxMeta = core.UNIT_NAMES[box];
          return H.makeStep('lockedCandidatesPointing', 2, {
            eliminations,
            highlights: {
              primary: spots,
              secondary: eliminations.map((e) => e.cell),
              units: [box, line],
              candidates: spots.map((cell) => ({ cell, digit, role: 'pattern' })),
            },
            explainKey: 'explain.lockedCandidatesPointing',
            explainVars: {
              box: H.refUnit(boxMeta.type, boxMeta.index),
              line: H.refUnit(lineMeta.type, lineMeta.index),
              digit,
              spots: H.refCells(spots),
              eliminations: H.refCands(eliminations),
            },
            data: { box, line, digit },
          });
        }
      }
      return null;
    },
  };
});

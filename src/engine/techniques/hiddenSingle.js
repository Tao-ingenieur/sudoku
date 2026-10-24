(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.hiddenSingle = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'hiddenSingle',
    tier: 1,
    find(values, cands) {
      for (let u = 0; u < 27; u++) {
        for (let digit = 1; digit <= 9; digit++) {
          const spots = H.positionsInUnit(u, digit, cands);
          if (spots.length === 1) {
            const cell = spots[0];
            if (values[cell]) continue;
            const meta = core.UNIT_NAMES[u];
            return H.placementStep('hiddenSingle', 1, cell, digit, 'explain.hiddenSingle', {
              digit,
              unit: H.refUnit(meta.type, meta.index),
              cell: H.refCell(cell),
            }, { highlights: { primary: [cell], units: [u] } });
          }
        }
      }
      return null;
    },
  };
});

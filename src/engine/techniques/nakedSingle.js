(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.nakedSingle = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'nakedSingle',
    tier: 1,
    find(values, cands) {
      for (let cell = 0; cell < 81; cell++) {
        if (!values[cell] && core.countBits(cands[cell]) === 1) {
          const digit = core.lowestDigit(cands[cell]);
          return H.placementStep('nakedSingle', 1, cell, digit, 'explain.nakedSingle', {
            cell: H.refCell(cell),
            digit,
          });
        }
      }
      return null;
    },
  };
});

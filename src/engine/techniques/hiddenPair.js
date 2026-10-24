(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.hiddenPair = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'hiddenPair',
    tier: 2,
    find(values, cands) {
      for (let u = 0; u < 27; u++) {
        const positions = H.digitMasksInUnit(u, cands);
        for (let a = 1; a <= 8; a++) {
          if (!positions.get(a) || !positions.get(a).length) continue;
          for (let b = a + 1; b <= 9; b++) {
            if (!positions.get(b) || !positions.get(b).length) continue;
            if (positions.get(a).length === 1 || positions.get(b).length === 1) continue;
            const cells = Array.from(new Set(positions.get(a).concat(positions.get(b))));
            if (cells.length !== 2) continue;
            const digitsSet = [a, b];
            const eliminations = [];
            for (const cell of cells) {
              for (const digit of core.digits(cands[cell])) {
                if (!digitsSet.includes(digit)) eliminations.push({ cell, digit });
              }
            }
            if (!eliminations.length) continue;
            const meta = core.UNIT_NAMES[u];
            return H.makeStep('hiddenPair', 2, {
              eliminations,
              highlights: {
                primary: cells,
                secondary: eliminations.map((e) => e.cell),
                units: [u],
                candidates: digitsSet.map((digit) => ({ cell: cells[0], digit, role: 'pattern' }))
                  .concat(digitsSet.map((digit) => ({ cell: cells[1], digit, role: 'pattern' }))),
              },
              explainKey: 'explain.hiddenPair',
              explainVars: {
                unit: H.refUnit(meta.type, meta.index),
                cells: H.refCells(cells),
                digits: H.refDigits(digitsSet),
                eliminations: H.refCands(eliminations),
              },
              data: { unit: u, cells, digits: digitsSet },
            });
          }
        }
      }
      return null;
    },
  };
});

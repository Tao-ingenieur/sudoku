(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.nakedPair = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'nakedPair',
    tier: 2,
    find(values, cands) {
      for (let u = 0; u < 27; u++) {
        const cells = H.cellsInUnit(u, cands).filter((cell) => core.countBits(cands[cell]) === 2);
        for (let i = 0; i < cells.length; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            if (cands[cells[i]] !== cands[cells[j]]) continue;
            const pair = cells[i];
            const other = cells[j];
            const digitMask = cands[pair];
            const eliminations = [];
            for (const cell of core.UNITS[u]) {
              if (cell === pair || cell === other) continue;
              for (const digit of core.digits(digitMask)) {
                if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
              }
            }
            if (!eliminations.length) continue;
            const ds = core.digits(digitMask);
            const meta = core.UNIT_NAMES[u];
            return H.makeStep('nakedPair', 2, {
              eliminations,
              highlights: {
                primary: [pair, other],
                secondary: eliminations.map((e) => e.cell),
                units: [u],
                candidates: ds.map((digit) => ({ cell: pair, digit, role: 'pattern' }))
                  .concat(ds.map((digit) => ({ cell: other, digit, role: 'pattern' }))),
              },
              explainKey: 'explain.nakedPair',
              explainVars: {
                unit: H.refUnit(meta.type, meta.index),
                cells: H.refCells([pair, other]),
                digits: H.refDigits(ds),
                eliminations: H.refCands(eliminations),
              },
              data: { unit: u, cells: [pair, other], digits: ds },
            });
          }
        }
      }
      return null;
    },
  };
});

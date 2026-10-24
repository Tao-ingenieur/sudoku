(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.nakedTriple = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'nakedTriple',
    tier: 3,
    find(values, cands) {
      for (let u = 0; u < 27; u++) {
        const cells = H.cellsInUnit(u, cands).filter((cell) => {
          const n = core.countBits(cands[cell]);
          return n >= 2 && n <= 3;
        });
        for (let a = 0; a < cells.length - 2; a++) {
          for (let b = a + 1; b < cells.length - 1; b++) {
            for (let c = b + 1; c < cells.length; c++) {
              const trio = [cells[a], cells[b], cells[c]];
              const union = cands[trio[0]] | cands[trio[1]] | cands[trio[2]];
              if (core.countBits(union) !== 3) continue;
              const ds = core.digits(union);
              const eliminations = [];
              for (const cell of core.UNITS[u]) {
                if (trio.includes(cell)) continue;
                for (const digit of ds) if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
              }
              if (!eliminations.length) continue;
              const meta = core.UNIT_NAMES[u];
              return H.makeStep('nakedTriple', 3, {
                eliminations,
                highlights: {
                  primary: trio,
                  secondary: eliminations.map((e) => e.cell),
                  units: [u],
                  candidates: trio.flatMap((cell) => ds.map((digit) => ({ cell, digit, role: 'pattern' }))),
                },
                explainKey: 'explain.nakedTriple',
                explainVars: {
                  unit: H.refUnit(meta.type, meta.index),
                  cells: H.refCells(trio),
                  digits: H.refDigits(ds),
                  eliminations: H.refCands(eliminations),
                },
                data: { unit: u, cells: trio, digits: ds },
              });
            }
          }
        }
      }
      return null;
    },
  };
});

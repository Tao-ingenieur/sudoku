(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.hiddenTriple = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'hiddenTriple',
    tier: 3,
    find(values, cands) {
      for (let u = 0; u < 27; u++) {
        const positions = H.digitMasksInUnit(u, cands);
        const active = [];
        for (let d = 1; d <= 9; d++) if (positions.get(d) && positions.get(d).length > 1) active.push(d);
        for (let a = 0; a < active.length - 2; a++) {
          for (let b = a + 1; b < active.length - 1; b++) {
            for (let c = b + 1; c < active.length; c++) {
              const ds = [active[a], active[b], active[c]];
              const cells = Array.from(new Set(ds.flatMap((d) => positions.get(d))));
              if (cells.length !== 3) continue;
              const eliminations = [];
              for (const cell of cells) {
                for (const digit of core.digits(cands[cell])) {
                  if (!ds.includes(digit)) eliminations.push({ cell, digit });
                }
              }
              if (!eliminations.length) continue;
              const meta = core.UNIT_NAMES[u];
              return H.makeStep('hiddenTriple', 3, {
                eliminations,
                highlights: {
                  primary: cells,
                  secondary: eliminations.map((e) => e.cell),
                  units: [u],
                  candidates: cells.flatMap((cell) => ds.map((digit) => ({ cell, digit, role: 'pattern' }))),
                },
                explainKey: 'explain.hiddenTriple',
                explainVars: {
                  unit: H.refUnit(meta.type, meta.index),
                  cells: H.refCells(cells),
                  digits: H.refDigits(ds),
                  eliminations: H.refCands(eliminations),
                },
                data: { unit: u, cells, digits: ds },
              });
            }
          }
        }
      }
      return null;
    },
  };
});

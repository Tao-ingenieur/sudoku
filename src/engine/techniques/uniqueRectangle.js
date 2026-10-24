(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.uniqueRectangle = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'uniqueRectangle',
    tier: 4,
    find(values, cands) {
      for (let r1 = 0; r1 < 8; r1++) {
        for (let r2 = r1 + 1; r2 < 9; r2++) {
          for (let c1 = 0; c1 < 8; c1++) {
            for (let c2 = c1 + 1; c2 < 9; c2++) {
              const corners = [
                core.idx(r1, c1), core.idx(r1, c2), core.idx(r2, c1), core.idx(r2, c2),
              ];
              if (corners.some((cell) => !cands[cell])) continue;
              // A deadly rectangle needs two boxes, not four, otherwise boxes
              // break the symmetry.
              if (new Set(corners.map(core.boxOf)).size !== 2) continue;
              const common = corners.reduce((mask, cell) => mask & cands[cell], core.ALL);
              if (core.countBits(common) < 2) continue;
              const ds = core.digits(common);
              for (let a = 0; a < ds.length - 1; a++) {
                for (let b = a + 1; b < ds.length; b++) {
                  const pairMask = core.bit(ds[a]) | core.bit(ds[b]);
                  const bivalue = corners.filter((cell) => cands[cell] === pairMask);
                  if (bivalue.length !== 3) continue;
                  const extraCell = corners.find((cell) => cands[cell] !== pairMask);
                  if (!extraCell) continue;
                  const extra = core.digits(cands[extraCell] & ~pairMask);
                  if (!extra.length) continue;
                  const pair = [ds[a], ds[b]];
                  const eliminations = pair.map((digit) => ({ cell: extraCell, digit }));
                  const bivalueCells = bivalue;
                  return H.makeStep('uniqueRectangle', 4, {
                    eliminations,
                    highlights: {
                      primary: corners,
                      candidates: pair.map((digit) => ({ cell: extraCell, digit, role: 'pattern' }))
                        .concat(pair.map((digit) => ({ cell: bivalueCells[0], digit, role: 'pattern' }))),
                    },
                    explainKey: 'explain.uniqueRectangle',
                    explainVars: {
                      corners: H.refCells(corners),
                      pair: H.refDigits(pair),
                      extraCell: H.refCell(extraCell),
                      extraDigits: H.refDigits(extra),
                      eliminations: H.refCands(eliminations),
                    },
                    data: { corners, pair, extraCell, assumesUnique: true },
                  });
                }
              }
            }
          }
        }
      }
      return null;
    },
  };
});

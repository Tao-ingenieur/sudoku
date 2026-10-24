(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.twoStringKite = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'twoStringKite',
    tier: 3,
    find(values, cands) {
      for (let digit = 1; digit <= 9; digit++) {
        for (let r = 0; r < 9; r++) {
          const rowSpots = H.positionsInUnit(core.ROW_UNITS[r], digit, cands);
          if (rowSpots.length !== 2) continue;
          for (let c = 0; c < 9; c++) {
            const colSpots = H.positionsInUnit(core.COL_UNITS[c], digit, cands);
            if (colSpots.length !== 2) continue;
            for (const rowSpot of rowSpots) {
              for (const colSpot of colSpots) {
                if (rowSpot === colSpot) continue;
                if (core.boxOf(rowSpot) !== core.boxOf(colSpot)) continue;
                const rowFree = rowSpots.find((cell) => cell !== rowSpot);
                const colFree = colSpots.find((cell) => cell !== colSpot);
                if (!rowFree || !colFree || rowFree === colFree) continue;
                const eliminations = H.uniqueEliminations(
                  H.commonPeers(rowFree, colFree).map((cell) => ({ cell, digit })),
                  cands
                );
                if (!eliminations.length) continue;
                const pattern = rowSpots.concat(colSpots);
                return H.makeStep('twoStringKite', 3, {
                  eliminations,
                  highlights: {
                    primary: pattern,
                    secondary: eliminations.map((e) => e.cell),
                    candidates: pattern.map((cell) => ({ cell, digit, role: 'pattern' })),
                  },
                  explainKey: 'explain.twoStringKite',
                  explainVars: {
                    digit,
                    rowUnit: H.refUnit('row', r),
                    colUnit: H.refUnit('col', c),
                    boxEndpoints: H.refCells([rowSpot, colSpot]),
                    freeEnds: H.refCells([rowFree, colFree]),
                    eliminations: H.refCands(eliminations),
                  },
                  data: { digit, row: r, col: c, endpoints: [rowSpot, colSpot], free: [rowFree, colFree] },
                });
              }
            }
          }
        }
      }
      return null;
    },
  };
});

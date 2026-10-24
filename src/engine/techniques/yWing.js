(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.yWing = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'yWing',
    tier: 3,
    find(values, cands) {
      const bivalue = [];
      for (let cell = 0; cell < 81; cell++) if (core.countBits(cands[cell]) === 2) bivalue.push(cell);
      for (const pivot of bivalue) {
        const pivotMask = cands[pivot];
        const pincers = bivalue.filter((cell) => cell !== pivot && H.sees(cell, pivot) &&
          core.countBits(cands[cell] & pivotMask) === 1);
        for (let i = 0; i < pincers.length; i++) {
          for (let j = i + 1; j < pincers.length; j++) {
            const p1 = pincers[i];
            const p2 = pincers[j];
            const m1 = cands[p1];
            const m2 = cands[p2];
            const sharedPivot1 = m1 & pivotMask;
            const sharedPivot2 = m2 & pivotMask;
            if (sharedPivot1 === sharedPivot2) continue;
            const other1 = m1 & ~pivotMask;
            const other2 = m2 & ~pivotMask;
            if (core.countBits(other1) !== 1 || other1 !== other2) continue;
            const z = core.lowestDigit(other1);
            const eliminations = H.uniqueEliminations(
              H.commonPeers(p1, p2).filter((cell) => cell !== pivot).map((cell) => ({ cell, digit: z })),
              cands
            );
            if (!eliminations.length) continue;
            const cellList = [pivot, p1, p2];
            return H.makeStep('yWing', 3, {
              eliminations,
              highlights: {
                primary: cellList,
                secondary: eliminations.map((e) => e.cell),
                candidates: cellList.map((cell) => ({ cell, digit: z, role: 'pattern' })),
              },
              explainKey: 'explain.yWing',
              explainVars: {
                pivot: H.refCell(pivot),
                pivotDigits: H.refDigits(core.digits(pivotMask)),
                wing1: H.refCell(p1),
                wing1Digits: H.refDigits(core.digits(m1)),
                wing2: H.refCell(p2),
                wing2Digits: H.refDigits(core.digits(m2)),
                digit: z,
                eliminations: H.refCands(eliminations),
              },
              data: { pivot, wings: [p1, p2], digit: z },
            });
          }
        }
      }
      return null;
    },
  };
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.xWing = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';

  function scan(digit, baseType, cands) {
    const bases = [];
    for (let i = 0; i < 9; i++) {
      const unitIndex = baseType === 'row' ? core.ROW_UNITS[i] : core.COL_UNITS[i];
      const spots = H.positionsInUnit(unitIndex, digit, cands);
      if (spots.length === 2) bases.push({ index: i, spots });
    }
    const coverKey = (cell) => baseType === 'row' ? core.colOf(cell) : core.rowOf(cell);
    for (let i = 0; i < bases.length - 1; i++) {
      for (let j = i + 1; j < bases.length; j++) {
        const a = bases[i].spots;
        const b = bases[j].spots;
        const keyA = a.map(coverKey).sort((x, y) => x - y);
        const keyB = b.map(coverKey).sort((x, y) => x - y);
        if (keyA[0] !== keyB[0] || keyA[1] !== keyB[1]) continue;
        const coverA = keyA[0];
        const coverB = keyA[1];
        const eliminations = [];
        for (const cover of [coverA, coverB]) {
          const unitIndex = baseType === 'row' ? core.COL_UNITS[cover] : core.ROW_UNITS[cover];
          for (const cell of core.UNITS[unitIndex]) {
            if (a.includes(cell) || b.includes(cell)) continue;
            if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
          }
        }
        if (!eliminations.length) continue;
        const all = a.concat(b);
        const coverType = baseType === 'row' ? 'col' : 'row';
        return H.makeStep('xWing', 3, {
          eliminations,
          highlights: {
            primary: all,
            secondary: eliminations.map((e) => e.cell),
            candidates: all.map((cell) => ({ cell, digit, role: 'pattern' })),
          },
          explainKey: 'explain.xWing',
          explainVars: {
            digit,
            baseUnits: H.refUnits(baseType, [bases[i].index, bases[j].index]),
            coverUnits: H.refUnits(coverType, [coverA, coverB]),
            eliminations: H.refCands(eliminations),
          },
          data: { digit, baseType, baseIndices: [bases[i].index, bases[j].index], coverIndices: [coverA, coverB] },
        });
      }
    }
    return null;
  }

  return {
    id: 'xWing',
    tier: 3,
    find(values, cands) {
      for (let digit = 1; digit <= 9; digit++) {
        let step = scan(digit, 'row', cands);
        if (step) return step;
        step = scan(digit, 'col', cands);
        if (step) return step;
      }
      return null;
    },
  };
});

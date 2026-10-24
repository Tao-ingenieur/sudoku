(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.jellyfish = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';

  function coverIndex(baseType, cell) {
    return baseType === 'row' ? core.colOf(cell) : core.rowOf(cell);
  }

  function coverUnit(baseType, index) {
    return baseType === 'row' ? core.COL_UNITS[index] : core.ROW_UNITS[index];
  }

  function scan(digit, baseType, cands) {
    const bases = [];
    for (let i = 0; i < 9; i++) {
      const spots = H.positionsInUnit(baseType === 'row' ? core.ROW_UNITS[i] : core.COL_UNITS[i], digit, cands);
      if (spots.length >= 2 && spots.length <= 4) bases.push({ index: i, spots });
    }
    for (let a = 0; a < bases.length - 3; a++) {
      for (let b = a + 1; b < bases.length - 2; b++) {
        for (let c = b + 1; c < bases.length - 1; c++) {
          for (let d = c + 1; d < bases.length; d++) {
            const quad = [bases[a], bases[b], bases[c], bases[d]];
            const coverSet = new Set();
            quad.forEach((base) => base.spots.forEach((cell) => coverSet.add(coverIndex(baseType, cell))));
            if (coverSet.size !== 4) continue;
            const covers = Array.from(coverSet);
            const baseIndices = quad.map((q) => q.index);
            const pattern = quad.flatMap((q) => q.spots);
            const eliminations = [];
            for (const cover of covers) {
              for (const cell of core.UNITS[coverUnit(baseType, cover)]) {
                const onBase = baseType === 'row' ? baseIndices.includes(core.rowOf(cell)) : baseIndices.includes(core.colOf(cell));
                if (onBase) continue;
                if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
              }
            }
            if (!eliminations.length) continue;
            const coverType = baseType === 'row' ? 'col' : 'row';
            return H.makeStep('jellyfish', 4, {
              eliminations,
              highlights: {
                primary: pattern,
                secondary: eliminations.map((e) => e.cell),
                candidates: pattern.map((cell) => ({ cell, digit, role: 'pattern' })),
              },
              explainKey: 'explain.jellyfish',
              explainVars: {
                digit,
                baseUnits: H.refUnits(baseType, baseIndices),
                coverUnits: H.refUnits(coverType, covers),
                eliminations: H.refCands(eliminations),
              },
              data: { digit, baseType, baseIndices, coverIndices: covers },
            });
          }
        }
      }
    }
    return null;
  }

  return {
    id: 'jellyfish',
    tier: 4,
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

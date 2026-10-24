(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.swordfish = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';

  function lineCells(baseType, index) {
    return core.UNITS[baseType === 'row' ? core.ROW_UNITS[index] : core.COL_UNITS[index]];
  }

  function coverIndex(baseType, cell) {
    return baseType === 'row' ? core.colOf(cell) : core.rowOf(cell);
  }

  function unitIndex(baseType, index) {
    return baseType === 'row' ? core.COL_UNITS[index] : core.ROW_UNITS[index];
  }

  function scan(digit, baseType, cands) {
    const bases = [];
    for (let i = 0; i < 9; i++) {
      const spots = H.positionsInUnit(baseType === 'row' ? core.ROW_UNITS[i] : core.COL_UNITS[i], digit, cands);
      if (spots.length >= 2 && spots.length <= 3) bases.push({ index: i, spots });
    }
    for (let a = 0; a < bases.length - 2; a++) {
      for (let b = a + 1; b < bases.length - 1; b++) {
        for (let c = b + 1; c < bases.length; c++) {
          const trio = [bases[a], bases[b], bases[c]];
          const coverIndices = new Set();
          trio.forEach((base) => base.spots.forEach((cell) => coverIndices.add(coverIndex(baseType, cell))));
          if (coverIndices.size !== 3) continue;
          const covers = Array.from(coverIndices).sort((x, y) => x - y);
          const baseIndices = trio.map((t) => t.index);
          const pattern = trio.flatMap((t) => t.spots);
          const eliminations = [];
          for (const cover of covers) {
            for (const cell of core.UNITS[unitIndex(baseType, cover)]) {
              const onBase = baseType === 'row' ? baseIndices.includes(core.rowOf(cell)) : baseIndices.includes(core.colOf(cell));
              if (onBase) continue;
              if (cands[cell] & core.bit(digit)) eliminations.push({ cell, digit });
            }
          }
          if (!eliminations.length) continue;
          const coverType = baseType === 'row' ? 'col' : 'row';
          return H.makeStep('swordfish', 3, {
            eliminations,
            highlights: {
              primary: pattern,
              secondary: eliminations.map((e) => e.cell),
              candidates: pattern.map((cell) => ({ cell, digit, role: 'pattern' })),
            },
            explainKey: 'explain.swordfish',
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
    return null;
  }

  return {
    id: 'swordfish',
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

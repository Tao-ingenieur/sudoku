(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.skyscraper = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';

  function scan(digit, baseType, cands) {
    const lines = [];
    for (let i = 0; i < 9; i++) {
      const unit = baseType === 'row' ? core.ROW_UNITS[i] : core.COL_UNITS[i];
      const spots = H.positionsInUnit(unit, digit, cands);
      if (spots.length === 2) lines.push({ index: i, spots });
    }
    for (let i = 0; i < lines.length - 1; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i].spots;
        const b = lines[j].spots;
        const key = (cell) => baseType === 'row' ? core.colOf(cell) : core.rowOf(cell);
        const aKeys = a.map(key);
        const bKeys = b.map(key);
        let shared = null;
        for (const k of aKeys) if (bKeys.includes(k)) shared = k;
        if (shared === null) continue;
        const roof1 = a.find((cell) => key(cell) !== shared);
        const roof2 = b.find((cell) => key(cell) !== shared);
        if (!roof1 || !roof2 || roof1 === roof2) continue;
        const common = H.commonPeers(roof1, roof2);
        const eliminations = H.uniqueEliminations(common.map((cell) => ({ cell, digit })), cands);
        if (!eliminations.length) continue;
        const pattern = a.concat(b);
        const sharedType = baseType === 'row' ? 'col' : 'row';
        return H.makeStep('skyscraper', 3, {
          eliminations,
          highlights: {
            primary: pattern,
            secondary: [roof1, roof2].concat(eliminations.map((e) => e.cell)),
            candidates: pattern.map((cell) => ({ cell, digit, role: 'pattern' })),
          },
          explainKey: 'explain.skyscraper',
          explainVars: {
            digit,
            baseUnits: H.refUnits(baseType, [lines[i].index, lines[j].index]),
            baseUnit: H.refUnit(sharedType, shared),
            roofs: H.refCells([roof1, roof2]),
            eliminations: H.refCands(eliminations),
          },
          data: { digit, baseType, baseIndices: [lines[i].index, lines[j].index], roofs: [roof1, roof2] },
        });
      }
    }
    return null;
  }

  return {
    id: 'skyscraper',
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

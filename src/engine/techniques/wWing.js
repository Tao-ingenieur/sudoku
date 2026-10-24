(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.wWing = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'wWing',
    tier: 4,
    find(values, cands) {
      const bivalue = [];
      for (let cell = 0; cell < 81; cell++) if (core.countBits(cands[cell]) === 2) bivalue.push(cell);
      const linksByDigit = Array.from({ length: 10 }, () => []);
      for (let digit = 1; digit <= 9; digit++) {
        for (let u = 0; u < 27; u++) {
          const spots = H.positionsInUnit(u, digit, cands);
          if (spots.length === 2) linksByDigit[digit].push({ p: spots[0], q: spots[1], unit: u });
        }
      }
      for (const x of bivalue) {
        const mask = cands[x];
        const ds = core.digits(mask);
        for (const a of ds) {
          const b = ds[0] === a ? ds[1] : ds[0];
          for (const y of bivalue) {
            if (y <= x || cands[y] !== mask || H.sees(x, y)) continue;
            for (const link of linksByDigit[a]) {
              if ([x, y].includes(link.p) || [x, y].includes(link.q)) continue;
              const orientationA = H.sees(x, link.p) && H.sees(y, link.q);
              const orientationB = H.sees(x, link.q) && H.sees(y, link.p);
              if (!orientationA && !orientationB) continue;
              const eliminations = H.uniqueEliminations(
                H.commonPeers(x, y).map((cell) => ({ cell, digit: b })),
                cands
              );
              if (!eliminations.length) continue;
              const meta = core.UNIT_NAMES[link.unit];
              return H.makeStep('wWing', 4, {
                eliminations,
                highlights: {
                  primary: [x, y, link.p, link.q],
                  secondary: eliminations.map((e) => e.cell),
                  units: [link.unit],
                  candidates: [
                    { cell: x, digit: b, role: 'pattern' }, { cell: y, digit: b, role: 'pattern' },
                    { cell: link.p, digit: a, role: 'pattern' }, { cell: link.q, digit: a, role: 'pattern' },
                  ],
                },
                explainKey: 'explain.wWing',
                explainVars: {
                  endpoints: H.refCells([x, y]),
                  digits: H.refDigits(ds),
                  linkDigit: a,
                  eliminated: b,
                  linkCells: H.refCells([link.p, link.q]),
                  strongUnit: H.refUnit(meta.type, meta.index),
                  eliminations: H.refCands(eliminations),
                },
                data: { endpoints: [x, y], strongLink: [link.p, link.q], strongUnit: link.unit, eliminated: b, digits: ds },
              });
            }
          }
        }
      }
      return null;
    },
  };
});

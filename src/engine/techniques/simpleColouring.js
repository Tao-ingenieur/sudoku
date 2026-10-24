(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.simpleColouring = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'simpleColouring',
    tier: 4,
    find(values, cands) {
      for (let digit = 1; digit <= 9; digit++) {
        const adj = Array.from({ length: 81 }, () => []);
        for (let u = 0; u < 27; u++) {
          const spots = H.positionsInUnit(u, digit, cands);
          if (spots.length === 2) {
            adj[spots[0]].push(spots[1]);
            adj[spots[1]].push(spots[0]);
          }
        }
        const color = new Int8Array(81).fill(-1);
        const seen = new Uint8Array(81);
        for (let start = 0; start < 81; start++) {
          if (seen[start] || !adj[start].length) continue;
          const queue = [start];
          color[start] = 0;
          seen[start] = 1;
          const component = [];
          let consistent = true;
          while (queue.length) {
            const cell = queue.shift();
            component.push(cell);
            for (const neighbor of adj[cell]) {
              if (!seen[neighbor]) {
                seen[neighbor] = 1;
                color[neighbor] = 1 - color[cell];
                queue.push(neighbor);
              } else if (color[neighbor] === color[cell]) {
                consistent = false;
              }
            }
          }
          if (!consistent || component.length < 3) continue;
          const groupA = component.filter((cell) => color[cell] === 0);
          const groupB = component.filter((cell) => color[cell] === 1);
          // Rule 1: two same-coloured candidates that see each other mean that
          // colour cannot be true, so erase the whole colour.
          for (const group of [groupA, groupB]) {
            const colour = group === groupA ? 'A' : 'B';
            for (let i = 0; i < group.length; i++) {
              for (let j = i + 1; j < group.length; j++) {
                if (!H.sees(group[i], group[j])) continue;
                const eliminations = group.map((cell) => ({ cell, digit }));
                return H.makeStep('simpleColouring', 4, {
                  eliminations,
                  highlights: {
                    primary: component,
                    secondary: eliminations.map((e) => e.cell),
                    candidates: component.map((cell) => ({ cell, digit, role: color[cell] === 0 ? 'color-a' : 'color-b' })),
                  },
                  explainKey: 'explain.simpleColouring.sameColour',
                  explainVars: {
                    digit,
                    colour,
                    conflictCells: H.refCells([group[i], group[j]]),
                    eliminations: H.refCands(eliminations),
                  },
                  data: { digit, colors: { a: groupA, b: groupB }, rule: 'sameColourConflict' },
                });
              }
            }
          }
          // Rule 2: an uncoloured candidate seeing one cell of each colour
          // cannot itself be the digit.
          const eliminations = [];
          for (let cell = 0; cell < 81; cell++) {
            if (component.includes(cell) || !(cands[cell] & core.bit(digit))) continue;
            let seesA = false;
            let seesB = false;
            for (const other of groupA) if (H.sees(cell, other)) seesA = true;
            for (const other of groupB) if (H.sees(cell, other)) seesB = true;
            if (seesA && seesB) eliminations.push({ cell, digit });
          }
          if (!eliminations.length) continue;
          const cellsAll = component;
          return H.makeStep('simpleColouring', 4, {
            eliminations,
            highlights: {
              primary: cellsAll,
              secondary: eliminations.map((e) => e.cell),
              candidates: cellsAll.map((cell) => ({ cell, digit, role: color[cell] === 0 ? 'color-a' : 'color-b' })),
            },
            explainKey: 'explain.simpleColouring.bothColours',
            explainVars: {
              digit,
              eliminations: H.refCands(eliminations),
            },
            data: { digit, colors: { a: groupA, b: groupB }, rule: 'seesBothColours' },
          });
        }
      }
      return null;
    },
  };
});

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core.js'), require('../util.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.Techniques = root.Sudoku.Techniques || {};
    root.Sudoku.Techniques.xyChain = factory(root.Sudoku.core, root.Sudoku.util);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core, H) {
  'use strict';
  return {
    id: 'xyChain',
    tier: 4,
    find(values, cands) {
      const bivalue = [];
      for (let cell = 0; cell < 81; cell++) if (core.countBits(cands[cell]) === 2) bivalue.push(cell);
      const bivalueSet = new Set(bivalue);
      const peerBivalue = new Map();
      for (const cell of bivalue) {
        peerBivalue.set(cell, H.PEERS_FOR_TEST ? [] : core.PEERS[cell].filter((p) => bivalueSet.has(p)));
      }
      let nodes = 0;
      const NODE_LIMIT = 70000;
      const MAX_LENGTH = 8;

      function otherDigit(mask, digit) {
        for (const d of core.digits(mask)) if (d !== digit) return d;
        return 0;
      }

      function search(start, z) {
        const firstOut = otherDigit(cands[start], z);
        const path = [start];
        const visited = new Set([start]);

        function walk(current, outgoing) {
          if (++nodes > NODE_LIMIT) return null;
          const neighbors = peerBivalue.get(current) || [];
          for (const next of neighbors) {
            if (visited.has(next)) continue;
            if (!(cands[next] & core.bit(outgoing))) continue;
            const nextMask = cands[next];
            const nextOut = otherDigit(nextMask, outgoing);
            path.push(next);
            visited.add(next);
            if (path.length >= 4 && (nextMask & core.bit(z))) {
              const eliminations = H.uniqueEliminations(
                H.commonPeers(start, next)
                  .filter((cell) => !visited.has(cell))
                  .map((cell) => ({ cell, digit: z })),
                cands
              );
              if (eliminations.length) {
                return H.makeStep('xyChain', 4, {
                  eliminations,
                  highlights: {
                    primary: path.slice(),
                    secondary: eliminations.map((e) => e.cell),
                    candidates: [{ cell: start, digit: z, role: 'pattern' }, { cell: next, digit: z, role: 'pattern' }],
                  },
                  explainKey: 'explain.xyChain',
                  explainVars: {
                    start: H.refCell(start),
                    end: H.refCell(next),
                    digit: z,
                    chain: H.refChain(path.map((cell) => ({ cell, digits: core.digits(cands[cell]) }))),
                    eliminations: H.refCands(eliminations),
                  },
                  data: { chain: path.slice(), digit: z },
                });
              }
            }
            if (path.length < MAX_LENGTH) {
              const found = walk(next, nextOut);
              if (found) return found;
            }
            visited.delete(next);
            path.pop();
          }
          return null;
        }
        return walk(start, firstOut);
      }

      for (const start of bivalue) {
        for (const z of core.digits(cands[start])) {
          const step = search(start, z);
          if (step) return step;
          if (nodes > NODE_LIMIT) return null;
        }
      }
      return null;
    },
  };
});

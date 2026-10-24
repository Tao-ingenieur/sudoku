/*
 * Sudoku core — platform independent.
 * Works as a CommonJS module in Node and exposes window.Sudoku.core in browsers.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SIZE = 9;
  const CELLS = 81;
  const ALL = 0x1ff; // bits 1..9
  const EMPTY = 0;

  const rowOf = (i) => (i / 9) | 0;
  const colOf = (i) => i % 9;
  const boxOf = (i) => ((rowOf(i) / 3) | 0) * 3 + ((colOf(i) / 3) | 0);
  const idx = (r, c) => r * 9 + c;

  const UNITS = [];
  const UNIT_NAMES = [];
  // Rows, columns and boxes each form nine units. Keeping a stable order makes
  // solver traces deterministic across browser and desktop builds.
  for (let r = 0; r < 9; r++) {
    const cells = [];
    for (let c = 0; c < 9; c++) cells.push(idx(r, c));
    UNITS.push(cells);
    UNIT_NAMES.push({ type: 'row', index: r });
  }
  for (let c = 0; c < 9; c++) {
    const cells = [];
    for (let r = 0; r < 9; r++) cells.push(idx(r, c));
    UNITS.push(cells);
    UNIT_NAMES.push({ type: 'col', index: c });
  }
  for (let br = 0; br < 3; br++) {
    for (let bc = 0; bc < 3; bc++) {
      const cells = [];
      for (let dr = 0; dr < 3; dr++) {
        for (let dc = 0; dc < 3; dc++) cells.push(idx(br * 3 + dr, bc * 3 + dc));
      }
      UNITS.push(cells);
      UNIT_NAMES.push({ type: 'box', index: br * 3 + bc });
    }
  }

  const CELL_UNITS = Array.from({ length: CELLS }, () => []);
  UNITS.forEach((cells, u) => cells.forEach((cell) => CELL_UNITS[cell].push(u)));

  const PEERS = [];
  const PEER_SETS = [];
  for (let cell = 0; cell < CELLS; cell++) {
    const set = new Set();
    CELL_UNITS[cell].forEach((u) => UNITS[u].forEach((other) => {
      if (other !== cell) set.add(other);
    }));
    PEERS.push(Array.from(set));
    PEER_SETS.push(set);
  }

  const ROW_UNITS = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  const COL_UNITS = [9, 10, 11, 12, 13, 14, 15, 16, 17];
  const BOX_UNITS = [18, 19, 20, 21, 22, 23, 24, 25, 26];
  const ROWS = ROW_UNITS.map((u) => UNITS[u]);
  const COLS = COL_UNITS.map((u) => UNITS[u]);
  const BOXES = BOX_UNITS.map((u) => UNITS[u]);

  function bit(digit) { return 1 << (digit - 1); }
  function has(mask, digit) { return (mask & bit(digit)) !== 0; }
  function countBits(mask) {
    let count = 0;
    while (mask) { mask &= mask - 1; count++; }
    return count;
  }
  function digits(mask) {
    const out = [];
    for (let d = 1; d <= 9; d++) if (mask & bit(d)) out.push(d);
    return out;
  }
  function lowestDigit(mask) {
    for (let d = 1; d <= 9; d++) if (mask & bit(d)) return d;
    return 0;
  }
  function maskFromDigits(list) {
    let mask = 0;
    list.forEach((d) => { mask |= bit(d); });
    return mask;
  }

  /** Accept 81 cells made of 1-9, 0, . or -; whitespace is ignored. */
  function parse(text) {
    if (typeof text !== 'string') throw new Error('Puzzle must be a string');
    const compact = text.replace(/\s+/g, '').replace(/[-_.]/g, '.');
    if (compact.length !== 81) throw new Error('Puzzle must contain exactly 81 cells');
    const values = [];
    for (const ch of compact) {
      if (ch >= '1' && ch <= '9') values.push(Number(ch));
      else if (ch === '0' || ch === '.') values.push(0);
      else throw new Error('Puzzle contains an invalid character: ' + ch);
    }
    return values;
  }

  /** Convert a 9x9 array into the flat representation used by the engine. */
  function fromRows(rows) {
    if (!Array.isArray(rows) || rows.length !== 9) throw new Error('Expected 9 rows');
    const values = [];
    for (const row of rows) {
      if (!Array.isArray(row) || row.length !== 9) throw new Error('Expected 9 columns');
      for (const value of row) values.push(Number(value) || 0);
    }
    return values;
  }

  function toRows(values) {
    const rows = [];
    for (let r = 0; r < 9; r++) rows.push(values.slice(r * 9, r * 9 + 9));
    return rows;
  }

  function toPuzzleString(values) {
    return values.map((v) => (v ? String(v) : '.')).join('');
  }

  /** Return all cells that participate in a duplicate (row/column/box). */
  function conflicts(values) {
    const bad = new Set();
    for (const unit of UNITS) {
      const seen = new Map();
      for (const cell of unit) {
        const value = values[cell];
        if (!value) continue;
        if (!seen.has(value)) seen.set(value, []);
        seen.get(value).push(cell);
      }
      for (const list of seen.values()) {
        if (list.length > 1) list.forEach((cell) => bad.add(cell));
      }
    }
    return Array.from(bad);
  }

  function isValid(values) {
    return values.length === 81 && conflicts(values).length === 0;
  }

  function isSolved(values) {
    if (values.length !== 81 || values.some((v) => v < 1 || v > 9)) return false;
    return conflicts(values).length === 0;
  }

  /** Candidates for every cell, derived only from solved values. */
  function candidates(values) {
    const cands = new Uint16Array(CELLS);
    for (let cell = 0; cell < CELLS; cell++) {
      if (values[cell]) continue;
      let used = 0;
      for (const peer of PEERS[cell]) used |= bit(values[peer]);
      cands[cell] = ALL & ~used;
    }
    return cands;
  }

  function validate(values) {
    if (!Array.isArray(values) && !ArrayBuffer.isView(values)) {
      return { ok: false, error: 'Board must be an array' };
    }
    if (values.length !== 81) return { ok: false, error: 'Board must contain 81 cells' };
    for (const value of values) {
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        return { ok: false, error: 'Cell values must be integers from 0 to 9' };
      }
    }
    const bad = conflicts(values);
    if (bad.length) return { ok: false, error: 'Duplicate values', conflicts: bad };
    return { ok: true };
  }

  /**
   * Count solutions up to `limit` (2 by default). Uses bit masks and MRV, so it
   * is fast enough to run once for every candidate clue removal.
   */
  function countSolutions(values, limit, firstSolution) {
    limit = limit || 2;
    const board = Array.from(values);
    if (!isValid(board)) return 0;
    const rowMask = new Uint16Array(9);
    const colMask = new Uint16Array(9);
    const boxMask = new Uint16Array(9);
    for (let cell = 0; cell < CELLS; cell++) {
      const value = board[cell];
      if (!value) continue;
      const b = bit(value);
      rowMask[rowOf(cell)] |= b;
      colMask[colOf(cell)] |= b;
      boxMask[boxOf(cell)] |= b;
    }

    let count = 0;
    function search() {
      if (count >= limit) return;
      let best = -1;
      let bestMask = 0;
      let bestCount = 10;
      for (let cell = 0; cell < CELLS; cell++) {
        if (board[cell]) continue;
        const mask = ALL & ~(rowMask[rowOf(cell)] | colMask[colOf(cell)] | boxMask[boxOf(cell)]);
        const n = countBits(mask);
        if (n === 0) return;
        if (n < bestCount) {
          best = cell;
          bestMask = mask;
          bestCount = n;
          if (n === 1) break;
        }
      }
      if (best === -1) {
        count++;
        if (firstSolution && count === 1) firstSolution.splice(0, firstSolution.length, ...board);
        return;
      }
      const r = rowOf(best);
      const c = colOf(best);
      const b = boxOf(best);
      let mask = bestMask;
      while (mask) {
        const bv = mask & -mask;
        mask ^= bv;
        const value = Math.log2(bv) + 1;
        const db = bit(value);
        board[best] = value;
        rowMask[r] |= db; colMask[c] |= db; boxMask[b] |= db;
        search();
        rowMask[r] ^= db; colMask[c] ^= db; boxMask[b] ^= db;
        board[best] = 0;
        if (count >= limit) return;
      }
    }
    search();
    return count;
  }

  /** Return one solution, or null. */
  function solve(values) {
    const solution = [];
    return countSolutions(values, 1, solution) === 1 ? solution : null;
  }

  function difficultyForTier(tier) {
    if (tier <= 1) return 'easy';
    if (tier <= 3) return 'medium';
    return 'hard';
  }

  return {
    SIZE, CELLS, ALL, EMPTY,
    idx, rowOf, colOf, boxOf,
    UNITS, UNIT_NAMES, CELL_UNITS, PEERS, PEER_SETS,
    ROW_UNITS, COL_UNITS, BOX_UNITS, ROWS, COLS, BOXES,
    bit, has, countBits, digits, lowestDigit, maskFromDigits,
    parse, fromRows, toRows, toPuzzleString,
    conflicts, isValid, isSolved, candidates, validate,
    countSolutions, solve, difficultyForTier,
  };
});

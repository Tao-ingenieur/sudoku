/*
 * Lightweight offline digit classifier used where Web Workers/WASM are not
 * available (WeChat mini program) and as a fallback when Tesseract cannot be
 * loaded. It compares a normalised 16x16 ink pattern against templates
 * rendered from several common fonts.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./templates.js'));
  else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.ocrClassifier = factory(root.Sudoku.ocrTemplates);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (TEMPLATES) {
  'use strict';

  const SIZE = 16;
  const INK = 128;
  function holeFeatures(bits) {
    const seen = new Uint8Array(SIZE * SIZE);
    let holes = 0;
    let holeY = 0;
    let holePixels = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const start = y * SIZE + x;
        if (seen[start] || bits[start]) continue;
        const queue = [start];
        seen[start] = 1;
        let touchesBorder = false;
        let size = 0;
        let sumY = 0;
        while (queue.length) {
          const index = queue.pop();
          const px = index % SIZE;
          const py = (index / SIZE) | 0;
          size++;
          sumY += py;
          if (px === 0 || py === 0 || px === SIZE - 1 || py === SIZE - 1) touchesBorder = true;
          const neighbours = [index - 1, index + 1, index - SIZE, index + SIZE];
          for (const next of neighbours) {
            if (next < 0 || next >= SIZE * SIZE) continue;
            if (next === index - 1 && px === 0) continue;
            if (next === index + 1 && px === SIZE - 1) continue;
            if (!seen[next] && !bits[next]) {
              seen[next] = 1;
              queue.push(next);
            }
          }
        }
        if (!touchesBorder && size >= 4) {
          holes++;
          holeY += sumY / size;
          holePixels += size;
        }
      }
    }
    return { holes, holeY: holes ? holeY / holes : 0, holePixels };
  }

  const compiled = {};
  for (const digit of Object.keys(TEMPLATES)) {
    compiled[digit] = TEMPLATES[digit].map((rows) => {
      const bits = new Uint8Array(SIZE * SIZE);
      for (let i = 0; i < SIZE * SIZE; i++) bits[i] = rows.charCodeAt(i) === 49 ? 1 : 0;
      return { bits, features: holeFeatures(bits) };
    });
  }

  function grayAt(gray, width, height, x, y) {
    if (x < 0) x = 0;
    if (y < 0) y = 0;
    if (x >= width) x = width - 1;
    if (y >= height) y = height - 1;
    return gray[y * width + x];
  }

  function sampleRect(gray, width, height, rect, outW, outH) {
    const out = new Uint8Array(outW * outH);
    for (let y = 0; y < outH; y++) {
      const sy = rect.y + ((y + 0.5) * rect.h) / outH - 0.5;
      const y0 = Math.floor(sy);
      const fy = sy - y0;
      for (let x = 0; x < outW; x++) {
        const sx = rect.x + ((x + 0.5) * rect.w) / outW - 0.5;
        const x0 = Math.floor(sx);
        const fx = sx - x0;
        const a = grayAt(gray, width, height, x0, y0);
        const b = grayAt(gray, width, height, x0 + 1, y0);
        const c = grayAt(gray, width, height, x0, y0 + 1);
        const d = grayAt(gray, width, height, x0 + 1, y0 + 1);
        out[y * outW + x] = Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
      }
    }
    return out;
  }

  function bitsFromCell(gray, width, height, rect) {
    const raw = sampleRect(gray, width, height, rect, 32, 32);
    let min = 255;
    let max = 0;
    for (const value of raw) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min < 36) return null;
    const threshold = (min + max) / 2;
    let x0 = 32;
    let y0 = 32;
    let x1 = -1;
    let y1 = -1;
    let ink = 0;
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        if (raw[y * 32 + x] < threshold) {
          ink++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (ink < 6 || ink > 32 * 32 * 0.55 || x1 < x0 || y1 < y0) return null;
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    const scale = 12 / Math.max(bw, bh);
    const nw = Math.max(1, Math.round(bw * scale));
    const nh = Math.max(1, Math.round(bh * scale));
    const cropped = new Uint8Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) cropped[y * bw + x] = raw[(y + y0) * 32 + (x + x0)];
    }
    const small = sampleRect(cropped, bw, bh, { x: 0, y: 0, w: bw, h: bh }, nw, nh);
    const bits = new Uint8Array(SIZE * SIZE);
    const ox = Math.floor((SIZE - nw) / 2);
    const oy = Math.floor((SIZE - nh) / 2);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        if (small[y * nw + x] < 118) bits[(y + oy) * SIZE + (x + ox)] = 1;
      }
    }
    let count = 0;
    for (const bit of bits) count += bit;
    if (count < 5) return null;
    return bits;
  }

  function shiftDistance(bits, template, dx, dy) {
    let distance = 0;
    for (let y = 0; y < SIZE; y++) {
      const ty = y + dy;
      if (ty < 0 || ty >= SIZE) {
        for (let x = 0; x < SIZE; x++) distance += bits[y * SIZE + x];
        continue;
      }
      for (let x = 0; x < SIZE; x++) {
        const tx = x + dx;
        const a = bits[y * SIZE + x];
        const b = tx < 0 || tx >= SIZE ? 0 : template[ty * SIZE + tx];
        if (a !== b) distance++;
      }
    }
    return distance;
  }

  function classifyBits(bits) {
    const features = holeFeatures(bits);
    let bestDigit = 0;
    let bestDistance = Infinity;
    for (const digit of Object.keys(compiled)) {
      for (const template of compiled[digit]) {
        // Enclosed regions are a strong shape cue: 5 has none, 6/9 have one,
        // and 8 has two. It resolves close template matches such as 5 vs 6.
        let penalty = Math.abs(features.holes - template.features.holes) * 22;
        if (features.holes && template.features.holes) {
          penalty += Math.min(18, Math.abs(features.holeY - template.features.holeY) * 2);
        }
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const distance = shiftDistance(bits, template.bits, dx, dy) + penalty;
            if (distance < bestDistance) {
              bestDistance = distance;
              bestDigit = Number(digit);
            }
          }
        }
      }
    }
    // 256 pixels per glyph; > 108 (including the shape penalty) is noise.
    if (bestDistance > 108) return { digit: 0, distance: bestDistance, confidence: 0 };
    return {
      digit: bestDigit,
      distance: bestDistance,
      confidence: Math.max(0, Math.min(99, Math.round(100 - bestDistance * 0.7))),
    };
  }

  function classifyCell(gray, width, height, rect) {
    const bits = bitsFromCell(gray, width, height, rect);
    if (!bits) return { digit: 0, distance: 0, confidence: 0, blank: true };
    return classifyBits(bits);
  }

  /**
   * Classify an entire composite returned by ocr.buildComposite.
   * @param {{data: Uint8ClampedArray, width: number, height: number}} composite
   * @param {{cellSize:number, gap:number, pad:number}} layout
   */
  function recognizeComposite(composite, layout) {
    const width = composite.width;
    const height = composite.height;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      gray[i] = Math.round(composite.data[p] * 0.299 + composite.data[p + 1] * 0.587 + composite.data[p + 2] * 0.114);
    }
    const slot = layout.cellSize + layout.gap;
    const symbols = [];
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const x = layout.pad + col * slot;
        const y = layout.pad + row * slot;
        const result = classifyCell(gray, width, height, { x, y, w: layout.cellSize, h: layout.cellSize });
        if (!result.digit) continue;
        symbols.push({
          text: String(result.digit),
          confidence: result.confidence,
          bbox: { x0: x, y0: y, x1: x + layout.cellSize, y1: y + layout.cellSize },
          source: 'template',
        });
      }
    }
    return { symbols };
  }

  return { SIZE, classifyBits, classifyCell, recognizeComposite, bitsFromCell };
});

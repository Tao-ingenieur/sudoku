/*
 * Offline Sudoku OCR pipeline.
 *
 * The input is a photograph, not a screenshot: we locate the grid as the
 * largest connected line network, correct rotation/perspective with a
 * homography, cut each cell into a clean 64x64 tile, and ask a pluggable OCR
 * backend (Tesseract in browsers, a template classifier in the mini program)
 * to read the tiles.  All geometry and validation code is pure JavaScript so
 * the same module runs in browsers, Electron, Android/iOS WebViews and WeChat.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.Sudoku = root.Sudoku || {}; root.Sudoku.ocr = factory(); }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const GRID = 9;
  const WARP_SIZE = 720;
  const CELL_SIZE = 64;
  const CELL_GAP = 16;
  const COMPOSITE_PAD = 12;
  const MIN_CLUES = 17;

  function clamp(value, min, max) {
    return value < min ? min : value > max ? max : value;
  }

  function grayFromRgba(image) {
    const { data, width, height } = image;
    const gray = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      const p = i * 4;
      gray[i] = Math.round(data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114);
    }
    return gray;
  }

  function downsampleGray(gray, width, height, maxSide) {
    const scale = Math.min(1, maxSide / Math.max(width, height));
    if (scale >= 1) return { data: gray, width, height, scale: 1 };
    const outW = Math.max(1, Math.round(width * scale));
    const outH = Math.max(1, Math.round(height * scale));
    const out = new Uint8Array(outW * outH);
    const sx = width / outW;
    const sy = height / outH;
    for (let y = 0; y < outH; y++) {
      const y0 = Math.floor(y * sy);
      const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((y + 1) * sy)));
      for (let x = 0; x < outW; x++) {
        const x0 = Math.floor(x * sx);
        const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((x + 1) * sx)));
        let sum = 0;
        let count = 0;
        for (let yy = y0; yy < y1; yy++) {
          for (let xx = x0; xx < x1; xx++) {
            sum += gray[yy * width + xx];
            count++;
          }
        }
        out[y * outW + x] = Math.round(sum / Math.max(1, count));
      }
    }
    return { data: out, width: outW, height: outH, scale: outW / width };
  }

  function otsu(gray) {
    const histogram = new Uint32Array(256);
    for (const value of gray) histogram[value]++;
    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * histogram[i];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let threshold = 128;
    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += i * histogram[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const between = wB * wF * (mB - mF) * (mB - mF);
      if (between > best) {
        best = between;
        threshold = i;
      }
    }
    return threshold;
  }

  function connectedComponents(mask, width, height) {
    const labels = new Int32Array(width * height).fill(-1);
    const queue = new Int32Array(width * height);
    const components = [];
    let label = 0;
    for (let start = 0; start < mask.length; start++) {
      if (!mask[start] || labels[start] >= 0) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      labels[start] = label;
      let count = 0;
      let minX = width;
      let maxX = -1;
      let minY = height;
      let maxY = -1;
      while (head < tail) {
        const index = queue[head++];
        const x = index % width;
        const y = (index / width) | 0;
        count++;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        if (x > 0 && mask[index - 1] && labels[index - 1] < 0) {
          labels[index - 1] = label;
          queue[tail++] = index - 1;
        }
        if (x + 1 < width && mask[index + 1] && labels[index + 1] < 0) {
          labels[index + 1] = label;
          queue[tail++] = index + 1;
        }
        if (y > 0 && mask[index - width] && labels[index - width] < 0) {
          labels[index - width] = label;
          queue[tail++] = index - width;
        }
        if (y + 1 < height && mask[index + width] && labels[index + width] < 0) {
          labels[index + width] = label;
          queue[tail++] = index + width;
        }
      }
      components.push({ label, count, minX, maxX, minY, maxY });
      label++;
    }
    return { labels, components };
  }

  function fitLine(points, vertical) {
    if (points.length < 4) return null;
    let sumX = 0;
    let sumY = 0;
    for (const point of points) { sumX += point.x; sumY += point.y; }
    const meanX = sumX / points.length;
    const meanY = sumY / points.length;
    let varX = 0;
    let varY = 0;
    let cov = 0;
    for (const point of points) {
      const dx = point.x - meanX;
      const dy = point.y - meanY;
      varX += dx * dx;
      varY += dy * dy;
      cov += dx * dy;
    }
    if (vertical) {
      if (varY < 1e-6) return null;
      const a = cov / varY;
      return { a, b: meanX - a * meanY, vertical: true };
    }
    if (varX < 1e-6) return null;
    const a = cov / varX;
    return { a, b: meanY - a * meanX, vertical: false };
  }

  function intersectLines(horizontal, vertical) {
    if (!horizontal || !vertical) return null;
    // horizontal: y = ah*x + bh ; vertical: x = av*y + bv
    const den = 1 - vertical.a * horizontal.a;
    if (Math.abs(den) < 1e-6) return null;
    const x = (vertical.a * horizontal.b + vertical.b) / den;
    const y = horizontal.a * x + horizontal.b;
    return { x, y };
  }

  /**
   * Trace the outer border from the component's envelopes: for every column
   * the top/bottom-most dark pixel belongs to the top/bottom border, and for
   * every row the left/right-most pixel belongs to the side borders. Fitting
   * these envelopes and intersecting them recovers exact corners under both
   * rotation and perspective (a plain bounding box would not).
   */
  function envelopeCorners(labels, component, stride) {
    const { label, minX, maxX, minY, maxY } = component;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    const trimX = Math.max(2, Math.floor(width * 0.14));
    const trimY = Math.max(2, Math.floor(height * 0.14));
    const top = [];
    const bottom = [];
    for (let x = minX + trimX; x <= maxX - trimX; x++) {
      let lo = -1;
      let hi = -1;
      for (let y = minY; y <= maxY; y++) {
        if (labels[y * stride + x] === label) { if (lo < 0) lo = y; hi = y; }
      }
      if (lo >= 0) { top.push({ x, y: lo }); bottom.push({ x, y: hi }); }
    }
    const left = [];
    const right = [];
    for (let y = minY + trimY; y <= maxY - trimY; y++) {
      let lo = -1;
      let hi = -1;
      for (let x = minX; x <= maxX; x++) {
        if (labels[y * stride + x] === label) { if (lo < 0) lo = x; hi = x; }
      }
      if (lo >= 0) { left.push({ x: lo, y }); right.push({ x: hi, y }); }
    }
    const topLine = fitLine(top, false);
    const bottomLine = fitLine(bottom, false);
    const leftLine = fitLine(left, true);
    const rightLine = fitLine(right, true);
    const corners = [
      intersectLines(topLine, leftLine),
      intersectLines(topLine, rightLine),
      intersectLines(bottomLine, rightLine),
      intersectLines(bottomLine, leftLine),
    ];
    return corners.every(Boolean) ? corners : null;
  }

  function bboxCorners(component) {
    return [
      { x: component.minX, y: component.minY },
      { x: component.maxX, y: component.minY },
      { x: component.maxX, y: component.maxY },
      { x: component.minX, y: component.maxY },
    ];
  }

  function quadArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      area += a.x * b.y - b.x * a.y;
    }
    return Math.abs(area) / 2;
  }

  /**
   * Find the four outer corners of the puzzle. The grid lines form one large
   * connected component; its extreme diagonal points are the corners, which
   * also works for rotated and moderately perspective-skewed photos.
   */
  function detectGrid(image) {
    const gray = grayFromRgba(image);
    const small = downsampleGray(gray, image.width, image.height, 420);
    const threshold = Math.min(225, otsu(small.data) + 32);
    const mask = new Uint8Array(small.width * small.height);
    for (let i = 0; i < mask.length; i++) mask[i] = small.data[i] < threshold ? 1 : 0;
    const { labels, components } = connectedComponents(mask, small.width, small.height);
    let best = null;
    const minSpan = Math.min(small.width, small.height) * 0.22;
    const imageArea = small.width * small.height;
    for (const component of components) {
      const w = component.maxX - component.minX + 1;
      const h = component.maxY - component.minY + 1;
      if (w < minSpan || h < minSpan) continue;
      const aspect = w / h;
      if (aspect < 0.45 || aspect > 2.2) continue;
      const bboxArea = w * h;
      if (bboxArea < imageArea * 0.08) continue;
      const fill = component.count / bboxArea;
      if (bboxArea > imageArea * 0.98 && fill > 0.72) continue;
      if (!best || bboxArea > best.bboxArea) best = { component, bboxArea };
    }
    if (best) {
      const localCorners = envelopeCorners(labels, best.component, small.width) || bboxCorners(best.component);
      const inv = 1 / small.scale;
      const corners = localCorners.map((point) => ({ x: point.x * inv, y: point.y * inv }));
      if (corners) {
        const area = quadArea(corners);
        const sideMin = Math.min(
          Math.hypot(corners[0].x - corners[1].x, corners[0].y - corners[1].y),
          Math.hypot(corners[1].x - corners[2].x, corners[1].y - corners[2].y),
          Math.hypot(corners[2].x - corners[3].x, corners[2].y - corners[3].y),
          Math.hypot(corners[3].x - corners[0].x, corners[3].y - corners[0].y)
        );
        if (area > image.width * image.height * 0.06 && sideMin > Math.min(image.width, image.height) * 0.18) {
          return { corners, method: 'component', confidence: clamp(best.component.count / 2000, 0.4, 1) };
        }
      }
    }
    return null;
  }

  function solve8(rows, rhs) {
    const n = 8;
    const a = rows.map((row, i) => row.slice().concat([rhs[i]]));
    for (let col = 0; col < n; col++) {
      let pivot = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (Math.abs(a[pivot][col]) < 1e-9) return null;
      if (pivot !== col) { const t = a[pivot]; a[pivot] = a[col]; a[col] = t; }
      const div = a[col][col];
      for (let k = col; k <= n; k++) a[col][k] /= div;
      for (let row = 0; row < n; row++) {
        if (row === col) continue;
        const factor = a[row][col];
        if (!factor) continue;
        for (let k = col; k <= n; k++) a[row][k] -= factor * a[col][k];
      }
    }
    return a.map((row) => row[n]);
  }

  /** H maps output-square coordinates (u,v) to source-image coordinates. */
  function squareToQuad(size, corners) {
    const dst = [{ x: 0, y: 0 }, { x: size, y: 0 }, { x: size, y: size }, { x: 0, y: size }];
    const rows = [];
    const rhs = [];
    for (let i = 0; i < 4; i++) {
      const u = dst[i].x;
      const v = dst[i].y;
      const x = corners[i].x;
      const y = corners[i].y;
      rows.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); rhs.push(x);
      rows.push([0, 0, 0, u, v, 1, -u * y, -v * y]); rhs.push(y);
    }
    const h = solve8(rows, rhs);
    if (!h) return null;
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
  }

  function applyHomography(H, u, v) {
    const den = H[6] * u + H[7] * v + H[8];
    if (Math.abs(den) < 1e-9) return null;
    return { x: (H[0] * u + H[1] * v + H[2]) / den, y: (H[3] * u + H[4] * v + H[5]) / den };
  }

  function sampleBilinear(image, x, y) {
    const { data, width, height } = image;
    const x0 = clamp(Math.floor(x), 0, width - 1);
    const y0 = clamp(Math.floor(y), 0, height - 1);
    const x1 = clamp(x0 + 1, 0, width - 1);
    const y1 = clamp(y0 + 1, 0, height - 1);
    const fx = clamp(x - x0, 0, 1);
    const fy = clamp(y - y0, 0, 1);
    const p = (yy, xx) => (yy * width + xx) * 4;
    const out = [0, 0, 0, 255];
    for (let c = 0; c < 3; c++) {
      const a = data[p(y0, x0) + c];
      const b = data[p(y0, x1) + c];
      const cc = data[p(y1, x0) + c];
      const d = data[p(y1, x1) + c];
      out[c] = Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + cc * (1 - fx) * fy + d * fx * fy);
    }
    return out;
  }

  /** Warp the puzzle quadrilateral into an axis-aligned square. */
  function warpSquare(image, corners, size) {
    const outSize = size || WARP_SIZE;
    const H = squareToQuad(outSize, corners);
    if (!H) return null;
    const data = new Uint8ClampedArray(outSize * outSize * 4);
    for (let y = 0; y < outSize; y++) {
      for (let x = 0; x < outSize; x++) {
        const source = applyHomography(H, x + 0.5, y + 0.5);
        const target = (y * outSize + x) * 4;
        if (!source) {
          data[target] = data[target + 1] = data[target + 2] = 255;
          data[target + 3] = 255;
          continue;
        }
        const px = sampleBilinear(image, source.x, source.y);
        data[target] = px[0];
        data[target + 1] = px[1];
        data[target + 2] = px[2];
        data[target + 3] = 255;
      }
    }
    return { data, width: outSize, height: outSize };
  }

  function stretchContrast(gray, count) {
    let min = 255;
    let max = 0;
    for (const value of gray) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    if (max - min < 40) return;
    const scale = 255 / (max - min);
    for (let i = 0; i < count; i++) gray[i] = clamp(Math.round((gray[i] - min) * scale), 0, 255);
  }

  function resizeGray(gray, width, height, x0, y0, x1, y1, outW, outH) {
    const out = new Uint8Array(outW * outH);
    const sw = x1 - x0;
    const sh = y1 - y0;
    for (let y = 0; y < outH; y++) {
      const sy = y0 + ((y + 0.5) * sh) / outH - 0.5;
      const iy = Math.floor(sy);
      const fy = sy - iy;
      for (let x = 0; x < outW; x++) {
        const sx = x0 + ((x + 0.5) * sw) / outW - 0.5;
        const ix = Math.floor(sx);
        const fx = sx - ix;
        const g = (xx, yy) => gray[clamp(yy, 0, height - 1) * width + clamp(xx, 0, width - 1)];
        const a = g(ix, iy);
        const b = g(ix + 1, iy);
        const c = g(ix, iy + 1);
        const d = g(ix + 1, iy + 1);
        out[y * outW + x] = Math.round(a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
      }
    }
    return out;
  }

  /**
   * Cut 81 cell interiors into one composite image. Keeping the tiles apart
   * stops Tesseract from treating neighbouring rows as one word and removes
   * the grid lines that confuse whole-image OCR.
   */
  function buildComposite(square, options) {
    options = options || {};
    const margin = options.margin === undefined ? 0.18 : options.margin;
    const cellSize = options.cellSize || CELL_SIZE;
    const gap = options.gap === undefined ? CELL_GAP : options.gap;
    const pad = options.pad === undefined ? COMPOSITE_PAD : options.pad;
    const slot = cellSize + gap;
    const width = pad * 2 + slot * 9 - gap;
    const height = width;
    const data = new Uint8ClampedArray(width * height * 4).fill(255);
    const gray = grayFromRgba(square);
    const cell = square.width / 9;
    for (let row = 0; row < 9; row++) {
      for (let col = 0; col < 9; col++) {
        const mx = cell * margin;
        const my = cell * margin;
        const x0 = col * cell + mx;
        const y0 = row * cell + my;
        const tile = resizeGray(
          gray, square.width, square.height,
          x0, y0, (col + 1) * cell - mx, (row + 1) * cell - my,
          cellSize, cellSize
        );
        stretchContrast(tile, tile.length);
        const ox = pad + col * slot;
        const oy = pad + row * slot;
        for (let y = 0; y < cellSize; y++) {
          for (let x = 0; x < cellSize; x++) {
            const value = tile[y * cellSize + x];
            const index = ((oy + y) * width + (ox + x)) * 4;
            data[index] = data[index + 1] = data[index + 2] = value;
            data[index + 3] = 255;
          }
        }
      }
    }
    return { data, width, height, cellSize, gap, pad, slot };
  }

  function mapSymbols(symbols, layout, options) {
    options = options || {};
    const minConfidence = options.minConfidence === undefined ? 18 : options.minConfidence;
    const values = new Array(81).fill(0);
    const confidences = new Array(81).fill(0);
    const sources = new Array(81).fill(null);
    for (const symbol of symbols || []) {
      const text = String(symbol.text || '').replace(/[^1-9]/g, '');
      if (text.length !== 1) continue;
      const confidence = Number(symbol.confidence) || 0;
      if (confidence < minConfidence) continue;
      const box = symbol.bbox || {};
      if (box.x0 === undefined) continue;
      const cx = (box.x0 + box.x1) / 2 - layout.pad;
      const cy = (box.y0 + box.y1) / 2 - layout.pad;
      if (cx < 0 || cy < 0) continue;
      const col = Math.floor(cx / layout.slot);
      const row = Math.floor(cy / layout.slot);
      if (col < 0 || col > 8 || row < 0 || row > 8) continue;
      const index = row * 9 + col;
      if (confidence > confidences[index]) {
        values[index] = Number(text);
        confidences[index] = confidence;
        sources[index] = symbol.source || 'ocr';
      }
    }
    let total = 0;
    let count = 0;
    const lowConfidence = [];
    for (let i = 0; i < 81; i++) {
      if (!values[i]) continue;
      count++;
      total += confidences[i];
      if (confidences[i] < 55) lowConfidence.push(i);
    }
    return {
      values,
      confidences,
      sources,
      count,
      confidence: count ? Math.round(total / count) : 0,
      lowConfidence,
    };
  }

  function validateValues(values) {
    if (!Array.isArray(values) || values.length !== 81) {
      return { ok: false, reason: 'invalid', duplicates: [] };
    }
    for (const value of values) {
      if (!Number.isInteger(value) || value < 0 || value > 9) {
        return { ok: false, reason: 'invalid', duplicates: [] };
      }
    }
    const duplicates = [];
    const units = [
      ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
      ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
      ...Array.from({ length: 9 }, (_, b) => {
        const br = Math.floor(b / 3) * 3;
        const bc = (b % 3) * 3;
        return Array.from({ length: 9 }, (_, i) => (br + Math.floor(i / 3)) * 9 + bc + (i % 3));
      }),
    ];
    for (const unit of units) {
      const seen = new Map();
      for (const cell of unit) {
        const value = values[cell];
        if (!value) continue;
        if (seen.has(value)) duplicates.push(cell, seen.get(value));
        else seen.set(value, cell);
      }
    }
    const count = values.filter(Boolean).length;
    if (duplicates.length) return { ok: false, reason: 'conflict', duplicates: Array.from(new Set(duplicates)), count };
    if (count < MIN_CLUES) return { ok: false, reason: 'tooFew', duplicates: [], count };
    return { ok: true, count, duplicates: [] };
  }

  function puzzleString(values) {
    return values.map((value) => (value ? String(value) : '0')).join('');
  }

  /**
   * @param {{data: Uint8ClampedArray, width:number, height:number}} image
   * @param {{recognize:function}} backend
   * @param {{onProgress?:function, margins?:number[]}} options
   * @returns {Promise<object>} never throws for expected recognition failures
   */
  async function recognizeImage(image, backend, options) {
    options = options || {};
    const onProgress = options.onProgress || function () {};
    onProgress({ stage: 'detect', progress: 0 });
    const grid = detectGrid(image);
    if (!grid) return { ok: false, reason: 'noGrid' };
    onProgress({ stage: 'warp', progress: 0.12 });
    const square = warpSquare(image, grid.corners, options.warpSize || WARP_SIZE);
    if (!square) return { ok: false, reason: 'noGrid' };
    const margins = options.margins || [0.18, 0.12, 0.24];
    let best = null;
    for (let attempt = 0; attempt < margins.length; attempt++) {
      onProgress({ stage: 'tiles', progress: 0.2, attempt });
      const composite = buildComposite(square, { margin: margins[attempt] });
      let result;
      try {
        result = await backend.recognize(composite, (progress) => {
          onProgress({ stage: 'recognize', progress: 0.25 + progress * 0.65, attempt });
        });
      } catch (error) {
        if (attempt === margins.length - 1) return { ok: false, reason: 'engine', error: error && error.message };
        continue;
      }
      const mapped = mapSymbols(result && result.symbols, composite);
      const validation = validateValues(mapped.values);
      const candidate = Object.assign({}, mapped, {
        grid,
        composite,
        validation,
        attempts: attempt + 1,
      });
      candidate.score = mapped.count + mapped.confidence / 100 + (validation.ok ? 100 : 0);
      if (!best || candidate.score > best.score) best = candidate;
      if (validation.ok) {
        onProgress({ stage: 'done', progress: 1 });
        return {
          ok: true,
          values: mapped.values,
          puzzle: puzzleString(mapped.values),
          count: mapped.count,
          confidence: mapped.confidence,
          lowConfidence: mapped.lowConfidence,
          grid,
          composite,
          attempts: attempt + 1,
        };
      }
    }
    onProgress({ stage: 'done', progress: 1 });
    return {
      ok: false,
      reason: best ? best.validation.reason : 'noDigits',
      duplicates: best ? best.validation.duplicates : [],
      count: best ? best.count : 0,
      confidence: best ? best.confidence : 0,
      values: best ? best.values : null,
      grid,
    };
  }

  return {
    GRID,
    WARP_SIZE,
    MIN_CLUES,
    grayFromRgba,
    downsampleGray,
    otsu,
    connectedComponents,
    detectGrid,
    squareToQuad,
    warpSquare,
    buildComposite,
    mapSymbols,
    validateValues,
    puzzleString,
    recognizeImage,
  };
});

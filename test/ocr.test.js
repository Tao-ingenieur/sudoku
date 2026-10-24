'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');
const ocr = require('../src/ocr/index.js');
const classifier = require('../src/ocr/classifier.js');

const ROOT = path.join(__dirname, '..');
const EXPECTED = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';

function loadFixture(name) {
  const png = PNG.sync.read(fs.readFileSync(path.join(ROOT, 'test/fixtures', name)));
  return { data: png.data, width: png.width, height: png.height };
}

async function recognizeFixture(name) {
  return ocr.recognizeImage(loadFixture(name), {
    recognize: async (composite) => classifier.recognizeComposite(composite, composite),
  }, { margins: [0.18, 0.24] });
}

for (const fixture of ['sudoku-clean.png', 'sudoku-rotated.png', 'sudoku-perspective.png']) {
  test('offline OCR reads ' + fixture + ' exactly', async () => {
    const result = await recognizeFixture(fixture);
    assert.equal(result.ok, true, result.reason);
    assert.equal(result.puzzle, EXPECTED);
    assert.equal(result.count, 30);
    assert.ok(result.confidence >= 80);
  });
}

test('grid detection rejects an image without a sudoku board', async () => {
  const width = 320;
  const height = 320;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  const result = await ocr.recognizeImage({ data, width, height }, {
    recognize: async () => ({ symbols: [] }),
  }, {});
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'noGrid');
});

test('recognised strings are validated for duplicates and clue count', () => {
  const duplicate = new Array(81).fill(0);
  duplicate[0] = 5;
  duplicate[1] = 5;
  const conflict = ocr.validateValues(duplicate);
  assert.equal(conflict.ok, false);
  assert.equal(conflict.reason, 'conflict');
  assert.ok(conflict.duplicates.includes(0) && conflict.duplicates.includes(1));

  const sparse = new Array(81).fill(0);
  sparse[0] = 1;
  const tooFew = ocr.validateValues(sparse);
  assert.equal(tooFew.ok, false);
  assert.equal(tooFew.reason, 'tooFew');

  const good = ocr.validateValues(EXPECTED.split('').map(Number));
  assert.equal(good.ok, true);
  assert.equal(good.count, 30);
});

test('symbol boxes map to the correct 9x9 cells and keep the strongest reading', () => {
  const layout = { cellSize: 10, gap: 2, pad: 4, slot: 12 };
  const at = (row, col) => ({ x0: 4 + col * 12 + 2, y0: 4 + row * 12 + 2, x1: 4 + col * 12 + 8, y1: 4 + row * 12 + 8 });
  const mapped = ocr.mapSymbols([
    { text: '4', confidence: 50, bbox: at(0, 0) },
    { text: '7', confidence: 90, bbox: at(0, 0) },
    { text: '9', confidence: 88, bbox: at(8, 8) },
    { text: 'x', confidence: 99, bbox: at(4, 4) },
  ], layout);
  assert.equal(mapped.values[0], 7);
  assert.equal(mapped.values[80], 9);
  assert.equal(mapped.values[40], 0);
  assert.equal(mapped.count, 2);
});

test('vendored OCR assets are present and patched for embedded language data', () => {
  const vendor = path.join(ROOT, 'web/assets/vendor/tesseract');
  for (const file of ['tesseract.min.js', 'worker.min.js', 'eng-data.js', 'tesseract-core-lstm.wasm.js']) {
    assert.ok(fs.existsSync(path.join(vendor, file)), 'missing ' + file);
  }
  assert.ok(fs.statSync(path.join(vendor, 'tesseract-core-lstm.wasm.js')).size > 1000000);
  const worker = fs.readFileSync(path.join(vendor, 'worker.min.js'), 'utf8');
  assert.match(worker, /t\.code\|\|t\.data/);
  const data = fs.readFileSync(path.join(vendor, 'eng-data.js'), 'utf8');
  assert.match(data, /^\/\* offline eng\.traineddata/);
  assert.ok(data.length > 2000000);
});

test('web and mini program expose the same photo import entry points', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
  assert.ok(scripts.includes('../src/ocr/index.js'));
  assert.ok(scripts.includes('../src/ui/ocr.js'));
  assert.ok(scripts.indexOf('../src/ocr/index.js') < scripts.indexOf('../src/ui/ocr.js'));
  assert.match(html, /id="ocrDialog"/);
  assert.match(html, /id="ocrFileInput"/);

  const wxml = fs.readFileSync(path.join(ROOT, 'platforms/wechat/pages/index/index.wxml'), 'utf8');
  assert.match(wxml, /bindtap="openOcr"/);
  assert.match(wxml, /bindtap="chooseOcrCamera"/);
  assert.match(wxml, /bindtap="chooseOcrAlbum"/);
  const js = fs.readFileSync(path.join(ROOT, 'platforms/wechat/pages/index/index.js'), 'utf8');
  assert.match(js, /wx\.chooseMedia/);
  assert.match(js, /recognizeOcr/);
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'platforms/wechat/app.json'), 'utf8'));
  assert.ok(app.permission && app.permission['scope.camera']);
});

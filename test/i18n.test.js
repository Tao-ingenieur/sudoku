'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const i18n = require('../src/ui/i18n.js');
const engine = require('../src/engine/index.js');

const ROOT = path.join(__dirname, '..');
const CODES = ['zh-CN', 'zh-Hant', 'en', 'ja', 'fr', 'es'];

function keysOf(lang) {
  return new Set(Object.keys(i18n.LOCALES[lang]));
}
function placeholders(text) {
  return Array.from(new Set(Array.from(text.matchAll(/\{([a-zA-Z0-9_]+)\}/g), (m) => m[1]))).sort();
}

test('six JSON language packs and the generated bundle are in sync', () => {
  assert.deepEqual(i18n.LANGUAGES, CODES);
  for (const code of CODES) {
    const file = path.join(ROOT, 'src/locales', code + '.json');
    assert.ok(fs.existsSync(file), 'missing locale JSON ' + file);
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.deepEqual(json, i18n.LOCALES[code], 'generated locale differs from locales/' + code + '.json');
  }
});

test('all language packs have the same keys and placeholders', () => {
  const reference = keysOf('en');
  for (const code of CODES) {
    const keys = keysOf(code);
    assert.deepEqual(Array.from(keys).sort(), Array.from(reference).sort(), 'key mismatch in ' + code);
    for (const key of reference) {
      assert.deepEqual(placeholders(i18n.LOCALES[code][key]), placeholders(i18n.LOCALES.en[key]), 'placeholder mismatch in ' + code + ' / ' + key);
    }
  }
});

test('every solver technique has names and descriptions in all six languages', () => {
  for (const id of engine.techniqueIds) {
    for (const code of CODES) {
      const table = i18n.LOCALES[code];
      assert.ok(table['technique.' + id], code + ' name missing for ' + id);
      assert.ok(table['technique.' + id + '.desc'], code + ' description missing for ' + id);
    }
  }
  assert.equal(engine.techniqueIds.length >= 12, true);
});

test('all explanation templates exist in every language', () => {
  const keys = Object.keys(i18n.LOCALES.en).filter((key) => key.startsWith('explain.'));
  assert.ok(keys.length >= 18);
  for (const code of CODES) {
    for (const key of keys) assert.ok(i18n.LOCALES[code][key], 'missing ' + key + ' in ' + code);
  }
});

test('every data-i18n key used by index.html exists in all six languages', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  const attrs = ['data-i18n', 'data-i18n-html', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-aria-label'];
  const missing = [];
  for (const attr of attrs) {
    const regex = new RegExp(attr + '="([^"]+)"', 'g');
    let match;
    while ((match = regex.exec(html))) {
      for (const code of CODES) {
        if (!(match[1] in i18n.LOCALES[code])) missing.push(code + ':' + match[1]);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('index.html loads the locale bundle and all modules locally in dependency order', () => {
  const html = fs.readFileSync(path.join(ROOT, 'web/index.html'), 'utf8');
  const scripts = Array.from(html.matchAll(/<script src="([^"]+)"><\/script>/g)).map((m) => m[1]);
  assert.ok(scripts.length >= 20);
  for (const src of scripts) {
    assert.doesNotMatch(src, /^https?:/);
    assert.ok(fs.existsSync(path.join(ROOT, 'web', src)), 'missing script ' + src);
  }
  assert.ok(scripts.indexOf('../src/engine/core.js') < scripts.indexOf('../src/engine/util.js'));
  assert.ok(scripts.indexOf('../src/engine/util.js') < scripts.indexOf('../src/engine/index.js'));
  assert.ok(scripts.indexOf('../src/ui/locales-data.js') < scripts.indexOf('../src/ui/i18n.js'));
  assert.ok(scripts.lastIndexOf('../src/engine/index.js') < scripts.indexOf('../src/ui/app.js'));
  assert.equal(scripts[scripts.length - 1], '../src/ui/app.js');
});

test('UI source files contain no hardcoded CJK copy', () => {
  const files = ['web/index.html', 'src/ui/app.js', 'src/ui/i18n.js', 'src/ui/ocr.js', 'src/ocr/index.js', 'src/ocr/classifier.js', 'platforms/wechat/pages/index/index.wxml', 'platforms/wechat/pages/index/index.js'];
  for (const technique of fs.readdirSync(path.join(ROOT, 'src/engine/techniques'))) {
    if (technique.endsWith('.js')) files.push('src/engine/techniques/' + technique);
  }
  for (const file of files) {
    const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
    assert.doesNotMatch(text, /[\u4e00-\u9fff]/, file + ' contains hardcoded CJK UI copy');
  }
});

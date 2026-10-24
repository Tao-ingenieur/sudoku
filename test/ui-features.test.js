'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

test('web ships replay, stats, erase and three themes', () => {
  const html = read('web/index.html');
  for (const id of ['panel-replay', 'panel-stats', 'replayBoard', 'replaySlider', 'statsTotal', 'statsFastest', 'statsAverage', 'eraseBtn', 'themeBtn', 'resetStatsBtn', 'langSelect']) {
    assert.match(html, new RegExp('id="' + id + '"'), 'missing #' + id);
  }
  const css = read('web/styles.css');
  assert.match(css, /html\[data-theme="eye"\]/);
  assert.match(css, /html\[data-theme="dark"\]/);
  const app = read('src/ui/app.js');
  assert.match(app, /sudoku\.replay\.current\.v1/);
  assert.match(app, /sudoku\.replay\.history\.v1/);
  assert.match(app, /sudoku\.stats\.v1/);
  assert.match(app, /const THEMES = \['light', 'dark', 'eye'\]/);
  assert.match(app, /logPlayAction\('hint'/);
  assert.match(app, /logPlayAction\('undo'/);
  assert.match(app, /archiveReplay\('completed'/);
  assert.match(app, /i18n\.languages\(\)/);
});

test('mini program ships replay, stats, erase and three themes', () => {
  const wxml = read('platforms/wechat/pages/index/index.wxml');
  assert.match(wxml, /theme-\{\{theme\}\}/);
  assert.match(wxml, /activeTab == 'replay'/);
  assert.match(wxml, /activeTab == 'stats'/);
  assert.match(wxml, /bindtap="toggleReplayPlayback"/);
  assert.match(wxml, /bindtap="erasePlay"/);
  assert.match(wxml, /bindtap="resetStats"/);
  const wxss = read('platforms/wechat/pages/index/index.wxss');
  assert.match(wxss, /\.page\.theme-dark/);
  assert.match(wxss, /\.page\.theme-eye/);
  const js = read('platforms/wechat/pages/index/index.js');
  assert.match(js, /shared\/replay\/index\.js/);
  assert.match(js, /shared\/stats\/index\.js/);
  assert.match(js, /const THEMES = \['light', 'dark', 'eye'\]/);
  assert.match(wxml, /bindchange="onLanguageChange"/);
});

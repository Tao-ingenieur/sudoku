'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const core = require('../src/engine/core.js');
const sync = require('../scripts/sync-platforms.js');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

test('mini program shared core is a byte-for-byte copy of src', () => {
  for (const rel of sync.wechatSourceFiles()) {
    const target = rel.replace(/^src\//, 'platforms/wechat/shared/');
    assert.equal(hash(path.join(ROOT, rel)), hash(path.join(ROOT, target)), 'stale generated file ' + target);
  }
});

function setupPage() {
  let pageDef = null;
  global.Page = (def) => { pageDef = def; };
  const storage = {};
  global.wx = {
    getStorageSync: (key) => storage[key] || '',
    setStorageSync: (key, value) => { storage[key] = value; },
    getSystemInfoSync: () => ({ language: 'zh_CN', windowWidth: 390, windowHeight: 844 }),
    getWindowInfo: () => ({ windowWidth: 390, windowHeight: 844 }),
    setNavigationBarTitle: () => {},
    setNavigationBarColor: () => {},
    showLoading: () => {},
    hideLoading: () => {},
    showToast: () => {},
    showModal: (options) => { if (options.success) options.success({ confirm: true }); },
    getClipboardData: (options) => options.success({ data: '' }),
    setClipboardData: (options) => { if (options.success) options.success(); },
  };
  delete require.cache[require.resolve('../platforms/wechat/pages/index/index.js')];
  require('../platforms/wechat/pages/index/index.js');
  assert.ok(pageDef, 'mini program Page() must be defined');
  const instance = Object.assign({}, pageDef);
  instance.data = JSON.parse(JSON.stringify(pageDef.data));
  instance.setData = function setData(patch) {
    for (const [key, value] of Object.entries(patch)) {
      if (key.includes('.')) {
        const parts = key.split('.');
        let target = this.data;
        for (let i = 0; i < parts.length - 1; i++) target = target[parts[i]];
        target[parts[parts.length - 1]] = value;
      } else if (value && typeof value === 'object' && !Array.isArray(value) &&
                 this.data[key] && typeof this.data[key] === 'object' && !Array.isArray(this.data[key])) {
        Object.assign(this.data[key], value);
      } else {
        this.data[key] = value;
      }
    }
  };
  return { instance, pageDef, storage };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('all generated platform bundles match the single source tree', () => {
  assert.equal(sync.verifyCopies(), 0);
});

test('mini program project is importable and uses the shared core', () => {
  const config = JSON.parse(read('platforms/wechat/project.config.json'));
  assert.equal(config.compileType, 'miniprogram');
  assert.equal(config.miniprogramRoot, './');
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/wechat/app.json')));
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/wechat/pages/index/index.wxml')));
  const page = read('platforms/wechat/pages/index/index.js');
  assert.match(page, /shared\/engine\/core\.js/);
  assert.match(page, /shared\/generator\/index\.js/);
  assert.match(page, /shared\/constructor\/index\.js/);
  assert.match(page, /shared\/ui\/i18n\.js/);
  const techniques = fs.readdirSync(path.join(ROOT, 'platforms/wechat/shared/engine/techniques'));
  assert.equal(techniques.filter((f) => f.endsWith('.js')).length, 19);
  assert.equal(core.countSolutions(core.parse('530070000600195000098000060800060003400803001700020006060000280000419005000080079'), 2), 1);
});

test('mini program WXML is balanced, handlers exist and labels resolve', async () => {
  const { instance, pageDef, storage } = setupPage();
  await instance.onLoad();
  await wait(500);

  const wxml = read('platforms/wechat/pages/index/index.wxml');
  const handlers = new Set();
  for (const match of wxml.matchAll(/(?:bind|catch)[a-zA-Z]+="([a-zA-Z0-9_]+)"/g)) handlers.add(match[1]);
  for (const handler of handlers) {
    assert.equal(typeof pageDef[handler], 'function', 'missing WXML handler ' + handler);
  }
  for (const match of wxml.matchAll(/labels\.([a-zA-Z0-9_]+)/g)) {
    assert.ok(instance.data.labels[match[1]], 'missing label ' + match[1]);
  }

  const stripped = wxml.replace(/<!--[\s\S]*?-->/g, '');
  const stack = [];
  for (const match of stripped.matchAll(/<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g)) {
    const closing = match[1] === '/';
    const tag = match[2];
    const selfClosing = /\/\s*$/.test(match[3]);
    if (closing) {
      assert.equal(stack.pop(), tag, 'unbalanced closing tag ' + tag);
    } else if (!selfClosing) {
      stack.push(tag);
    }
  }
  assert.deepEqual(stack, [], 'unbalanced WXML tags');

  const wxss = read('platforms/wechat/pages/index/index.wxss');
  let brace = 0;
  for (const ch of wxss) {
    if (ch === '{') brace++;
    if (ch === '}') brace--;
    assert.ok(brace >= 0, 'unbalanced WXSS braces');
  }
  assert.equal(brace, 0);

  assert.equal(instance.data.play.cells.length, 81);
  assert.ok(instance.play.meta);
  assert.equal(core.countSolutions(core.parse(instance.play.meta.puzzleString), 2), 1);
  assert.deepEqual(instance.data.tabs.map((tab) => tab.key), ['play', 'constructor', 'solver', 'replay', 'stats']);
  assert.equal(instance.data.languages.length, 6);

  // Three themes cycle, persist, and leave language untouched.
  assert.equal(instance.data.theme, 'light');
  instance.cycleTheme();
  assert.equal(instance.data.theme, 'dark');
  instance.cycleTheme();
  assert.equal(instance.data.theme, 'eye');
  instance.cycleTheme();
  assert.equal(instance.data.theme, 'light');
  assert.equal(storage['sudoku.theme'], 'light');

  const empty = instance.play.values.findIndex((value) => !value);
  instance.play.selected = empty;
  instance.playDigit(4);
  assert.equal(instance.play.values[empty], 4);
  instance.onUndo();
  assert.equal(instance.play.values[empty], 0);
  assert.ok(instance.replayCurrent);
  assert.ok(instance.replayCurrent.actions.some((action) => action.type === 'value'));
  assert.ok(instance.replayCurrent.actions.some((action) => action.type === 'undo'));
  assert.ok(storage['sudoku.replay.current.v1']);

  instance.onLanguageChange({ detail: { value: 2 } });
  assert.equal(instance.data.labels.playTitle, 'Start a game');
  instance.onLanguageChange({ detail: { value: 3 } });
  assert.equal(instance.data.labels.playTitle, 'ゲームを始める');
  instance.onLanguageChange({ detail: { value: 0 } });
  assert.equal(instance.data.labels.playTitle, '开始一局');

  instance.conExample();
  await wait(300);
  assert.equal(instance.con.analysis.status, 'unique');
  assert.equal(instance.data.con.startEnabled, true);
  instance.conStart();
  assert.equal(instance.data.activeTab, 'play');
  assert.equal(instance.play.meta.source, 'constructor');

  instance.switchTab({ currentTarget: { dataset: { tab: 'solver' } } });
  instance.solverLoadExample();
  assert.ok(instance.solver.trace);
  assert.ok(instance.data.solver.steps.length > 2);
  assert.equal(instance.data.solver.cells.length, 81);
  instance.solverNext();
  assert.ok(instance.data.solver.technique);
  instance.solverSlider({ detail: { value: instance.data.solver.max } });
  assert.equal(instance.data.solver.counter, instance.data.labels.solverFinal);
  assert.ok(instance.data.solver.solvedChip);

  // Finish an 80-clue puzzle to verify local stats, completion replay and playback.
  const nearPuzzle = '53467891267219534819834256785976142342685379171392485696153728428741963534528617.';
  const nearSolution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
  instance.loadGame(nearPuzzle, nearSolution, {
    difficulty: 'easy', maxTier: 1, technique: 'nakedSingle', clueCount: 80, source: 'imported',
  });
  assert.equal(instance.play.meta.difficulty, 'easy');
  const last = instance.play.values.findIndex((value) => !value);
  instance.play.selected = last;
  instance.playDigit(9);
  assert.equal(instance.play.finished, true);
  assert.equal(instance.statsData.completed, 1);
  assert.equal(instance.statsData.byDifficulty.easy.completed, 1);
  assert.ok(instance.data.win.visible);
  assert.ok(storage['sudoku.stats.v1']);
  assert.ok(instance.replayHistory.some((record) => record.status === 'completed'));

  instance.closeWin();
  instance.switchTab({ currentTarget: { dataset: { tab: 'replay' } } });
  assert.equal(instance.data.activeTab, 'replay');
  assert.ok(instance.data.replay.records.length >= 1);
  assert.equal(instance.data.replay.cells.length, 81);
  instance.replayNext();
  assert.ok(instance.data.replay.action);
  instance.toggleReplayPlayback();
  assert.equal(instance.data.replay.playing, true);
  instance.stopReplayPlayback();

  instance.switchTab({ currentTarget: { dataset: { tab: 'stats' } } });
  assert.equal(instance.data.stats.total, 1);
  assert.equal(instance.data.stats.rows.length, 3);
  assert.equal(instance.data.stats.empty, false);
  instance.onLanguageChange({ detail: { value: 2 } });
  assert.equal(instance.data.stats.rows[0].label, 'Easy');
  instance.onLanguageChange({ detail: { value: 0 } });

  instance.onUnload();
});

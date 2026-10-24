/*
 * Teaching Sudoku UI. Vanilla JS only: the same file runs from file://, in
 * Electron and on any static web host. The solver/generator/constructor
 * modules are shared with the desktop build.
 */
(function () {
  'use strict';

  const Sudoku = window.Sudoku;
  const { core, engine, generator, constructor: ctor, i18n, replay: replayModel, stats: statsModel } = Sudoku;
  const t = (key, vars) => i18n.t(key, vars);
  const $ = (selector, root) => (root || document).querySelector(selector);
  const $$ = (selector, root) => Array.from((root || document).querySelectorAll(selector));
  const EXAMPLE_PUZZLE = '93.72......6.4..5.41....7.3....6.....91...4..3..5.........98.72.....45.8...2.76..';
  const CONSTRUCTOR_EXAMPLE = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
  const digitBit = (digit) => 1 << (digit - 1);
  const cellName = (index) => 'R' + (core.rowOf(index) + 1) + 'C' + (core.colOf(index) + 1);

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  const STORAGE_KEYS = {
    stats: 'sudoku.stats.v1',
    replayCurrent: 'sudoku.replay.current.v1',
    replayHistory: 'sudoku.replay.history.v1',
  };
  const MAX_REPLAY_HISTORY = 12;

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) { return false; }
  }
  function formatDate(timestamp) {
    if (!timestamp) return '—';
    try {
      return new Date(timestamp).toLocaleString(i18n.intlLocale(), {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch (_) { return '—'; }
  }

  function formatTime(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (v) => String(v).padStart(2, '0');
    return h ? h + ':' + pad(m) + ':' + pad(s) : pad(m) + ':' + pad(s);
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === 'function') {
      if (dialog.open) dialog.close();
    } else {
      dialog.removeAttribute('open');
    }
  }

  function setButtonBusy(button, busy) {
    button.classList.toggle('busy', !!busy);
    button.disabled = !!busy;
  }

  async function copyText(text) {
    if (!text) {
      toast(t('import.empty'));
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast(t('common.copied'));
      return true;
    } catch (_) {
      // file:// or a restrictive permission policy: fall back to selection.
      const area = $('#ioTextarea');
      if (area) {
        area.value = text;
        area.focus();
        area.select();
        try {
          const ok = document.execCommand('copy');
          toast(ok ? t('common.copied') : t('import.manual'));
          return ok;
        } catch (__) { /* ignore */ }
      }
      toast(t('import.manual'));
      return false;
    }
  }

  function hardestTechnique(rating) {
    if (!rating || !rating.steps || !rating.steps.length) return null;
    let best = null;
    for (const step of rating.steps) {
      if (!best || step.tier >= best.tier) best = step;
    }
    return best ? best.technique : null;
  }

  function difficultyOf(rating) {
    if (!rating) return null;
    if (rating.solved) return rating.difficulty;
    if (rating.maxTier >= 4) return 'hard';
    if (rating.maxTier >= 2) return 'medium';
    return 'easy';
  }

  // Local-only replay and statistics state. Both are shared structurally with
  // the WeChat mini program, while storage stays platform-local.
  let statsData = statsModel.normalize(readJSON(STORAGE_KEYS.stats, null));
  let replayCurrent = replayModel.normalizeRecording(readJSON(STORAGE_KEYS.replayCurrent, null));
  let replayHistory = (readJSON(STORAGE_KEYS.replayHistory, []) || [])
    .map((item) => replayModel.normalizeRecording(item))
    .filter(Boolean)
    .slice(0, MAX_REPLAY_HISTORY);
  let replaySelection = null;
  const replayView = { index: 0, playing: false, timer: null };
  const THEMES = ['light', 'dark', 'eye'];

  // ---------------------------------------------------------------------------
  // Board view
  // ---------------------------------------------------------------------------
  function createBoardView(element, onSelect) {
    element.innerHTML = '';
    const cells = [];
    for (let index = 0; index < 81; index++) {
      const r = core.rowOf(index);
      const c = core.colOf(index);
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.index = index;
      cell.dataset.r = r;
      cell.dataset.c = c;
      const value = document.createElement('span');
      value.className = 'value';
      const notes = document.createElement('div');
      notes.className = 'notes';
      const noteEls = [];
      for (let d = 1; d <= 9; d++) {
        const note = document.createElement('span');
        note.className = 'note';
        note.dataset.digit = d;
        note.textContent = String(d);
        notes.appendChild(note);
        noteEls.push(note);
      }
      cell.appendChild(value);
      cell.appendChild(notes);
      cell.addEventListener('click', () => { if (onSelect) onSelect(index); });
      element.appendChild(cell);
      cells.push({ el: cell, value, notes: noteEls });
    }

    function render(state) {
      const values = state.values || [];
      const given = state.given || [];
      const notes = state.notes || [];
      const candidates = state.candidates || null;
      const selected = typeof state.selected === 'number' ? state.selected : -1;
      const selectedValue = selected >= 0 ? values[selected] : 0;
      const peerSet = selected >= 0 ? new Set(core.PEERS[selected]) : new Set();
      const conflicts = state.conflicts instanceof Set ? state.conflicts : new Set(state.conflicts || []);
      const wrong = state.wrong instanceof Set ? state.wrong : new Set(state.wrong || []);
      const highlight = state.highlight || {};
      const primary = new Set(highlight.primary || []);
      const secondary = new Set(highlight.secondary || []);
      const roleMap = new Map();
      for (const item of highlight.candidates || []) {
        roleMap.set(item.cell + ':' + item.digit, item.role || 'pattern');
      }
      const unitCells = new Set();
      for (const unit of highlight.units || []) {
        if (core.UNITS[unit]) core.UNITS[unit].forEach((cell) => unitCells.add(cell));
      }
      const showFor = state.showCandidatesFor instanceof Set ? state.showCandidatesFor : null;
      const showAllCandidates = !!state.showAllCandidates;

      for (let index = 0; index < 81; index++) {
        const { el, value: valueEl, notes: noteEls } = cells[index];
        el.className = 'cell';
        const isGiven = !!given[index];
        const digit = values[index] || 0;
        let mask = 0;
        if (!digit) {
          if (showAllCandidates && candidates) mask = candidates[index] || 0;
          else if (showFor && showFor.has(index) && candidates) mask = candidates[index] || 0;
          else mask = notes[index] || 0;
        }
        if (isGiven) el.classList.add('given');
        if (selected === index) el.classList.add('selected');
        else if (peerSet.has(index)) el.classList.add('peer');
        if (selectedValue && digit === selectedValue) el.classList.add('same-digit');
        if (conflicts.has(index)) el.classList.add('conflict');
        if (wrong.has(index)) el.classList.add('wrong');
        if (primary.has(index)) el.classList.add('hint-primary');
        if (secondary.has(index)) el.classList.add('hint-secondary');
        if (unitCells.has(index)) el.classList.add('unit-highlight');
        valueEl.textContent = digit ? String(digit) : '';
        for (let d = 1; d <= 9; d++) {
          const note = noteEls[d - 1];
          note.className = 'note';
          const visible = !digit && (mask & digitBit(d));
          if (visible) note.classList.add('visible');
          const role = roleMap.get(index + ':' + d);
          if (visible && role) note.classList.add('cand-' + role);
        }
        el.tabIndex = selected === index ? 0 : -1;
        let aria = t('aria.cell', { row: core.rowOf(index) + 1, col: core.colOf(index) + 1 });
        if (digit) aria += ': ' + digit;
        else if (mask) aria += ': ' + core.digits(mask).join(' ');
        el.setAttribute('aria-label', aria);
      }
    }

    return { element, cells, render };
  }

  // ---------------------------------------------------------------------------
  // Shared number pad
  // ---------------------------------------------------------------------------
  function createNumpad(element, onDigit) {
    element.innerHTML = '';
    const buttons = [];
    for (let digit = 1; digit <= 9; digit++) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'num-btn';
      button.dataset.digit = digit;
      button.innerHTML = '<span>' + digit + '</span><span class="count"></span>';
      button.addEventListener('click', () => onDigit(digit));
      element.appendChild(button);
      buttons.push(button);
    }
    return {
      update(values) {
        const counts = new Array(10).fill(0);
        values.forEach((value) => { if (value >= 1 && value <= 9) counts[value]++; });
        buttons.forEach((button, i) => {
          const count = counts[i + 1];
          button.querySelector('.count').textContent = Math.max(0, 9 - count);
          button.classList.toggle('done', count >= 9);
          button.setAttribute('aria-label', (i + 1) + ' (' + count + '/9)');
        });
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Timer (play only)
  // ---------------------------------------------------------------------------
  const timer = {
    base: 0,
    startedAt: 0,
    running: false,
    interval: null,
    reset(start) {
      this.base = 0;
      this.startedAt = 0;
      this.running = false;
      if (start) this.start();
      renderTimer();
    },
    start() {
      if (this.running) return;
      this.startedAt = Date.now();
      this.running = true;
      renderTimer();
    },
    stop() {
      if (!this.running) return;
      this.base += Date.now() - this.startedAt;
      this.startedAt = 0;
      this.running = false;
      renderTimer();
    },
    value() {
      return this.base + (this.running ? Date.now() - this.startedAt : 0);
    },
  };
  function renderTimer() {
    const el = $('#timerDisplay');
    if (el) el.textContent = formatTime(timer.value());
    const pause = $('#pauseBtn');
    if (pause) {
      if (play.finished) {
        pause.disabled = true;
        pause.textContent = t('common.pause');
      } else {
        pause.disabled = false;
        pause.textContent = play.paused ? t('common.resume') : t('common.pause');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Play state
  // ---------------------------------------------------------------------------
  const play = {
    values: new Array(81).fill(0),
    given: new Array(81).fill(false),
    notes: new Array(81).fill(0),
    solutionValues: null,
    selected: -1,
    difficulty: 'easy',
    notesMode: false,
    errorMode: 'immediate',
    checked: false,
    finished: false,
    paused: false,
    generating: false,
    history: [],
    hintStep: null,
    meta: null,
    message: null,
    finalTime: 0,
    statsRecorded: false,
  };

  function setPlayMessage(titleKey, detailKey, tone, titleVars, detailVars) {
    play.message = { titleKey, detailKey, tone, titleVars, detailVars };
    renderPlayMessage();
  }

  function renderPlayMessage() {
    const message = play.message || { titleKey: 'play.inProgress', detailKey: 'play.empty', tone: 'ok' };
    let titleVars = message.titleVars;
    if (message.titleKey === 'play.ready' && play.meta) {
      titleVars = {
        difficulty: i18n.difficultyName(play.meta.difficulty || 'easy'),
        clues: play.meta.clueCount,
      };
    } else if (message.titleKey === 'play.win' && play.meta) {
      titleVars = {
        time: formatTime(play.finalTime),
        difficulty: i18n.difficultyName(play.meta.difficulty || 'easy'),
      };
    } else if (message.titleKey === 'play.hint.applied' && play.hintStep) {
      titleVars = { technique: i18n.techniqueName(play.hintStep.technique) };
    }
    $('#playStatus').textContent = t(message.titleKey, titleVars);
    $('#playStatusDetail').textContent = t(message.detailKey, message.detailVars);
    const dot = $('#playStatusDot');
    dot.className = 'status-dot ' + (message.tone === 'neutral' ? '' : (message.tone || ''));
  }

  function playMarks() {
    const conflicts = new Set();
    const wrong = new Set();
    if (!play.finished || play.checked) {
      if (play.errorMode !== 'off' || play.checked) {
        core.conflicts(play.values).forEach((cell) => conflicts.add(cell));
      }
      if (play.solutionValues && (play.errorMode === 'immediate' || play.checked)) {
        for (let i = 0; i < 81; i++) {
          if (play.values[i] && !play.given[i] && play.values[i] !== play.solutionValues[i]) wrong.add(i);
        }
      }
    }
    return { conflicts, wrong };
  }

  function playHighlight() {
    if (!play.hintStep) return null;
    return play.hintStep.highlights;
  }

  function showCandidatesForHint(candidates) {
    if (!play.hintStep) return null;
    const set = new Set(play.hintStep.highlights.cells || []);
    for (const elimination of play.hintStep.eliminations || []) set.add(elimination.cell);
    return set;
  }

  function renderPlayBoard() {
    const marks = playMarks();
    const candidates = play.hintStep ? core.candidates(play.values) : null;
    playBoardView.render({
      values: play.values,
      given: play.given,
      notes: play.notes,
      candidates,
      showCandidatesFor: showCandidatesForHint(candidates),
      selected: play.selected,
      conflicts: marks.conflicts,
      wrong: marks.wrong,
      highlight: playHighlight(),
    });
    playNumpad.update(play.values);
    $('#playStatsFilled').textContent = play.values.filter(Boolean).length + ' / 81';
    $('#playStatsNotes').textContent = String(play.notes.filter(Boolean).length);
  }

  function renderPlayMeta() {
    const meta = play.meta;
    $('#playDiffValue').textContent = meta && meta.difficulty ? i18n.difficultyName(meta.difficulty) : '—';
    $('#playClueValue').textContent = meta ? String(meta.clueCount) : '—';
    $('#ratingValue').textContent = meta && meta.maxTier ? i18n.tierName(meta.maxTier) : '—';
    const chip = $('#ratingTechnique');
    const technique = meta && meta.technique;
    chip.textContent = technique ? i18n.techniqueName(technique) : (meta && meta.ratingStalled ? t('solver.stalled') : '—');
    chip.title = technique ? i18n.techniqueDesc(technique) : '';
  }

  function renderPlayAll() {
    renderPlayBoard();
    renderPlayMeta();
    renderPlayMessage();
    renderTimer();
    if (play.hintStep) {
      $('#hintTechnique').textContent = i18n.techniqueName(play.hintStep.technique);
      $('#hintText').textContent = i18n.explain(play.hintStep);
    }
    $('#notesToggle').setAttribute('aria-pressed', String(play.notesMode));
    $('#errorMode').value = play.errorMode;
    const undo = $('#undoBtn');
    undo.disabled = play.history.length === 0 || play.finished;
    const reveal = $('#revealBtn');
    if (reveal) reveal.disabled = play.finished || !play.solutionValues || play.generating;
    const erase = $('#eraseBtn');
    if (erase) erase.disabled = play.finished || play.generating;
  }

  function persistReplayState() {
    writeJSON(STORAGE_KEYS.replayCurrent, replayCurrent);
    writeJSON(STORAGE_KEYS.replayHistory, replayHistory);
  }

  function persistStats() {
    writeJSON(STORAGE_KEYS.stats, statsData);
  }

  function startReplayRecording() {
    if (!play.meta) return;
    replayCurrent = replayModel.createRecording({
      puzzle: play.meta.puzzleString,
      solution: play.meta.solutionString,
      values: play.values,
      notes: play.notes,
      difficulty: play.meta.difficulty || 'easy',
      maxTier: play.meta.maxTier || 0,
      startedAt: Date.now(),
    });
    replaySelection = null;
    persistReplayState();
  }

  function archiveReplay(status, durationMs) {
    if (!replayCurrent) return;
    const ended = replayModel.markEnded(replayCurrent, status, durationMs);
    if (replayModel.actionCount(ended) > 0 || status === 'completed') {
      const clone = JSON.parse(JSON.stringify(ended));
      const exists = replayHistory.some((item) => item.id === clone.id);
      if (!exists) {
        replayHistory.unshift(clone);
        replayHistory = replayHistory.slice(0, MAX_REPLAY_HISTORY);
        if (replaySelection && replaySelection.id === clone.id) {
          replaySelection = clone;
          replayView.index = replayModel.actionCount(clone);
        }
      }
    }
    replayCurrent = null;
    persistReplayState();
    if (activeTab === 'replay') {
      if (!replaySelection) {
        replaySelection = replayHistory[0] || null;
        replayView.index = 0;
      }
      renderReplayList();
      renderReplay();
    }
  }

  function logPlayAction(type, extra) {
    if (!replayCurrent) return;
    extra = extra || {};
    replayModel.recordAction(replayCurrent, {
      type,
      cell: extra.cell,
      digit: extra.digit,
      technique: extra.technique,
      durationMs: timer.value(),
      snapshot: { values: play.values, notes: play.notes },
    });
    persistReplayState();
    if (activeTab === 'replay') {
      renderReplayList();
      if (replaySelection && replaySelection.id === replayCurrent.id) {
        replayView.index = replayModel.actionCount(replayCurrent);
        replaySelection = replayCurrent;
        renderReplay();
      }
    }
  }

  function recordCompletionStats() {
    if (play.statsRecorded) return;
    play.statsRecorded = true;
    const difficulty = (play.meta && play.meta.difficulty) || play.difficulty || 'easy';
    statsData = statsModel.recordCompletion(statsData, {
      difficulty,
      timeMs: play.finalTime,
      completedAt: Date.now(),
    });
    persistStats();
    if (activeTab === 'stats') renderStats();
  }

  function pushPlayHistory() {
    play.history.push({
      values: play.values.slice(),
      notes: play.notes.slice(),
      checked: play.checked,
    });
    if (play.history.length > 200) play.history.shift();
  }

  function clearPlayHint() {
    play.hintStep = null;
    $('#hintCard').hidden = true;
  }

  function selectPlay(index) {
    if (play.generating) return;
    play.selected = index;
    if (play.message) {
      play.message = Object.assign({}, play.message, {
        detailKey: 'play.selected',
        detailVars: { cell: cellName(index) },
      });
    }
    renderPlayBoard();
    renderPlayMessage();
  }

  function playDigit(digit) {
    if (play.generating || play.finished) return;
    const index = play.selected;
    if (index < 0) {
      setPlayMessage('play.empty', 'play.empty', 'neutral');
      return;
    }
    if (play.given[index]) {
      setPlayMessage('play.inProgress', 'play.selected', 'neutral', null, { cell: cellName(index) });
      return;
    }
    pushPlayHistory();
    let actionType;
    let actionDigit = digit;
    if (play.notesMode && !play.values[index]) {
      play.notes[index] ^= digitBit(digit);
      actionType = 'notes';
    } else if (play.notesMode && play.values[index]) {
      play.history.pop();
      setPlayMessage('play.inProgress', 'play.selected', 'neutral', null, { cell: cellName(index) });
      return;
    } else if (play.values[index] === digit) {
      play.values[index] = 0;
      actionType = 'erase';
      actionDigit = null;
    } else {
      play.values[index] = digit;
      play.notes[index] = 0;
      for (const peer of core.PEERS[index]) play.notes[peer] &= ~digitBit(digit);
      actionType = 'value';
    }
    play.checked = false;
    clearPlayHint();
    logPlayAction(actionType, { cell: index, digit: actionDigit });
    afterPlayEdit();
  }

  function erasePlay() {
    if (play.generating || play.finished) return;
    const index = play.selected;
    if (index < 0 || play.given[index]) return;
    if (!play.values[index] && !play.notes[index]) return;
    pushPlayHistory();
    play.values[index] = 0;
    play.notes[index] = 0;
    play.checked = false;
    clearPlayHint();
    logPlayAction('erase', { cell: index });
    afterPlayEdit();
  }

  function afterPlayEdit() {
    renderPlayAll();
    if (checkWin()) return;
    const marks = playMarks();
    if (marks.conflicts.size) {
      setPlayMessage('play.conflict', 'play.empty', 'bad');
    } else if (marks.wrong.size) {
      setPlayMessage('play.wrongImmediate', 'play.empty', 'bad');
    } else if (play.selected >= 0) {
      setPlayMessage('play.inProgress', 'play.selected', 'ok', null, { cell: cellName(play.selected) });
    }
  }

  function checkWin() {
    if (play.finished) return true;
    if (!core.isSolved(play.values)) return false;
    play.finished = true;
    play.paused = false;
    timer.stop();
    play.finalTime = timer.value();
    recordCompletionStats();
    archiveReplay('completed', play.finalTime);
    setPlayMessage('play.win', 'play.win.subtitle', 'ok', {
      time: formatTime(play.finalTime),
      difficulty: i18n.difficultyName(play.meta && play.meta.difficulty || 'easy'),
    });
    renderPlayAll();
    $('#winTime').textContent = formatTime(play.finalTime);
    $('#winDifficulty').textContent = play.meta && play.meta.difficulty ? i18n.difficultyName(play.meta.difficulty) : '—';
    $('#winRating').textContent = play.meta && play.meta.maxTier ? i18n.tierName(play.meta.maxTier) : '—';
    setTimeout(() => openDialog($('#winDialog')), 220);
    return true;
  }

  function revealPlay() {
    if (play.generating || !play.solutionValues) return;
    if (!window.confirm(t('play.confirm.reveal'))) return;
    timer.stop();
    play.values = play.solutionValues.slice();
    play.notes = new Array(81).fill(0);
    play.checked = false;
    play.finished = true;
    play.paused = false;
    clearPlayHint();
    logPlayAction('reveal', {});
    archiveReplay('revealed', timer.value());
    setPlayMessage('play.revealed', 'play.empty', 'neutral');
    renderPlayAll();
  }

  function playCheck() {
    if (play.generating) return;
    play.checked = true;
    const marks = playMarks();
    if (checkWin()) return;
    renderPlayAll();
    if (marks.wrong.size) {
      setPlayMessage('play.check.wrong', 'play.empty', 'bad', { n: marks.wrong.size });
    } else if (marks.conflicts.size) {
      setPlayMessage('play.conflict', 'play.empty', 'bad');
    } else {
      const status = t('play.check.valid');
      setPlayMessage('play.check.ok', 'play.check.incomplete', 'ok', null, { status });
    }
  }

  function playUndo() {
    if (!play.history.length || play.finished) {
      toast(t('play.undo.empty'));
      return;
    }
    const previous = play.history.pop();
    play.values = previous.values;
    play.notes = previous.notes;
    play.checked = previous.checked;
    clearPlayHint();
    if (play.selected >= 0 && play.given[play.selected]) play.selected = -1;
    logPlayAction('undo', {});
    renderPlayAll();
    setPlayMessage('play.inProgress', 'play.empty', 'ok');
  }

  function playRestart() {
    if (!play.meta || play.generating) return;
    if (!window.confirm(t('play.confirm.restart'))) return;
    play.values = play.meta.originalValues.slice();
    play.notes = new Array(81).fill(0);
    play.given = play.values.map(Boolean);
    play.checked = false;
    play.finished = false;
    play.paused = false;
    play.history = [];
    clearPlayHint();
    play.selected = play.values.findIndex((value) => !value);
    timer.reset(true);
    renderPlayAll();
    setPlayMessage('play.inProgress', 'play.empty', 'ok');
  }

  function playHint() {
    if (play.generating || play.finished) return;
    const marks = playMarks();
    if (marks.conflicts.size) {
      setPlayMessage('play.conflict', 'play.empty', 'bad');
      return;
    }
    if (marks.wrong.size) {
      setPlayMessage('play.wrongImmediate', 'play.empty', 'bad');
      return;
    }
    const cands = core.candidates(play.values);
    const step = engine.findNextStep(play.values, cands, { assumeUnique: true });
    if (!step) {
      setPlayMessage('play.hint.none', 'play.empty', 'warn');
      return;
    }
    play.hintStep = step;
    $('#hintTechnique').textContent = i18n.techniqueName(step.technique);
    $('#hintText').textContent = i18n.explain(step);
    $('#hintCard').hidden = false;
    const parts = [];
    for (const placement of step.placements || []) {
      parts.push(t('play.hint.place', { cell: cellName(placement.cell), digit: placement.digit }));
    }
    if (step.eliminations && step.eliminations.length) {
      parts.push(t('play.hint.eliminate', {
        candidate: i18n.candidateList(step.eliminations.slice(0, 6)),
      }));
    }
    // Keep the detail panel concise; the hint card carries the full text.
    play.message = {
      titleKey: 'play.hint.applied',
      titleVars: { technique: i18n.techniqueName(step.technique) },
      detailKey: 'play.selected',
      detailVars: { cell: cellName(play.selected >= 0 ? play.selected : 0) },
      tone: 'neutral',
    };
    renderPlayMessage();
    renderPlayBoard();
  }

  function applyPlayHint() {
    if (!play.hintStep || play.finished) return;
    pushPlayHistory();
    const step = play.hintStep;
    for (const placement of step.placements || []) {
      play.values[placement.cell] = placement.digit;
      play.notes[placement.cell] = 0;
      for (const peer of core.PEERS[placement.cell]) play.notes[peer] &= ~digitBit(placement.digit);
    }
    for (const elimination of step.eliminations || []) {
      play.notes[elimination.cell] &= ~digitBit(elimination.digit);
    }
    play.checked = false;
    clearPlayHint();
    logPlayAction('hint', { technique: step.technique });
    renderPlayAll();
    if (!checkWin()) {
      toast(t('play.hint.applied'));
      setPlayMessage('play.inProgress', 'play.empty', 'ok');
    }
  }

  function loadGame(puzzleString, solutionString, meta, notes) {
    archiveReplay('abandoned', timer.value());
    const values = core.parse(puzzleString);
    const solution = core.parse(solutionString);
    if (!meta.difficulty) meta.difficulty = play.difficulty || 'easy';
    play.values = values.slice();
    play.given = values.map(Boolean);
    play.notes = notes ? notes.slice() : new Array(81).fill(0);
    play.solutionValues = solution;
    play.selected = values.findIndex((value) => !value);
    play.checked = false;
    play.finished = false;
    play.paused = false;
    play.history = [];
    play.statsRecorded = false;
    clearPlayHint();
    if (meta.difficulty) play.difficulty = meta.difficulty;
    play.meta = Object.assign({}, meta, {
      originalValues: values.slice(),
      clueCount: values.filter(Boolean).length,
      solutionString: core.toPuzzleString(solution),
      puzzleString: core.toPuzzleString(values),
    });
    $$('.diff-btn').forEach((button) => {
      button.classList.toggle('active', button.dataset.difficulty === play.difficulty);
    });
    $('#errorMode').value = play.errorMode;
    timer.reset(true);
    startReplayRecording();
    renderPlayAll();
    renderPlayStatsIfVisible();
    const difficulty = meta.difficulty ? i18n.difficultyName(meta.difficulty) : '—';
    setPlayMessage('play.ready', 'play.empty', 'ok', { difficulty, clues: play.meta.clueCount });
  }

  function setDifficulty(difficulty) {
    play.difficulty = difficulty;
    $$('.diff-btn').forEach((button) => button.classList.toggle('active', button.dataset.difficulty === difficulty));
    setPlayMessage('play.inProgress', 'play.difficulty.' + difficulty + '.desc', 'neutral');
  }

  function newPuzzle() {
    if (play.generating) return;
    play.generating = true;
    clearPlayHint();
    $('#playOverlay').hidden = false;
    setButtonBusy($('#newPuzzleBtn'), true);
    setPlayMessage('play.generating', 'play.generating.detail', 'busy');
    setTimeout(() => {
      let result;
      try {
        result = generator.generatePuzzle({
          difficulty: play.difficulty,
          timeLimitMs: 15000,
          maxAttempts: 900,
        });
      } catch (error) {
        result = { ok: false, error: error.message };
      }
      play.generating = false;
      setButtonBusy($('#newPuzzleBtn'), false);
      $('#playOverlay').hidden = true;
      if (!result || !result.ok) {
        setPlayMessage('play.generate.failed', 'play.empty', 'bad');
        toast(t('play.generate.failed'));
        return;
      }
      const hardest = hardestTechnique(result.rating);
      const meta = {
        difficulty: result.difficulty,
        maxTier: result.rating.maxTier,
        technique: hardest,
        clueCount: result.clueCount,
        source: 'generated',
        attempts: result.attempts,
      };
      loadGame(result.puzzle, result.solution, meta);
      toast(t('play.ready', { difficulty: i18n.difficultyName(result.difficulty), clues: result.clueCount }));
    }, 40);
  }

  // ---------------------------------------------------------------------------
  // Constructor state
  // ---------------------------------------------------------------------------
  const con = {
    values: new Array(81).fill(0),
    notes: new Array(81).fill(0),
    selected: 40,
    notesMode: false,
    analysis: null,
    timer: null,
    message: null,
  };

  function renderConStatus() {
    const box = con.message || { titleKey: 'status.empty', detailKey: 'constructor.emptyHint', tone: '' };
    $('#conStatus').textContent = t(box.titleKey, box.vars);
    $('#conStatusDetail').textContent = t(box.detailKey, box.detailVars);
    $('#conStatusDot').className = 'status-dot ' + (box.tone || '');
    let note = box.note || '—';
    if (con.analysis && con.analysis.status === 'unique' && con.analysis.rating) {
      const diff = difficultyOf(con.analysis.rating);
      const rating = con.analysis.rating;
      note = diff ? i18n.difficultyName(diff) + ' · ' + (rating.maxTier ? i18n.tierName(rating.maxTier) : '—') : t('status.unique');
    }
    $('#conNote').textContent = note;
  }

  function setConMessage(titleKey, detailKey, tone, vars, detailVars, note) {
    con.message = { titleKey, detailKey, tone, vars, detailVars, note };
    renderConStatus();
  }

  function renderConBoard() {
    const conflicts = con.analysis && con.analysis.conflicts ? con.analysis.conflicts : [];
    conBoardView.render({
      values: con.values,
      given: con.values.map(Boolean),
      notes: con.notes,
      selected: con.selected,
      conflicts,
      wrong: [],
      highlight: null,
    });
    conNumpad.update(con.values);
    $('#conClues').textContent = String(con.values.filter(Boolean).length);
    $('#conEmpty').textContent = String(con.values.filter((v) => !v).length);
  }

  function scheduleAnalysis() {
    clearTimeout(con.timer);
    renderConBoard();
    const empty = con.values.filter((v) => !v).length;
    if (empty === 81) {
      con.analysis = null;
      $('#conStartBtn').disabled = true;
      setConMessage('status.empty', 'constructor.emptyHint', '', null, null, '—');
      return;
    }
    $('#conStartBtn').disabled = true;
    setConMessage('common.loading', 'constructor.subtitle', 'busy', null, null, '—');
    con.timer = setTimeout(runAnalysis, 130);
  }

  function runAnalysis() {
    const values = con.values.slice();
    const result = ctor.analyze(values);
    con.analysis = result;
    renderConBoard();
    $('#conStartBtn').disabled = result.status !== 'unique';
    let note = '—';
    if (result.status === 'unique') {
      let rating = null;
      try { rating = engine.solveHuman(values); } catch (_) { /* ignore */ }
      result.rating = rating;
      const diff = difficultyOf(rating);
      note = diff ? i18n.difficultyName(diff) + ' · ' + (rating && rating.maxTier ? i18n.tierName(rating.maxTier) : '—') : t('status.unique');
    }
    switch (result.status) {
      case 'unique':
        setConMessage('status.unique', 'constructor.uniqueHint', 'ok', null, null, note);
        break;
      case 'multiple':
        setConMessage('status.multiple', 'constructor.multipleHint', 'warn', null, null, note);
        break;
      case 'none':
        setConMessage('status.none', 'constructor.noneHint', 'bad', null, null, note);
        break;
      case 'conflict': {
        const names = (result.conflicts || []).slice(0, 7).map(cellName).join(i18n.listSeparator());
        setConMessage('status.conflict', 'constructor.conflictHint', 'bad', null, { cells: names || '—' }, note);
        break;
      }
      default:
        setConMessage('status.invalid', 'constructor.invalidHint', 'bad', null, null, note);
    }
  }

  function conSelect(index) {
    con.selected = index;
    renderConBoard();
  }

  function conDigit(digit) {
    const index = con.selected;
    if (index < 0) return;
    if (con.notesMode && !con.values[index]) {
      con.notes[index] ^= digitBit(digit);
    } else if (con.notesMode && con.values[index]) {
      return;
    } else if (con.values[index] === digit) {
      con.values[index] = 0;
    } else {
      con.values[index] = digit;
      con.notes[index] = 0;
      for (const peer of core.PEERS[index]) con.notes[peer] &= ~digitBit(digit);
    }
    con.analysis = null;
    scheduleAnalysis();
  }

  function conErase() {
    const index = con.selected;
    if (index < 0) return;
    if (!con.values[index] && !con.notes[index]) return;
    con.values[index] = 0;
    con.notes[index] = 0;
    con.analysis = null;
    scheduleAnalysis();
  }

  function conClear() {
    con.values = new Array(81).fill(0);
    con.notes = new Array(81).fill(0);
    con.analysis = null;
    con.selected = 40;
    scheduleAnalysis();
  }

  function conLoadExample() {
    con.values = core.parse(CONSTRUCTOR_EXAMPLE);
    con.notes = new Array(81).fill(0);
    con.analysis = null;
    con.selected = con.values.findIndex((v) => !v);
    scheduleAnalysis();
  }

  function conStartGame() {
    if (!con.analysis || con.analysis.status !== 'unique') return;
    const result = ctor.analyze(con.values, { rate: true });
    if (result.status !== 'unique') return;
    const difficulty = difficultyOf(result.rating);
    const meta = {
      difficulty,
      maxTier: result.rating ? result.rating.maxTier : 0,
      technique: hardestTechnique(result.rating),
      clueCount: con.values.filter(Boolean).length,
      source: 'constructor',
      ratingStalled: result.rating && result.rating.stalled,
    };
    loadGame(core.toPuzzleString(con.values), core.toPuzzleString(result.solution), meta, con.notes);
    switchTab('play');
    toast(t('play.ready', { difficulty: i18n.difficultyName(difficulty || 'easy'), clues: meta.clueCount }));
  }

  // ---------------------------------------------------------------------------
  // Solver state
  // ---------------------------------------------------------------------------
  const solver = {
    trace: null,
    states: [],
    index: 0,
    given: new Array(81).fill(false),
    sourcePuzzle: '',
    multiple: false,
    autoplay: false,
    timer: null,
  };

  function stopAutoplay() {
    solver.autoplay = false;
    if (solver.timer) clearInterval(solver.timer);
    solver.timer = null;
    updateSolverTransport();
  }

  function renderSolverSummary() {
    const container = $('#solverSummary');
    container.innerHTML = '';
    if (!solver.trace) {
      container.innerHTML = '<span class="muted tiny">—</span>';
      return;
    }
    const counts = solver.trace.counts || {};
    const entries = Object.entries(counts).filter(([, n]) => n > 0);
    if (!entries.length) {
      container.innerHTML = '<span class="muted tiny">' + t('solver.noneNote') + '</span>';
      return;
    }
    for (const [id, n] of entries) {
      const span = document.createElement('span');
      span.className = 'tcount';
      span.innerHTML = '<b>' + n + '</b>' + escapeHtml(i18n.techniqueName(id));
      container.appendChild(span);
    }
  }

  function buildStepList() {
    const list = $('#stepList');
    list.innerHTML = '';
    if (!solver.trace || !solver.trace.steps.length) {
      list.innerHTML = '<li class="empty-state">' + t('solver.noneNote') + '</li>';
      return;
    }
    solver.trace.steps.forEach((step, i) => {
      const li = document.createElement('li');
      li.className = 'step-item';
      li.dataset.index = i;
      if (solver.index === i) li.classList.add('active');
      li.innerHTML = '<span class="step-no">' + (i + 1) + '</span>' +
        '<span class="step-name">' + escapeHtml(i18n.techniqueName(step.technique)) + '</span>' +
        '<span class="step-tier">' + escapeHtml(i18n.tierName(step.tier)) + '</span>';
      li.addEventListener('click', () => {
        stopAutoplay();
        solver.index = i;
        renderSolver();
      });
      list.appendChild(li);
    });
    const final = document.createElement('li');
    final.className = 'step-item final';
    if (solver.index === solver.trace.steps.length) final.classList.add('active');
    final.innerHTML = '<span class="step-no">✓</span><span class="step-name">' + escapeHtml(t('solver.final')) + '</span>';
    final.addEventListener('click', () => {
      stopAutoplay();
      solver.index = solver.trace.steps.length;
      renderSolver();
    });
    list.appendChild(final);
    const active = list.querySelector('.step-item.active');
    if (active) {
      const listRect = list.getBoundingClientRect();
      const activeRect = active.getBoundingClientRect();
      if (activeRect.top < listRect.top) list.scrollTop -= listRect.top - activeRect.top;
      else if (activeRect.bottom > listRect.bottom) list.scrollTop += activeRect.bottom - listRect.bottom;
    }
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function updateSolverTransport() {
    if (!solver.trace) {
      $('#prevStepBtn').disabled = true;
      $('#nextStepBtn').disabled = true;
      $('#stepSlider').disabled = true;
      $('#autoplayBtn').disabled = true;
      return;
    }
    const n = solver.trace.steps.length;
    $('#prevStepBtn').disabled = solver.index <= 0;
    $('#nextStepBtn').disabled = solver.index >= n;
    $('#stepSlider').disabled = n === 0;
    $('#autoplayBtn').disabled = n === 0;
    $('#autoplayBtn').textContent = solver.autoplay ? t('solver.stop') : t('solver.autoplay');
    $('#stepSlider').max = String(n);
    $('#stepSlider').value = String(solver.index);
    if (solver.index >= n) $('#solverCounter').textContent = t('solver.final');
    else $('#solverCounter').textContent = t('solver.stepOf', { i: solver.index + 1, n });
  }

  function renderSolverWarning() {
    const warning = $('#solverWarnings');
    if (!solver.warning) {
      warning.hidden = true;
      warning.textContent = '';
      return;
    }
    warning.hidden = false;
    warning.textContent = t(solver.warning.key, solver.warning.vars);
  }

  function renderSolver() {
    const solvedChip = $('#solverSolvedChip');
    if (!solver.trace || !solver.trace.solved) {
      solvedChip.hidden = true;
    } else {
      solvedChip.hidden = false;
      solvedChip.textContent = t('solver.logicSolvable');
      solvedChip.className = 'chip good';
    }
    renderSolverWarning();
    if (!solver.trace) {
      solverBoardView.render({
        values: new Array(81).fill(0),
        given: new Array(81).fill(false),
        notes: new Array(81).fill(0),
        selected: -1,
        showAllCandidates: false,
      });
      $('#solverTechnique').textContent = '—';
      $('#solverTier').textContent = '—';
      $('#solverExplanation').textContent = t('solver.noSteps');
      $('#solverDifficulty').textContent = '—';
      $('#solverClues').textContent = '—';
      $('#solverCounter').textContent = t('solver.noSteps');
      renderSolverSummary();
      buildStepList();
      updateSolverTransport();
      return;
    }
    const n = solver.trace.steps.length;
    const atFinal = solver.index >= n;
    const state = solver.states[Math.min(solver.index, n)] || solver.states[0];
    const step = !atFinal ? solver.trace.steps[solver.index] : null;
    solverBoardView.render({
      values: Array.from(state.values),
      given: solver.given,
      notes: new Array(81).fill(0),
      candidates: state.candidates,
      showAllCandidates: true,
      selected: -1,
      highlight: step ? step.highlights : null,
    });
    if (step) {
      $('#solverTechnique').textContent = i18n.techniqueName(step.technique);
      $('#solverTier').textContent = t('tier.' + step.tier);
      $('#solverTier').className = 'chip tier-badge';
      $('#solverExplanation').textContent = i18n.explain(step);
    } else if (solver.trace.solved) {
      $('#solverTechnique').textContent = t('solver.final');
      $('#solverTier').textContent = '';
      $('#solverTier').className = 'chip tier-badge';
      $('#solverExplanation').textContent = t('solver.solved', { n });
    } else {
      $('#solverTechnique').textContent = t('solver.stalled');
      $('#solverTier').textContent = '';
      $('#solverTier').className = 'chip tier-badge';
      $('#solverExplanation').textContent = t('solver.stalled');
    }
    $('#solverDifficulty').textContent = solver.trace.solved ? i18n.difficultyName(solver.trace.difficulty) : '—';
    $('#solverClues').textContent = String(solver.sourcePuzzle.split('').filter((ch) => ch >= '1' && ch <= '9').length);
    updateSolverTransport();
    renderSolverSummary();
    buildStepList();
  }

  function solverStep(delta) {
    if (!solver.trace) return;
    stopAutoplay();
    const n = solver.trace.steps.length;
    solver.index = Math.max(0, Math.min(n, solver.index + delta));
    renderSolver();
  }

  function toggleAutoplay() {
    if (!solver.trace) return;
    if (solver.autoplay) {
      stopAutoplay();
      return;
    }
    const n = solver.trace.steps.length;
    if (!n) return;
    if (solver.index >= n) solver.index = 0;
    solver.autoplay = true;
    updateSolverTransport();
    renderSolver();
    solver.timer = setInterval(() => {
      const max = solver.trace.steps.length;
      if (solver.index >= max) {
        stopAutoplay();
        return;
      }
      solver.index++;
      renderSolver();
      if (solver.index >= max) stopAutoplay();
    }, 1150);
  }

  function startSolver() {
    stopAutoplay();
    let source = $('#solverInput').value.trim();
    if (!source) {
      source = play.meta && play.meta.puzzleString ? play.meta.puzzleString : EXAMPLE_PUZZLE;
      $('#solverInput').value = source;
    }
    const analysis = ctor.analyze(source);
    solver.warning = null;
    if (analysis.status === 'invalid' || analysis.status === 'conflict') {
      solver.warning = { key: analysis.status === 'conflict' ? 'play.import.conflict' : 'solver.invalid' };
      solver.trace = null;
      renderSolver();
      return;
    }
    if (analysis.status === 'none') {
      solver.warning = { key: 'solver.none' };
      solver.trace = null;
      renderSolver();
      return;
    }
    const trace = engine.solveHuman(source, { assumeUnique: analysis.status === 'unique' });
    if (trace.error) {
      solver.warning = { key: 'solver.error', vars: { error: trace.error } };
      solver.trace = null;
      renderSolver();
      return;
    }
    solver.trace = trace;
    solver.sourcePuzzle = core.toPuzzleString(core.parse(source));
    solver.given = core.parse(source).map(Boolean);
    solver.multiple = analysis.status === 'multiple';
    solver.index = 0;
    solver.states = [{
      values: Array.from(trace.initial.values),
      candidates: Uint16Array.from(trace.initial.candidates),
    }];
    for (const step of trace.steps) {
      const previous = solver.states[solver.states.length - 1];
      const applied = engine.applyStep(previous.values, previous.candidates, step);
      solver.states.push({ values: applied.values, candidates: applied.candidates });
    }
    if (solver.multiple) {
      solver.warning = { key: 'solver.multiple' };
    }
    renderSolver();
    if (trace.steps.length && !trace.solved) {
      toast(t('solver.stalled'));
    }
  }

  // ---------------------------------------------------------------------------
  // Replay player
  // ---------------------------------------------------------------------------
  function replayRecords() {
    const list = [];
    if (replayCurrent) list.push({ record: replayCurrent, current: true });
    for (const record of replayHistory) list.push({ record, current: false });
    return list;
  }

  function replayStatusLabel(record, current) {
    if (current || record.status === 'playing') return t('replay.status.playing');
    if (record.status === 'completed') return t('replay.status.completed');
    if (record.status === 'revealed') return t('replay.status.revealed');
    return t('replay.status.abandoned');
  }

  function replayActionText(action) {
    if (!action) return t('replay.initial');
    const cell = action.cell === null || action.cell === undefined ? '—' : cellName(action.cell);
    switch (action.type) {
      case 'value': return t('replay.action.value', { cell, digit: action.digit === null ? '—' : action.digit });
      case 'erase': return t('replay.action.erase', { cell });
      case 'notes': return t('replay.action.notes', { cell, digit: action.digit === null ? '—' : action.digit });
      case 'undo': return t('replay.action.undo');
      case 'hint': return t('replay.action.hint', {
        technique: action.technique ? i18n.techniqueName(action.technique) : '—',
      });
      case 'reveal': return t('replay.action.reveal');
      default: return t('replay.action.unknown');
    }
  }

  function stopReplayPlayback() {
    if (replayView.timer) clearInterval(replayView.timer);
    replayView.timer = null;
    replayView.playing = false;
    updateReplayControls();
  }

  function updateReplayControls() {
    const record = replaySelection;
    const n = record ? replayModel.actionCount(record) : 0;
    const index = record ? Math.max(0, Math.min(n, replayView.index)) : 0;
    $('#replayPrev').disabled = !record || index <= 0;
    $('#replayNext').disabled = !record || index >= n;
    $('#replayPlay').disabled = !record || n === 0;
    $('#replayPlay').textContent = replayView.playing ? t('replay.pause') : t('replay.play');
    const slider = $('#replaySlider');
    slider.disabled = !record || n === 0;
    slider.max = String(n);
    slider.value = String(index);
  }

  function renderReplayList() {
    const container = $('#replayList');
    const records = replayRecords();
    $('#replayListCount').textContent = String(records.length);
    container.innerHTML = '';
    if (!records.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = t('replay.empty');
      container.appendChild(empty);
      return;
    }
    for (const item of records) {
      const record = item.record;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'replay-item';
      if (replaySelection && replaySelection.id === record.id) button.classList.add('active');
      const head = document.createElement('span');
      head.className = 'replay-item-head';
      head.textContent = item.current ? t('replay.current') : replayStatusLabel(record, false);
      const diff = document.createElement('span');
      diff.className = 'chip';
      diff.textContent = i18n.difficultyName(record.difficulty);
      const meta = document.createElement('span');
      meta.className = 'replay-item-meta';
      const duration = item.current ? timer.value() : record.durationMs;
      meta.textContent = t('replay.actionsCount', { n: replayModel.actionCount(record) }) +
        ' · ' + formatTime(duration) + ' · ' + formatDate(record.startedAt);
      button.appendChild(head);
      button.appendChild(diff);
      button.appendChild(meta);
      button.addEventListener('click', () => {
        stopReplayPlayback();
        replaySelection = record;
        replayView.index = 0;
        renderReplayList();
        renderReplay();
      });
      container.appendChild(button);
    }
  }

  function openReplayTab() {
    if (!replaySelection) {
      const records = replayRecords();
      const playable = records.find((item) => replayModel.actionCount(item.record) > 0) || records[0] || null;
      replaySelection = playable ? playable.record : null;
      replayView.index = 0;
    }
    renderReplayList();
    renderReplay();
  }

  function renderReplay() {
    const record = replaySelection;
    const empty = !record;
    const n = record ? replayModel.actionCount(record) : 0;
    replayView.index = record ? Math.max(0, Math.min(n, replayView.index)) : 0;
    const index = replayView.index;
    let given = new Array(81).fill(false);
    let snapshot = { values: new Array(81).fill(0), notes: new Array(81).fill(0) };
    let action = null;
    if (record) {
      snapshot = replayModel.snapshotAt(record, index);
      try { given = core.parse(record.puzzle).map(Boolean); } catch (_) { /* ignore */ }
      action = index > 0 ? record.actions[index - 1] : null;
    }
    replayBoardView.render({
      values: snapshot.values,
      given,
      notes: snapshot.notes,
      selected: -1,
      conflicts: [],
      wrong: [],
      highlight: action && typeof action.cell === 'number' ? { primary: [action.cell] } : null,
    });
    $('#replayDifficulty').textContent = record ? i18n.difficultyName(record.difficulty) : '—';
    $('#replayActionCount').textContent = record ? String(n) : '—';
    $('#replayDuration').textContent = record ? formatTime(record.durationMs) : '—';
    $('#replayCounter').textContent = record
      ? t('replay.stepOf', { i: index, n })
      : t('replay.noSelection');
    $('#replayAction').textContent = record
      ? (index === 0 ? t('replay.initial') : replayActionText(action))
      : t('replay.noSelection');
    updateReplayControls();
  }

  function toggleReplayPlayback() {
    if (!replaySelection) return;
    if (replayView.playing) {
      stopReplayPlayback();
      return;
    }
    const n = replayModel.actionCount(replaySelection);
    if (!n) return;
    if (replayView.index >= n) replayView.index = 0;
    replayView.playing = true;
    updateReplayControls();
    renderReplay();
    replayView.timer = setInterval(() => {
      const max = replayModel.actionCount(replaySelection);
      if (replayView.index >= max) {
        stopReplayPlayback();
        return;
      }
      replayView.index++;
      renderReplay();
      if (replayView.index >= max) stopReplayPlayback();
    }, 800);
  }

  function replayStep(delta) {
    if (!replaySelection) return;
    stopReplayPlayback();
    const n = replayModel.actionCount(replaySelection);
    replayView.index = Math.max(0, Math.min(n, replayView.index + delta));
    renderReplay();
  }

  function seekReplay(value) {
    if (!replaySelection) return;
    stopReplayPlayback();
    const n = replayModel.actionCount(replaySelection);
    replayView.index = Math.max(0, Math.min(n, Number(value)));
    renderReplay();
  }

  // ---------------------------------------------------------------------------
  // Local statistics
  // ---------------------------------------------------------------------------
  function renderPlayStatsIfVisible() {
    if (activeTab === 'stats') renderStats();
  }

  function renderStats() {
    const summary = statsModel.summary(statsData);
    $('#statsTotal').textContent = String(summary.completed);
    $('#statsFastest').textContent = summary.bestMs === null ? '—' : formatTime(summary.bestMs);
    $('#statsAverage').textContent = summary.averageMs === null ? '—' : formatTime(summary.averageMs);
    for (const difficulty of statsModel.DIFFICULTIES) {
      const item = summary.byDifficulty[difficulty];
      const row = $('.stats-diff-row[data-diff="' + difficulty + '"]');
      if (row) {
        const label = row.querySelector('[data-diff-name]');
        if (label) label.textContent = i18n.difficultyName(difficulty);
        const value = $('#stats' + difficulty.charAt(0).toUpperCase() + difficulty.slice(1));
        if (value) {
          if (!item.completed) value.textContent = t('stats.count', { n: 0 });
          else value.textContent = t('stats.count', { n: item.completed }) + ' · ' +
            t('stats.best', { time: formatTime(item.bestMs) }) + ' · ' +
            t('stats.avg', { time: formatTime(item.averageMs) });
        }
      }
    }
    const recent = $('#statsRecent');
    recent.innerHTML = '';
    if (!summary.recent.length) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = t('stats.noData');
      recent.appendChild(empty);
      return;
    }
    for (const item of summary.recent) {
      const row = document.createElement('div');
      row.className = 'stats-recent-row';
      const diff = document.createElement('span');
      diff.className = 'chip';
      diff.textContent = i18n.difficultyName(item.difficulty);
      const time = document.createElement('strong');
      time.textContent = formatTime(item.timeMs);
      const date = document.createElement('span');
      date.className = 'muted tiny';
      date.textContent = formatDate(item.completedAt);
      row.appendChild(diff);
      row.appendChild(time);
      row.appendChild(date);
      recent.appendChild(row);
    }
  }

  function resetStats() {
    if (!window.confirm(t('stats.confirmReset'))) return;
    statsData = statsModel.emptyStats();
    persistStats();
    renderStats();
    toast(t('stats.resetDone'));
  }

  // ---------------------------------------------------------------------------
  // Import / export
  // ---------------------------------------------------------------------------
  const io = { mode: 'play' };

  function openIO(mode, initial) {
    io.mode = mode;
    const dialog = $('#ioDialog');
    let value = initial;
    if (value === undefined) {
      if (mode === 'constructor') value = core.toPuzzleString(con.values);
      else if (play.meta) value = core.toPuzzleString(play.values);
      else value = '';
    }
    $('#ioTextarea').value = value;
    $('#ioError').hidden = true;
    $('#ioCopySolutionBtn').style.display = mode === 'play' ? '' : 'none';
    const ocrEntry = $('#ocrOpenBtn');
    if (ocrEntry && ocrEntry.closest('.io-ocr-entry')) {
      ocrEntry.closest('.io-ocr-entry').style.display = mode === 'play' ? '' : 'none';
    }
    openDialog(dialog);
    setTimeout(() => $('#ioTextarea').focus(), 80);
  }

  function ioError(message) {
    const el = $('#ioError');
    el.textContent = message;
    el.hidden = false;
  }

  function importFromIO() {
    const text = $('#ioTextarea').value;
    if (io.mode === 'constructor') {
      try {
        const values = core.parse(text);
        con.values = values.slice();
        con.notes = new Array(81).fill(0);
        con.analysis = null;
        con.selected = con.values.findIndex((v) => !v);
        if (con.selected < 0) con.selected = 40;
        closeDialog($('#ioDialog'));
        scheduleAnalysis();
        toast(t('constructor.imported'));
      } catch (error) {
        ioError(t('play.import.invalid'));
      }
      return;
    }
    const analysis = ctor.analyze(text, { rate: true });
    if (analysis.status === 'invalid') return ioError(t('play.import.invalid'));
    if (analysis.status === 'conflict') return ioError(t('play.import.conflict'));
    if (analysis.status === 'none') return ioError(t('play.import.none'));
    if (analysis.status === 'multiple') return ioError(t('play.import.multiple'));
    const difficulty = difficultyOf(analysis.rating);
    const meta = {
      difficulty,
      maxTier: analysis.rating ? analysis.rating.maxTier : 0,
      technique: hardestTechnique(analysis.rating),
      clueCount: analysis.values.filter(Boolean).length,
      source: 'imported',
      ratingStalled: analysis.rating && analysis.rating.stalled,
    };
    loadGame(core.toPuzzleString(analysis.values), core.toPuzzleString(analysis.solution), meta);
    closeDialog($('#ioDialog'));
    toast(t('play.import.success'));
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      $('#ioTextarea').value = text;
      $('#ioError').hidden = true;
      toast(t('import.auto'));
    } catch (_) {
      $('#ioTextarea').focus();
      toast(t('import.manual'));
    }
  }

  function copyPuzzle() {
    const text = io.mode === 'constructor' ? core.toPuzzleString(con.values) : (play.meta ? play.meta.puzzleString : '');
    copyText(text);
  }
  function copyCurrent() {
    const text = io.mode === 'constructor' ? core.toPuzzleString(con.values) : core.toPuzzleString(play.values);
    copyText(text);
  }
  function copySolution() {
    copyText(play.solutionValues ? core.toPuzzleString(play.solutionValues) : '');
  }

  // ---------------------------------------------------------------------------
  // Tabs, language, theme, keyboard
  // ---------------------------------------------------------------------------
  let activeTab = 'play';
  function switchTab(name) {
    if (!['play', 'constructor', 'solver', 'replay', 'stats'].includes(name)) return;
    if (name !== 'replay') stopReplayPlayback();
    activeTab = name;
    $$('.nav-btn').forEach((button) => {
      const active = button.dataset.tab === name;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });
    $$('.panel').forEach((panel) => panel.classList.toggle('active', panel.id === 'panel-' + name));
    if (name === 'constructor') {
      con.selected = con.selected >= 0 ? con.selected : 40;
      renderConBoard();
    }
    if (name === 'play') renderPlayBoard();
    if (name === 'solver') renderSolver();
    if (name === 'replay') openReplayTab();
    if (name === 'stats') renderStats();
  }

  function populateLanguageSelect() {
    const select = $('#langSelect');
    if (!select) return;
    select.innerHTML = '';
    for (const language of i18n.languages()) {
      const option = document.createElement('option');
      option.value = language.code;
      option.textContent = language.label;
      select.appendChild(option);
    }
    select.value = i18n.getLang();
    select.setAttribute('aria-label', t('language.label'));
  }

  function applyLanguage() {
    i18n.apply(document);
    populateLanguageSelect();
    document.title = t('app.title') + ' · ' + t('app.tagline');
    renderPlayAll();
    renderConStatus();
    if (con.analysis) renderConBoard();
    renderSolver();
    renderTimer();
    renderReplayList();
    renderReplay();
    renderStats();
    updateThemeChrome();
    $('#winTime').textContent = play.finalTime ? formatTime(play.finalTime) : '—';
    $('#winDifficulty').textContent = play.meta && play.meta.difficulty ? i18n.difficultyName(play.meta.difficulty) : '—';
    $('#winRating').textContent = play.meta && play.meta.maxTier ? i18n.tierName(play.meta.maxTier) : '—';
    updateSolverTransport();
  }

  function currentTheme() {
    const value = document.documentElement.dataset.theme;
    return THEMES.includes(value) ? value : 'light';
  }
  function themeName(theme) {
    return t({ light: 'theme.light', dark: 'theme.dark', eye: 'theme.eye' }[theme] || 'theme.light');
  }
  function initTheme() {
    let theme = 'light';
    try {
      const saved = localStorage.getItem('sudoku.theme');
      if (THEMES.includes(saved)) theme = saved;
    } catch (_) { /* ignore */ }
    document.documentElement.dataset.theme = theme;
    updateThemeChrome();
  }
  function updateThemeChrome() {
    const theme = currentTheme();
    const icon = $('.theme-icon');
    if (icon) icon.textContent = { light: '☾', dark: '◑', eye: '☀' }[theme];
    const button = $('#themeBtn');
    if (button) {
      const label = t('theme.current', { name: themeName(theme) });
      button.title = label;
      button.setAttribute('aria-label', label);
    }
  }
  function toggleTheme() {
    const next = THEMES[(THEMES.indexOf(currentTheme()) + 1) % THEMES.length];
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('sudoku.theme', next); } catch (_) { /* ignore */ }
    updateThemeChrome();
    toast(t('theme.switched', { name: themeName(next) }));
  }

  function activeEditor() {
    return activeTab === 'constructor' ? con : play;
  }

  function activeSelect(index) {
    if (activeTab === 'constructor') conSelect(index);
    else if (activeTab === 'play') selectPlay(index);
  }

  function activeDigit(digit) {
    if (activeTab === 'constructor') conDigit(digit);
    else if (activeTab === 'play') playDigit(digit);
  }

  function activeErase() {
    if (activeTab === 'constructor') conErase();
    else if (activeTab === 'play') erasePlay();
  }

  function activeNotesToggle() {
    if (activeTab === 'constructor') {
      con.notesMode = !con.notesMode;
      $('#conNotesToggle').setAttribute('aria-pressed', String(con.notesMode));
    } else if (activeTab === 'play') {
      play.notesMode = !play.notesMode;
      $('#notesToggle').setAttribute('aria-pressed', String(play.notesMode));
      setPlayMessage(play.notesMode ? 'play.candidatesOn' : 'play.candidatesOff', 'play.empty', 'neutral');
    }
  }

  function moveSelection(dr, dc) {
    if (activeTab !== 'play' && activeTab !== 'constructor') return;
    const state = activeEditor();
    let index = state.selected;
    if (index < 0) index = 40;
    const r = Math.max(0, Math.min(8, core.rowOf(index) + dr));
    const c = Math.max(0, Math.min(8, core.colOf(index) + dc));
    activeSelect(core.idx(r, c));
  }

  function isTypingTarget(target) {
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);
  }

  // ---------------------------------------------------------------------------
  // Wiring
  // ---------------------------------------------------------------------------
  const playBoardView = createBoardView($('#playBoard'), (index) => selectPlay(index));
  const conBoardView = createBoardView($('#conBoard'), (index) => conSelect(index));
  const solverBoardView = createBoardView($('#solverBoard'), null);
  const replayBoardView = createBoardView($('#replayBoard'), null);
  const playNumpad = createNumpad($('#playNumpad'), (digit) => playDigit(digit));
  const conNumpad = createNumpad($('#conNumpad'), (digit) => conDigit(digit));

  function bind() {
    $$('.nav-btn').forEach((button) => button.addEventListener('click', () => switchTab(button.dataset.tab)));
    $('#langSelect').addEventListener('change', (event) => i18n.setLang(event.target.value));
    $('#themeBtn').addEventListener('click', toggleTheme);
    $$('.diff-btn').forEach((button) => button.addEventListener('click', () => setDifficulty(button.dataset.difficulty)));
    $('#newPuzzleBtn').addEventListener('click', newPuzzle);
    $('#winNewBtn').addEventListener('click', () => { closeDialog($('#winDialog')); newPuzzle(); });
    $('#winCloseBtn').addEventListener('click', () => closeDialog($('#winDialog')));
    $('#notesToggle').addEventListener('click', () => {
      play.notesMode = !play.notesMode;
      $('#notesToggle').setAttribute('aria-pressed', String(play.notesMode));
      setPlayMessage(play.notesMode ? 'play.candidatesOn' : 'play.candidatesOff', 'play.empty', 'neutral');
    });
    $('#conNotesToggle').addEventListener('click', () => {
      con.notesMode = !con.notesMode;
      $('#conNotesToggle').setAttribute('aria-pressed', String(con.notesMode));
    });
    $('#errorMode').addEventListener('change', (event) => {
      play.errorMode = event.target.value;
      play.checked = false;
      renderPlayAll();
    });
    $('#undoBtn').addEventListener('click', playUndo);
    $('#eraseBtn').addEventListener('click', erasePlay);
    $('#hintBtn').addEventListener('click', playHint);
    $('#hintApply').addEventListener('click', applyPlayHint);
    $('#hintClose').addEventListener('click', () => { clearPlayHint(); renderPlayAll(); });
    $('#checkBtn').addEventListener('click', playCheck);
    $('#restartBtn').addEventListener('click', playRestart);
    $('#revealBtn').addEventListener('click', revealPlay);
    $('#pauseBtn').addEventListener('click', () => {
      if (play.finished) return;
      play.paused = !play.paused;
      if (play.paused) {
        timer.stop();
        setPlayMessage('play.paused', 'play.empty', 'neutral');
      } else {
        timer.start();
        setPlayMessage('play.inProgress', 'play.empty', 'ok');
      }
      renderTimer();
    });
    $('#importExportBtn').addEventListener('click', () => openIO('play'));
    $('#conImportBtn').addEventListener('click', () => openIO('constructor'));
    $('#conExportBtn').addEventListener('click', () => copyText(core.toPuzzleString(con.values)));
    $('#conClearBtn').addEventListener('click', conClear);
    $('#conExampleBtn').addEventListener('click', conLoadExample);
    $('#conStartBtn').addEventListener('click', conStartGame);
    $('#ioCloseBtn').addEventListener('click', () => closeDialog($('#ioDialog')));
    $('#ioPasteBtn').addEventListener('click', pasteFromClipboard);
    $('#ioImportBtn').addEventListener('click', importFromIO);
    $('#ioCopyPuzzleBtn').addEventListener('click', copyPuzzle);
    $('#ioCopyCurrentBtn').addEventListener('click', copyCurrent);
    $('#ioCopySolutionBtn').addEventListener('click', copySolution);
    $('#ioDialog').addEventListener('click', (event) => {
      if (event.target === $('#ioDialog')) closeDialog($('#ioDialog'));
    });
    $('#solverStartBtn').addEventListener('click', startSolver);
    $('#solverInput').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') startSolver();
    });
    $('#solverLoadCurrent').addEventListener('click', () => {
      if (play.meta && play.meta.puzzleString) {
        $('#solverInput').value = play.meta.puzzleString;
        toast(t('solver.loadCurrent'));
      } else {
        toast(t('solver.needPuzzle'));
      }
    });
    $('#solverExample').addEventListener('click', () => {
      $('#solverInput').value = EXAMPLE_PUZZLE;
      startSolver();
    });
    $('#prevStepBtn').addEventListener('click', () => solverStep(-1));
    $('#nextStepBtn').addEventListener('click', () => solverStep(1));
    $('#autoplayBtn').addEventListener('click', toggleAutoplay);
    $('#stepSlider').addEventListener('input', (event) => {
      if (!solver.trace) return;
      const target = Number(event.target.value);
      stopAutoplay();
      solver.index = target;
      renderSolver();
    });
    $('#replayPrev').addEventListener('click', () => replayStep(-1));
    $('#replayNext').addEventListener('click', () => replayStep(1));
    $('#replayPlay').addEventListener('click', toggleReplayPlayback);
    $('#replaySlider').addEventListener('input', (event) => seekReplay(event.target.value));
    $('#resetStatsBtn').addEventListener('click', resetStats);
    i18n.onChange(applyLanguage);

    document.addEventListener('keydown', (event) => {
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('dialog[open]')) return;
      if (event.key === 'Escape') {
        clearPlayHint();
        renderPlayAll();
        return;
      }
      if (activeTab !== 'play' && activeTab !== 'constructor') return;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const map = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
        moveSelection(map[event.key][0], map[event.key][1]);
        return;
      }
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        activeErase();
        return;
      }
      if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        activeNotesToggle();
        return;
      }
      if (event.key === 'h' || event.key === 'H') {
        if (activeTab === 'play') {
          event.preventDefault();
          playHint();
        }
        return;
      }
      if (/^[1-9]$/.test(event.key)) {
        event.preventDefault();
        activeDigit(Number(event.key));
      }
    });

    window.addEventListener('beforeunload', () => {
      if (solver.timer) clearInterval(solver.timer);
    });
  }

  function initOcr() {
    if (!Sudoku.ocrUi) return;
    Sudoku.ocrUi.init({
      onRecognized(result) {
        const analysis = ctor.analyze(result.puzzle, { rate: true });
        if (analysis.status === 'invalid') return { errorKey: 'ocr.failed.unclear' };
        if (analysis.status === 'conflict') return { errorKey: 'ocr.failed.invalid' };
        if (analysis.status === 'none') return { errorKey: 'ocr.failed.unsolvable' };
        if (analysis.status === 'multiple') return { errorKey: 'play.import.multiple' };
        const difficulty = difficultyOf(analysis.rating) || play.difficulty;
        const meta = {
          difficulty,
          maxTier: analysis.rating ? analysis.rating.maxTier : 0,
          technique: hardestTechnique(analysis.rating),
          clueCount: analysis.values.filter(Boolean).length,
          source: 'ocr',
          confidence: result.confidence,
          ratingStalled: analysis.rating && analysis.rating.stalled,
        };
        if ($('#ioDialog').open) closeDialog($('#ioDialog'));
        loadGame(core.toPuzzleString(analysis.values), core.toPuzzleString(analysis.solution), meta);
        toast(t(result.lowConfidence && result.lowConfidence.length ? 'ocr.successVerify' : 'ocr.success'));
        return { ok: true };
      },
    });
  }

  function init() {
    initTheme();
    bind();
    initOcr();
    i18n.setLang(i18n.getLang());
    populateLanguageSelect();
    document.title = t('app.title') + ' · ' + t('app.tagline');
    renderPlayAll();
    renderConBoard();
    renderSolver();
    renderReplayList();
    renderReplay();
    renderStats();
    updateThemeChrome();
    setConMessage('status.empty', 'constructor.emptyHint', '', null, null, '—');
    timer.interval = setInterval(renderTimer, 500);
    renderTimer();
    // The first puzzle is generated asynchronously after the shell paints.
    setPlayMessage('play.loadingBoard', 'play.generating.detail', 'busy');
    newPuzzle();
  }

  init();
})();

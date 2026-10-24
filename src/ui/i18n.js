/*
 * Global translation utility. All copy lives in locales/*.json and is embedded
 * by scripts/build-locales.js so the app can run from file:// and inside the
 * WeChat mini program without fetch().
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./locales-data.js'));
  } else {
    root.Sudoku = root.Sudoku || {};
    root.Sudoku.i18n = factory(root.SudokuLocales);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (LOCALES) {
  'use strict';

  const LANGUAGES = ['zh-CN', 'zh-Hant', 'en', 'ja', 'fr', 'es'];
  const INTL_LOCALES = {
    'zh-CN': 'zh-CN',
    'zh-Hant': 'zh-TW',
    en: 'en-US',
    ja: 'ja-JP',
    fr: 'fr-FR',
    es: 'es-ES',
  };
  const TECHNIQUES = [
    'nakedSingle', 'hiddenSingle', 'lockedCandidatesPointing', 'lockedCandidatesClaiming',
    'nakedPair', 'hiddenPair', 'nakedTriple', 'hiddenTriple', 'xWing', 'swordfish',
    'jellyfish', 'yWing', 'xyzWing', 'skyscraper', 'twoStringKite', 'uniqueRectangle',
    'simpleColouring', 'wWing', 'xyChain',
  ];

  function normalizeLanguage(value) {
    if (!value) return null;
    const raw = String(value).replace('_', '-').toLowerCase();
    if (raw === 'zh' || raw.startsWith('zh-cn') || raw.startsWith('zh-hans') || raw.startsWith('zh-sg')) return 'zh-CN';
    if (raw.startsWith('zh-tw') || raw.startsWith('zh-hk') || raw.startsWith('zh-mo') || raw.startsWith('zh-hant')) return 'zh-Hant';
    if (raw.startsWith('en')) return 'en';
    if (raw.startsWith('ja')) return 'ja';
    if (raw.startsWith('fr')) return 'fr';
    if (raw.startsWith('es')) return 'es';
    return LANGUAGES.includes(value) ? value : null;
  }

  function detectInitial() {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = normalizeLanguage(localStorage.getItem('sudoku.lang'));
        if (saved) return saved;
      } catch (_) { /* ignore */ }
    }
    if (typeof navigator !== 'undefined') {
      const candidates = navigator.languages || [navigator.language];
      for (const candidate of candidates) {
        const match = normalizeLanguage(candidate);
        if (match) return match;
      }
    }
    return 'en';
  }

  let lang = detectInitial();
  const listeners = new Set();

  function t(key, vars) {
    const table = LOCALES[lang] || LOCALES.en;
    let text = table[key];
    if (text === undefined) text = LOCALES.en[key];
    if (text === undefined) text = LOCALES['zh-CN'][key];
    if (text === undefined) return key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.split('{' + name + '}').join(value === undefined || value === null ? '' : String(value));
      }
    }
    return text;
  }

  function cellName(index) {
    return 'R' + (Math.floor(index / 9) + 1) + 'C' + (index % 9 + 1);
  }

  function listSeparator() {
    return t('list.separator');
  }

  function unitName(type, index) {
    return t('unit.' + type, { index: index + 1 });
  }

  function unitNames(type, indices) {
    return t('unit.' + type + '.plural', {
      indices: indices.map((index) => index + 1).join(listSeparator()),
    });
  }

  function cellList(cells) {
    return cells.map(cellName).join(listSeparator());
  }

  function digitList(digits) {
    return digits.join(listSeparator());
  }

  function candidateList(candidates) {
    return candidates.map((item) => t('format.candidate', {
      cell: cellName(item.cell),
      digit: item.digit,
    })).join(listSeparator());
  }

  function chainText(chain) {
    return chain.map((item) => cellName(item.cell) + '(' + digitList(item.digits) + ')').join(' → ');
  }

  /**
   * Engine techniques expose language-neutral refs. This resolver turns them
   * into locale-specific phrases before interpolation.
   */
  function formatVars(vars) {
    const out = {};
    for (const [key, value] of Object.entries(vars || {})) out[key] = formatValue(value);
    return out;
  }

  function formatValue(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return value.map(formatValue).join(listSeparator());
    if (typeof value !== 'object') return value;
    if (value.kind === 'cell') return cellName(value.index);
    if (value.kind === 'cells') return cellList(value.list);
    if (value.kind === 'digits') return digitList(value.list);
    if (value.kind === 'cands') return candidateList(value.list);
    if (value.kind === 'unit') return unitName(value.type, value.index);
    if (value.kind === 'units') return unitNames(value.type, value.indices);
    if (value.kind === 'chain') return chainText(value.list);
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = formatValue(item);
    return out;
  }

  function explain(step) {
    if (!step || !step.explainKey) return '';
    return t(step.explainKey, formatVars(step.explainVars));
  }

  function techniqueName(id) { return t('technique.' + id); }
  function techniqueDesc(id) { return t('technique.' + id + '.desc'); }
  function tierName(tier) { return t('tier.' + tier); }
  function difficultyName(id) { return t('play.difficulty.' + id); }

  function languages() {
    return LANGUAGES.map((code) => ({ code, label: t('language.' + code) }));
  }

  function languageLabel(code) {
    return t('language.' + normalizeLanguage(code));
  }

  function intlLocale() {
    return INTL_LOCALES[lang] || 'en-US';
  }

  function setLang(next) {
    const normalized = normalizeLanguage(next);
    if (!normalized) return;
    lang = normalized;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = INTL_LOCALES[lang];
      document.documentElement.dataset.lang = lang;
    }
    if (typeof localStorage !== 'undefined') {
      try { localStorage.setItem('sudoku.lang', lang); } catch (_) { /* ignore */ }
    }
    listeners.forEach((fn) => fn(lang));
  }

  function getLang() { return lang; }
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

  function apply(scope) {
    if (typeof document === 'undefined') return;
    const root = scope || document;
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.getAttribute('data-i18n-html'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
    root.querySelectorAll('[data-i18n-aria-label]').forEach((el) => {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label')));
    });
  }

  return {
    STRINGS: LOCALES,
    LOCALES,
    LANGUAGES,
    TECHNIQUES,
    t,
    explain,
    formatVars,
    cellName,
    cellList,
    digitList,
    candidateList,
    unitName,
    unitNames,
    listSeparator,
    techniqueName,
    techniqueDesc,
    tierName,
    difficultyName,
    languages,
    languageLabel,
    intlLocale,
    normalizeLanguage,
    setLang,
    getLang,
    onChange,
    apply,
  };
});

# Language packs

Six independent JSON files are the single source of truth for all UI copy and
step-by-step solver explanations:

- `zh-CN.json` — 简体中文
- `zh-Hant.json` — 繁體中文
- `en.json` — English
- `ja.json` — 日本語
- `fr.json` — Français
- `es.json` — Español

Keep the same key set and `{placeholder}` names in every file. After editing:

```bash
npm run build:locales
npm test
```

The build emits `src/ui/locales-data.js` for offline `file://` loading and the
WeChat mini program. Never edit generated JSON/JS copies under platform folders.

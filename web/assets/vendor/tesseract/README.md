# Vendored OCR assets

These files make photo import work without any network access.

| File | Source | License |
|------|--------|---------|
| `tesseract.min.js` | tesseract.js 7.0.0 (`dist/`) | Apache-2.0 |
| `worker.min.js` | tesseract.js 7.0.0 (`dist/`), patched to accept `{code,data}` language objects | Apache-2.0 |
| `tesseract-core-lstm.wasm.js` | tesseract.js-core 6.x | Apache-2.0 |
| `eng.traineddata.gz` | tessdata_fast 4.0.0 | Apache-2.0 |
| `eng-data.js` | generated Base64 of `eng.traineddata.gz` | Apache-2.0 |

## Worker patch

`worker.min.js` contains one minimal change in the language-name mapping:

```diff
- return "string" == typeof t ? t : t.data
+ return "string" == typeof t ? t : (t.code || t.data)
```

This lets `src/ui/ocr.js` pass the embedded language bytes directly:

```js
createWorker([{ code: 'eng', data: bytes }], 1, { ... })
```

Without it, Tesseract tries to `fetch()` `eng.traineddata.gz`, which fails when
the app is opened from `file://` on Android/iOS/Windows. The embedded data path
keeps recognition fully offline and avoids CORS/worker fetch restrictions.

## Regenerating `eng-data.js`

```bash
node - <<'NODE'
const fs = require('fs');
const b = fs.readFileSync('web/assets/vendor/tesseract/eng.traineddata.gz').toString('base64');
fs.writeFileSync('web/assets/vendor/tesseract/eng-data.js',
  '/* offline eng.traineddata (gzip) for file:// and WebView use */\n' +
  'var SUDOKU_TESSDATA_BASE64 = "' + b + '";\n');
NODE
```


After upgrading Tesseract.js, re-copy `tesseract.min.js` / `worker.min.js`, re-apply the patch, and run `node scripts/verify-ocr-browser.js`.

License texts and bundled dependency notices are in `licenses/`.
Run `npm run sync:platforms` to regenerate the embedded English data.

`worker-bundle.js` is generated from the patched worker and the WASM bootstrap.
The UI creates a Blob Worker from this bundle, avoiding blocked file:// imports.
Original worker/core files remain build inputs; distribution bundles include only
the generated worker bundle. Regenerate it with `npm run sync:platforms`.

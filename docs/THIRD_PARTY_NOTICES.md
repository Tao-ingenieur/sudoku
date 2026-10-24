# Third-party components

Sudoku Academy's own source code is MIT licensed; see the repository's LICENSE.
Bundled third-party components retain their own licenses.

| Component | Version / origin | License | Local license |
| --- | --- | --- | --- |
| Tesseract.js and bundled dependencies | 7.0.0, npm package | Apache-2.0 and notices in the bundled license files | `web/assets/vendor/tesseract/licenses/` |
| Tesseract.js-core | 6.x, vendored WASM runtime | Apache-2.0 | same directory |
| English language model | tessdata_fast 4.0.0, `eng.traineddata.gz` | Apache-2.0 | same directory |
| Electron / Chromium | Locked in package-lock.json | MIT and bundled third-party licenses | Windows runtime LICENSE.electron.txt and LICENSES.chromium.html |
| Capacitor | 8.5.3 | MIT | Resolved package / SwiftPM dependency |
| Gradle Wrapper | Gradle 8.9 | Apache-2.0 | Wrapper source headers |

The vendored Tesseract worker has a local compatibility patch: embedded language
objects use `code || data` when resolving the language name. See the vendor README.
`eng-data.js` is generated from the checked-in compressed English model.
Generated Windows icon artwork comes from the existing iOS AppIcon resource.

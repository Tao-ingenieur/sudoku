#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.resolve(__dirname, '..');
const WEB = '.build/web';
const VENDOR = 'web/assets/vendor/tesseract/';
const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(rel) {
  return fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name, 'en')).flatMap(e =>
    e.isDirectory() ? walk(rel + '/' + e.name) : [rel + '/' + e.name]);
}
function reset(rel) {
  const dest = path.resolve(ROOT, rel);
  if (!dest.startsWith(ROOT + path.sep)) throw Error('Unsafe output: ' + rel);
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(dest, { recursive: true });
  return dest;
}
function copy(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}
function sourceWebFiles() {
  return ['web/index.html', 'web/styles.css', ...walk('src').filter(f => !f.startsWith('src/locales/')),
    ...['tesseract.min.js','eng-data.js','worker-bundle.js'].map(f => VENDOR + f), ...walk(VENDOR + 'licenses')];
}
function webTarget(rel) { return rel.startsWith('web/') ? rel.slice(4) : rel; }
function webContent(rel) {
  const b = fs.readFileSync(path.join(ROOT, rel));
  return rel === 'web/index.html' ? Buffer.from(b.toString().replaceAll('src="../src/', 'src="src/')) : b;
}
function wechatSourceFiles() {
  return ['engine','generator','constructor','replay','stats','ocr'].flatMap(d => walk('src/' + d))
    .concat(['src/ui/i18n.js', 'src/ui/locales-data.js']);
}
function copyWebAssets(destRel = WEB) {
  const dest = reset(destRel);
  for (const rel of sourceWebFiles()) {
    const target = path.join(dest, webTarget(rel));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, webContent(rel));
  }
  console.log('Web resources -> ' + destRel);
}
function copyWechatCore() {
  const dest = reset('platforms/wechat/shared');
  for (const rel of wechatSourceFiles()) copy(path.join(ROOT, rel), path.join(dest, rel.slice(4)));
  console.log('Shared core -> platforms/wechat/shared');
}
function verifyCopies() {
  let failures = 0;
  for (const rel of wechatSourceFiles()) {
    const target = path.join(ROOT, 'platforms/wechat/shared', rel.slice(4));
    if (!fs.existsSync(target) || hash(target) !== hash(path.join(ROOT, rel))) { console.error('STALE:', target); failures++; }
  }
  for (const dir of [WEB, 'platforms/android/app/src/main/assets/www', 'platforms/ios/App/App/public']) {
    for (const rel of sourceWebFiles()) {
      const target = path.join(ROOT, dir, webTarget(rel));
      if (!fs.existsSync(target) || !fs.readFileSync(target).equals(webContent(rel))) { console.error('STALE:', target); failures++; }
    }
  }
  console.log('Generated resource verification: ' + failures + ' differences');
  return failures;
}
function main(mode = process.argv[2] || 'all') {
  if (!['all','web','android','ios','wechat','check'].includes(mode)) throw Error('Unknown sync mode: ' + mode);
  if (mode === 'check') return verifyCopies();
  require('./build-locales.js');
  const gzip = fs.readFileSync(path.join(ROOT, VENDOR, 'eng.traineddata.gz'));
  fs.writeFileSync(path.join(ROOT, VENDOR, 'eng-data.js'), '/* offline eng.traineddata (gzip) for file:// and WebView use */\nvar SUDOKU_TESSDATA_BASE64 = "' + gzip.toString('base64') + '";\n');
  const workerSource = ['tesseract-core-lstm.wasm.js', 'worker.min.js'].map(file => fs.readFileSync(path.join(ROOT,VENDOR,file),'utf8').replace(/\/\/# sourceMappingURL=.*$/gm,'')).join('\n;\n');
  fs.writeFileSync(path.join(ROOT,VENDOR,'worker-bundle.js'),'/* Generated offline worker; see licenses/ for third-party notices. */\nvar SUDOKU_OCR_WORKER_SOURCE = '+JSON.stringify(workerSource)+';\n');
  if (mode === 'all' || mode === 'wechat') copyWechatCore();
  if (mode !== 'wechat') copyWebAssets();
  if (mode === 'all' || mode === 'android') copyWebAssets('platforms/android/app/src/main/assets/www');
  if (mode === 'all' || mode === 'ios') copyWebAssets('platforms/ios/App/App/public');
  return mode === 'all' ? verifyCopies() : 0;
}
if (require.main === module) process.exitCode = main();
module.exports = { wechatSourceFiles, verifyCopies, main };

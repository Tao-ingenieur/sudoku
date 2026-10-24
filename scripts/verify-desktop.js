'use strict';
const fs = require('fs');
const path = require('path');
const asar = require('@electron/asar');
const ROOT = path.resolve(__dirname, '..');
const archive = path.join(ROOT, '.build/windows/win-unpacked/resources/app.asar');
const pkg = JSON.parse(asar.extractFile(archive, 'package.json').toString());
if (pkg.main !== 'platforms/desktop/main.js') throw Error('Unexpected packaged entry point');
const walk = dir => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
const resources = walk(path.join(ROOT, '.build/web')).concat(path.join(ROOT, pkg.main));
for (const file of resources) {
  const rel = path.relative(ROOT, file);
  if (!asar.extractFile(archive, rel).equals(fs.readFileSync(file))) throw Error('Packaged resource mismatch: ' + rel);
}
const html = asar.extractFile(archive, path.normalize('.build/web/index.html')).toString();
for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) {
  const target = path.normalize(path.join('.build/web', match[1]));
  if (!target.startsWith(path.normalize('.build/web/') )) throw Error('Resource outside Web bundle: ' + match[1]);
  asar.extractFile(archive, target);
}
console.log('Packaged Electron entry and ' + resources.length + ' resources verified.');

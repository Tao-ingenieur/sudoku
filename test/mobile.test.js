'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const sync = require('../scripts/sync-platforms.js');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('all generated platform bundles match the single source tree', () => {
  assert.equal(sync.verifyCopies(), 0);
});

test('Android project is an offline WebView shell with generated assets', () => {
  const main = read('platforms/android/app/src/main/java/com/sudokuacademy/app/MainActivity.java');
  assert.match(main, /file:\/\/\/android_asset\/www\/index\.html/);
  assert.match(main, /setDomStorageEnabled\(true\)/);
  assert.match(main, /setJavaScriptEnabled\(true\)/);
  const manifest = read('platforms/android/app/src/main/AndroidManifest.xml');
  assert.doesNotMatch(manifest, /android\.permission\.INTERNET/);
  const build = read('platforms/android/app/build.gradle');
  assert.match(build, /syncWebAssets/);
  assert.match(build, /include '\*\*'/);
  assert.match(build, /\.build\/web/);
  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(main, /onShowFileChooser/);
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/android/app/src/main/assets/www/index.html')));
  assert.equal(read('platforms/android/settings.gradle').includes("include \":app\""), true);
});

test('iOS project is a Capacitor Xcode project with shared public assets', () => {
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/ios/App/App.xcodeproj/project.pbxproj')));
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme')));
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/ios/App/CapApp-SPM/Package.swift')));
  const config = JSON.parse(read('config/capacitor.config.json'));
  assert.equal(config.webDir, '../.build/web');
  assert.equal(config.appId, 'com.sudokuacademy.app');
  const pbx = read('platforms/ios/App/App.xcodeproj/project.pbxproj');
  assert.match(pbx, /com\.sudokuacademy\.app/);
  const version = require('../package.json').version.replace(/\./g, '\\.');
  assert.match(pbx, new RegExp('MARKETING_VERSION = ' + version));
  assert.match(read('platforms/ios/App/App/Info.plist'), /NSCameraUsageDescription/);
  assert.match(read('platforms/ios/App/App/Info.plist'), /NSPhotoLibraryUsageDescription/);
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/ios/App/App/public/index.html')));
  assert.ok(fs.existsSync(path.join(ROOT, 'platforms/ios/App/App/public/src/engine/index.js')));
  const packageSwift = read('platforms/ios/App/CapApp-SPM/Package.swift');
  assert.match(packageSwift, /capacitor-swift-pm/);
  assert.match(read('platforms/ios/App/App/Info.plist'), /Sudoku Academy/);
});

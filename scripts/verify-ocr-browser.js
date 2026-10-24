#!/usr/bin/env node
'use strict';

/*
 * End-to-end browser check for photo import. Opens index.html via file://,
 * uploads a rotated fixture, and verifies that the same puzzle reaches the
 * board. Requires Chromium (PUPPETEER_EXECUTABLE_PATH or /usr/local/bin/chromium).
 * This is intentionally separate from `npm test` so CI does not need a browser.
 */
const path = require('path');
const { pathToFileURL } = require('url');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const EXPECTED = '530070000600195000098000060800060003400803001700020006060000280000419005000080079';
const fs = require('fs');
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/local/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find(file => fs.existsSync(file));

(async () => {
  if (!executablePath) throw new Error('Set PUPPETEER_EXECUTABLE_PATH to a Chromium browser.');
  const browser = await puppeteer.launch({
    executablePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  try {
  const warnings = [];
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'warning' && /ocr/.test(message.text())) warnings.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());

  await page.goto(pathToFileURL(path.resolve(ROOT, process.env.SUDOKU_WEB_ENTRY || '.build/web/index.html')).href, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelectorAll('#playBoard .cell').length === 81, { timeout: 30000 });

  // Language switching must reach the OCR dialog without a reload.
  await page.select('#langSelect', 'fr');
  await page.waitForFunction(() => /Scanner/.test(document.querySelector('#ocrDialog h3').textContent));
  await page.select('#langSelect', 'en');
  await page.waitForFunction(() => /Scan or photograph/.test(document.querySelector('#ocrDialog h3').textContent));

  // Start from another valid puzzle so the final board proves a real import.
  await page.click('#importExportBtn');
  await page.$eval('#ioTextarea', (element, puzzle) => { element.value = puzzle; }, EXPECTED.replace(/[12]/g, d => d === '1' ? '2' : '1'));
  await page.click('#ioImportBtn');
  await page.waitForFunction(() => !document.querySelector('#ioDialog').open);
  await page.evaluate(() => {
    const recognize = Sudoku.ocr.recognizeImage;
    Sudoku.ocr.recognizeImage = async (...args) => {
      window.ocrTestBackend = args[1].kind;
      const result = await recognize(...args);
      window.ocrTestCompleted = true;
      return result;
    };
  });

  await page.click('#importExportBtn');
  await page.waitForFunction(() => document.querySelector('#ioDialog').open);
  await page.click('#ocrOpenBtn');
  await page.waitForFunction(() => document.querySelector('#ocrDialog').open);

  const input = await page.$('#ocrFileInput');
  await input.uploadFile(path.join(ROOT, 'test/fixtures/sudoku-perspective.png'));

  await page.waitForFunction(() => {
    const result = document.querySelector('#ocrDialog');
    const error = document.querySelector('#ocrError');
    return (window.ocrTestCompleted && !result.open) || (error && !error.hidden);
  }, { timeout: 120000 });

  const error = await page.$eval('#ocrError', (element) => (element.hidden ? '' : element.textContent));
  if (error) throw new Error('OCR dialog error: ' + error);

  const values = await page.$$eval('#playBoard .cell .value', (cells) => cells.map((cell) => cell.textContent || '0'));
  const actual = values.map((value) => (value === '0' || value === '' ? '0' : value)).join('');
  if (actual !== EXPECTED) {
    throw new Error('board mismatch\nexpected ' + EXPECTED + '\nactual   ' + actual);
  }
  if (warnings.length) {
    throw new Error('Tesseract fell back to the template classifier: ' + warnings.join(' | '));
  }
  if (errors.length) throw new Error('Browser errors: ' + errors.join(' | '));
  if (await page.evaluate(() => window.ocrTestBackend) !== 'tesseract') throw new Error('Expected the offline Tesseract backend.');
  console.log('OCR browser check passed:', actual);
  } finally {
  await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});

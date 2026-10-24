/*
 * Photo/camera import UI. Tesseract runs fully offline from vendored WASM
 * assets; if the worker cannot start (for example inside a restricted
 * WebView) the shared template classifier takes over so the feature still
 * works without a network connection.
 */
(function (root) {
  'use strict';

  const Sudoku = root.Sudoku;
  const i18n = Sudoku.i18n;
  const ocrCore = Sudoku.ocr;
  const classifier = Sudoku.ocrClassifier;
  const t = (key, vars) => i18n.t(key, vars);
  const MAX_IMAGE_SIDE = 1600;

  function init(options) {
    options = options || {};
    const $ = (selector) => document.querySelector(selector);
    const els = {
      dialog: $('#ocrDialog'),
      openBtn: $('#ocrOpenBtn'),
      quickBtn: $('#ocrQuickBtn'),
      closeBtn: $('#ocrCloseBtn'),
      cancelBtn: $('#ocrCancelBtn'),
      cameraBtn: $('#ocrCameraBtn'),
      albumBtn: $('#ocrAlbumBtn'),
      captureBtn: $('#ocrCaptureBtn'),
      retryBtn: $('#ocrRetryBtn'),
      fileInput: $('#ocrFileInput'),
      cameraInput: $('#ocrCameraInput'),
      preview: $('#ocrPreview'),
      placeholder: $('#ocrPlaceholder'),
      image: $('#ocrImage'),
      video: $('#ocrVideo'),
      status: $('#ocrStatus'),
      statusText: $('#ocrStatusText'),
      progressBar: $('#ocrProgressBar'),
      error: $('#ocrError'),
    };
    if (!els.dialog || !els.openBtn) return null;

    const state = {
      stream: null,
      previewUrl: null,
      lastCanvas: null,
      runId: 0,
      busy: false,
      backend: null,
      backendPromise: null,
      dataBytes: null,
      errorKey: null,
      statusKey: null,
      progress: 0,
      cameraActive: false,
    };

    function loadScript(src) {
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = () => reject(new Error('script: ' + src));
        document.head.appendChild(script);
      });
    }

    function assetUrl(rel) {
      return new URL(rel, document.baseURI).href;
    }

    function base64ToBytes(base64) {
      if (state.dataBytes) return state.dataBytes;
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      state.dataBytes = bytes;
      return bytes;
    }

    function setStatus(key, progress) {
      state.statusKey = key;
      state.progress = Math.max(0, Math.min(1, progress === undefined ? state.progress : progress));
      els.status.hidden = false;
      els.statusText.textContent = t(key);
      els.progressBar.style.width = Math.round(state.progress * 100) + '%';
    }

    function hideStatus() {
      state.statusKey = null;
      els.status.hidden = true;
      els.progressBar.style.width = '0%';
    }

    function showError(key) {
      state.errorKey = key;
      els.error.hidden = false;
      els.error.textContent = t(key);
    }

    function hideError() {
      state.errorKey = null;
      els.error.hidden = true;
      els.error.textContent = '';
    }

    function setBusy(busy) {
      state.busy = busy;
      els.dialog.classList.toggle('busy', busy);
      [els.cameraBtn, els.albumBtn, els.captureBtn, els.retryBtn, els.openBtn].forEach((button) => {
        if (button) button.disabled = busy;
      });
    }

    function revokePreview() {
      if (state.previewUrl) {
        URL.revokeObjectURL(state.previewUrl);
        state.previewUrl = null;
      }
    }

    function stopCamera() {
      state.cameraActive = false;
      if (state.stream) {
        for (const track of state.stream.getTracks()) track.stop();
        state.stream = null;
      }
      if (els.video) {
        els.video.srcObject = null;
        els.video.hidden = true;
      }
    }

    function showPlaceholder() {
      els.placeholder.hidden = false;
      els.image.hidden = true;
      els.image.removeAttribute('src');
      els.video.hidden = true;
      els.captureBtn.hidden = true;
      els.cameraBtn.hidden = false;
      revokePreview();
    }

    function reset() {
      state.runId++;
      stopCamera();
      showPlaceholder();
      hideStatus();
      hideError();
      els.retryBtn.hidden = true;
      state.lastCanvas = null;
      setBusy(false);
    }

    function open() {
      reset();
      if (typeof els.dialog.showModal === 'function') els.dialog.showModal();
      else els.dialog.setAttribute('open', '');
    }

    function close() {
      state.runId++;
      stopCamera();
      revokePreview();
      if (els.dialog.open && typeof els.dialog.close === 'function') els.dialog.close();
      else els.dialog.removeAttribute('open');
    }

    function loadImage(url) {
      return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('image'));
        image.src = url;
      });
    }

    function canvasFromSource(source, width, height) {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext('2d', { willReadFrequently: true });
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      return canvas;
    }

    async function canvasFromFile(file) {
      const url = URL.createObjectURL(file);
      try {
        const image = await loadImage(url);
        return canvasFromSource(image, image.naturalWidth || image.width, image.naturalHeight || image.height);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    function showCanvasPreview(canvas) {
      revokePreview();
      state.previewUrl = canvas.toDataURL('image/png');
      els.image.src = state.previewUrl;
      els.image.hidden = false;
      els.placeholder.hidden = true;
      els.video.hidden = true;
      els.captureBtn.hidden = true;
      els.cameraBtn.hidden = false;
    }

    function fallbackBackend() {
      return {
        recognize: async (composite) => classifier.recognizeComposite(composite, composite),
      };
    }

    async function tesseractBackend(onEngineProgress) {
      if (state.backend) {
        if (state.backend.kind === 'tesseract') onEngineProgress(1);
        return state.backend;
      }
      if (state.backendPromise) return state.backendPromise;
      state.backendPromise = (async () => {
        try {
          if (!root.Tesseract) await loadScript(assetUrl('assets/vendor/tesseract/tesseract.min.js'));
          if (!root.SUDOKU_TESSDATA_BASE64) await loadScript(assetUrl('assets/vendor/tesseract/eng-data.js'));
          if (!root.SUDOKU_OCR_WORKER_SOURCE) await loadScript(assetUrl('assets/vendor/tesseract/worker-bundle.js'));
          if (!root.Tesseract) throw new Error('Tesseract unavailable');
          const data = base64ToBytes(root.SUDOKU_TESSDATA_BASE64);
          // A worker cannot import file:// scripts in Chromium. Embed the worker
          // and WASM bootstrap in one Blob so offline packages need no fetch.
          const workerUrl = URL.createObjectURL(new Blob([root.SUDOKU_OCR_WORKER_SOURCE], { type: 'application/javascript' }));
          let worker;
          try {
          worker = await root.Tesseract.createWorker(
            [{ code: 'eng', data }],
            1,
            {
              workerPath: workerUrl,
              workerBlobURL: false,
              gzip: true,
              logger: (message) => {
                if (!message || !message.status) return;
                onEngineProgress(message.progress || 0, message.status);
              },
            }
          );
          } finally {
            URL.revokeObjectURL(workerUrl);
          }
          await worker.setParameters({
            tessedit_char_whitelist: '123456789',
            tessedit_pageseg_mode: '6',
            preserve_interword_spaces: '1',
          });
          state.worker = worker;
          state.backend = {
            kind: 'tesseract',
            recognize: async (composite) => {
              const canvas = document.createElement('canvas');
              canvas.width = composite.width;
              canvas.height = composite.height;
              const context = canvas.getContext('2d');
              const pixels = context.createImageData(composite.width, composite.height);
              pixels.data.set(composite.data);
              context.putImageData(pixels, 0, 0);
              const result = await worker.recognize(canvas, {}, { blocks: true });
              const dataOut = result.data || {};
              const symbols = [];
              for (const block of dataOut.blocks || []) {
                for (const paragraph of block.paragraphs || []) {
                  for (const line of paragraph.lines || []) {
                    for (const word of line.words || []) {
                      for (const symbol of word.symbols || []) symbols.push(symbol);
                    }
                  }
                }
              }
              return { symbols };
            },
          };
          return state.backend;
        } catch (error) {
          if (root.console && console.warn) console.warn('[ocr] falling back to template classifier:', error.message);
          state.backend = fallbackBackend();
          return state.backend;
        }
      })();
      return state.backendPromise;
    }

    function errorKeyFor(reason) {
      if (reason === 'noGrid') return 'ocr.failed.noGrid';
      if (reason === 'conflict' || reason === 'invalid') return 'ocr.failed.invalid';
      if (reason === 'tooFew' || reason === 'noDigits' || reason === 'unclear') return 'ocr.failed.unclear';
      return 'ocr.failed.engine';
    }

    async function processCanvas(canvas) {
      const runId = ++state.runId;
      state.lastCanvas = canvas;
      showCanvasPreview(canvas);
      hideError();
      els.retryBtn.hidden = true;
      setBusy(true);
      setStatus('ocr.loading', 0.02);
      try {
        const backend = await tesseractBackend((progress, engineStatus) => {
          if (runId !== state.runId) return;
          const ratio = /recogniz/i.test(engineStatus || '') ? 0.6 : 0.08;
          setStatus(/recogniz/i.test(engineStatus || '') ? 'ocr.recognizing' : 'ocr.loading', ratio + progress * 0.2);
        });
        if (runId !== state.runId) return;
        setStatus('ocr.recognizing', 0.25);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = await ocrCore.recognizeImage(pixels, backend, {
          onProgress: (progress) => {
            if (runId !== state.runId) return;
            if (progress.stage === 'recognize') setStatus('ocr.recognizing', progress.progress);
            else if (progress.stage === 'detect' || progress.stage === 'warp' || progress.stage === 'tiles') {
              setStatus('ocr.recognizing', Math.max(0.08, progress.progress || 0.08));
            }
          },
        });
        if (runId !== state.runId) return;
        if (!result.ok) {
          hideStatus();
          els.retryBtn.hidden = false;
          showError(errorKeyFor(result.reason));
          return;
        }
        hideStatus();
        const outcome = options.onRecognized ? await options.onRecognized(result) : null;
        if (runId !== state.runId) return;
        if (outcome && outcome.errorKey) {
          els.retryBtn.hidden = false;
          showError(outcome.errorKey);
          return;
        }
        close();
      } catch (error) {
        if (runId !== state.runId) return;
        hideStatus();
        els.retryBtn.hidden = false;
        showError('ocr.failed.engine');
      } finally {
        if (runId === state.runId) setBusy(false);
      }
    }

    async function handleFile(file) {
      if (!file || state.busy) return;
      hideError();
      setStatus('ocr.loading', 0.01);
      try {
        const canvas = await canvasFromFile(file);
        await processCanvas(canvas);
      } catch (error) {
        hideStatus();
        showError('ocr.failed.unclear');
      }
    }

    async function openCamera() {
      if (state.busy) return;
      hideError();
      stopCamera();
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('unsupported');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        state.stream = stream;
        state.cameraActive = true;
        els.video.srcObject = stream;
        els.video.hidden = false;
        els.image.hidden = true;
        els.placeholder.hidden = true;
        els.captureBtn.hidden = false;
        els.cameraBtn.hidden = true;
        els.retryBtn.hidden = true;
        try { await els.video.play(); } catch (__) { /* autoplay is muted */ }
      } catch (error) {
        // Browsers without getUserMedia (and any denied permission) fall back
        // to the native file picker with capture=environment.
        els.cameraInput.value = '';
        els.cameraInput.click();
      }
    }

    function capture() {
      if (!els.video.videoWidth || !els.video.videoHeight) return;
      const canvas = canvasFromSource(els.video, els.video.videoWidth, els.video.videoHeight);
      stopCamera();
      processCanvas(canvas);
    }

    els.openBtn.addEventListener('click', open);
    if (els.quickBtn) els.quickBtn.addEventListener('click', open);
    els.closeBtn.addEventListener('click', close);
    els.cancelBtn.addEventListener('click', close);
    els.cameraBtn.addEventListener('click', openCamera);
    els.albumBtn.addEventListener('click', () => {
      if (state.busy) return;
      hideError();
      els.fileInput.value = '';
      els.fileInput.click();
    });
    els.captureBtn.addEventListener('click', capture);
    els.retryBtn.addEventListener('click', () => {
      if (!state.lastCanvas || state.busy) return;
      processCanvas(state.lastCanvas);
    });
    els.fileInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleFile(file);
    });
    els.cameraInput.addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) handleFile(file);
    });
    els.dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });
    i18n.onChange(() => {
      if (state.statusKey && !els.status.hidden) els.statusText.textContent = t(state.statusKey);
      if (state.errorKey && !els.error.hidden) els.error.textContent = t(state.errorKey);
    });

    return { open, close, reset };
  }

  Sudoku.ocrUi = { init };
})(typeof globalThis !== 'undefined' ? globalThis : this);

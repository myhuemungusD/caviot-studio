'use strict';
// Photo-to-sleeve controls. The original photo stays in AppState.photoSource.
// The picture on the sleeve is a new canvas, so turning the style off puts the original back.
(function () {
  const TIPS = {
    off: '',
    shadow: 'One solid shape, one height. The subject is found automatically. A leg, ear or tail stays at least 0.8 mm thick. Cut out makes a hole of that shape.',
    silhouette: 'One solid shape. The easiest to recognize on a small sleeve.',
    line: 'The outline plus a few long strokes (eyes, nose, mouth). At 30 mm wide that is about 15 to 25 strokes, thickened to the line width.',
    poster: 'Three heights. The steps default to 0.6 mm and 1.2 mm so they stay readable.',
    smooth: 'Keeps gray, for a face or a pet. Depth defaults to 2 mm so the relief is visible.',
    lithophane: 'A thickness map for a flat plate held up to a light. Bright areas are thinner. Depth defaults to 2.2 mm and the plate backing to 0.8 mm, so the thickness runs from 0.8 mm to 3 mm. The sleeve wall is not changed.',
  };

  let jobId = 0;
  let timer = null;
  let applying = false;
  globalThis.photoBusy = false;
  let syncing = false;
  let lastPrintKey = '';
  let fittedKey = '';
  let autoDepth = null;
  let depthTouched = false;
  const PHOTO_DEPTH = { shadow: 1.6, silhouette: 0.8, line: 0.8, poster: 1.2, smooth: 2, lithophane: 2.2 };
  let autoBase = null;
  let baseTouched = false;
  let worker = null;
  let workerBroken = false;
  const priorSchedule = scheduleRebuild;
  const priorSetImage = setDesignImage;
  const priorRotate = rotateImage;
  const priorFlip = flipImageH;
  const priorProjectUI = projectStateToUI;

  function $(id) { return document.getElementById(id); }
  function photoOn() {
    return !!(AppState.photo && AppState.photo.style && AppState.photo.style !== 'off');
  }
  function sourceImage() {
    return AppState.photoSource || null;
  }
  function longSideCap() {
    const phone = typeof CaviotDevice !== 'undefined' && CaviotDevice.tier === 'light';
    const mmPerPx = phone ? 0.2 : 0.15;
    const size = printSizeMm();
    const longMm = Math.max(size.width, size.height);
    const shortMm = Math.max(1, Math.min(size.width, size.height));
    const limits = typeof CaviotDevice !== 'undefined' && CaviotDevice.limits ? CaviotDevice.limits : null;
    const device = typeof CaviotDevice !== 'undefined' && CaviotDevice.DEVICE ? CaviotDevice.DEVICE[CaviotDevice.tier] : null;
    const sideCap = device && Number.isFinite(device.maxImageSide) ? device.maxImageSide : 4096;
    const pixelCap = Math.min(limits && limits.maxImagePixels ? limits.maxImagePixels : 24e6, 4e6);
    let side = Math.ceil(longMm / mmPerPx);
    const maxSide = Math.floor(Math.sqrt(pixelCap * (longMm / shortMm)));
    side = Math.min(side, sideCap, maxSide);
    return Math.max(96, side);
  }
  function writeDepth(mm) {
    AppState.depthMm = mm;
    const input = $('depthIn');
    const label = $('depthVal');
    if (input) input.value = String(mm);
    if (label) {
      const arrow = AppState.relief === 'carved' ? '⬇' : '⬆';
      label.textContent = arrow + ' ' + mm.toFixed(2);
    }
    if (typeof captureDesignSide === 'function') captureDesignSide();
  }
  function applyAutoDepth(style) {
    const want = PHOTO_DEPTH[style];
    if (!want) return;
    const cap = typeof templateActive === 'function' && templateActive() ? 3 : 5;
    const next = Math.min(cap, want);
    const current = AppState.depthMm;
    const untouched = !depthTouched && (Math.abs(current - 0.4) < 0.011 || (autoDepth != null && Math.abs(current - autoDepth) < 0.011));
    if (!untouched) return;
    autoDepth = next;
    writeDepth(next);
  }
  function restoreAutoDepth() {
    if (depthTouched || autoDepth == null) return;
    autoDepth = null;
    writeDepth(0.4);
  }
  function writeBase(mm) {
    AppState.baseThickness = mm;
    const input = $('baseIn');
    const label = $('baseVal');
    if (input) input.value = String(mm);
    if (label) label.textContent = mm.toFixed(1);
  }
  function applyAutoBase(style) {
    if (style !== 'lithophane' || AppState.mode !== 'flat') return;
    const current = AppState.baseThickness;
    const untouched = !baseTouched && (Math.abs(current - 1) < 0.011 || (autoBase != null && Math.abs(current - autoBase) < 0.011));
    if (!untouched) return;
    autoBase = 0.8;
    writeBase(0.8);
  }
  function restoreAutoBase() {
    if (baseTouched || autoBase == null) return;
    autoBase = null;
    writeBase(1);
  }
  function packMask(mask) {
    const bytes = new Uint8Array(Math.ceil(mask.length / 8));
    for (let i = 0; i < mask.length; i++) if (mask[i]) bytes[i >> 3] |= 1 << (i & 7);
    let text = '';
    const step = 0x8000;
    for (let i = 0; i < bytes.length; i += step) text += String.fromCharCode.apply(null, bytes.subarray(i, i + step));
    return btoa(text);
  }
  function unpackMask(text, width, height) {
    if (!text || width < 2 || height < 2) return null;
    const bin = atob(text);
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
    return mask;
  }
  function clearSubjectPick() {
    if (!AppState.photo) return;
    AppState.photo.seed = null;
    AppState.photo.subjectBits = null;
    AppState.photo.subjectW = null;
    AppState.photo.subjectH = null;
  }
  function num(id, fallback) {
    const el = $(id);
    const n = el ? Number(el.value) : NaN;
    return Number.isFinite(n) ? n : fallback;
  }
  function aspectRatio(name) {
    if (name === 'square') return 1;
    if (name === 'portrait') return 3 / 4;
    if (name === 'landscape') return 4 / 3;
    if (name === 'sleeve') return (AppState.designWidth || 30) / (AppState.designHeight || 30);
    return null;
  }
  function fitCrop(ratio) {
    const src = sourceImage();
    if (!src || !src.width || !src.height || !ratio) return null;
    let cw, ch;
    if (src.width / src.height > ratio) { ch = src.height; cw = src.height * ratio; }
    else { cw = src.width; ch = src.width / ratio; }
    cw = Math.max(1, cw);
    ch = Math.max(1, ch);
    return {
      x: (src.width - cw) / 2 / src.width,
      y: (src.height - ch) / 2 / src.height,
      w: cw / src.width,
      h: ch / src.height,
    };
  }
  function currentCrop() {
    const crop = AppState.photo && AppState.photo.crop;
    if (!crop) return { x: 0, y: 0, w: 1, h: 1 };
    return crop;
  }
  function printSizeMm() {
    const src = sourceImage() || AppState.image;
    const crop = AppState.photo && AppState.photo.crop;
    let aspect = 1;
    if (src && src.width && src.height) {
      const cw = crop ? crop.w : 1;
      const ch = crop ? crop.h : 1;
      aspect = (src.width * cw) / Math.max(1, src.height * ch);
    }
    if (typeof templateActive === 'function' && templateActive()) {
      return { width: AppState.designWidth || 30, height: AppState.designHeight || 30 };
    }
    if (AppState.mode === 'flat') {
      const width = AppState.plateWidth || 100;
      return { width, height: width / Math.max(0.05, aspect) };
    }
    return { width: AppState.designWidth || 30, height: AppState.designHeight || 30 };
  }
  function printKey() {
    const size = printSizeMm();
    return size.width.toFixed(2) + 'x' + size.height.toFixed(2);
  }
  function defaults() {
    return Object.assign({}, PhotoRelief.DEFAULTS);
  }
  function readPhoto() {
    const photo = AppState.photo || defaults();
    const picked = document.querySelector('input[name="photoStyle"]:checked');
    if (picked) photo.style = picked.value;
    photo.detail = num('photoDetail', photo.detail);
    photo.lineMm = num('photoLine', photo.lineMm);
    photo.brightness = num('photoBrightness', photo.brightness);
    photo.contrast = num('photoContrast', photo.contrast);
    photo.gamma = num('photoGamma', photo.gamma);
    const focus = $('photoFocus');
    if (focus) photo.focus = focus.checked;
    const swap = $('photoSwap');
    if (swap) photo.swap = swap.checked;
    const inverse = $('photoInverse');
    if (inverse && inverse.checked) photo.inverse = true;
    else delete photo.inverse;
    const aspect = $('photoAspect');
    if (aspect) photo.aspect = aspect.value;
    AppState.photo = photo;
    return photo;
  }
  function maybeFit(force) {
    const photo = AppState.photo;
    if (!photo || photo.aspect === 'free') return;
    const ratio = aspectRatio(photo.aspect);
    if (!ratio) return;
    const key = photo.aspect + ':' + ratio.toFixed(4);
    if (!force && key === fittedKey && photo.crop) return;
    fittedKey = key;
    photo.crop = fitCrop(ratio);
  }
  function showWarning(text) {
    const el = $('photoWarning');
    if (!el) return;
    el.textContent = text || '';
  }
  function syncUI() {
    syncing = true;
    try {
      const photo = AppState.photo;
      const style = photo && photo.style ? photo.style : 'off';
      const radio = document.querySelector('input[name="photoStyle"][value="' + style + '"]');
      if (radio) radio.checked = true;
      const tools = $('photoTools');
      if (tools) tools.hidden = style === 'off';
      const tip = $('photoTip');
      if (tip) tip.textContent = TIPS[style] || '';
      if (style === 'off') showWarning('');
      const setRange = (id, value) => { const el = $(id); if (el && document.activeElement !== el) el.value = String(value); };
      const d = photo || PhotoRelief.DEFAULTS;
      setRange('photoDetail', d.detail);
      setRange('photoLine', d.lineMm);
      setRange('photoBrightness', d.brightness);
      setRange('photoContrast', d.contrast);
      setRange('photoGamma', d.gamma);
      const focus = $('photoFocus');
      if (focus) focus.checked = !!(photo && photo.focus);
      const swap = $('photoSwap');
      if (swap) swap.checked = !!(photo && photo.swap);
      const inverse = $('photoInverse');
      if (inverse) {
        inverse.checked = !!(photo && photo.inverse);
        inverse.disabled = style !== 'shadow';
      }
      const find = $('photoFind');
      if (find) {
        const phone = typeof CaviotDevice !== 'undefined' && CaviotDevice.tier === 'light';
        find.disabled = phone;
        find.title = phone
          ? 'Find subject needs a computer. Tap the subject on this phone.'
          : (style === 'shadow'
            ? 'Shadow runs this on its own. Click to try again. It is not kept for offline use.'
            : 'Separate the subject. Loaded only when you click, and not kept for offline use.');
      }
      const aspect = $('photoAspect');
      if (aspect && photo && photo.aspect) aspect.value = photo.aspect;
      drawCrop();
      if (style !== 'off' && AppState.image) drawPreview(AppState.image);
    } finally { syncing = false; }
  }
  function drawCrop() {
    const canvas = $('photoCrop');
    const src = sourceImage();
    if (!canvas) return;
    if (!src || !src.width) { canvas.width = 2; canvas.height = 2; return; }
    const maxW = 320, maxH = 180;
    const scale = Math.min(maxW / src.width, maxH / src.height, 1);
    canvas.width = Math.max(2, Math.round(src.width * scale));
    canvas.height = Math.max(2, Math.round(src.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
    const crop = currentCrop();
    const rx = crop.x * canvas.width, ry = crop.y * canvas.height;
    const rw = Math.max(1, crop.w * canvas.width), rh = Math.max(1, crop.h * canvas.height);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.rect(rx + rw, ry, -rw, rh);
    ctx.fill('evenodd');
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx + 1, ry + 1, Math.max(0, rw - 2), Math.max(0, rh - 2));
    ctx.fillStyle = '#ffffff';
    for (const [hx, hy] of [[rx, ry], [rx + rw, ry], [rx, ry + rh], [rx + rw, ry + rh]]) ctx.fillRect(hx - 4, hy - 4, 8, 8);
  }
  function drawPreview(canvas) {
    const preview = $('photoPreview');
    if (!preview || !canvas) return;
    const maxW = 320;
    const scale = Math.min(1, maxW / canvas.width);
    preview.width = Math.max(1, Math.round(canvas.width * scale));
    preview.height = Math.max(1, Math.round(canvas.height * scale));
    const ctx = preview.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
  }
  function remember() {
    if (typeof captureDesignSide === 'function') {
      const slot = captureDesignSide();
      slot.cache = null;
    }
  }
  function turnOff() {
    jobId++;
    clearTimeout(timer);
    if (cancelWorker) cancelWorker();
    else if (worker) { try { worker.terminate(); } catch (_) { /* already gone */ } worker = null; }
    globalThis.photoBusy = false;
    if (AppState.photoSource) AppState.image = AppState.photoSource;
    restoreAutoDepth();
    restoreAutoBase();
    AppState.photo = null;
    AppState.photoSource = null;
    lastPrintKey = '';
    fittedKey = '';
    showWarning('');
    remember();
    syncUI();
    priorSchedule(true);
  }
  function ensureSource() {
    if (typeof designSides !== 'undefined' && designSides[activeDesignSide] && designSides[activeDesignSide].kind === 'text') {
      toast('Photo styles are for pictures. This layer is lettering.', 'error');
      return false;
    }
    if (!AppState.image && !AppState.photoSource) {
      toast('Add a photo first', 'error');
      return false;
    }
    if (!AppState.photoSource) AppState.photoSource = AppState.image;
    if (!AppState.photo) AppState.photo = defaults();
    return true;
  }
  function onStyle() {
    if (syncing) return;
    const picked = document.querySelector('input[name="photoStyle"]:checked');
    const style = picked ? picked.value : 'off';
    if (style === 'off') { turnOff(); return; }
    restoreAutoBase();
    if (!ensureSource()) {
      const off = $('photoStyleOff');
      if (off) off.checked = true;
      syncUI();
      return;
    }
    readPhoto();
    AppState.photo.style = style;
    applyAutoDepth(style);
    applyAutoBase(style);
    maybeFit(true);
    syncUI();
    queueProcess();
  }
  function onControl() {
    if (syncing || !photoOn()) return;
    const before = AppState.photo.aspect;
    readPhoto();
    if (AppState.photo.aspect !== before) {
      if (AppState.photo.aspect === 'free') AppState.photo.crop = null;
      clearSubjectPick();
      maybeFit(true);
      drawCrop();
    }
    queueProcess();
  }
  function sampleCanvas() {
    const src = sourceImage();
    if (!src || src.width < 2 || src.height < 2) throw Error('Add a photo first');
    const crop = currentCrop();
    let sx = Math.round(crop.x * src.width);
    let sy = Math.round(crop.y * src.height);
    let sw = Math.max(1, Math.round(crop.w * src.width));
    let sh = Math.max(1, Math.round(crop.h * src.height));
    sx = Math.min(sx, src.width - 1);
    sy = Math.min(sy, src.height - 1);
    sw = Math.min(sw, src.width - sx);
    sh = Math.min(sh, src.height - sy);
    const scale = Math.min(1, longSideCap() / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(8, Math.round(sw * scale));
    canvas.height = Math.max(8, Math.round(sh * scale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw Error('Not enough memory to convert this photo');
    ctx.drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  }
  function optionsFor(pixels) {
    const photo = AppState.photo;
    const size = printSizeMm();
    return {
      style: photo.style,
      detail: photo.detail,
      lineMm: photo.lineMm,
      brightness: photo.brightness,
      contrast: photo.contrast,
      gamma: photo.gamma,
      focus: photo.focus,
      swap: !!photo.swap,
      inverse: !!photo.inverse,
      seed: photo.seed ? { x: photo.seed.x * (pixels.width - 1), y: photo.seed.y * (pixels.height - 1) } : null,
      subjectMask: photo.subjectBits ? unpackMask(photo.subjectBits, photo.subjectW, photo.subjectH) : null,
      subjectWidth: photo.subjectW || 0,
      subjectHeight: photo.subjectH || 0,
      printWidthMm: size.width,
      printHeightMm: size.height,
      width: pixels.width,
      height: pixels.height,
    };
  }
  function getWorker() {
    if (workerBroken || typeof Worker !== 'function') return null;
    if (worker) return worker;
    try { worker = new Worker('photo-worker.js'); }
    catch (_) { workerBroken = true; worker = null; }
    return worker;
  }
  let workerMsg = 0;
  let cancelWorker = null;
  function processInWorker(pixels, options) {
    if (cancelWorker) cancelWorker();
    const thread = getWorker();
    if (!thread) return Promise.reject(Error('no worker'));
    return new Promise((resolve, reject) => {
      const id = ++workerMsg;
      const rgba = new Uint8ClampedArray(pixels.data);
      let settled = false;
      const finish = (fn, value) => { if (settled) return; settled = true; cleanup(); fn(value); };
      function cleanup() {
        clearTimeout(timerId);
        thread.removeEventListener('message', onMsg);
        thread.removeEventListener('error', onErr);
        if (cancelWorker === cancel) cancelWorker = null;
      }
      const timerId = setTimeout(() => {
        finish(reject, Error('Photo conversion took too long'));
        try { thread.terminate(); } catch (_) { /* already gone */ }
        if (worker === thread) worker = null;
      }, 30000);
      function onMsg(event) {
        const data = event.data || {};
        if (data.id !== id) return;
        if (data.error) finish(reject, Error(data.error));
        else finish(resolve, data);
      }
      function onErr() {
        finish(reject, Error('Photo conversion failed'));
        workerBroken = true;
        try { thread.terminate(); } catch (_) { /* already gone */ }
        worker = null;
      }
      function cancel() {
        const error = Error('cancelled');
        error.name = 'PhotoCancel';
        finish(reject, error);
        try { thread.terminate(); } catch (_) { /* already gone */ }
        if (worker === thread) worker = null;
      }
      cancelWorker = cancel;
      thread.addEventListener('message', onMsg);
      thread.addEventListener('error', onErr);
      try { thread.postMessage({ id, rgba, width: pixels.width, height: pixels.height, options }, [rgba.buffer]); }
      catch (error) { finish(reject, error); }
    });
  }
  function queueProcess() {
    if (typeof restoringHistory !== 'undefined' && restoringHistory) return;
    if (!photoOn()) { globalThis.photoBusy = false; return; }
    const id = ++jobId;
    globalThis.photoBusy = true;
    clearTimeout(timer);
    timer = setTimeout(() => { run(id).catch((error) => { if (id === jobId) toast(error.message || 'Could not convert this photo', 'error'); }); }, 120);
  }
  async function run(id) {
    try {
      if (id !== jobId || !photoOn()) return;
      maybeFit(false);
      applyAutoBase(AppState.photo.style);
      const pixels = sampleCanvas();
      if (id !== jobId || !photoOn()) return;
      await ensureShadowMask(pixels, id);
      if (id !== jobId || !photoOn()) return;
      const options = optionsFor(pixels);
      if (pixels.width * pixels.height > 4e6) throw Error('Photo is too large to convert. It will be scaled down first.');
      let result;
      try { result = await processInWorker(pixels, options); }
      catch (error) {
        if (id !== jobId || !photoOn() || (error && error.name === 'PhotoCancel')) return;
        result = PhotoRelief.process(pixels.data, pixels.width, pixels.height, options);
      }
      if (id !== jobId || !photoOn()) return;
      const canvas = document.createElement('canvas');
      canvas.width = result.width;
      canvas.height = result.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Not enough memory to show this photo');
      const rgba = result.rgba instanceof Uint8ClampedArray ? result.rgba : new Uint8ClampedArray(result.rgba);
      ctx.putImageData(new ImageData(rgba, result.width, result.height), 0, 0);
      showWarning(result.warning || '');
      drawPreview(canvas);
      applying = true;
      try {
        AppState.image = canvas;
        lastPrintKey = printKey();
        remember();
        priorSchedule(true);
      } finally { applying = false; }
      const wasDirty = typeof projectDirty !== 'undefined' && projectDirty;
      if (wasDirty && typeof dirty === 'function') dirty();
    } finally {
      if (id === jobId) globalThis.photoBusy = false;
    }
  }
  function clampCrop(crop) {
    const w = Math.min(1, Math.max(0.05, crop.w));
    const h = Math.min(1, Math.max(0.05, crop.h));
    return {
      x: Math.min(1 - w, Math.max(0, crop.x)),
      y: Math.min(1 - h, Math.max(0, crop.y)),
      w, h,
    };
  }
  function hitHandle(crop, x, y) {
    const near = 0.06;
    const corners = [
      ['nw', crop.x, crop.y],
      ['ne', crop.x + crop.w, crop.y],
      ['sw', crop.x, crop.y + crop.h],
      ['se', crop.x + crop.w, crop.y + crop.h],
    ];
    for (const [name, cx, cy] of corners) if (Math.abs(x - cx) <= near && Math.abs(y - cy) <= near) return name;
    if (x >= crop.x && x <= crop.x + crop.w && y >= crop.y && y <= crop.y + crop.h) return 'move';
    return '';
  }
  function applyDrag(start, dx, dy, mode) {
    const photo = AppState.photo;
    const ratio = photo && photo.aspect !== 'free' ? aspectRatio(photo.aspect) : null;
    const src = sourceImage();
    let crop = { x: start.x, y: start.y, w: start.w, h: start.h };
    if (mode === 'move') {
      crop.x += dx;
      crop.y += dy;
    } else {
      if (mode === 'se' || mode === 'ne') crop.w = start.w + dx;
      if (mode === 'sw' || mode === 'nw') { crop.x = start.x + dx; crop.w = start.w - dx; }
      if (mode === 'se' || mode === 'sw') crop.h = start.h + dy;
      if (mode === 'ne' || mode === 'nw') { crop.y = start.y + dy; crop.h = start.h - dy; }
      if (ratio && src && src.width && src.height) {
        const signX = mode === 'nw' || mode === 'sw' ? -1 : 1;
        const signY = mode === 'nw' || mode === 'ne' ? -1 : 1;
        const pixelW = Math.max(8, crop.w * src.width);
        const pixelH = pixelW / ratio;
        crop.w = pixelW / src.width;
        crop.h = pixelH / src.height;
        if (signX < 0) crop.x = start.x + start.w - crop.w;
        if (signY < 0) crop.y = start.y + start.h - crop.h;
      }
    }
    return clampCrop(crop);
  }
  let picking = false;
  function setPicking(on) {
    picking = !!on;
    const button = $('photoTap');
    const canvas = $('photoCrop');
    if (button) button.setAttribute('aria-pressed', picking ? 'true' : 'false');
    if (canvas) canvas.classList.toggle('is-picking', picking);
    const help = $('photoSubjectHelp');
    if (help) {
      const shadow = AppState.photo && AppState.photo.style === 'shadow';
      help.textContent = picking
        ? 'Click the subject in the photo. The background is not raised.'
        : (shadow
          ? 'Shadow finds the subject on its own. Tap the subject if that picked the background.'
          : 'The subject is whatever covers the middle. Tap the subject if that picked the background.');
    }
  }
  function rememberSeed(x, y) {
    if (!AppState.photo) return;
    clearSubjectPick();
    AppState.photo.seed = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
    setPicking(false);
    queueProcess();
  }
  function loadSegment() {
    if (globalThis.PhotoSegment) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'photo-segment.js';
      script.onload = () => resolve();
      script.onerror = () => reject(Error('Could not load the subject finder.'));
      document.head.appendChild(script);
    });
  }
  async function segmentPixels(pixels, raw) {
    await loadSegment();
    if (!PhotoSegment.allowed()) throw Error('Find subject needs a computer. Tap the subject on this phone.');
    return PhotoSegment.findSubject(pixels, raw ? { raw: true } : undefined);
  }
  async function ensureShadowMask(pixels, id) {
    const photo = AppState.photo;
    if (!photo || photo.style !== 'shadow' || photo.subjectBits || photo.seed) return;
    const phone = typeof CaviotDevice !== 'undefined' && CaviotDevice.tier === 'light';
    if (phone || (globalThis.PhotoSegment && !PhotoSegment.allowed())) {
      setPicking(true);
      return;
    }
    try {
      const mask = await segmentPixels(pixels, true);
      if (id !== jobId || !AppState.photo || AppState.photo.style !== 'shadow') return;
      clearSubjectPick();
      AppState.photo.subjectBits = packMask(mask);
      AppState.photo.subjectW = pixels.width;
      AppState.photo.subjectH = pixels.height;
      setPicking(false);
    } catch (_) {
      if (id === jobId) setPicking(true);
    }
  }
  async function findSubject() {
    if (!photoOn() || !ensureSource()) return;
    const find = $('photoFind');
    if (find && find.disabled) {
      toast('Find subject needs a computer. Tap the subject on this phone.', 'error');
      return;
    }
    const pixels = sampleCanvas();
    const raw = AppState.photo && AppState.photo.style === 'shadow';
    const mask = await segmentPixels(pixels, raw);
    if (!AppState.photo) return;
    clearSubjectPick();
    AppState.photo.subjectBits = packMask(mask);
    AppState.photo.subjectW = pixels.width;
    AppState.photo.subjectH = pixels.height;
    queueProcess();
  }
  function bindCrop() {
    const canvas = $('photoCrop');
    if (!canvas) return;
    let drag = null;
    canvas.addEventListener('pointerdown', (event) => {
      if (!photoOn() || !sourceImage()) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      if (picking) {
        const crop = currentCrop();
        if (x >= crop.x && y >= crop.y && x <= crop.x + crop.w && y <= crop.y + crop.h) {
          rememberSeed((x - crop.x) / crop.w, (y - crop.y) / crop.h);
        }
        event.preventDefault();
        return;
      }
      const mode = hitHandle(currentCrop(), x, y);
      if (!mode) return;
      drag = { mode, x, y, crop: Object.assign({}, currentCrop()), pointer: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag || event.pointerId !== drag.pointer || !AppState.photo) return;
      const rect = canvas.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      AppState.photo.crop = applyDrag(drag.crop, x - drag.x, y - drag.y, drag.mode);
      if (AppState.photo.aspect !== 'free' && drag.mode === 'move') { /* keep the preset */ }
      else if (drag.mode !== 'move') {
        // A free-hand resize leaves the preset only when the shape was free. Locked presets stay locked.
      }
      drawCrop();
    });
    const end = (event) => {
      if (!drag || (event && event.pointerId !== drag.pointer)) return;
      drag = null;
      clearSubjectPick();
      queueProcess();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('keydown', (event) => {
      if (!photoOn() || !AppState.photo) return;
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown';
      if (!horizontal && !vertical) return;
      event.preventDefault();
      const dir = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
      const crop = Object.assign({}, currentCrop());
      if (event.shiftKey) {
        if (horizontal) crop.w += dir * 0.02;
        if (vertical) crop.h += dir * 0.02;
        const ratio = AppState.photo.aspect !== 'free' ? aspectRatio(AppState.photo.aspect) : null;
        const src = sourceImage();
        if (ratio && src && src.width) {
          crop.h = (crop.w * src.width / ratio) / src.height;
        }
      } else {
        if (horizontal) crop.x += dir * 0.01;
        if (vertical) crop.y += dir * 0.01;
      }
      AppState.photo.crop = clampCrop(crop);
      drawCrop();
      queueProcess();
    });
  }
  function spinSource(deg) {
    const src = sourceImage();
    if (!src) return;
    const canvas = document.createElement('canvas');
    const w = src.width, h = src.height;
    if (Math.abs(deg) % 180 === 0) { canvas.width = w; canvas.height = h; }
    else { canvas.width = h; canvas.height = w; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { toast('Not enough memory to rotate this photo', 'error'); return; }
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(deg * Math.PI / 180);
    ctx.drawImage(src, -w / 2, -h / 2);
    AppState.photoSource = canvas;
    if (AppState.photo && AppState.photo.crop) AppState.photo.crop = rotateCrop(AppState.photo.crop, deg);
    fittedKey = '';
    drawCrop();
    queueProcess();
  }
  function rotateCrop(crop, deg) {
    const x = crop.x, y = crop.y, w = crop.w, h = crop.h;
    const d = ((deg % 360) + 360) % 360;
    if (d === 90) return { x: 1 - (y + h), y: x, w: h, h: w };
    if (d === 180) return { x: 1 - (x + w), y: 1 - (y + h), w, h };
    if (d === 270) return { x: y, y: 1 - (x + w), w: h, h: w };
    return { x, y, w, h };
  }
  function flipSource() {
    const src = sourceImage();
    if (!src) return;
    const canvas = document.createElement('canvas');
    canvas.width = src.width;
    canvas.height = src.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) { toast('Not enough memory to flip this photo', 'error'); return; }
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(src, 0, 0);
    AppState.photoSource = canvas;
    if (AppState.photo && AppState.photo.crop) {
      const crop = AppState.photo.crop;
      AppState.photo.crop = { x: 1 - (crop.x + crop.w), y: crop.y, w: crop.w, h: crop.h };
    }
    drawCrop();
    queueProcess();
  }

  setDesignImage = function (img, label) {
    jobId++;
    clearTimeout(timer);
    restoreAutoDepth();
    restoreAutoBase();
    depthTouched = false;
    baseTouched = false;
    AppState.photo = null;
    AppState.photoSource = null;
    lastPrintKey = '';
    fittedKey = '';
    const result = priorSetImage.apply(this, arguments);
    syncUI();
    return result;
  };
  rotateImage = function (deg) {
    if (photoOn() && AppState.photoSource) { spinSource(deg); return; }
    return priorRotate(deg);
  };
  flipImageH = function () {
    if (photoOn() && AppState.photoSource) { flipSource(); return; }
    return priorFlip();
  };
  function maybeReprocessForSize() {
    if (applying || !photoOn()) return;
    if (typeof restoringHistory !== 'undefined' && restoringHistory) return;
    if (printKey() !== lastPrintKey) queueProcess();
  }
  scheduleRebuild = function (immediate) {
    maybeReprocessForSize();
    return priorSchedule.call(this, immediate);
  };
  if (typeof requestTemplatePreview === 'function') {
    const priorRequestPreview = requestTemplatePreview;
    requestTemplatePreview = function () {
      maybeReprocessForSize();
      return priorRequestPreview.apply(this, arguments);
    };
  }
  projectStateToUI = function () {
    const result = priorProjectUI.apply(this, arguments);
    syncUI();
    return result;
  };

  const preview = $('photoPreview');
  if (preview) preview.addEventListener('pointerdown', (event) => {
    if (!picking || !photoOn()) return;
    const rect = preview.getBoundingClientRect();
    rememberSeed((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    event.preventDefault();
  });
  const tap = $('photoTap');
  if (tap) tap.addEventListener('click', () => { if (photoOn()) setPicking(!picking); });
  const find = $('photoFind');
  if (find) find.addEventListener('click', () => {
    findSubject().catch((error) => toast(error.message || 'Could not find a subject', 'error'));
  });
  const swap = $('photoSwap');
  if (swap) swap.addEventListener('change', onControl);
  const inverse = $('photoInverse');
  if (inverse) inverse.addEventListener('change', onControl);
  const baseIn = $('baseIn');
  if (baseIn) baseIn.addEventListener('input', () => {
    const v = Number(baseIn.value);
    if (autoBase == null || Math.abs(v - autoBase) > 0.05) {
      baseTouched = true;
      autoBase = null;
    }
  });
  const depthIn = $('depthIn');
  if (depthIn) depthIn.addEventListener('input', () => {
    const v = Number(depthIn.value);
    if (autoDepth == null || Math.abs(v - autoDepth) > 0.015) {
      depthTouched = true;
      autoDepth = null;
    }
  });
  document.querySelectorAll('input[name="photoStyle"]').forEach((el) => el.addEventListener('change', onStyle));
  ['photoDetail', 'photoLine', 'photoBrightness', 'photoContrast', 'photoGamma'].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener('input', onControl);
  });
  const focus = $('photoFocus');
  if (focus) focus.addEventListener('change', onControl);
  const aspect = $('photoAspect');
  if (aspect) aspect.addEventListener('change', onControl);
  bindCrop();
  syncUI();
  globalThis.syncPhotoUI = syncUI;
})();

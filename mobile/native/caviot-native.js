import {
  WKWEBVIEW_LIMITS,
  nativeActive,
  safeExportName,
  shouldConfirmIpadExport,
  shareWasCancelled,
  cameraOutcome,
  nativePickerKind,
  iphoneMemoryHolds,
  proGateApplies
} from './bridge-logic.js';
import { installProGate } from './pro-paywall.js';

// Optional native shell for the Capacitor app. On the web, and in Node tests, Capacitor is absent
// and this module returns without patching download, camera, or export.
// page-bridge.js (a classic script) publishes __caviotPage. This module must not name the
// studio's const/let bindings or its function declarations; those are invisible here.
const cap = globalThis.Capacitor;
let pageApi = null;
if (!nativeActive(cap)) {
  // Intentionally empty.
} else {
  installNativeShell(cap);
}

function installNativeShell(capacitor) {
  const plugins = capacitor.Plugins || {};
  const native = typeof capacitor.registerPlugin === 'function'
    ? capacitor.registerPlugin('CaviotNative')
    : plugins.CaviotNative;
  pageApi = globalThis.__caviotPage || null;
  const platform = typeof capacitor.getPlatform === 'function' ? capacitor.getPlatform() : '';
  const android = platform === 'android';
  document.documentElement.classList.add('capacitor-native');
  if (android) document.documentElement.classList.add('android-native');

  const haptics = plugins.Haptics;
  const filesystem = plugins.Filesystem;
  const share = plugins.Share;
  const camera = plugins.Camera;
  let smokeMode = false;
  let memoryWarnedAt = 0;

  configureChrome(plugins);
  patchExportHandoff({ filesystem, share, haptics });
  patchIpadMemoryGuard();
  // Outermost export wrapper, so a locked export opens the paywall before any confirm or heavy work.
  const pro = proGateApplies(platform) && native && typeof native.proStatus === 'function'
    ? installProGate({ plugin: native, pageApi, say })
    : null;
  bindPickersAndHaptics({ camera, haptics });
  listenForMemoryWarnings(native);
  listenForOpenedFiles(native, capacitor);
  if (android) {
    bindAndroidBackButton(plugins.App);
    bindAdaptiveRefresh(native);
  }
  void beginSmokeIfRequested(native);

  // "Open in Caviot" from Files or the share sheet: the native side copies the file into tmp and
  // signals; the page then loads it as the sleeve template (STL, OBJ or 3MF; anything else is refused there).
  function listenForOpenedFiles(plugin, capacitorRef) {
    if (!plugin || typeof plugin.takePendingFiles !== 'function') return;
    let busy = false;
    const drain = async () => {
      if (busy) return;
      busy = true;
      try {
        for (let i = 0; i < 600 && !(pageApi && pageApi.ready); i++) await new Promise((r) => setTimeout(r, 100));
        const { files = [], shortcuts = [] } = await plugin.takePendingFiles();
        for (const action of shortcuts) void runShortcut(plugin, action);
        for (const entry of files) {
          if (entry.error) { say(entry.error, 'error'); continue; }
          try {
            const url = capacitorRef.convertFileSrc('file://' + entry.path);
            const response = await fetch(url);
            if (!response.ok) throw new Error('could not read the file (' + response.status + ')');
            const file = new File([await response.blob()], entry.name || 'template.stl');
            say('Opening “' + file.name + '” as the sleeve template…', 'success');
            const opened = performance.now();
            await pageApi.openTemplateFile(file);
            if (smokeMode) await report(plugin, { stage: 'template-opened', name: file.name, bytes: file.size, ms: Math.round(performance.now() - opened), template: pageApi.state?.templateId });
          } catch (error) {
            say('Could not open “' + (entry.name || 'file') + '”: ' + messageOf(error), 'error');
          }
        }
      } catch (error) {
        say('Could not open the shared file: ' + messageOf(error), 'error');
      } finally {
        busy = false;
      }
    };
    plugin.addListener?.('templateFileReady', () => { void drain(); });
    plugin.addListener?.('shortcut', () => { void drain(); });
    void drain();
  }

  // Android launcher shortcuts (long-press the icon): open a template, or pick the export folder.
  async function runShortcut(plugin, action) {
    try {
      if (/PICK_TEMPLATE$/.test(action)) await plugin.pickTemplate();
      else if (/EXPORT_FOLDER$/.test(action)) {
        const result = await plugin.chooseExportFolder();
        if (result?.folder) say('Exports will be saved to “' + result.folder + '”.', 'success');
      }
    } catch (error) {
      say('That shortcut did not work: ' + messageOf(error), 'error');
    }
  }

  // Android back: close the top dialog, then the tools sheet, then send the app to the background
  // (like Chrome) instead of killing it, so an unsaved design survives.
  function bindAndroidBackButton(app) {
    if (!app || typeof app.addListener !== 'function') return;
    app.addListener('backButton', () => {
      const dialogs = [...document.querySelectorAll('dialog[open]')];
      const top = dialogs[dialogs.length - 1];
      if (top) {
        const cancel = new Event('cancel', { cancelable: true });
        if (top.dispatchEvent(cancel)) top.close('cancel');
        return;
      }
      if (document.body.classList.contains('mobile-settings-open') && typeof globalThis.setSettingsOpen === 'function') {
        globalThis.setSettingsOpen(false);
        return;
      }
      if (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
        document.activeElement.blur();
        return;
      }
      app.minimizeApp?.().catch?.(() => {});
    })?.catch?.(() => {});
  }

  // 90/120 Hz only while a finger is on the model; the system picks a lower rate when idle (battery).
  function bindAdaptiveRefresh(plugin) {
    if (!plugin || typeof plugin.setHighRefresh !== 'function') return;
    let high = false;
    let dropTimer = 0;
    const set = (value) => {
      if (value === high) return;
      high = value;
      plugin.setHighRefresh({ high: value }).catch(() => {});
    };
    const onCanvas = (event) => event.target && event.target.tagName === 'CANVAS';
    document.addEventListener('pointerdown', (event) => {
      if (!onCanvas(event) && !event.target?.closest?.('input[type="range"]')) return;
      clearTimeout(dropTimer);
      set(true);
    }, { capture: true, passive: true });
    const release = () => { clearTimeout(dropTimer); dropTimer = setTimeout(() => set(false), 1500); };
    document.addEventListener('pointerup', release, { capture: true, passive: true });
    document.addEventListener('pointercancel', release, { capture: true, passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) set(false); });
  }

  function configureChrome(all) {
    const status = all.StatusBar;
    if (status) {
      if (!android) status.setOverlaysWebView({ overlay: true }).catch(() => {});
      status.setStyle({ style: 'DARK' }).catch(() => {});
      status.setBackgroundColor({ color: '#101114' }).catch(() => {});
    }
    const hide = () => all.SplashScreen?.hide({ fadeOutDuration: 200 }).catch(() => {});
    hide();
    globalThis.addEventListener('load', hide);
    setTimeout(hide, 8000);
  }

  function patchExportHandoff(tools) {
    if (!pageApi || typeof pageApi.download !== 'function') return;
    const webDownload = pageApi.download;
    pageApi.download = function (blob, filename) {
      deliverExport(blob, filename, tools).catch((error) => {
        if (smokeMode) {
          globalThis.__caviotSmokeExportError = messageOf(error);
          return;
        }
        if (error && error.code === 'too-large') {
          say(error.message, 'error');
          pulse(tools.haptics, 'notification', { type: 'ERROR' });
          return;
        }
        say('Could not save through ' + (android ? 'Android' : 'the iOS share sheet') + ' (' + messageOf(error) + '). Trying the browser download instead.', 'error');
        try { webDownload(blob, filename); }
        catch (fallbackError) { say('Export could not be saved: ' + messageOf(fallbackError), 'error'); }
      });
    };
  }

  async function deliverExport(blob, filename, tools) {
    if (!tools.filesystem || typeof tools.filesystem.writeFile !== 'function') {
      throw new Error('Files is not available in this build');
    }
    if (!blob || blob.size <= 0) throw new Error('The export file is empty.');
    if (blob.size > WKWEBVIEW_LIMITS.maxHandoffBytes) {
      const error = new Error('This export is over 80 MB, which is too large to hand off on this device. Use a computer for this model.');
      error.code = 'too-large';
      throw error;
    }
    const path = safeExportName(filename);
    if (android) return deliverAndroidExport(blob, path, tools);
    try {
      await writeBlobInChunks(tools.filesystem, path, blob);
      const stat = await tools.filesystem.stat({ path, directory: 'DOCUMENTS' });
      if (Number(stat.size) !== blob.size) {
        throw new Error('The saved file is ' + stat.size + ' bytes; the export is ' + blob.size + ' bytes.');
      }
    } catch (error) {
      await tools.filesystem.deleteFile({ path, directory: 'DOCUMENTS' }).catch(() => {});
      throw error;
    }
    pulse(tools.haptics, 'notification', { type: 'SUCCESS' });
    say('Saved “' + path + '” to Files.', 'success');
    if (smokeMode) {
      globalThis.__caviotSmokeExport = { filename: path, bytes: blob.size };
      return;
    }
    if (!tools.share || typeof tools.share.share !== 'function') return;
    try {
      const located = await tools.filesystem.getUri({ path, directory: 'DOCUMENTS' });
      await tools.share.share({ title: path, files: [located.uri] });
    } catch (error) {
      if (shareWasCancelled(error)) return;
      say('Saved to Files. The share sheet could not open: ' + messageOf(error), 'error');
      pulse(tools.haptics, 'notification', { type: 'ERROR' });
    }
  }

  // Android: write the export to app cache, then the native side saves it to the remembered folder
  // (Storage Access Framework), asks with Save as…, or hands back "share".
  async function deliverAndroidExport(blob, path, tools) {
    await writeBlobInChunks(tools.filesystem, path, blob, 'CACHE');
    const stat = await tools.filesystem.stat({ path, directory: 'CACHE' });
    if (Number(stat.size) !== blob.size) {
      await tools.filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
      throw new Error('The saved file is ' + stat.size + ' bytes; the export is ' + blob.size + ' bytes.');
    }
    if (smokeMode) {
      globalThis.__caviotSmokeExport = { filename: path, bytes: blob.size };
      return;
    }
    const located = await tools.filesystem.getUri({ path, directory: 'CACHE' });
    const filePath = String(located.uri).replace(/^file:\/\//, '');
    const mime = /\.obj$/i.test(path) ? 'model/obj' : /\.icaviot$/i.test(path) ? 'application/json' : 'model/stl';
    const result = await native.saveExport({ path: decodeURIComponent(filePath), name: path, mime });
    if (result?.cancelled) {
      await tools.filesystem.deleteFile({ path, directory: 'CACHE' }).catch(() => {});
      return;
    }
    if (result?.action === 'share') {
      try { await tools.share.share({ title: path, files: [located.uri] }); }
      catch (error) { if (!shareWasCancelled(error)) say('The share sheet could not open: ' + messageOf(error), 'error'); }
      return;
    }
    pulse(tools.haptics, 'notification', { type: 'SUCCESS' });
    say(result?.where === 'folder' ? 'Saved “' + path + '” to “' + (result.folder || 'your folder') + '”.' : 'Saved “' + path + '”.', 'success');
  }

  function patchIpadMemoryGuard() {
    if (!pageApi || typeof pageApi.exportCurrent !== 'function' || !pageApi.device) return;
    const previous = pageApi.exportCurrent;
    pageApi.exportCurrent = function (format) {
      try {
        const estimate = pageApi.estimate();
        const device = pageApi.device;
        if (estimate && device && shouldConfirmIpadExport({ ios: device.iOS, phone: device.phone, triangles: estimate.tris })) {
          const millions = (estimate.tris / 1e6).toFixed(1);
          const ok = confirm('This export is about ' + millions + ' million triangles and may be closed by iOS if it runs out of memory (WKWebView is limited to roughly 2 GB on iPad). Export anyway?');
          if (!ok) return;
        }
      } catch (error) {
        console.warn('Could not check the WKWebView export size:', error);
      }
      return previous.apply(this, arguments);
    };
  }

  function bindPickersAndHaptics(tools) {
    document.addEventListener('click', (event) => {
      const add = event.target.closest?.('[data-add]');
      const kind = nativePickerKind(add?.dataset.add);
      if (kind) {
        event.preventDefault();
        event.stopPropagation();
        pulse(tools.haptics, 'impact', { style: 'LIGHT' });
        void pickImage(kind, tools);
        return;
      }
      const button = event.target.closest?.('button');
      if (!button || button.disabled) return;
      if (button.id === 'generateBtn' || button.id === 'downloadObjBtn' || button.id === 'saveProject') {
        pulse(tools.haptics, 'impact', { style: 'MEDIUM' });
      } else if (button.id === 'undoEdit' || button.id === 'redoEdit' || button.dataset.add === 'text' || button.dataset.add === 'files') {
        pulse(tools.haptics, 'impact', { style: 'LIGHT' });
      }
    }, true);
  }

  async function pickImage(kind, tools) {
    if (!tools.camera) {
      say('The photo picker is not available in this build.', 'error');
      return;
    }
    try {
      const media = kind === 'camera'
        ? await tools.camera.takePhoto({
          quality: 85,
          targetWidth: 2048,
          targetHeight: 2048,
          correctOrientation: true,
          saveToGallery: false,
          cameraDirection: 'REAR',
          editable: 'no'
        })
        : (await tools.camera.chooseFromGallery({ allowMultipleSelection: false, includeMetadata: false })).results?.[0];
      if (!media) return;
      const file = await fileFromMedia(media, capacitor);
      const input = document.getElementById(kind === 'camera' ? 'phoneCameraInput' : 'fileInput');
      if (!handToInput(input, file)) pageApi?.loadImage(file);
    } catch (error) {
      const outcome = cameraOutcome(error);
      if (outcome === 'cancel') return;
      pulse(tools.haptics, 'notification', { type: 'ERROR' });
      if (outcome === 'denied') {
        say(kind === 'camera'
          ? 'Camera access is off. Enable it in Settings → Caviot Studio → Camera.'
          : 'Photo access is off. Enable it in Settings → Caviot Studio → Photos.', 'error');
        return;
      }
      say('Could not open ' + (kind === 'camera' ? 'the camera' : 'Photos') + '. ' + messageOf(error), 'error');
    }
  }

  // Frame timing while the camera orbits (what a finger drag does), measured with rAF deltas.
  async function benchmarkPreview() {
    const nav = performance.getEntriesByType('navigation')[0];
    const out = { firstRenderMs: Math.round(performance.now()), domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd) : null, dpr: devicePixelRatio };
    const { camera, controls, renderer } = pageApi.three || {};
    if (!camera || !controls || !renderer) return { ...out, orbit: 'unavailable' };
    out.drawingBuffer = renderer.domElement.width + 'x' + renderer.domElement.height;
    const target = controls.target.clone();
    const offset = camera.position.clone().sub(target);
    const axis = new camera.up.constructor(0, 1, 0);
    const deltas = [];
    let last = performance.now();
    const t0 = last;
    await new Promise((resolve) => {
      const step = (now) => {
        deltas.push(now - last);
        last = now;
        offset.applyAxisAngle(axis, 0.03);
        camera.position.copy(target).add(offset);
        camera.lookAt(target);
        globalThis.requestPreviewRender?.(200);
        if (now - t0 < 4000) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    out.orbit = frameStats(deltas.slice(3));
    const idleStart = renderer.info.render.frame;
    await sleep(3000);
    out.idleDrawsPerSecond = +((renderer.info.render.frame - idleStart) / 3).toFixed(1);
    return out;
  }

  // Drag a real tools slider for 3 s and time each frame plus the input handler cost.
  async function benchmarkSlider() {
    const slider = [...document.querySelectorAll('input[type="range"]')].find((el) => !el.disabled && el.offsetParent !== null)
      || document.querySelector('input[type="range"]:not([disabled])');
    if (!slider) return { slider: 'none' };
    const min = Number(slider.min || 0), max = Number(slider.max || 100), original = slider.value;
    const deltas = [], handler = [];
    let last = performance.now();
    const t0 = last;
    let i = 0;
    await new Promise((resolve) => {
      const step = (now) => {
        deltas.push(now - last);
        last = now;
        slider.value = String(min + ((Math.sin(i++ / 10) + 1) / 2) * (max - min));
        const h0 = performance.now();
        slider.dispatchEvent(new Event('input', { bubbles: true }));
        handler.push(performance.now() - h0);
        if (now - t0 < 3000) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    slider.value = original;
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    slider.dispatchEvent(new Event('change', { bubbles: true }));
    await waitFor(() => !pageApi.previewRunning && !pageApi.previewPending && !pageApi.state?.rebuildTimer, 120000, 'Preview did not settle after the slider test').catch(() => {});
    handler.sort((x, y) => x - y);
    return { slider: slider.id || slider.name || 'range', frames: frameStats(deltas.slice(3)), inputHandlerP95Ms: +(handler[Math.floor(handler.length * 0.95)] || 0).toFixed(2) };
  }

  function frameStats(deltas) {
    const sorted = [...deltas].sort((x, y) => x - y);
    const pick = (q) => +(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] || 0).toFixed(2);
    const total = deltas.reduce((x, y) => x + y, 0);
    return { frames: deltas.length, fps: +(deltas.length / (total / 1000)).toFixed(1), p50Ms: pick(0.5), p95Ms: pick(0.95), maxMs: pick(1), over33ms: deltas.filter((d) => d > 33.4).length };
  }

  function listenForMemoryWarnings(plugin) {
    if (!plugin || typeof plugin.addListener !== 'function') return;
    try {
      const added = plugin.addListener('memoryWarning', () => {
        const now = Date.now();
        if (now - memoryWarnedAt < 60000) return;
        memoryWarnedAt = now;
        say('This device is low on memory. Save your project. A very large export can be closed by ' + (android ? 'Android' : 'iOS') + '.', 'error');
        pulse(haptics, 'notification', { type: 'WARNING' });
      });
      if (added && typeof added.catch === 'function') added.catch(() => {});
    } catch { /* the page still works if the listener cannot be attached */ }
  }

  // iOS smoke: the paywall opens and closes without exporting, then the smoke export is allowed through.
  async function checkProGate(plugin) {
    const status = await Promise.race([pro.ready(), sleep(20000).then(() => pro.state)]);
    const showing = pro.open('smoke');
    await waitFor(() => document.getElementById('proPaywall')?.open, 10000, 'The Pro paywall did not open');
    const restoreShown = !!document.querySelector('#proPaywall [data-pro="restore"]');
    document.querySelector('#proPaywall [data-pro="close"]').click();
    const unlockedByChoice = await showing;
    if (unlockedByChoice) throw new Error('Closing the Pro paywall unlocked export');
    if (document.getElementById('proPaywall').open) throw new Error('The Pro paywall did not close');
    await report(plugin, {
      stage: 'pro-gate',
      shown: true,
      restore: restoreShown,
      environment: status.environment,
      product: status.productState,
      owned: status.pro,
      unlocked: pro.unlocked
    });
    pro.allowSmokeExport();
  }

  async function beginSmokeIfRequested(plugin) {
    if (!plugin || typeof plugin.getLaunchFlags !== 'function') return;
    let flags;
    try { flags = await plugin.getLaunchFlags(); }
    catch { return; }
    smokeMode = !!flags.smoke;
    if (!smokeMode) return;
    try {
      await report(plugin, { stage: 'launch', availableMemory: flags.availableMemory, physicalMemory: flags.physicalMemory });
      if (!pageApi) throw new Error('The native page bridge did not load');
      await waitFor(() => pageApi.templateBase && pageApi.state?.templateId === 'etsyfolger-v1', 90000, 'ETSYFOLGER did not finish loading');
      const device = pageApi.device;
      if (!device) throw new Error('Device limits did not load');
      // Phone apps open on "Choose a template" (dist/empty-start.js): export must be refused until one is picked.
      const gate = globalThis.CaviotEmptyStart;
      if (!gate || !gate.active) throw new Error('The Choose a template screen did not show');
      if (!document.getElementById('generateBtn')?.disabled) throw new Error('Export was enabled before a template was chosen');
      await report(plugin, { stage: 'empty-start', shown: true });
      document.getElementById('emptyStartClassic').click();
      await waitFor(() => !gate.active, 60000, 'Choosing Classic Sleeve did not open the studio');
      const choice = document.getElementById('templateChoice');
      if (!choice || choice.value !== 'etsyfolger-v1' || pageApi.state.templateId !== 'etsyfolger-v1') {
        throw new Error('ETSYFOLGER is not the default template');
      }
      if (device.phone && !iphoneMemoryHolds(device.device)) {
        throw new Error('iPhone WKWebView export budget is not the phone-safe limit');
      }
      await report(plugin, {
        stage: 'ready',
        template: pageApi.state.templateId,
        tier: device.tier,
        detected: device.detected,
        phone: device.phone,
        exportTriangleBudget: device.device.exportTriangleBudget,
        availableMemory: flags.availableMemory,
        physicalMemory: flags.physicalMemory,
        shareReady: await shareAvailable(share)
      });
      if (android) await report(plugin, { stage: 'perf', ...(await benchmarkPreview()) });
      const input = document.getElementById('textInput');
      if (!input) throw new Error('Text field is missing');
      input.focus();
      input.value = 'CI';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await waitFor(() => {
        const state = pageApi.state;
        const label = String(state?.sourceLabel || state?.imageName || '');
        return state?.image && label.startsWith('text:');
      }, 30000, 'Text design was not created');
      await sleep(400);
      await waitFor(() => !pageApi.previewRunning && !pageApi.previewPending && !pageApi.state?.rebuildTimer, 120000, 'Preview did not settle');
      await report(plugin, { stage: 'text-added', label: pageApi.state.sourceLabel });
      if (android) await report(plugin, { stage: 'perf-slider', ...(await benchmarkSlider()) });
      if (pro) await checkProGate(plugin);
      const started = Date.now();
      const pending = pageApi.exportCurrent('stl');
      if (pending && typeof pending.then === 'function') pending.catch(() => {});
      while (!globalThis.__caviotSmokeExport) {
        if (globalThis.__caviotSmokeExportError) throw new Error(globalThis.__caviotSmokeExportError);
        if (Date.now() - started > 600000) throw new Error('Export did not write a file');
        const heavy = document.getElementById('heavyExportDialog');
        if (heavy?.open) heavy.querySelector('[data-choice="go"]')?.click();
        const empty = document.getElementById('phoneEmptyExport');
        if (empty?.open) throw new Error('Export asked for a logo after the text design was added');
        if (!pageApi.exportBusy && Date.now() - started > 8000) {
          const status = document.getElementById('templateStatus')?.textContent || '';
          if (/could not|failed|cannot|too large|stopped responding/i.test(status)) throw new Error(status);
        }
        await sleep(300);
      }
      const result = globalThis.__caviotSmokeExport;
      await report(plugin, { stage: 'export-ok', filename: result.filename, bytes: result.bytes, exportMs: Date.now() - started });
    } catch (error) {
      const status = document.getElementById('templateStatus')?.textContent || '';
      await report(plugin, { stage: 'failed', message: messageOf(error), status }).catch(() => {});
    }
  }
}

async function writeBlobInChunks(filesystem, path, blob, directory = 'DOCUMENTS') {
  const chunkSize = 512 * 1024;
  let offset = 0;
  let index = 0;
  while (offset < blob.size) {
    const slice = blob.slice(offset, Math.min(blob.size, offset + chunkSize));
    const data = await blobToBase64(slice);
    const options = { path, data, directory };
    if (index === 0) await filesystem.writeFile(options);
    else await filesystem.appendFile(options);
    offset += slice.size;
    index += 1;
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read the export.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      if (comma < 0) reject(new Error('Could not encode the export.'));
      else resolve(value.slice(comma + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function fileFromMedia(media, capacitor) {
  const path = media.webPath || (media.uri && typeof capacitor.convertFileSrc === 'function' ? capacitor.convertFileSrc(media.uri) : '');
  if (!path) throw new Error('The picker did not return a photo.');
  const response = await fetch(path);
  if (!response.ok) throw new Error('Could not read the selected photo.');
  const blob = await response.blob();
  const type = blob.type || 'image/jpeg';
  const extension = type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], 'logo.' + extension, { type });
}

function handToInput(input, file) {
  if (!input || typeof DataTransfer !== 'function') return false;
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

function pulse(plugin, method, options) {
  try {
    const result = plugin?.[method]?.(options);
    if (result && typeof result.catch === 'function') result.catch(() => {});
  } catch { /* haptics are optional feedback */ }
}

function say(message, kind) {
  if (pageApi && typeof pageApi.toast === 'function') pageApi.toast(message, kind);
  else console.warn(message);
}

function messageOf(error) {
  return String((error && (error.message || error)) || 'unknown error');
}

async function shareAvailable(share) {
  try {
    if (!share || typeof share.canShare !== 'function') return false;
    const result = await share.canShare();
    return !!result?.value;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitFor(check, ms, label) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      let value;
      try { value = check(); }
      catch (error) { reject(error); return; }
      if (value) resolve(value);
      else if (Date.now() - start > ms) reject(new Error(label || 'Timed out'));
      else setTimeout(tick, 200);
    };
    tick();
  });
}

async function report(plugin, payload) {
  const json = JSON.stringify({ ...payload, at: Date.now() });
  console.info('CAVIOT_SMOKE ' + json);
  await plugin.report({ json });
}

import {
  WKWEBVIEW_LIMITS,
  nativeActive,
  safeExportName,
  shouldConfirmIpadExport,
  shareWasCancelled,
  cameraOutcome,
  nativePickerKind,
  iphoneMemoryHolds
} from './bridge-logic.js';

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
  document.documentElement.classList.add('capacitor-native');

  const haptics = plugins.Haptics;
  const filesystem = plugins.Filesystem;
  const share = plugins.Share;
  const camera = plugins.Camera;
  let smokeMode = false;
  let memoryWarnedAt = 0;

  configureChrome(plugins);
  patchExportHandoff({ filesystem, share, haptics });
  patchIpadMemoryGuard();
  bindPickersAndHaptics({ camera, haptics });
  listenForMemoryWarnings(native);
  void beginSmokeIfRequested(native);

  function configureChrome(all) {
    const status = all.StatusBar;
    if (status) {
      status.setOverlaysWebView({ overlay: true }).catch(() => {});
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
        say('Could not use the iOS share sheet (' + messageOf(error) + '). Trying the browser download instead.', 'error');
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

  function listenForMemoryWarnings(plugin) {
    if (!plugin || typeof plugin.addListener !== 'function') return;
    try {
      const added = plugin.addListener('memoryWarning', () => {
        const now = Date.now();
        if (now - memoryWarnedAt < 60000) return;
        memoryWarnedAt = now;
        say('This device is low on memory. Save your project. A very large export can be closed by iOS.', 'error');
        pulse(haptics, 'notification', { type: 'WARNING' });
      });
      if (added && typeof added.catch === 'function') added.catch(() => {});
    } catch { /* the page still works if the listener cannot be attached */ }
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
      await report(plugin, { stage: 'export-ok', filename: result.filename, bytes: result.bytes });
    } catch (error) {
      const status = document.getElementById('templateStatus')?.textContent || '';
      await report(plugin, { stage: 'failed', message: messageOf(error), status }).catch(() => {});
    }
  }
}

async function writeBlobInChunks(filesystem, path, blob) {
  const chunkSize = 512 * 1024;
  let offset = 0;
  let index = 0;
  while (offset < blob.size) {
    const slice = blob.slice(offset, Math.min(blob.size, offset + chunkSize));
    const data = await blobToBase64(slice);
    const options = { path, data, directory: 'DOCUMENTS' };
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

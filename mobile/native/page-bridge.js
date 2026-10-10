// Classic script, injected only into the Capacitor copy of index.html.
// The studio keeps limits and export state in top-level const/let bindings. An ES module
// cannot see those bindings, and it cannot call the page's function declarations by name.
// This object is the only seam. The website never loads this file.
globalThis.__caviotPage = {
  get device() { return typeof CaviotDevice === 'undefined' ? undefined : CaviotDevice; },
  get state() { return typeof AppState === 'undefined' ? undefined : AppState; },
  get templateBase() { return typeof templateBase === 'undefined' ? undefined : templateBase; },
  get previewRunning() { return typeof templatePreviewRunning !== 'undefined' && !!templatePreviewRunning; },
  get previewPending() { return typeof templatePending !== 'undefined' && !!templatePending; },
  get exportBusy() { return typeof exportBusy !== 'undefined' && !!exportBusy; },
  get download() { return typeof downloadBlob === 'function' ? downloadBlob : undefined; },
  set download(fn) { downloadBlob = fn; },
  get exportCurrent() { return typeof exportCurrent === 'function' ? exportCurrent : undefined; },
  set exportCurrent(fn) { exportCurrent = fn; },
  loadImage(file) { if (typeof loadImageFile === 'function') loadImageFile(file); },
  toast(message, kind) { if (typeof toast === 'function') toast(message, kind); },
  estimate() { return typeof exportEstimate === 'function' ? exportEstimate() : null; }
};

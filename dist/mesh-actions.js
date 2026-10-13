function scheduleRebuild(immediate) {
  if (!AppState.image) { if(templateActive() && typeof hasSleeveArtwork==='function' && hasSleeveArtwork()) requestTemplatePreview(); return; }
  clearTimeout(AppState.rebuildTimer);
  AppState.rebuildTimer = null;
  if (immediate) {
    document.body.classList.remove('is-rebuilding');
    regenerate();
    return;
  }
  document.body.classList.add('is-rebuilding');
  AppState.rebuildTimer = setTimeout(() => {
    AppState.rebuildTimer = null;
    try { regenerate(); }
    finally { document.body.classList.remove('is-rebuilding'); }
  }, 60);
}

function regenerate() {
  if (!AppState.image) return;
  if (AppState.rebuildTimer) {
    clearTimeout(AppState.rebuildTimer);
    AppState.rebuildTimer = null;
  }
  document.body.classList.remove('is-rebuilding');

  const exportRes = photoWorkingDetail(MC.getExportDetail(AppState.detail));
  const photoTone = AppState.photo && (AppState.photo.style === 'smooth' || AppState.photo.style === 'lithophane');
  const previewRes = templateActive() ? 768 : (photoTone ? exportRes : MC.getPreviewDetail(AppState.detail, AppState.fullPreview));
  const built = buildHeightmapAtDetail(previewRes);
  if (!built) return;

  AppState.heightmap = built.hm;
  AppState.hmRows = built.rows;
  AppState.hmCols = built.cols;
  AppState.alphaMap = built.alphaMap;
  AppState.mask = built.mask;
  AppState.isPreviewQuality = previewRes < exportRes;
  AppState.lastPreviewRes = previewRes;
  AppState.lastExportRes = exportRes;

  if (built.toastMsg) {
    const now = Date.now();
    if (now - AppState.lastSilhouetteToast > 4000) {
      AppState.lastSilhouetteToast = now;
      toast(built.toastMsg, 'error');
    }
  }

  drawHeightmapPreview();
  buildThreePreview();
  updateStats();
}

function buildExportMesh() {
  if (!AppState.image) return null;
  const detail = photoWorkingDetail(MC.getExportDetail(AppState.detail));
  const built = buildHeightmapAtDetail(detail);
  if (!built) return null;
  return MC.buildMesh(meshOptionsFromState(built.hm, built.rows, built.cols, built.mask));
}

function drawHeightmapPreview() {
  const canvas = els.heightmapCanvas;
  if (!canvas || !AppState.heightmap) {
    if (els.hmEmpty) els.hmEmpty.style.display = '';
    return;
  }
  if (els.hmEmpty) els.hmEmpty.style.display = 'none';
  const rows = AppState.hmRows, cols = AppState.hmCols;
  canvas.width = cols;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(cols, rows);
  const hm = AppState.heightmap;
  for (let i = 0; i < rows * cols; i++) {
    const v = Math.max(0, Math.min(255, Math.round(hm[i] * 255)));
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = AppState.alphaMap ? AppState.alphaMap[i] : 255;
  }
  ctx.putImageData(img, 0, 0);
  if (els.hmInfo) els.hmInfo.textContent = cols + '×' + rows;
}

function updateStats() {
  if (els.statSource) els.statSource.textContent = AppState.sourceLabel || '—';
  const sharpText = AppState.lastTextRelief && AppState.image && !templateActive();
  if (els.statGrid) {
    els.statGrid.textContent = sharpText
      ? 'outline · ' + (AppState.lastTextRelief.outlinePoints || 0).toLocaleString() + ' pts'
      : AppState.hmCols
      ? AppState.hmCols + '×' + AppState.hmRows
      : '—';
  }
  const v = AppState.lastValidation;
  if (els.statTris) els.statTris.textContent = v ? v.triCount.toLocaleString() : '—';
  if (els.statSize) {
    if (v) {
      const bytes = 84 + v.triCount * 50;
      els.statSize.textContent = bytes > 1e6 ? (bytes / 1e6).toFixed(2) + ' MB' : Math.round(bytes / 1024) + ' KB';
    } else els.statSize.textContent = '—';
  }
  if (els.statVol) {
    if (AppState.mode === 'flat' && sharpText && typeof previewMesh !== 'undefined' && previewMesh && previewMesh.positions) {
      // Flat text prints: the real footprint (a backing margin can make it wider than Width).
      const P = previewMesh.positions;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let i = 0; i < P.length; i += 3) {
        if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i];
        if (P[i + 2] < z0) z0 = P[i + 2]; if (P[i + 2] > z1) z1 = P[i + 2];
      }
      els.statVol.textContent = (x1 - x0).toFixed(1) + ' × ' + (z1 - z0).toFixed(1) + ' mm';
    } else if (AppState.mode === 'flat') {
      els.statVol.textContent = AppState.plateWidth + ' mm wide';
    } else {
      els.statVol.textContent =
        AppState.innerWidth + '×' + AppState.innerDepth + '×' + AppState.sleeveHeight;
    }
  }
  if (els.statQuality) {
    if (!v) els.statQuality.textContent = '—';
    else if (v.boundary === 0 && v.nonManifold === 0 && v.zeroArea === 0) {
      els.statQuality.textContent = '✓ closed edges';
      els.statQuality.style.color = 'var(--success)';
    } else {
      els.statQuality.textContent =
        '⚠ b' + v.boundary + ' n' + v.nonManifold + ' z' + v.zeroArea;
      els.statQuality.style.color = 'var(--warning)';
    }
  }
  if (els.statQualityMode) {
    if (!AppState.image) els.statQualityMode.textContent = '—';
    // Outline lettering does not depend on the grid detail: the preview is the export.
    else if (sharpText) els.statQualityMode.textContent = 'sharp lettering · same in export';
    else if (AppState.isPreviewQuality) {
      els.statQualityMode.textContent =
        'preview ' + AppState.lastPreviewRes + ' / export ' + AppState.lastExportRes;
    } else {
      els.statQualityMode.textContent = 'full ' + AppState.lastExportRes;
    }
  }
}

// ---------- Export ----------
// Saves a generated file. Desktop and Android use a Blob URL + <a download>. iOS (Safari and home-screen apps)
// gets a "file ready" sheet instead, because the export finishes long after the tap: iOS only allows the share
// sheet or a new tab from a fresh tap, and <a download> inside a home-screen app has no way back.
// The last line of defence for a download name. Callers already strip most
// punctuation; this also drops trailing dots and Windows device names (CON.stl
// is refused by the OS, so the save looks like it did nothing).
function safeDownloadName(filename) {
  const raw = String(filename || 'caviot-export');
  const dot = raw.lastIndexOf('.');
  const ext = dot > 0 ? raw.slice(dot).replace(/[^.a-z0-9]/gi, '').slice(0, 12) : '';
  // "name." has no real extension. Keeping the dot makes Windows hide the file.
  const keepExt = ext.length > 1;
  let stem = (keepExt ? raw.slice(0, dot) : raw)
    .replace(/[^\p{L}\p{N} _-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[. ]+$/g, '')
    .slice(0, 120)
    .trim();
  if (!stem) stem = 'caviot-export';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) stem += '-file';
  return stem + (keepExt ? ext : '');
}

function downloadBlob(blob, filename) {
  filename = safeDownloadName(filename);
  const stl = /\.stl$/i.test(filename);
  if (!blob || blob.size < (stl ? 84 : 1)) {
    toast('The export file was empty. Nothing was saved.', 'error');
    return false;
  }
  // iOS, and desktop Safari, ignore an <a download> click that happens after a
  // worker returns. A fresh tap on the file sheet is allowed to save.
  const ua = navigator.userAgent || '';
  const desktopSafari = /Safari\//.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Android/.test(ua);
  if (typeof showFileReady === 'function' && typeof CaviotDevice !== 'undefined' && (CaviotDevice.iOS || desktopSafari)) {
    showFileReady(blob, filename);
    return true;
  }
  saveBlobWithAnchor(blob, filename);
  return true;
}

function saveBlobWithAnchor(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Mobile browsers read the Blob URL asynchronously (and may show a prompt first); keep it alive for a minute.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

function exportFitRing() {
  const rows = 12, cols = 48;
  const hm = new Float32Array(rows * cols); // plain — zero relief
  const mesh = MC.buildMesh({
    mode: 'sleeve',
    heightmap: hm,
    rows,
    cols,
    mask: null,
    maxHeight: 0,
    negative: false,
    innerWidth: AppState.innerWidth,
    innerDepth: AppState.innerDepth,
    wall: AppState.wall,
    sleeveHeight: 5,
    tol: AppState.tol,
    wrapAngle: 360,
    capBottom: false,
    capThick: 1.5,
    capHole: 6,
  });
  const v = MC.validateMesh(mesh.positions, mesh.indices);
  if (v.boundary > 0 || v.nonManifold > 0) {
    if (!confirm('Fit ring mesh has issues. Export anyway?')) return;
  }
  const buf = MC.exportSTL(mesh.positions, mesh.indices);
  const lighter = (AppState.preset || 'custom').replace(/[^a-z0-9-]/gi, '');
  downloadBlob(new Blob([buf], { type: 'model/stl' }), 'fitring_' + lighter + '_5mm.stl');
  toast('Fit ring exported — print to confirm fit', 'success');
}

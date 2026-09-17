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

  const exportRes = MC.getExportDetail(AppState.detail);
  const previewRes = templateActive() ? 768 : MC.getPreviewDetail(AppState.detail, AppState.fullPreview);
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
  const detail = MC.getExportDetail(AppState.detail);
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
  if (els.statGrid) {
    els.statGrid.textContent = AppState.hmCols
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
    if (AppState.mode === 'flat') {
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
    else if (AppState.isPreviewQuality) {
      els.statQualityMode.textContent =
        'preview ' + AppState.lastPreviewRes + ' / export ' + AppState.lastExportRes;
    } else {
      els.statQualityMode.textContent = 'full ' + AppState.lastExportRes;
    }
  }
}

// ---------- Export ----------
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCurrentLegacy(format) {
  if (!AppState.image) {
    toast('Add a design first', 'error');
    return;
  }
  if (AppState.rebuildTimer) {
    clearTimeout(AppState.rebuildTimer);
    AppState.rebuildTimer = null;
    regenerate();
  }
  if (AppState.depthMm < 0.05) {
    if (!confirm('Depth is ~0 mm — the design will be almost flat. Export anyway?')) return;
  }
  toast('Building full-quality mesh…');
  let mesh;
  try {
    mesh = buildExportMesh();
  } catch (err) {
    console.error(err);
    toast('Export failed: ' + (err.message || err), 'error');
    return;
  }
  if (!mesh || !mesh.indices || mesh.indices.length === 0) {
    toast('Empty mesh — check silhouette / background', 'error');
    return;
  }
  const v = MC.validateMesh(mesh.positions, mesh.indices);
  AppState.lastValidation = v;
  updateStats();
  if (v.boundary > 0 || v.nonManifold > 0) {
    const ok = confirm(
      'Mesh quality warning:\n' +
      '  boundary edges: ' + v.boundary + '\n' +
      '  non-manifold: ' + v.nonManifold + '\n' +
      '  zero-area tris: ' + v.zeroArea + '\n\nExport anyway?'
    );
    if (!ok) return;
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const modeTag = AppState.mode;
  const reliefTag = AppState.relief;
  if (format === 'obj') {
    const text = MC.exportOBJ(mesh.positions, mesh.indices);
    downloadBlob(new Blob([text], { type: 'model/obj' }), 'icaviot_' + modeTag + '_' + reliefTag + '_' + stamp + '.obj');
    toast('OBJ exported', 'success');
  } else {
    const buf = MC.exportSTL(mesh.positions, mesh.indices);
    downloadBlob(new Blob([buf], { type: 'model/stl' }), 'icaviot_' + modeTag + '_' + reliefTag + '_' + stamp + '.stl');
    toast('STL exported — ready to slice', 'success');
  }
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

// ---------- Patterns ----------

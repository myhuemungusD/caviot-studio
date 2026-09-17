function bindUI() {
  // Mode
  const modeInputs = [
    [els.exportSleeve, 'sleeve'],
    [els.exportLogoOnly, 'logo-only'],
    [els.exportFlat, 'flat'],
  ];
  modeInputs.forEach(([el, mode]) => {
    if (!el) return;
    el.addEventListener('change', () => {
      if (el.checked) {
        AppState.mode = mode;
        projectStateToUI();
        scheduleRebuild();
        saveSettings();
      }
    });
  });

  // Relief
  if (els.modeRaised) els.modeRaised.addEventListener('change', () => {
    if (els.modeRaised.checked) {
      AppState.relief = 'raised';
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    }
  });
  if (els.modeCarved) els.modeCarved.addEventListener('change', () => {
    if (els.modeCarved.checked) {
      AppState.relief = 'carved';
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    }
  });

  // Depth magnitude
  if (els.depthIn) {
    els.depthIn.addEventListener('input', () => {
      AppState.depthMm = Math.max(0.1, Math.min(5, parseFloat(els.depthIn.value) || 1));
      projectStateToUI();
      scheduleRebuild();
    });
    els.depthIn.addEventListener('change', saveSettings);
  }

  if (els.imageScale) {
    els.imageScale.addEventListener('input', () => {
      AppState.logoSizePct = parseFloat(els.imageScale.value) || 100;
      projectStateToUI();
      scheduleRebuild();
    });
    els.imageScale.addEventListener('change', saveSettings);
  }

  // Processing toggles
  const bindCheck = (el, key, needsProject) => {
    if (!el) return;
    el.addEventListener('change', () => {
      AppState[key] = el.checked;
      if (needsProject || key === 'bgEnable' || key === 'curveEnable' || key === 'capBottom') {
        projectStateToUI();
      }
      scheduleRebuild();
      saveSettings();
    });
  };
  bindCheck(els.invert, 'invert');
  bindCheck(els.crisp, 'crisp');
  bindCheck(els.mirror, 'mirror');
  bindCheck(els.silhouette, 'silhouette');
  bindCheck(els.fullPreview, 'fullPreview');
  bindCheck(els.bgEnable, 'bgEnable', true);
  bindCheck(els.bgSoft, 'bgSoft');
  bindCheck(els.curveEnable, 'curveEnable', true);
  bindCheck(els.wrapCapBottom, 'capBottom', true);

  const bindRange = (el, key, parse, project) => {
    if (!el) return;
    el.addEventListener('input', () => {
      AppState[key] = parse(el.value);
      if (project) projectStateToUI();
      scheduleRebuild();
    });
    el.addEventListener('change', saveSettings);
  };
  bindRange(els.resIn, 'detail', (v) => parseInt(v, 10) || 200, true);
  bindRange(els.smoothIn, 'smoothPasses', (v) => parseInt(v, 10) || 0, true);
  bindRange(els.edgeSmoothIn, 'edgeSmooth', (v) => parseInt(v, 10) || 0, true);
  bindRange(els.bgTol, 'bgTol', (v) => parseInt(v, 10) || 0, true);
  bindRange(els.wrapWall, 'wall', (v) => parseFloat(v) || 2.4, true);
  bindRange(els.wrapHeight, 'sleeveHeight', (v) => parseFloat(v) || 72, true);
  bindRange(els.wrapTol, 'tol', (v) => parseFloat(v) || 0, true);
  bindRange(els.wrapCapThick, 'capThick', (v) => parseFloat(v) || 1.5, true);
  bindRange(els.wrapCapHole, 'capHole', (v) => parseFloat(v) || 6, true);
  bindRange(els.curveDiamIn, 'curveDiam', (v) => parseFloat(v) || 100, true);
  bindRange(els.curveAngleIn, 'curveAngle', (v) => parseFloat(v) || 30, true);
  bindRange(els.curveFalloffIn, 'curveFalloff', (v) => parseFloat(v) || 60, true);

  if (els.wrapInnerWidth) {
    els.wrapInnerWidth.addEventListener('change', () => {
      AppState.innerWidth = Math.max(3, Math.min(200, parseFloat(els.wrapInnerWidth.value) || 25.5));
      AppState.preset = 'custom';
      if (els.lighterChoice) els.lighterChoice.value = 'custom';
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    });
  }
  if (els.wrapInnerDepth) {
    els.wrapInnerDepth.addEventListener('change', () => {
      AppState.innerDepth = Math.max(3, Math.min(200, parseFloat(els.wrapInnerDepth.value) || 15.2));
      AppState.preset = 'custom';
      if (els.lighterChoice) els.lighterChoice.value = 'custom';
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    });
  }
  if (els.widthIn) {
    els.widthIn.addEventListener('change', () => {
      AppState.plateWidth = Math.max(10, Math.min(500, parseFloat(els.widthIn.value) || 100));
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    });
  }
  if (els.baseIn) {
    els.baseIn.addEventListener('change', () => {
      AppState.baseThickness = Math.max(0.4, Math.min(10, parseFloat(els.baseIn.value) || 1));
      projectStateToUI();
      scheduleRebuild();
      saveSettings();
    });
  }
  if (els.curveDirection) {
    els.curveDirection.addEventListener('change', () => {
      AppState.curveDirection = els.curveDirection.value;
      scheduleRebuild();
      saveSettings();
    });
  }

  if (els.lighterChoice) {
    els.lighterChoice.addEventListener('change', () => {
      const v = els.lighterChoice.value;
      if (v === 'custom') {
        AppState.preset = 'custom';
        updateDevicePresetTip('custom');
        saveSettings();
      } else applyPreset(v);
    });
  }
  if (els.orientFlat) {
    els.orientFlat.addEventListener('change', () => {
      if (els.orientFlat.checked) {
        AppState.wrapAngle = 180;
        scheduleRebuild();
        saveSettings();
      }
    });
  }
  if (els.orientWhole) {
    els.orientWhole.addEventListener('change', () => {
      if (els.orientWhole.checked) {
        AppState.wrapAngle = 360;
        scheduleRebuild();
        saveSettings();
      }
    });
  }

  // File / drop / paste
  if (els.fileInput) {
    els.fileInput.addEventListener('change', () => {
      if (els.fileInput.files && els.fileInput.files[0]) loadImageFile(els.fileInput.files[0]);
    });
  }
  if (els.uploadBtn) {
    els.uploadBtn.addEventListener('click', () => els.fileInput && els.fileInput.click());
    els.uploadBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        els.fileInput && els.fileInput.click();
      }
    });
  }
  // Drop on upload zone
  if (els.uploadBtn) {
    ['dragenter', 'dragover'].forEach((ev) => {
      els.uploadBtn.addEventListener(ev, (e) => {
        e.preventDefault();
        els.uploadBtn.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((ev) => {
      els.uploadBtn.addEventListener(ev, (e) => {
        e.preventDefault();
        els.uploadBtn.classList.remove('dragover');
      });
    });
    els.uploadBtn.addEventListener('drop', (e) => {
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadImageFile(f);
    });
  }
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f && /image\//.test(f.type)) loadImageFile(f);
  });
  window.addEventListener('paste', (e) => {
    const items = e.clipboardData && e.clipboardData.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const f = items[i].getAsFile();
        if (f) loadImageFile(f);
        break;
      }
    }
  });

  // Text
  let textTimer = null;
  if (els.textInput) {
    els.textInput.addEventListener('input', () => {
      AppState.text = els.textInput.value;
      if (els.textStretchField) {
        els.textStretchField.style.display = AppState.text.trim() ? 'block' : 'none';
      }
      clearTimeout(textTimer);
      textTimer = setTimeout(() => applyTextDesign(), 280);
    });
  }
  if (els.letterSpacingIn) {
    els.letterSpacingIn.addEventListener('input', () => {
      AppState.letterSpacing = parseInt(els.letterSpacingIn.value, 10) || 0;
      if (els.letterSpacingVal) els.letterSpacingVal.textContent = String(AppState.letterSpacing);
      clearTimeout(textTimer);
      textTimer = setTimeout(() => applyTextDesign(), 200);
    });
  }
  if (els.letterThicknessIn) {
    els.letterThicknessIn.addEventListener('input', () => {
      AppState.letterThickness = parseInt(els.letterThicknessIn.value, 10) || 0;
      if (els.letterThicknessVal) els.letterThicknessVal.textContent = String(AppState.letterThickness);
      clearTimeout(textTimer);
      textTimer = setTimeout(() => applyTextDesign(), 200);
    });
  }

  // Image tools
  if (els.rotCcw) els.rotCcw.addEventListener('click', () => rotateImage(-90));
  if (els.rotCw) els.rotCw.addEventListener('click', () => rotateImage(90));
  if (els.rot180) els.rot180.addEventListener('click', () => rotateImage(180));
  if (els.flipH) els.flipH.addEventListener('click', flipImageH);

  // Patterns / STL
  if (els.openPatterns) els.openPatterns.addEventListener('click', openPatternModal);
  if (els.patternModalClose) els.patternModalClose.addEventListener('click', closePatternModal);
  if (els.patternModal) els.patternModal.addEventListener('click', (e) => {
    if (e.target === els.patternModal) closePatternModal();
  });
  if (els.openSTL) els.openSTL.addEventListener('click', () => els.stlInput && els.stlInput.click());
  if (els.stlInput) els.stlInput.addEventListener('change', () => {
    if (els.stlInput.files && els.stlInput.files[0]) importSTLFile(els.stlInput.files[0]);
  });
  if (els.openFont) els.openFont.addEventListener('click', () => els.fontInput && els.fontInput.click());
  if (els.fontInput) els.fontInput.addEventListener('change', () => {
    if (els.fontInput.files && els.fontInput.files.length) loadCustomFontFiles(els.fontInput.files);
    els.fontInput.value = '';
  });
  if (els.openFontFolder) els.openFontFolder.addEventListener('click', () => els.fontFolderInput && els.fontFolderInput.click());
  if (els.fontFolderInput) els.fontFolderInput.addEventListener('change', () => {
    if (els.fontFolderInput.files && els.fontFolderInput.files.length) loadCustomFontFiles(els.fontFolderInput.files);
    els.fontFolderInput.value = '';
  });
  if (els.fontChoice) els.fontChoice.addEventListener('change', async () => {
    const index = parseInt(els.fontChoice.value, 10);
    const record = customFontRecords[index];
    if (!record) return;
    AppState.customFontFamily = JSON.stringify(fontFamilyForIndex(index));
    updateCustomFontUi(record.name);
    try { await saveCustomFontRecord({ fonts: customFontRecords, activeName: record.name }); } catch (_) { /* ignore */ }
    if ((AppState.text || '').trim()) applyTextDesign();
  });
  if (els.clearFont) els.clearFont.addEventListener('click', clearCustomFont);

  // BG
  if (els.bgAuto) els.bgAuto.addEventListener('click', () => {
    if (AppState.image) {
      autoDetectBgColor(AppState.image);
      scheduleRebuild();
      saveSettings();
    }
  });
  if (els.bgPick) els.bgPick.addEventListener('click', () => {
    AppState.pickingBg = true;
    toast('Click the heightmap mini preview to sample a color');
  });
  if (els.heightmapCanvas) {
    els.heightmapCanvas.addEventListener('click', (e) => {
      if (!AppState.pickingBg || !AppState.image) return;
      const rect = els.heightmapCanvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) / rect.width * els.heightmapCanvas.width);
      const y = Math.floor((e.clientY - rect.top) / rect.height * els.heightmapCanvas.height);
      const ctx = els.heightmapCanvas.getContext('2d');
      const px = ctx.getImageData(x, y, 1, 1).data;
      // sample from source image instead for real color
      const sc = document.createElement('canvas');
      sc.width = AppState.image.width;
      sc.height = AppState.image.height;
      const sctx = sc.getContext('2d');
      sctx.drawImage(AppState.image, 0, 0);
      const sx = Math.floor(x / els.heightmapCanvas.width * sc.width);
      const sy = Math.floor(y / els.heightmapCanvas.height * sc.height);
      const sp = sctx.getImageData(sx, sy, 1, 1).data;
      AppState.bgR = sp[0]; AppState.bgG = sp[1]; AppState.bgB = sp[2];
      AppState.pickingBg = false;
      updateBgSwatch();
      scheduleRebuild();
      saveSettings();
      toast('Background color set', 'success');
    });
  }

  // Export
  if (els.generateBtn) els.generateBtn.addEventListener('click', () => exportCurrent('stl'));
  if (els.downloadObjBtn) els.downloadObjBtn.addEventListener('click', () => exportCurrent('obj'));
  if (els.fitRingBtn) els.fitRingBtn.addEventListener('click', exportFitRing);
  if (els.resetViewBtn) els.resetViewBtn.addEventListener('click', resetView);
  if (els.runMeshTests) els.runMeshTests.addEventListener('click', runBrowserMeshTests);

  setSettingsOpen(window.innerWidth > 900);
  if (els.mobileSettingsBtn) {
    els.mobileSettingsBtn.addEventListener('click', () => {
      setSettingsOpen(!settingsAreOpen());
    });
  }

  if (els.tipsToggle && els.tipsContent) {
    els.tipsToggle.addEventListener('click', () => {
      const willShow = els.tipsContent.classList.contains('hidden');
      els.tipsContent.classList.toggle('hidden', !willShow);
      els.tipsToggle.textContent = willShow ? '▾ Print tips' : '▸ Print tips';
    });
  }

  // Keyboard
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    const isFormField = !!(e.target && /input|textarea|select/i.test(e.target.tagName));
    if (!isFormField && e.code === 'Numpad1') { e.preventDefault(); setBlenderView('front'); return; }
    if (!isFormField && e.code === 'Numpad3') { e.preventDefault(); setBlenderView('right'); return; }
    if (!isFormField && e.code === 'Numpad7') { e.preventDefault(); setBlenderView('top'); return; }
    if (!isFormField && e.code === 'Home') { e.preventDefault(); resetView(); return; }
    if (e.key === 'Escape') {
      if (els.patternModal && !els.patternModal.classList.contains('hidden')) {
        closePatternModal();
        return;
      }
      if (document.body.classList.contains('mobile-settings-open')) {
        setSettingsOpen(false);
        if (els.mobileSettingsBtn) {
          els.mobileSettingsBtn.setAttribute('aria-expanded', 'false');
          els.mobileSettingsBtn.textContent = 'Settings';
          els.mobileSettingsBtn.focus();
        }
      }
    }
    if (mod && (e.key === 'e' || e.key === 'E')) {
      e.preventDefault();
      exportCurrent('stl');
    }
    if (e.key === 'r' || e.key === 'R') {
      if (isFormField) return;
      resetView();
    }
    if (!isFormField && e.key === '1') { AppState.mode = 'sleeve'; projectStateToUI(); scheduleRebuild(); saveSettings(); }
    if (!isFormField && e.key === '2') { AppState.mode = 'logo-only'; projectStateToUI(); scheduleRebuild(); saveSettings(); }
    if (!isFormField && e.key === '3') { AppState.mode = 'flat'; projectStateToUI(); scheduleRebuild(); saveSettings(); }
    if (e.key === 'c' || e.key === 'C') {
      if (isFormField) return;
      AppState.relief = 'carved'; projectStateToUI(); scheduleRebuild(); saveSettings();
    }
    if (e.key === 'v' || e.key === 'V') {
      if (isFormField) return;
      AppState.relief = 'raised'; projectStateToUI(); scheduleRebuild(); saveSettings();
    }
  });
}

// ---------- Boot ----------
function boot() {
  loadSettings();
  // Ensure depth magnitude is positive
  AppState.depthMm = Math.max(0.1, Math.abs(AppState.depthMm) || 1);
  projectStateToUI();
  try { initThree(); } catch (error) {
    console.error(error);
    const notice = document.createElement('div'); notice.className='preview-unavailable'; notice.textContent='3D preview is unavailable. Enable WebGL or try another browser. You can still design and export.'; els.threeContainer.appendChild(notice);
  }
  bindUI();
  restoreCustomFont();
  setEmptyState(true);
  updateStats();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}


function settingsAreOpen(){return document.body.classList.contains('mobile-settings-open')}
function setSettingsOpen(open){document.body.classList.toggle('mobile-settings-open',open);document.body.classList.toggle('settings-closed',!open);const b=document.getElementById('mobileSettingsBtn');if(b){b.setAttribute('aria-expanded',String(open));b.textContent=open?'Hide settings':'Settings'}window.dispatchEvent(new Event('resize'));}

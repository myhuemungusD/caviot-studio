
/* ========== iCaviot v2 application (DOM + THREE; mesh via MeshCore) ========== */
'use strict';

const MC = window.MeshCore;
const APP_BUILD = '2026.09.19';
const SETTINGS_KEY = 'icaviot.settings.v1';
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 24 * 1024 * 1024;
const MAX_STL_BYTES = 100 * 1024 * 1024;
const MAX_STL_TRIANGLES = 1000000;
const MAX_FONT_BYTES = 10 * 1024 * 1024;
const MAX_FONT_TOTAL_BYTES = 50 * 1024 * 1024;
const MAX_FONT_COUNT = 100;
const CUSTOM_FONT_FAMILY = 'iCaviot Custom Font';
const FONT_DB_NAME = 'icaviot.assets.v1';
const FONT_STORE_NAME = 'fonts';

// ---------- Single AppState (source of truth) ----------
const AppState = {
  templateId: 'etsyfolger-v1',
  designAngle: 0, designY: 44.5, designWidth: 30, designHeight: 30, designRotation: 0, uniformDepth: true,
  mode: 'sleeve',          // 'sleeve' | 'logo-only' | 'flat'
  relief: 'raised',        // 'raised' | 'carved'
  depthMm: 1.0,            // magnitude 0.1–5
  detail: 400,             // export long-side
  fullPreview: false,

  // Sleeve dims (Bic Maxi measured default)
  preset: 'bic-template',
  innerWidth: 25.5,
  innerDepth: 15.2,
  wall: 2.4,
  sleeveHeight: 72,
  tol: 0,
  wrapAngle: 180,          // print orient: flat halves default
  capBottom: false,
  capThick: 1.5,
  capHole: 6,

  // Flat plate
  plateWidth: 100,
  baseThickness: 1.0,
  curveEnable: false,
  curveDirection: 'horizontal',
  curveDiam: 100,
  curveAngle: 30,
  curveFalloff: 60,

  // Design
  logoSizePct: 100,
  invert: true,            // light sticks out
  crisp: true,
  mirror: false,
  silhouette: true,
  smoothPasses: 0,
  edgeSmooth: 4,

  // Background removal
  bgEnable: true,
  bgR: 255, bgG: 255, bgB: 255,
  bgTol: 40,
  bgSoft: false,

  // Text
  text: '',
  letterSpacing: 0,
  letterThickness: 0,
  customFontFamily: null,

  // Runtime (not persisted)
  image: null,
  imageName: '',
  heightmap: null,
  hmRows: 0,
  hmCols: 0,
  mask: null,
  alphaMap: null,
  sourceLabel: '—',
  isPreviewQuality: false,
  lastPreviewRes: 0,
  lastExportRes: 0,
  lastValidation: null,
  rebuildTimer: null,
  lastSilhouetteToast: 0,
  pickingBg: false,
  textRenderId: 0,
};

// ---------- DOM helpers ----------
const $ = (id) => document.getElementById(id);
const els = {
  // mode
  exportSleeve: $('exportSleeve'),
  exportLogoOnly: $('exportLogoOnly'),
  exportFlat: $('exportFlat'),
  modeRaised: $('modeRaised'),
  modeCarved: $('modeCarved'),
  // primary
  depthIn: $('depthIn'),
  depthVal: $('depthVal'),
  imageScale: $('imageScale'),
  imageScaleVal: $('imageScaleVal'),
  imageScaleMm: $('imageScaleMm'),
  // source
  fileInput: $('fileInput'),
  stlInput: $('stlInput'),
  fontInput: $('fontInput'),
  fontFolderInput: $('fontFolderInput'),
  uploadBtn: $('uploadBtn'),
  fileName: $('fileName'),
  textInput: $('textInput'),
  letterSpacingIn: $('letterSpacingIn'),
  letterSpacingVal: $('letterSpacingVal'),
  letterThicknessIn: $('letterThicknessIn'),
  letterThicknessVal: $('letterThicknessVal'),
  textStretchField: $('textStretchField'),
  openPatterns: $('openPatterns'),
  openSTL: $('openSTL'),
  openFont: $('openFont'),
  openFontFolder: $('openFontFolder'),
  clearFont: $('clearFont'),
  fontChoice: $('fontChoice'),
  fontName: $('fontName'),
  rotCcw: $('rotCcw'),
  rot180: $('rot180'),
  rotCw: $('rotCw'),
  flipH: $('flipH'),
  // image processing
  bgEnable: $('bgEnable'),
  bgControls: $('bgControls'),
  bgSwatch: $('bgSwatch'),
  bgColorLabel: $('bgColorLabel'),
  bgAuto: $('bgAuto'),
  bgPick: $('bgPick'),
  bgTol: $('bgTol'),
  bgTolVal: $('bgTolVal'),
  bgSoft: $('bgSoft'),
  crisp: $('crisp'),
  invert: $('invert'),
  mirror: $('mirror'),
  silhouette: $('silhouette'),
  resIn: $('resIn'),
  resVal: $('resVal'),
  fullPreview: $('fullPreview'),
  smoothIn: $('smoothIn'),
  smoothVal: $('smoothVal'),
  edgeSmoothIn: $('edgeSmoothIn'),
  edgeSmoothVal: $('edgeSmoothVal'),
  // lighter / sleeve
  lighterChoice: $('lighterChoice'),
  orientFlat: $('orientFlat'),
  orientWhole: $('orientWhole'),
  wrapInnerWidth: $('wrapInnerWidth'),
  wrapInnerDepth: $('wrapInnerDepth'),
  wrapWall: $('wrapWall'),
  wrapWallVal: $('wrapWallVal'),
  wrapHeight: $('wrapHeight'),
  wrapHeightVal: $('wrapHeightVal'),
  wrapTol: $('wrapTol'),
  wrapTolVal: $('wrapTolVal'),
  wrapCapBottom: $('wrapCapBottom'),
  wrapCapThick: $('wrapCapThick'),
  wrapCapThickVal: $('wrapCapThickVal'),
  wrapCapHole: $('wrapCapHole'),
  wrapCapHoleVal: $('wrapCapHoleVal'),
  capBottomControls: $('capBottomControls'),
  sleevePanel: $('sleevePanel'),
  // flat
  bendSection: $('bendSection'),
  flatPanel: $('flatPanel'),
  widthIn: $('widthIn'),
  widthVal: $('widthVal'),
  baseIn: $('baseIn'),
  baseVal: $('baseVal'),
  curveEnable: $('curveEnable'),
  curveControls: $('curveControls'),
  curveDirection: $('curveDirection'),
  curveDiamIn: $('curveDiamIn'),
  curveDiamVal: $('curveDiamVal'),
  curveAngleIn: $('curveAngleIn'),
  curveAngleVal: $('curveAngleVal'),
  curveFalloffIn: $('curveFalloffIn'),
  curveFalloffVal: $('curveFalloffVal'),
  // actions
  generateBtn: $('generateBtn'),
  downloadObjBtn: $('downloadObjBtn'),
  fitRingBtn: $('fitRingBtn'),
  resetViewBtn: $('resetViewBtn'),
  mobileSettingsBtn: $('mobileSettingsBtn'),
  runMeshTests: $('runMeshTests'),
  tipsToggle: $('tipsToggle'),
  tipsContent: $('tipsContent'),
  // canvas
  threeContainer: $('threeContainer'),
  threeEmpty: $('threeEmpty'),
  heightmapCanvas: $('heightmapCanvas'),
  hmEmpty: $('hmEmpty'),
  hmInfo: $('hmInfo'),
  // status
  statSource: $('statSource'),
  statGrid: $('statGrid'),
  statTris: $('statTris'),
  statSize: $('statSize'),
  statVol: $('statVol'),
  statQuality: $('statQuality'),
  statQualityMode: $('statQualityMode'),
  toast: $('toast'),
  patternModal: $('patternModal'),
  patternModalClose: $('patternModalClose'),
  patternGrid: $('patternGrid'),
};

// ---------- Toast ----------
let toastTimer = null;
function toast(msg, type) {
  if (!els.toast) return;
  els.toast.textContent = msg;
  els.toast.className = 'toast show ' + (type || '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2600);
}

// ---------- Settings persistence ----------
function collectSettings() {
  return {
    templateId: AppState.templateId,
    designAngle: AppState.designAngle, designY: AppState.designY, designWidth: AppState.designWidth, designHeight: AppState.designHeight, designRotation: AppState.designRotation, uniformDepth: AppState.uniformDepth,
    mode: AppState.mode,
    relief: AppState.relief,
    depthMm: AppState.depthMm,
    detail: AppState.detail,
    fullPreview: AppState.fullPreview,
    preset: AppState.preset,
    innerWidth: AppState.innerWidth,
    innerDepth: AppState.innerDepth,
    wall: AppState.wall,
    sleeveHeight: AppState.sleeveHeight,
    tol: AppState.tol,
    wrapAngle: AppState.wrapAngle,
    capBottom: AppState.capBottom,
    capThick: AppState.capThick,
    capHole: AppState.capHole,
    plateWidth: AppState.plateWidth,
    baseThickness: AppState.baseThickness,
    curveEnable: AppState.curveEnable,
    curveDirection: AppState.curveDirection,
    curveDiam: AppState.curveDiam,
    curveAngle: AppState.curveAngle,
    curveFalloff: AppState.curveFalloff,
    logoSizePct: AppState.logoSizePct,
    invert: AppState.invert,
    crisp: AppState.crisp,
    mirror: AppState.mirror,
    silhouette: AppState.silhouette,
    smoothPasses: AppState.smoothPasses,
    edgeSmooth: AppState.edgeSmooth,
    bgEnable: AppState.bgEnable,
    bgR: AppState.bgR, bgG: AppState.bgG, bgB: AppState.bgB,
    bgTol: AppState.bgTol,
    bgSoft: AppState.bgSoft,
  };
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(collectSettings()));
  } catch (_) { /* quota / private mode */ }
}

function loadSettings(settingsOverride) {
  try {
    const raw = settingsOverride ? JSON.stringify(settingsOverride) : localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    const numberRules = {
      designAngle: [-180,180], designY: [0,89], designWidth: [2,160], designHeight: [2,89], designRotation: [-180,180],
      depthMm: [0.1, 5], detail: [50, 400], innerWidth: [3, 200], innerDepth: [3, 200],
      wall: [0.6, 5], sleeveHeight: [10, 200], tol: [0, 2], capThick: [0.6, 5],
      capHole: [0, 15], plateWidth: [10, 500], baseThickness: [0.4, 10],
      curveDiam: [20, 500], curveAngle: [-180, 180], curveFalloff: [0, 90],
      logoSizePct: [10, 100], smoothPasses: [0, 3], edgeSmooth: [0, 10], bgTol: [0, 180],
      bgR: [0, 255], bgG: [0, 255], bgB: [0, 255],
    };
    Object.keys(s).forEach((k) => {
      if (!Object.hasOwn(collectSettings(), k)) return;
      if (numberRules[k]) {
        const n = Number(s[k]);
        if (Number.isFinite(n)) AppState[k] = Math.max(numberRules[k][0], Math.min(numberRules[k][1], n));
      } else if (typeof AppState[k] === typeof s[k]) {
        AppState[k] = s[k];
      }
    });
    if (!['etsyfolger-v1','parametric'].includes(AppState.templateId)) AppState.templateId='etsyfolger-v1';
    if (!['sleeve', 'logo-only', 'flat'].includes(AppState.mode)) AppState.mode = 'sleeve';
    if (!['raised', 'carved'].includes(AppState.relief)) AppState.relief = 'raised';
    if (![180, 360].includes(Number(AppState.wrapAngle))) AppState.wrapAngle = 180;
    if (!['horizontal', 'vertical', 'all'].includes(AppState.curveDirection)) AppState.curveDirection = 'horizontal';
  } catch (_) { /* ignore */ }
}

// ---------- Device presets ----------
// innerWidth × innerDepth = sleeve cavity (device outer size).
// sleeveHeight = wrap height along the device (mouthpiece often left free — shorten if needed).
// tol = default looseness when selecting the preset (user can still tweak).
const PRESETS = {
  // Lighters
  'bic-template': {
    innerWidth: 25.5, innerDepth: 15.2, wall: 2.4, sleeveHeight: 72, tol: 0,
    tip: 'Bic Maxi measured cavity. Fit ring recommended for first print.',
  },
  'bic-maxi': {
    innerWidth: 24.0, innerDepth: 15.0, wall: 2.0, sleeveHeight: 72, tol: 0.2,
    tip: 'Bic Maxi factory-style dims with a little looseness.',
  },
  'bic-mini': {
    innerWidth: 20.5, innerDepth: 11.5, wall: 1.8, sleeveHeight: 58, tol: 0.2,
    tip: 'Bic Mini lighter sleeve.',
  },
  // Geek Bar — published Pulse body 52.6 × 27.7 × 82.6 mm
  'geek-bar-pulse': {
    innerWidth: 52.6, innerDepth: 27.7, wall: 2.0, sleeveHeight: 78, tol: 0.3,
    tip: 'Geek Bar Pulse body. Height leaves mouthpiece free (~78 mm). Fit-ring before full sleeve.',
  },
  // Pulse X is bulkier; dims are approximate — always fit-ring calibrate
  'geek-bar-pulse-x': {
    innerWidth: 54.0, innerDepth: 28.0, wall: 2.0, sleeveHeight: 88, tol: 0.35,
    tip: 'Geek Bar Pulse X approximate body. Calibrate with a fit ring — batches vary.',
  },
  // Foger (often sold as Fogger) Switch Pro — pod cartridge / full kit
  'foger-switch-pro': {
    innerWidth: 51.4, innerDepth: 27.7, wall: 2.0, sleeveHeight: 90, tol: 0.3,
    tip: 'Foger/Fogger Switch Pro disposable pod body (~51.4×27.7×96). Sleeve ~90 mm tall.',
  },
  'foger-switch-pro-full': {
    innerWidth: 54.6, innerDepth: 27.7, wall: 2.0, sleeveHeight: 92, tol: 0.35,
    tip: 'Foger/Fogger Switch Pro full kit envelope (~54.6×27.7×96). Wider for dock+pod stack.',
  },
  // Round
  'cylinder-25': {
    innerWidth: 25, innerDepth: 25, wall: 2.0, sleeveHeight: 80, tol: 0.3,
    tip: 'Round 25 mm tube (pens, slim disposables).',
  },
  'cylinder-32': {
    innerWidth: 32, innerDepth: 32, wall: 2.0, sleeveHeight: 100, tol: 0.3,
    tip: 'Round 32 mm tube.',
  },
};

function updateDevicePresetTip(id) {
  const el = document.getElementById('devicePresetTip');
  if (!el) return;
  const p = PRESETS[id];
  if (p && p.tip) {
    el.textContent = 'Starting dimensions only. Cavity is elliptical, not an exact device outline. Measure your device and print a fit ring before a full sleeve.';
  } else if (id === 'custom') {
    el.innerHTML = 'Custom cavity — measure your device with calipers (W × D × height), then fit-ring test.';
  } else {
    el.innerHTML = 'Starting dimensions from the original tool; verify with calipers. Print a <strong>fit ring</strong> first — units vary by batch.';
  }
}

function applyPreset(id) {
  const p = PRESETS[id];
  if (!p) return;
  AppState.preset = id;
  AppState.innerWidth = p.innerWidth;
  AppState.innerDepth = p.innerDepth;
  AppState.wall = p.wall;
  AppState.sleeveHeight = p.sleeveHeight;
  if (typeof p.tol === 'number') AppState.tol = p.tol;
  updateDevicePresetTip(id);
  projectStateToUI();
  scheduleRebuild();
  saveSettings();
}

// ---------- Project AppState → UI ----------
function projectStateToUI() {
  // Mode pills
  if (els.exportSleeve) els.exportSleeve.checked = AppState.mode === 'sleeve';
  if (els.exportLogoOnly) els.exportLogoOnly.checked = AppState.mode === 'logo-only';
  if (els.exportFlat) els.exportFlat.checked = AppState.mode === 'flat';
  // Relief
  if (els.modeRaised) els.modeRaised.checked = AppState.relief === 'raised';
  if (els.modeCarved) els.modeCarved.checked = AppState.relief === 'carved';
  // Depth magnitude
  if (els.depthIn) els.depthIn.value = String(AppState.depthMm);
  if (els.depthVal) {
    const arrow = AppState.relief === 'carved' ? '⬇' : '⬆';
    els.depthVal.textContent = arrow + ' ' + AppState.depthMm.toFixed(1);
  }
  // Logo size
  if (els.imageScale) els.imageScale.value = String(AppState.logoSizePct);
  if (els.imageScaleVal) els.imageScaleVal.textContent = String(Math.round(AppState.logoSizePct));
  // Processing
  if (els.invert) els.invert.checked = AppState.invert;
  if (els.crisp) els.crisp.checked = AppState.crisp;
  if (els.mirror) els.mirror.checked = AppState.mirror;
  if (els.silhouette) els.silhouette.checked = AppState.silhouette;
  if (els.resIn) els.resIn.value = String(AppState.detail);
  if (els.resVal) els.resVal.textContent = String(AppState.detail);
  if (els.fullPreview) els.fullPreview.checked = AppState.fullPreview;
  if (els.smoothIn) els.smoothIn.value = String(AppState.smoothPasses);
  if (els.smoothVal) els.smoothVal.textContent = String(AppState.smoothPasses);
  if (els.edgeSmoothIn) els.edgeSmoothIn.value = String(AppState.edgeSmooth);
  if (els.edgeSmoothVal) els.edgeSmoothVal.textContent = String(AppState.edgeSmooth);
  // BG
  if (els.bgEnable) els.bgEnable.checked = AppState.bgEnable;
  if (els.bgControls) els.bgControls.style.display = AppState.bgEnable ? 'block' : 'none';
  if (els.bgTol) els.bgTol.value = String(AppState.bgTol);
  if (els.bgTolVal) els.bgTolVal.textContent = String(AppState.bgTol);
  if (els.bgSoft) els.bgSoft.checked = AppState.bgSoft;
  updateBgSwatch();
  // Sleeve dims
  if (els.lighterChoice) {
    els.lighterChoice.value = AppState.preset;
    // custom may not be in PRESETS — keep select valid
    if (els.lighterChoice.value !== AppState.preset) els.lighterChoice.value = 'custom';
  }
  updateDevicePresetTip(AppState.preset);
  if (els.wrapInnerWidth) els.wrapInnerWidth.value = String(AppState.innerWidth);
  if (els.wrapInnerDepth) els.wrapInnerDepth.value = String(AppState.innerDepth);
  if (els.wrapWall) els.wrapWall.value = String(AppState.wall);
  if (els.wrapWallVal) els.wrapWallVal.textContent = AppState.wall.toFixed(1);
  if (els.wrapHeight) els.wrapHeight.value = String(AppState.sleeveHeight);
  if (els.wrapHeightVal) els.wrapHeightVal.textContent = String(Math.round(AppState.sleeveHeight));
  if (els.wrapTol) els.wrapTol.value = String(AppState.tol);
  if (els.wrapTolVal) els.wrapTolVal.textContent = AppState.tol.toFixed(2);
  if (els.orientFlat) els.orientFlat.checked = Math.abs(AppState.wrapAngle - 180) < 1 || AppState.wrapAngle < 270;
  if (els.orientWhole) els.orientWhole.checked = Math.abs(AppState.wrapAngle - 360) < 1;
  // If custom angle stored, keep closest
  if (Math.abs(AppState.wrapAngle - 360) < 1) {
    if (els.orientWhole) els.orientWhole.checked = true;
  } else {
    if (els.orientFlat) els.orientFlat.checked = true;
  }
  if (els.wrapCapBottom) els.wrapCapBottom.checked = AppState.capBottom;
  if (els.capBottomControls) els.capBottomControls.style.display = AppState.capBottom ? 'block' : 'none';
  if (els.wrapCapThick) els.wrapCapThick.value = String(AppState.capThick);
  if (els.wrapCapThickVal) els.wrapCapThickVal.textContent = AppState.capThick.toFixed(1);
  if (els.wrapCapHole) els.wrapCapHole.value = String(AppState.capHole);
  if (els.wrapCapHoleVal) els.wrapCapHoleVal.textContent = AppState.capHole.toFixed(1);
  // Flat
  if (els.widthIn) els.widthIn.value = String(AppState.plateWidth);
  if (els.widthVal) els.widthVal.textContent = String(AppState.plateWidth);
  if (els.baseIn) els.baseIn.value = String(AppState.baseThickness);
  if (els.baseVal) els.baseVal.textContent = AppState.baseThickness.toFixed(1);
  if (els.curveEnable) els.curveEnable.checked = AppState.curveEnable;
  if (els.curveControls) els.curveControls.style.display = AppState.curveEnable ? 'block' : 'none';
  if (els.curveDirection) els.curveDirection.value = AppState.curveDirection;
  if (els.curveDiamIn) els.curveDiamIn.value = String(AppState.curveDiam);
  if (els.curveDiamVal) els.curveDiamVal.textContent = Number(AppState.curveDiam).toFixed(1);
  if (els.curveAngleIn) els.curveAngleIn.value = String(AppState.curveAngle);
  if (els.curveAngleVal) els.curveAngleVal.textContent = String(AppState.curveAngle);
  if (els.curveFalloffIn) els.curveFalloffIn.value = String(AppState.curveFalloff);
  if (els.curveFalloffVal) els.curveFalloffVal.textContent = String(AppState.curveFalloff);

  // Mode-aware panels
  const isFlat = AppState.mode === 'flat';
  if (els.sleevePanel) els.sleevePanel.style.display = isFlat ? 'none' : '';
  if (els.flatPanel) els.flatPanel.style.display = isFlat ? '' : 'none';
  if (els.bendSection) els.bendSection.style.display = isFlat ? '' : 'none';
  if (els.silhouette) els.silhouette.closest('label').style.opacity = isFlat ? '1' : '0.45';

  updateLogoScaleMm();
}

function updateBgSwatch() {
  const hex = '#' + [AppState.bgR, AppState.bgG, AppState.bgB].map((c) => {
    const h = Math.max(0, Math.min(255, c | 0)).toString(16);
    return h.length === 1 ? '0' + h : h;
  }).join('');
  if (els.bgSwatch) els.bgSwatch.style.background = hex;
  if (els.bgColorLabel) els.bgColorLabel.textContent = hex.toUpperCase();
}

function updateLogoScaleMm() {
  if (!els.imageScaleMm) return;
  if (AppState.mode === 'flat') {
    const w = AppState.plateWidth * (AppState.logoSizePct / 100);
    els.imageScaleMm.textContent = w.toFixed(1) + ' mm wide';
  } else {
    // approximate wrap arc length for ellipse perimeter fraction
    const a = AppState.innerWidth / 2 + AppState.wall;
    const b = AppState.innerDepth / 2 + AppState.wall;
    const peri = Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
    const arc = peri * (AppState.wrapAngle / 360) * (AppState.logoSizePct / 100);
    els.imageScaleMm.textContent = '≈' + arc.toFixed(1) + ' mm wrap';
  }
}

// ---------- Custom fonts ----------
let activeCustomFontFaces = [];
let customFontRecords = [];

function openFontDb() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('Font storage is not supported in this browser'));
      return;
    }
    const request = indexedDB.open(FONT_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(FONT_STORE_NAME)) db.createObjectStore(FONT_STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open font storage'));
  });
}

async function saveCustomFontRecord(record) {
  const db = await openFontDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FONT_STORE_NAME, 'readwrite');
    tx.objectStore(FONT_STORE_NAME).put(record, 'active');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function readCustomFontRecord() {
  const db = await openFontDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FONT_STORE_NAME, 'readonly');
    const request = tx.objectStore(FONT_STORE_NAME).get('active');
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
  });
}

async function deleteCustomFontRecord() {
  const db = await openFontDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(FONT_STORE_NAME, 'readwrite');
    tx.objectStore(FONT_STORE_NAME).delete('active');
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

function fontFamilyForIndex(index) {
  return CUSTOM_FONT_FAMILY + ' ' + (index + 1);
}

function updateCustomFontUi(activeName) {
  const count = customFontRecords.length;
  if (els.fontName) {
    els.fontName.style.display = count ? '' : 'none';
    els.fontName.textContent = count ? count + (count === 1 ? ' font loaded' : ' fonts loaded') : '';
  }
  if (els.clearFont) els.clearFont.style.display = count ? '' : 'none';
  if (els.fontChoice) {
    els.fontChoice.replaceChildren();
    customFontRecords.forEach((record, index) => {
      const option = document.createElement('option');
      option.value = String(index);
      option.textContent = record.name;
      if (record.name === activeName) option.selected = true;
      els.fontChoice.appendChild(option);
    });
    els.fontChoice.style.display = count ? '' : 'none';
  }
}

async function activateCustomFonts(records, activeName) {
  if (!('FontFace' in window)) throw new Error('Custom fonts are not supported in this browser');
  activeCustomFontFaces.forEach((face) => document.fonts.delete(face));
  activeCustomFontFaces = [];
  customFontRecords = records.slice();
  for (let i = 0; i < customFontRecords.length; i++) {
    const face = new FontFace(fontFamilyForIndex(i), customFontRecords[i].buffer);
    await face.load();
    document.fonts.add(face);
    activeCustomFontFaces.push(face);
  }
  let activeIndex = customFontRecords.findIndex((record) => record.name === activeName);
  if (activeIndex < 0) activeIndex = Math.max(0, customFontRecords.length - 1);
  AppState.customFontFamily = customFontRecords.length ? JSON.stringify(fontFamilyForIndex(activeIndex)) : null;
  updateCustomFontUi(customFontRecords[activeIndex] && customFontRecords[activeIndex].name);
  if ((AppState.text || '').trim()) applyTextDesign();
}

async function loadCustomFontFiles(files) {
  const accepted = Array.from(files || []).filter((file) => /\.(ttf|otf|woff2?)$/i.test(file.name || ''));
  if (!accepted.length) {
    toast('Use TTF, OTF, WOFF, or WOFF2 fonts', 'error');
    return;
  }
  if (accepted.some((file) => file.size > MAX_FONT_BYTES)) {
    toast('Each font must be 10 MB or less', 'error');
    return;
  }
  if (accepted.length > MAX_FONT_COUNT || accepted.reduce((sum, file) => sum + file.size, 0) > MAX_FONT_TOTAL_BYTES) {
    toast('Choose up to 100 fonts totaling 50 MB or less', 'error');
    return;
  }
  try {
    const incoming = await Promise.all(accepted.map(async (file) => ({
      name: file.webkitRelativePath || file.name,
      type: file.type || '',
      buffer: await file.arrayBuffer(),
    })));
    const merged = customFontRecords.filter((old) => !incoming.some((next) => next.name === old.name)).concat(incoming);
    const activeName = incoming[incoming.length - 1].name;
    await activateCustomFonts(merged, activeName);
    await saveCustomFontRecord({ fonts: merged, activeName });
    toast(incoming.length + (incoming.length === 1 ? ' font loaded' : ' fonts loaded'), 'success');
  } catch (e) {
    console.error(e);
    toast('Could not load one or more fonts', 'error');
  }
}

async function restoreCustomFont() {
  try {
    const record = await readCustomFontRecord();
    if (!record) return;
    // Migrate the original one-font record shape automatically.
    const fonts = Array.isArray(record.fonts) ? record.fonts : (record.buffer ? [record] : []);
    if (fonts.length) await activateCustomFonts(fonts, record.activeName || fonts[0].name);
  } catch (_) { /* font storage may be unavailable in private mode */ }
}

async function clearCustomFont() {
  activeCustomFontFaces.forEach((face) => document.fonts.delete(face));
  activeCustomFontFaces = [];
  customFontRecords = [];
  AppState.customFontFamily = null;
  updateCustomFontUi('');
  try { await deleteCustomFontRecord(); } catch (_) { /* ignore storage failure */ }
  if ((AppState.text || '').trim()) applyTextDesign();
  toast('Custom fonts removed', 'success');
}



/* ========== iCaviot v2 application (DOM + THREE; mesh via MeshCore) ========== */
'use strict';

const MC = window.MeshCore;
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

// ---------- Mesh options from AppState ----------
function meshOptionsFromState(hm, rows, cols, mask) {
  const negative = AppState.relief === 'carved';
  const maxHeight = Math.max(0, AppState.depthMm);
  return {
    mode: AppState.mode,
    heightmap: hm,
    rows,
    cols,
    mask: AppState.mode === 'flat' ? mask : null,
    maxHeight,
    negative,
    innerWidth: AppState.innerWidth,
    innerDepth: AppState.innerDepth,
    wall: AppState.wall,
    sleeveHeight: AppState.sleeveHeight,
    tol: AppState.tol,
    wrapAngle: AppState.wrapAngle,
    capBottom: AppState.capBottom,
    capThick: AppState.capThick,
    capHole: AppState.capHole,
    width: AppState.plateWidth,
    base: AppState.baseThickness,
    edgeSmooth: AppState.edgeSmooth,
    curveEnable: AppState.curveEnable && AppState.mode === 'flat',
    curveDirection: AppState.curveDirection,
    curveRadius: Math.max(1, AppState.curveDiam / 2),
    curveAngle: AppState.curveAngle,
    curveFalloff: AppState.curveFalloff,
  };
}

// ---------- Image / heightmap pipeline ----------
function boxBlur(src, rows, cols) {
  const dst = new Float32Array(src.length);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      let sum = 0, n = 0;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || ni >= rows || nj < 0 || nj >= cols) continue;
          sum += src[ni * cols + nj];
          n++;
        }
      }
      dst[i * cols + j] = sum / n;
    }
  }
  return dst;
}

function applyBgRemoval(img, state = AppState) {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const id = ctx.getImageData(0, 0, c.width, c.height);
  const d = id.data;
  const tr = state.bgR, tg = state.bgG, tb = state.bgB;
  const tol = state.bgTol;
  const soft = state.bgSoft;
  for (let i = 0; i < d.length; i += 4) {
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb;
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);
    if (dist <= tol) {
      if (soft && tol > 0) {
        const t = dist / tol;
        d[i + 3] = Math.round(d[i + 3] * t);
      } else {
        d[i + 3] = 0;
      }
    }
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

function autoDetectBgColor(img, state = AppState) {
  const c = document.createElement('canvas');
  const s = 48;
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  // Sample corners
  const samples = [[0, 0], [s - 1, 0], [0, s - 1], [s - 1, s - 1], [s >> 1, 0], [0, s >> 1]];
  let r = 0, g = 0, b = 0;
  samples.forEach(([x, y]) => {
    const i = (y * s + x) * 4;
    r += d[i]; g += d[i + 1]; b += d[i + 2];
  });
  state.bgR = Math.round(r / samples.length);
  state.bgG = Math.round(g / samples.length);
  state.bgB = Math.round(b / samples.length);
  if(state===AppState)updateBgSwatch();
}

function buildHeightmapAtDetail(targetSize, image, state = AppState) {
  const img = image || state.image;
  if (!img) return null;
  const aspect = img.width / img.height;
  let cols, rows;
  if (aspect >= 1) {
    cols = targetSize;
    rows = Math.max(20, Math.round(targetSize / aspect));
  } else {
    rows = targetSize;
    cols = Math.max(20, Math.round(targetSize * aspect));
  }

  const sourceCanvas = state.bgEnable ? applyBgRemoval(img, state) : img;
  const tmp = document.createElement('canvas');
  tmp.width = cols;
  tmp.height = rows;
  const tctx = tmp.getContext('2d');
  tctx.imageSmoothingEnabled = true;
  tctx.imageSmoothingQuality = 'high';

  const imgScalePct = templateActive() ? 1 : state.logoSizePct / 100;
  const drawW = cols * imgScalePct;
  const drawH = rows * imgScalePct;
  const drawX = (cols - drawW) / 2;
  const drawY = (rows - drawH) / 2;

  tctx.save();
  if (state.mirror) {
    tctx.translate(cols, 0);
    tctx.scale(-1, 1);
  }
  tctx.drawImage(sourceCanvas, drawX, drawY, drawW, drawH);
  tctx.restore();
  const data = tctx.getImageData(0, 0, cols, rows).data;

  const useSilhouette = state.silhouette && state.mode === 'flat';
  const crispMode = state.crisp;
  let hm = new Float32Array(rows * cols);
  const alphaMap = new Uint8Array(rows * cols);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const idx = (i * cols + j) * 4;
      const r = data[idx], g = data[idx + 1], b = data[idx + 2], a = data[idx + 3];
      alphaMap[i * cols + j] = a;
      let lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      // Transparent pixels must never become relief. Invert first, then clear them.
      if (crispMode) lum = lum < 0.5 ? 0 : 1;
      hm[i * cols + j] = lum;
    }
  }

  // The checked UI option means light pixels are high. Unchecked reverses the map.
  if (!state.invert) {
    for (let i = 0; i < hm.length; i++) hm[i] = 1 - hm[i];
  }
  if (!useSilhouette) {
    for (let i = 0; i < hm.length; i++) {
      if (alphaMap[i] < 128) hm[i] = 0;
    }
  }
  if (templateActive() && state.uniformDepth) for(let i=0;i<hm.length;i++) hm[i]=alphaMap[i]/255;
  if (!(templateActive() && state.uniformDepth && state.crisp)) for (let p = 0; p < state.smoothPasses; p++) hm = boxBlur(hm, rows, cols);

  let mask = null;
  let toastMsg = null;
  if (useSilhouette) {
    const cellRows = rows - 1, cellCols = cols - 1;
    const m = new Uint8Array(cellRows * cellCols);
    let masked = 0;
    for (let i = 0; i < cellRows; i++) {
      for (let j = 0; j < cellCols; j++) {
        const a00 = alphaMap[i * cols + j];
        const a01 = alphaMap[i * cols + j + 1];
        const a10 = alphaMap[(i + 1) * cols + j];
        const a11 = alphaMap[(i + 1) * cols + j + 1];
        if ((a00 + a01 + a10 + a11) / 4 >= 128) {
          m[i * cellCols + j] = 1;
          masked++;
        }
      }
    }
    if (masked === 0) {
      toastMsg = 'Trim to image: nothing visible. Soften background removal or turn off trim.';
    } else if (masked < cellRows * cellCols) {
      mask = m;
    }
  }

  return { hm, rows, cols, alphaMap, mask, toastMsg };
}

// ---------- Three.js preview ----------
let renderer, scene, camera, controls, meshObj = null;
let gridHelper = null, axesHelper = null;
let previewMesh = null; // pure {positions, indices}

function eachMaterial(material, fn) {
  if (Array.isArray(material)) material.forEach((item) => item && fn(item));
  else if (material) fn(material);
}

function styleGridMaterial(grid) {
  eachMaterial(grid && grid.material, (material) => {
    material.transparent = true;
    material.opacity = 0.72;
  });
}

function disposeMaterial(material) {
  eachMaterial(material, (item) => item.dispose());
}

function initThree() {
  const container = els.threeContainer;
  if (!container || typeof THREE === 'undefined') return;
  const w = container.clientWidth || 600;
  const h = container.clientHeight || 500;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 2000);
  camera.position.set(60, 50, 90);

  const amb = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0xffe0c0, 0.85);
  dir.position.set(40, 80, 50);
  scene.add(dir);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.25);
  fill.position.set(-50, 20, -40);
  scene.add(fill);

  gridHelper = new THREE.GridHelper(200, 40, 0x55545c, 0x292930);
  gridHelper.position.y = 0;
  styleGridMaterial(gridHelper);
  scene.add(gridHelper);

  axesHelper = new THREE.AxesHelper(28);
  axesHelper.position.set(0, 0.03, 0);
  scene.add(axesHelper);

  if (THREE.OrbitControls) {
    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 30, 0);
    // Blender-style mouse navigation: MMB orbit, Shift+MMB pan, wheel zoom.
    controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
    controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
    controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
    renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
    renderer.domElement.addEventListener('mousedown', (e) => {
      if (e.button !== 1 || !e.shiftKey) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      renderer.domElement.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
        button: 2,
        buttons: 2,
      }));
    }, true);
  }

  window.addEventListener('resize', onResize);
  animate();
}

function onResize() {
  if (!renderer || !camera || !els.threeContainer) return;
  const w = els.threeContainer.clientWidth;
  const h = els.threeContainer.clientHeight;
  if (w < 2 || h < 2) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

function animate() {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) renderer.render(scene, camera);
}

function resetView() {
  if (!meshObj || !camera || !controls) return;
  const box = new THREE.Box3().setFromObject(meshObj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z) || 50;
  const dist = maxDim * 2.2;
  camera.up.set(0, 1, 0);
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.35, center.z + dist * 0.75);
  controls.target.copy(center);
  controls.update();
}

function setBlenderView(view) {
  if (!meshObj || !camera || !controls) return;
  const box = new THREE.Box3().setFromObject(meshObj);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  const dist = (Math.max(size.x, size.y, size.z) || 50) * 2.4;
  camera.up.set(0, 1, 0);
  if (view === 'front') camera.position.set(center.x, center.y, center.z + dist);
  if (view === 'right') camera.position.set(center.x + dist, center.y, center.z);
  if (view === 'top') {
    camera.up.set(0, 0, -1);
    camera.position.set(center.x, center.y + dist, center.z);
  }
  controls.target.copy(center);
  camera.lookAt(center);
  controls.update();
}

function setEmptyState(empty) {
  if (els.threeEmpty) els.threeEmpty.style.display = empty ? 'flex' : 'none';
  if (els.generateBtn) els.generateBtn.disabled = empty;
  if (els.downloadObjBtn) els.downloadObjBtn.disabled = empty;
  const tools = document.getElementById('imgTools');
  if (tools) {
    tools.querySelectorAll('button').forEach((b) => { b.disabled = empty; });
  }
}

function buildThreePreview() {
  if (templateActive()) { requestTemplatePreview(); return; }
  if (!scene || !AppState.heightmap) return;
  const opts = meshOptionsFromState(AppState.heightmap, AppState.hmRows, AppState.hmCols, AppState.mask);
  let mesh;
  try {
    mesh = MC.buildMesh(opts);
  } catch (e) {
    console.error(e);
    previewMesh = null;
    AppState.lastValidation = null;
    if (meshObj) {
      scene.remove(meshObj);
      meshObj.geometry.dispose();
      meshObj.material.dispose();
      meshObj = null;
    }
    setEmptyState(true);
    updateStats();
    toast(e.message || 'Mesh build failed', 'error');
    return;
  }
  previewMesh = mesh;
  const geo = MC.toThreeGeometry(mesh, THREE);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xc8c4bc,
    metalness: 0.12,
    roughness: 0.55,
    side: THREE.DoubleSide,
  });
  if (meshObj) {
    scene.remove(meshObj);
    meshObj.geometry.dispose();
    meshObj.material.dispose();
  }
  meshObj = new THREE.Mesh(geo, mat);
  // Center roughly
  geo.computeBoundingBox();
  const c = new THREE.Vector3();
  geo.boundingBox.getCenter(c);
  meshObj.position.sub(c);
  meshObj.position.y += c.y; // keep base near origin visually for sleeve
  scene.add(meshObj);

  // Keep the grid useful for both small lighter sleeves and larger custom parts.
  if (gridHelper) {
    const boxSize = new THREE.Vector3();
    geo.boundingBox.getSize(boxSize);
    const desired = Math.max(100, Math.ceil(Math.max(boxSize.x, boxSize.z) * 2.5 / 10) * 10);
    scene.remove(gridHelper);
    gridHelper.geometry.dispose();
    disposeMaterial(gridHelper.material);
    gridHelper = new THREE.GridHelper(desired, 40, 0x55545c, 0x292930);
    styleGridMaterial(gridHelper);
    scene.add(gridHelper);
  }

  const v = MC.validateMesh(mesh.positions, mesh.indices);
  AppState.lastValidation = v;
  updateStats();
  setEmptyState(false);
}

// ---------- Rebuild ----------
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
const PATTERNS = [
  { id: 'plain', name: 'Plain', draw: (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } },
  { id: 'knurl', name: 'Knurl', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    for (let y = -h; y < h * 2; y += 10) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + w * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y - w * 0.6); ctx.stroke();
    }
  }},
  { id: 'hex', name: 'Hex', draw: (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h);
    const R = 14;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    for (let row = 0; row < h / (R * 1.5) + 2; row++) {
      for (let col = 0; col < w / (R * Math.sqrt(3)) + 2; col++) {
        const cx = col * R * Math.sqrt(3) + (row % 2 ? R * Math.sqrt(3) / 2 : 0);
        const cy = row * R * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }},
  { id: 'lines', name: 'Lines', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }},
  { id: 'diamond', name: 'Diamond', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-w / 2, -h / 2);
    const s = 16;
    for (let y = -h; y < h * 2; y += s) {
      for (let x = -w; x < w * 2; x += s) {
        ctx.strokeRect(x, y, s, s);
      }
    }
    ctx.restore();
  }},
];

let patternModalReturnFocus = null;

function closePatternModal() {
  if (!els.patternModal) return;
  els.patternModal.classList.add('hidden');
  if (patternModalReturnFocus && typeof patternModalReturnFocus.focus === 'function') {
    patternModalReturnFocus.focus();
  }
  patternModalReturnFocus = null;
}

function openPatternModal() {
  if (!els.patternModal || !els.patternGrid) return;
  patternModalReturnFocus = document.activeElement;
  els.patternGrid.innerHTML = '';
  PATTERNS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pattern-card';
    const c = document.createElement('canvas');
    c.width = 120; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.save();
    p.draw(ctx, 120, 80);
    ctx.restore();
    btn.appendChild(c);
    const lab = document.createElement('span');
    lab.textContent = p.name;
    btn.appendChild(lab);
    btn.addEventListener('click', () => {
      applyPattern(p);
      closePatternModal();
    });
    els.patternGrid.appendChild(btn);
  });
  els.patternModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    const first = els.patternGrid.querySelector('button');
    if (first) first.focus();
  });
}

function applyPattern(p) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  p.draw(ctx, 512, 512);
  const img = new Image();
  img.onload = () => {
    setDesignImage(img, 'pattern:' + p.id);
  };
  img.src = c.toDataURL('image/png');
}

// ---------- Text design ----------
function renderTextToImage(text) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.scale(2,2);
  const textWidth=1024,textHeight=512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, textWidth, textHeight);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const family = AppState.customFontFamily || 'Bebas Neue, Impact, sans-serif';
  let fontSize = 220;
  ctx.font = '400 ' + fontSize + 'px ' + family;
  const spacing = AppState.letterSpacing;
  // Simple letter-spacing draw
  const chars = text.split('');
  while (fontSize > 40) {
    ctx.font = '400 ' + fontSize + 'px ' + family;
    let total = 0;
    chars.forEach((ch, i) => {
      total += ctx.measureText(ch).width;
      if (i < chars.length - 1) total += spacing;
    });
    if ((spacing===0?ctx.measureText(text).width:total) < textWidth * 0.9) break;
    fontSize -= 8;
  }
  // thickness via stroke
  if (AppState.letterThickness > 0) {
    ctx.lineWidth = AppState.letterThickness * 2;
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
  }
  let total = 0;
  chars.forEach((ch, i) => {
    total += ctx.measureText(ch).width;
    if (i < chars.length - 1) total += spacing;
  });
  let x = (textWidth - total) / 2;
  const y = textHeight / 2;
  if(spacing===0){
    if(AppState.letterThickness>0)ctx.strokeText(text,textWidth/2,y);
    ctx.fillText(text,textWidth/2,y);
  } else chars.forEach((ch) => {
    const w = ctx.measureText(ch).width;
    if (AppState.letterThickness > 0) ctx.strokeText(ch, x + w / 2, y);
    ctx.fillText(ch, x + w / 2, y);
    x += w + spacing;
  });
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.src = c.toDataURL('image/png');
  });
}

async function applyTextDesign() {
  const t = (AppState.text || '').trim();
  if (!t) return;
  const renderId = ++AppState.textRenderId;
  const img = await renderTextToImage(t);
  if (renderId !== AppState.textRenderId || t !== (AppState.text || '').trim()) return;
  setDesignImage(img, 'text:' + t.slice(0, 24));
}

// ---------- Image load / transform ----------
function setDesignImage(img, label) {
  AppState.image = img;
  AppState.imageName = label || 'image';
  AppState.sourceLabel = label || 'image';
  if (els.fileName) {
    els.fileName.style.display = '';
    els.fileName.textContent = AppState.sourceLabel;
  }
  if (AppState.bgEnable) autoDetectBgColor(img);
  setEmptyState(false);
  scheduleRebuild(true);
  saveSettings();
}

function loadImageFile(file) {
  if (!file) return;
  const uploadSide=typeof activeDesignSide==='number'&&templateActive()?activeDesignSide:null;
  if (!/^image\/(png|jpe?g)$/i.test(file.type || '')) {
    toast('Use a PNG or JPG image', 'error');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Image is too large — maximum 20 MB', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (img.width * img.height > MAX_IMAGE_PIXELS) {
      URL.revokeObjectURL(url);
      toast('Image dimensions are too large — use 24 megapixels or less', 'error');
      return;
    }
    URL.revokeObjectURL(url);
    if(uploadSide!==null&&typeof receiveSideUpload==='function')receiveSideUpload(img,file.name||'image',uploadSide);else setDesignImage(img,file.name||'image');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('Could not load image', 'error');
  };
  img.src = url;
}

function transformImage(fn) {
  if (!AppState.image) return;
  const img = AppState.image;
  const c = document.createElement('canvas');
  // fn decides dimensions
  const result = fn(img, c);
  const out = new Image();
  out.onload = () => setDesignImage(out, AppState.imageName || 'image');
  out.src = result;
}

function rotateImage(deg) {
  transformImage((img, c) => {
    const rad = deg * Math.PI / 180;
    const w = img.width, h = img.height;
    if (deg % 180 === 0) { c.width = w; c.height = h; }
    else { c.width = h; c.height = w; }
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    return c.toDataURL('image/png');
  });
}

function flipImageH() {
  transformImage((img, c) => {
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  });
}

// ---------- Simplified STL flatten import ----------
function parseSTLPositions(buf) {
  const view = new DataView(buf);
  // Binary STL if size matches
  if (buf.byteLength > 84) {
    const triCount = view.getUint32(80, true);
    const expected = 84 + triCount * 50;
    if (expected === buf.byteLength && triCount > 0 && triCount <= MAX_STL_TRIANGLES) {
      const positions = new Float32Array(triCount * 9);
      let o = 84, p = 0;
      for (let t = 0; t < triCount; t++) {
        o += 12; // normal
        for (let v = 0; v < 3; v++) {
          positions[p++] = view.getFloat32(o, true); o += 4;
          positions[p++] = view.getFloat32(o, true); o += 4;
          positions[p++] = view.getFloat32(o, true); o += 4;
        }
        o += 2;
      }
      return positions;
    }
  }
  // ASCII fallback
  const text = new TextDecoder().decode(buf);
  if (!/solid/i.test(text)) return null;
  const re = /vertex\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)/g;
  const arr = [];
  let m;
  while ((m = re.exec(text))) {
    arr.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return new Float32Array(arr);
}

function importSTLFile(file) {
  if (!file) return;
  if (file.size > MAX_STL_BYTES) {
    toast('STL is too large — maximum 100 MB', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const positions = parseSTLPositions(reader.result);
      if (!positions || positions.length < 9) {
        toast('Could not parse STL', 'error');
        return;
      }
      const c = document.createElement('canvas');
      const size = 256;
      c.width = size; c.height = size;
      // inline raster
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
        minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
        minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
      }
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(size, size);
      const heightBuf = new Float32Array(size * size);
      heightBuf.fill(-Infinity);
      const rx = maxX - minX || 1, rz = maxZ - minZ || 1, ry = maxY - minY || 1;
      for (let i = 0; i < positions.length; i += 3) {
        const u = Math.min(size - 1, Math.max(0, Math.floor(((positions[i] - minX) / rx) * (size - 1))));
        const v = Math.min(size - 1, Math.max(0, Math.floor(((positions[i + 2] - minZ) / rz) * (size - 1))));
        const h = (positions[i + 1] - minY) / ry;
        const idx = v * size + u;
        if (h > heightBuf[idx]) heightBuf[idx] = h;
      }
      for (let i = 0; i < heightBuf.length; i++) {
        const h = heightBuf[i] === -Infinity ? 0 : heightBuf[i];
        const g = Math.round(h * 255);
        imgData.data[i * 4] = g;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = g;
        imgData.data[i * 4 + 3] = heightBuf[i] === -Infinity ? 0 : 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const im = new Image();
      im.onload = () => {
        setDesignImage(im, 'stl:' + (file.name || 'import'));
        toast('STL flattened to heightmap', 'success');
      };
      im.src = c.toDataURL('image/png');
    } catch (e) {
      console.error(e);
      toast('STL import failed', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- Browser self-tests ----------
function runBrowserMeshTests() {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || '' });
  }
  // cube
  {
    const positions = new Float32Array([
      0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1,
    ]);
    const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5];
    const v = MC.validateMesh(positions, indices);
    check('closed cube', v.boundary === 0 && v.nonManifold === 0, JSON.stringify(v));
  }
  const rows = 16, cols = 24;
  const hm = new Float32Array(rows * cols);
  for (let i = 0; i < hm.length; i++) hm[i] = Math.random();
  const modes = [
    { mode: 'sleeve', wrapAngle: 360, negative: false },
    { mode: 'sleeve', wrapAngle: 180, negative: true },
    { mode: 'logo-only', wrapAngle: 360, negative: false },
    { mode: 'flat', negative: false },
  ];
  modes.forEach((m) => {
    const mesh = MC.buildMesh({
      mode: m.mode,
      heightmap: hm,
      rows, cols,
      maxHeight: 1.2,
      negative: !!m.negative,
      innerWidth: 25.5, innerDepth: 15.2, wall: 2.4, sleeveHeight: 40,
      wrapAngle: m.wrapAngle || 360,
      width: 40, base: 1,
    });
    const v = MC.validateMesh(mesh.positions, mesh.indices);
    check(m.mode + (m.wrapAngle || '') + (m.negative ? '-carved' : '-raised'),
      v.boundary === 0 && v.nonManifold === 0 && v.zeroArea === 0, JSON.stringify(v));
  });
  const failed = results.filter((r) => !r.ok);
  const msg = results.length - failed.length + '/' + results.length + ' passed';
  if (failed.length) toast('Mesh tests: ' + msg, 'error');
  else toast('Mesh tests: ' + msg, 'success');
  console.table(results);
  return results;
}

window.__icaviotTests = runBrowserMeshTests;
window.AppState = AppState;
window.MeshCore = MC;

// ---------- Wire UI ----------
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

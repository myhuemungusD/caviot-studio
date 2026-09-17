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

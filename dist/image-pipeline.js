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
    textRelief: textReliefOptions(),
  };
}

// ---------- Sharp lettering ----------
// Text designs are meshed from vector outlines traced at sub-pixel accuracy from the 2048 px text image
// (TextRelief in text-relief.js) instead of the heightmap grid, so letters stay sharp in preview and export.
// The tracing does not depend on how the font was loaded (built-in, system, uploaded or a restored project PNG).
const TEXT_TRACE_MAX_PIXELS = 4096 * 2048;
const TEXT_OUTLINE_CACHE_LIMIT = 6;
const textOutlineCache = new WeakMap();

function isTextDesign(state = AppState) {
  if (!state.image) return false;
  if (/^text:/.test(state.sourceLabel || '')) return true;
  const slot = typeof designSides !== 'undefined' && typeof activeDesignSide !== 'undefined' ? designSides[activeDesignSide] : null;
  return !!slot && slot.image === state.image && slot.kind === 'text';
}

// Lettering outlines for an image, in normalized image coordinates (u right, v down, both 0..1).
// Returns null when the image cannot be traced; callers then use the heightmap grid.
function textOutlineSource(img) {
  if (textOutlineCache.has(img)) return textOutlineCache.get(img);
  let src = null;
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (w >= 8 && h >= 8 && w * h <= TEXT_TRACE_MAX_PIXELS) {
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const cx = c.getContext('2d', { willReadFrequently: true });
      cx.drawImage(img, 0, 0);
      const data = cx.getImageData(0, 0, w, h).data;
      const lum = new Float32Array(w * h);
      for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * data[p + 3] / 65025;
      // 0.2 px simplification: outline points stay within ~0.15 px (0.011 mm on a 152 mm plate) of the true glyph edge.
      const loops = TextRelief.prepare(TextRelief.trace(lum, w, h, 0.5), 0.2, 2)
        .map((l) => Float32Array.from(l, (v, i) => (i % 2 ? v / h : v / w)));
      // Half-resolution ink mask for outline backings (a margin of millimetres does not need full resolution).
      const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), ink = new Uint8Array(hw * hh);
      for (let y = 0; y < hh; y++) for (let x = 0; x < hw; x++) {
        let sum = 0, n = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = 2 * x + dx, sy = 2 * y + dy;
          if (sx < w && sy < h) { sum += lum[sy * w + sx]; n++; }
        }
        ink[y * hw + x] = sum / n >= 0.5 ? 1 : 0;
      }
      if (loops.length) src = { w, h, loops, ink, hw, hh, outlines: new Map() };
    }
  } catch (e) {
    console.warn('Lettering outline unavailable; using the grid.', e);
    src = null;
  }
  textOutlineCache.set(img, src);
  return src;
}

// Backing that follows the lettering at `marginMm`, as normalized loops (cached per margin and plate width).
function textOutlineBacking(src, marginMm, letteringWidthMm) {
  const mmPerHalfPx = letteringWidthMm / src.hw;
  const r = Math.max(0.5, marginMm / mmPerHalfPx);
  const key = r.toFixed(2);
  if (src.outlines.has(key)) return src.outlines.get(key);
  const off = TextRelief.offsetOutline(src.ink, src.hw, src.hh, r, { bridge: true });
  const loops = TextRelief.prepare(off.loops, 0.2, 1).map((l) => Float32Array.from(l, (v, i) => (i % 2 ? 2 * v / src.h : 2 * v / src.w)));
  if (src.outlines.size >= TEXT_OUTLINE_CACHE_LIMIT) src.outlines.delete(src.outlines.keys().next().value);
  src.outlines.set(key, loops);
  return loops;
}

// TextRelief options for MeshCore.buildMesh, or null when the grid should be used: image designs,
// "Sharp edges" off, and sleeve templates (their own contour pipeline in template-sharp.js already traces at 768 px).
function textReliefOptions(state = AppState) {
  if (typeof TextRelief === 'undefined' || !state.crisp || templateActive() || !isTextDesign(state)) return null;
  const src = textOutlineSource(state.image);
  if (!src) return null;
  const s = Math.max(0.1, Math.min(1, state.logoSizePct / 100));
  const place = (loops) => loops.map((l) => {
    const out = new Float32Array(l.length);
    for (let i = 0; i < l.length; i += 2) {
      const u = 0.5 + (l[i] - 0.5) * s;
      out[i] = state.mirror ? 1 - u : u;
      out[i + 1] = 0.5 + (l[i + 1] - 0.5) * s;
    }
    return out;
  });
  const flat = state.mode === 'flat';
  const backing = !flat ? 'plate' : !state.silhouette ? 'plate' : state.textOutline ? 'outline' : 'letters';
  const opts = { loops: place(src.loops), backing, inkHigh: state.invert !== false };
  if (flat) opts.depth = state.plateWidth * src.h / src.w;
  if (backing === 'outline') {
    try {
      opts.backingLoops = place(textOutlineBacking(src, state.outlineMargin, state.plateWidth * s));
    } catch (e) {
      console.warn('Outline backing failed; using letters only.', e);
      opts.backing = 'letters';
    }
  }
  return opts;
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

function applyBgRemoval(img, state = AppState, edgeOnly = false) {
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
  // edgeOnly: clear only background-colored pixels connected to the image border, so the same color enclosed by
  // the artwork (the inside of a badge or shield) stays part of the subject.
  const reached = edgeOnly ? edgeConnectedBackground(d, c.width, c.height, tr, tg, tb, tol) : null;
  for (let i = 0; i < d.length; i += 4) {
    if (reached && !reached[i >> 2]) continue;
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

// Pixels reachable from the border through background-colored or already transparent pixels (4-connected).
function edgeConnectedBackground(d, w, h, tr, tg, tb, tol) {
  const n = w * h, seen = new Uint8Array(n), stack = new Int32Array(n);
  let top = 0;
  const open = (p) => {
    const i = p * 4;
    if (d[i + 3] < 128) return true;
    const dr = d[i] - tr, dg = d[i + 1] - tg, db = d[i + 2] - tb;
    return dr * dr + dg * dg + db * db <= tol * tol;
  };
  const push = (p) => { if (!seen[p] && open(p)) { seen[p] = 1; stack[top++] = p; } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (top) {
    const p = stack[--top], x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < n - w) push(p + w);
  }
  return seen;
}

function autoDetectBgColor(img, state = AppState) {
  const c = document.createElement('canvas');
  const s = 48;
  c.width = s; c.height = s;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, s, s);
  const d = ctx.getImageData(0, 0, s, s).data;
  // Choose an actual dominant border color, never an average of unrelated colors.
  // Transparent PNG borders already define the silhouette and need no color key.
  const bins=new Map();let transparent=0,total=0;
  for(let y=0;y<s;y++)for(let x=0;x<s;x++)if(x<3||y<3||x>=s-3||y>=s-3){const i=(y*s+x)*4;total++;if(d[i+3]<128){transparent++;continue;}const key=[d[i]>>4,d[i+1]>>4,d[i+2]>>4].join(',');let b=bins.get(key);if(!b){b={n:0,r:0,g:0,b:0};bins.set(key,b);}b.n++;b.r+=d[i];b.g+=d[i+1];b.b+=d[i+2];}
  if(transparent>total*.5){state.bgR=255;state.bgG=255;state.bgB=255;state.bgEnable=false;}
  else {const best=[...bins.values()].sort((a,b)=>b.n-a.n)[0];if(best){state.bgR=Math.round(best.r/best.n);state.bgG=Math.round(best.g/best.n);state.bgB=Math.round(best.b/best.n);}}
  if(state===AppState)updateBgSwatch();
}

// Pixel-art and nearest-neighbour enlargements keep the original pixel grid: nearly every alpha edge then falls on
// a multiple of the block size. Sharp outlines smooth staircases of that size, so report it (1 when not blocky).
function blockPixelSize(source) {
  const w = source.width, h = source.height;
  if (!w || !h || w * h > 8e6) return 1;
  let data;
  try {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0); data = ctx.getImageData(0, 0, w, h).data;
  } catch (_) { return 1; }
  const hist = Array.from({ length: 9 }, (_, p) => new Uint32Array(p));
  let total = 0;
  const edge = (pos) => { total++; for (let p = 2; p <= 8; p++) hist[p][pos % p]++; };
  for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if ((data[(y * w + x) * 4 + 3] >= 128) !== (data[(y * w + x - 1) * 4 + 3] >= 128)) edge(x);
  for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if ((data[(y * w + x) * 4 + 3] >= 128) !== (data[((y - 1) * w + x) * 4 + 3] >= 128)) edge(y);
  if (total < 200) return 1;
  for (let p = 8; p >= 2; p--) if (Math.max(...hist[p]) >= total * 0.85) return p;
  return 1;
}

// Two trimmed cells that touch only at a corner make a non-manifold vertex (the export reports open edges and
// refuses the mesh). Join every such pair by filling one of the two empty cells beside it.
function closeDiagonalMask(m, rows, cols) {
  let added = 0, changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < rows - 1; i++) for (let j = 0; j < cols - 1; j++) {
      const a = i * cols + j, b = a + 1, c = a + cols, e = c + 1;
      if (m[a] && m[e] && !m[b] && !m[c]) { m[b] = 1; added++; changed = true; }
      else if (m[b] && m[c] && !m[a] && !m[e]) { m[a] = 1; added++; changed = true; }
    }
  }
  return added;
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

  const useSilhouette = state.silhouette && state.mode === 'flat';
  // Dark parts stick out on a trimmed plate: the plate is the subject's outline, so only the background outside
  // the artwork is removed. Light areas inside it stay as plate (height 0) instead of becoming holes.
  const edgeOnly = useSilhouette && !state.invert;
  const sourceCanvas = state.bgEnable ? applyBgRemoval(img, state, edgeOnly) : img;
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
  // Removed background is never relief. A trimmed plate with light parts high keeps the old behavior
  // (transparent pixels read as black, so they are already low).
  if (!useSilhouette || !state.invert) {
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
    if (masked) masked += closeDiagonalMask(m, cellRows, cellCols);
    if (masked === 0) {
      toastMsg = 'Trim to image: nothing visible. Soften background removal or turn off trim.';
    } else if (masked < cellRows * cellCols) {
      mask = m;
    }
  }

  // Map pixels per source pixel: sharp outlines simplify away staircases of this size.
  const sharpTemplate = templateActive() && state.uniformDepth && crispMode;
  const sourceScale = Math.max(cols / Math.max(1, img.width), rows / Math.max(1, img.height)) * imgScalePct * (sharpTemplate ? blockPixelSize(sourceCanvas) : 1);
  return { hm, rows, cols, alphaMap, mask, toastMsg, sourceScale };
}

// ---------- Three.js preview ----------

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
    textRelief: textReliefOptions() || photoOutlineOptions(),
  };
}

// Smooth and lithophane stay heightmaps. Their grid is scaled to the print so a pixel is about
// 0.15 mm (0.2 mm on a phone), capped by that device's triangle budget. Binary photo styles
// use outlines instead, and a photo that is off leaves the usual export detail untouched.
function photoWorkingDetail(baseDetail) {
  const style = AppState.photo && AppState.photo.style;
  // Poster keeps this grid as the fallback when a noisy outline cannot be closed. The outline is used when it succeeds.
  if (style !== 'smooth' && style !== 'lithophane' && style !== 'poster') return baseDetail;
  if (typeof templateActive === 'function' && templateActive()) return baseDetail;
  const phone = typeof CaviotDevice !== 'undefined' && CaviotDevice.tier === 'light';
  const mm = phone ? 0.2 : 0.15;
  const width = AppState.mode === 'flat' ? (AppState.plateWidth || 100) : (AppState.designWidth || 30);
  const img = AppState.image;
  const aspect = img && img.width && img.height ? img.width / Math.max(1, img.height) : 1;
  const height = AppState.mode === 'flat' ? width / Math.max(0.05, aspect) : (AppState.designHeight || width);
  const longMm = Math.max(width, height);
  const shortMm = Math.max(1, Math.min(width, height));
  let detail = Math.ceil(longMm / mm);
  const limits = typeof CaviotDevice !== 'undefined' && CaviotDevice.limits ? CaviotDevice.limits : null;
  const meshBudget = limits && limits.meshBudget ? limits.meshBudget : 1400000;
  const exportBudget = limits && limits.exportTriangleBudget < Infinity ? limits.exportTriangleBudget : meshBudget;
  const budget = Math.min(meshBudget, exportBudget);
  const cells = (longMm / mm) * (shortMm / mm);
  if (cells * 2 > budget) detail = Math.max(80, Math.floor(detail * Math.sqrt(budget / (cells * 2))));
  const device = typeof CaviotDevice !== 'undefined' && CaviotDevice.DEVICE ? CaviotDevice.DEVICE[CaviotDevice.tier] : null;
  if (device && Number.isFinite(device.maxImageSide)) detail = Math.min(detail, device.maxImageSide);
  return Math.max(baseDetail, Math.min(detail, 1400));
}

// ---------- Sharp lettering ----------
// Text designs are meshed from vector outlines traced at sub-pixel accuracy from the 2048 px text image
// (TextRelief in text-relief.js) instead of the heightmap grid, so letters stay sharp in preview and export.
// The tracing does not depend on how the font was loaded (built-in, system, uploaded or a restored project PNG).
const TEXT_TRACE_MAX_PIXELS = 4096 * 2048;
const TEXT_OUTLINE_CACHE_LIMIT = 6;
const textOutlineCache = new WeakMap();
let lastBackingError = '';

// Phones keep the device-tier export budget. Desktop (no finite triangle budget) is unchanged.
function textDeviceLimits() {
  const device = typeof CaviotDevice !== 'undefined' ? CaviotDevice.device : null;
  const budget = device && device.exportTriangleBudget;
  if (!(budget < Infinity)) return null;
  const meshBudget = typeof CaviotDevice.limits?.meshBudget === 'number' ? CaviotDevice.limits.meshBudget : budget;
  return { maxFaces: Math.max(10000, Math.min(1500000, budget, meshBudget)), maxPixels: 6e6 };
}

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
      // Ink extent (half-res pixels) and baseline (median lowest ink row per column; descenders are a minority).
      let x0 = hw, x1 = -1, y0 = hh, y1 = -1;const bottoms = [];
      for (let x = 0; x < hw; x++) { let low = -1; for (let y = 0; y < hh; y++) if (ink[y * hw + x]) { low = y; if (y < y0) y0 = y; if (y > y1) y1 = y; } if (low >= 0) { bottoms.push(low); if (x < x0) x0 = x; x1 = x; } }
      bottoms.sort((a, b) => a - b);
      // Exact extent of the traced outlines (half-res px) for the rounded rectangle, so it always clears the letters.
      let ex0 = Infinity, ex1 = -Infinity, ey0 = Infinity, ey1 = -Infinity;
      for (const l of loops) for (let i = 0; i < l.length; i += 2) {
        const x = l[i] * hw, y = l[i + 1] * hh;
        if (x < ex0) ex0 = x; if (x > ex1) ex1 = x; if (y < ey0) ey0 = y; if (y > ey1) ey1 = y;
      }
      const box = x1 >= 0 && loops.length ? { x0, x1: x1 + 1, y0, y1: y1 + 1, baseline: bottoms[Math.floor(bottoms.length / 2)] + 1, exact: [ex0, ex1, ey0, ey1] } : null;
      if (loops.length && box) src = { w, h, loops, ink, hw, hh, box, outlines: new Map() };
    }
  } catch (e) {
    console.warn('Lettering outline unavailable; using the grid.', e);
    src = null;
  }
  textOutlineCache.set(img, src);
  return src;
}

// Backing shapes for flat text, as normalized loops (u right, v down in the text image), cached per shape and size.
//   outline: follows the letters at marginMm (separate letters joined by bridges, so it prints as one piece)
//   bar:     the outline of the letters plus a connector bar along the baseline (also bridged)
//   rounded: a rounded rectangle marginMm around the lettering
function textBackingLoops(src, type, marginMm, letteringWidthMm) {
  const mmPerHalfPx = letteringWidthMm / src.hw, m = Math.max(0.5, marginMm);
  const key = type + ':' + (m / mmPerHalfPx).toFixed(2);
  if (src.outlines.has(key)) return src.outlines.get(key);
  let loops;
  if (type === 'rounded') {
    // In millimetres around the ink box, then back to normalized coordinates.
    const [ex0, ex1, ey0, ey1] = src.box.exact, mmX = (x) => x * mmPerHalfPx;
    const left = mmX(ex0) - m, right = mmX(ex1) + m, top = mmX(ey0) - m, bottom = mmX(ey1) + m;
    // Corner radius below 3.41 x margin keeps the arc outside the lettering's corner (2.5 x leaves >= 0.27 x margin).
    const r = Math.max(0.1, Math.min(m + 2, 2.5 * m, (right - left) / 2, (bottom - top) / 2)), pts = [], steps = 12;
    const corner = (cx, cy, a0) => { for (let k = 0; k <= steps; k++) { const a = a0 + (k / steps) * Math.PI / 2; pts.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); } };
    corner(right - r, bottom - r, 0); corner(left + r, bottom - r, Math.PI / 2); corner(left + r, top + r, Math.PI); corner(right - r, top + r, Math.PI * 1.5);
    const fullW = src.hw * mmPerHalfPx, fullH = src.hh * mmPerHalfPx;
    loops = [Float32Array.from(pts, (v, i) => (i % 2 ? v / fullH : v / fullW))];
  } else {
    let ink = src.ink;
    if (type === 'bar') {
      // Raw bar: across the whole lettering, 30% above / 70% below the baseline, 18% of the letter height (1.5-6 mm).
      const b = src.box, barMm = Math.max(1.5, Math.min(6, 0.18 * (b.y1 - b.y0) * mmPerHalfPx)), bar = barMm / mmPerHalfPx;
      const ya = Math.max(0, Math.floor(b.baseline - 0.3 * bar)), yb = Math.min(src.hh, Math.ceil(b.baseline + 0.7 * bar));
      ink = src.ink.slice();
      for (let y = ya; y < yb; y++) ink.fill(1, y * src.hw + b.x0, y * src.hw + b.x1);
    }
    const limits = textDeviceLimits();
    const off = TextRelief.offsetOutline(ink, src.hw, src.hh, m / mmPerHalfPx, { bridge: true, ...(limits ? { maxPixels: limits.maxPixels } : {}) });
    loops = TextRelief.prepare(off.loops, 0.2, 1).map((l) => Float32Array.from(l, (v, i) => (i % 2 ? 2 * v / src.h : 2 * v / src.w)));
  }
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
  // Flat text: trim off = solid plate; trim on = the chosen backing ('none' = letters only).
  const shape = !flat || !state.silhouette ? 'solid' : ['outline', 'rounded', 'bar'].includes(state.textBacking) ? state.textBacking : 'none';
  const opts = { loops: place(src.loops), backing: shape === 'solid' ? 'plate' : shape === 'none' ? 'letters' : 'outline', inkHigh: state.invert !== false };
  const limits = textDeviceLimits();
  if (limits) opts.maxFaces = limits.maxFaces;
  if (flat) opts.depth = state.plateWidth * src.h / src.w;
  if (opts.backing === 'outline') {
    try {
      opts.backingLoops = place(textBackingLoops(src, shape, state.outlineMargin, state.plateWidth * s));
      lastBackingError = '';
    } catch (e) {
      console.warn('Text backing failed; using letters only.', e);
      opts.backing = 'letters';
      const msg = (e && e.message) || 'the backing could not be built';
      if (msg !== lastBackingError && typeof toast === 'function') toast('Backing could not be built (' + msg + '). Letters only were used.', 'error');
      lastBackingError = msg;
    }
  } else lastBackingError = '';
  return opts;
}

// Shadow, silhouette, line and poster on a flat plate are traced like sharp lettering, so the edge is a
// curve instead of the 160-column preview grid. Sleeve templates keep their own contour path.
const photoTraceCache = new WeakMap();
function photoTraceSource(img, style) {
  if (!img) return null;
  const cached = photoTraceCache.get(img);
  if (cached && cached.style === style) return cached.src;
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
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const p = (y * w + x) * 4;
        // A 1 px clear frame keeps a subject that touches the photo edge from welding to the plate rim.
        const edge = x === 0 || y === 0 || x === w - 1 || y === h - 1;
        lum[y * w + x] = edge ? 0 : (0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]) * data[p + 3] / 65025;
      }
      const tol = Math.max(0.4, Math.min(1.1, Math.max(w, h) / 800));
      const norm = (l) => Float32Array.from(l, (v, i) => (i % 2 ? v / h : v / w));
      if (style === 'poster') {
        const mid = new Float32Array(w * h), high = new Float32Array(w * h);
        for (let i = 0; i < lum.length; i++) {
          if (lum[i] >= 0.34) mid[i] = 1;
          if (lum[i] >= 0.75) high[i] = 1;
        }
        // Pull the top step in so its outline sits inside the middle step instead of crossing it.
        const inset = new Float32Array(w * h);
        const pull = 2;
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          let ok = high[y * w + x] ? 1 : 0;
          for (let dy = -pull; dy <= pull && ok; dy++) for (let dx = -pull; dx <= pull; dx++) {
            const yy = y + dy, xx = x + dx;
            if (yy < 0 || xx < 0 || yy >= h || xx >= w || !high[yy * w + xx]) ok = 0;
          }
          inset[y * w + x] = ok;
        }
        const posterTol = Math.max(tol, 0.75);
        src = {
          w, h,
          mid: TextRelief.prepare(TextRelief.trace(mid, w, h, 0.5), posterTol, 8).map(norm),
          high: TextRelief.prepare(TextRelief.trace(inset, w, h, 0.5), posterTol, 8).map(norm),
        };
        if (!src.mid.length && !src.high.length) src = null;
      } else {
        const loops = TextRelief.prepare(TextRelief.trace(lum, w, h, 0.5), tol, 6).map(norm);
        src = loops.length ? { w, h, loops } : null;
      }
    }
  } catch (e) {
    console.warn('Photo outline unavailable; using the grid.', e);
    src = null;
  }
  photoTraceCache.set(img, { style, src });
  return src;
}

function photoOutlineOptions(state = AppState) {
  if (typeof TextRelief === 'undefined' || templateActive() || state.mode !== 'flat') return null;
  const style = state.photo && state.photo.style;
  if (style !== 'shadow' && style !== 'silhouette' && style !== 'line' && style !== 'poster') return null;
  const src = photoTraceSource(state.image, style);
  if (!src) return null;
  const s = Math.max(0.1, Math.min(1, state.logoSizePct / 100));
  const place = (loops) => (loops || []).map((l) => {
    const out = new Float32Array(l.length);
    for (let i = 0; i < l.length; i += 2) {
      const u = 0.5 + (l[i] - 0.5) * s;
      out[i] = state.mirror ? 1 - u : u;
      out[i + 1] = 0.5 + (l[i + 1] - 0.5) * s;
    }
    return out;
  });
  const depth = state.plateWidth * src.h / src.w;
  const limits = textDeviceLimits();
  const opts = style === 'poster'
    ? { photoTiers: true, loops: place(src.high), midLoops: place(src.mid), backing: 'plate', inkHigh: state.invert !== false, depth }
    : { loops: place(src.loops), backing: 'plate', inkHigh: state.invert !== false, depth };
  if (limits) opts.maxFaces = limits.maxFaces;
  if (style === 'poster' && !opts.loops.length && !opts.midLoops.length) return null;
  if (style !== 'poster' && !opts.loops.length) return null;
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
const ownAlphaCache = new WeakMap();
function hasOwnAlpha(img) {
  if (ownAlphaCache.has(img)) return ownAlphaCache.get(img);
  let found = false;
  try {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, 128, 128);
    const d = ctx.getImageData(0, 0, 128, 128).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { found = true; break; }
  } catch (_) { found = true; }
  ownAlphaCache.set(img, found);
  return found;
}

// Exact squared Euclidean distance to the nearest set cell (Felzenszwalb & Huttenlocher). Unset grids give Infinity.
function squaredDistanceToSet(set, rows, cols) {
  const INF = 1e20, n = Math.max(rows, cols);
  const out = new Float64Array(rows * cols), f = new Float64Array(n), d = new Float64Array(n), z = new Float64Array(n + 1);
  const v = new Int32Array(n);
  const pass = len => {
    let k = 0;
    v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
  };
  for (let j = 0; j < cols; j++) {
    for (let i = 0; i < rows; i++) f[i] = set[i * cols + j] ? 0 : INF;
    pass(rows);
    for (let i = 0; i < rows; i++) out[i * cols + j] = d[i];
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) f[j] = out[i * cols + j];
    pass(cols);
    for (let j = 0; j < cols; j++) out[i * cols + j] = d[j] >= INF / 2 ? Infinity : d[j];
  }
  return out;
}

// Invert relief on a sleeve design: the parts that stuck out sink, and a raised pad that hugs the artwork's outline
// (gaps closed, holes filled, small margin) takes their place. Only the artwork's own shape is used, so removed
// background never turns into a full-size square. Returns null when there is nothing to invert or the artwork
// covers the whole picture (background removal off).
function invertReliefMap(hm, rows, cols) {
  const n = rows * cols, ink = new Uint8Array(n);
  let count = 0, minI = rows, maxI = -1, minJ = cols, maxJ = -1;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (hm[i * cols + j] < 0.5) continue;
      ink[i * cols + j] = 1; count++;
      if (i < minI) minI = i; if (i > maxI) maxI = i; if (j < minJ) minJ = j; if (j > maxJ) maxJ = j;
    }
  }
  if (!count || count >= n * 0.98) return null;
  const size = Math.max(maxI - minI + 1, maxJ - minJ + 1);
  const close = Math.max(2, Math.round(size * 0.05)), margin = Math.max(1.5, size * 0.035);
  // Close the outline: grow by `close`, then shrink by the same amount.
  const toInk = squaredDistanceToSet(ink, rows, cols), outside = new Uint8Array(n);
  for (let p = 0; p < n; p++) outside[p] = toInk[p] > close * close ? 1 : 0;
  const toOutside = squaredDistanceToSet(outside, rows, cols), pad = new Uint8Array(n);
  for (let p = 0; p < n; p++) pad[p] = ink[p] || toOutside[p] > close * close ? 1 : 0;
  // Fill holes: anything not reachable from the picture's border is inside the pad.
  const seen = new Uint8Array(n), stack = [];
  const push = p => { if (!pad[p] && !seen[p]) { seen[p] = 1; stack.push(p); } };
  for (let j = 0; j < cols; j++) { push(j); push((rows - 1) * cols + j); }
  for (let i = 0; i < rows; i++) { push(i * cols); push(i * cols + cols - 1); }
  while (stack.length) {
    const p = stack.pop(), i = (p / cols) | 0, j = p - i * cols;
    if (i > 0) push(p - cols); if (i < rows - 1) push(p + cols); if (j > 0) push(p - 1); if (j < cols - 1) push(p + 1);
  }
  for (let p = 0; p < n; p++) if (!seen[p]) pad[p] = 1;
  const toPad = squaredDistanceToSet(pad, rows, cols), out = new Float32Array(n);
  for (let p = 0; p < n; p++) {
    const region = Math.min(1, Math.max(0, margin + 0.5 - Math.sqrt(toPad[p])));
    out[p] = region * (1 - Math.min(1, Math.max(0, hm[p])));
  }
  return out;
}

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
  // A photo style already simplified the picture. Keying the background out again would punch holes
  // in a white silhouette. Tone styles (poster, smooth, lithophane) keep their gray levels.
  const photoStyle = state.photo && state.photo.style;
  const photoTone = photoStyle === 'poster' || photoStyle === 'smooth' || photoStyle === 'lithophane';
  const photoActive = !!(photoStyle && photoStyle !== 'off');
  const sourceCanvas = state.bgEnable && !photoActive ? applyBgRemoval(img, state, edgeOnly) : img;
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

  const crispMode = photoTone ? false : state.crisp;
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
  if (templateActive() && state.uniformDepth && !photoTone) for(let i=0;i<hm.length;i++) hm[i]=alphaMap[i]/255;
  let reliefInverted = false;
  if (templateActive() && state.reliefInvert) {
    const inverted = invertReliefMap(hm, rows, cols);
    if (inverted) { hm = inverted; reliefInverted = true; }
  }
  if (!(templateActive() && state.uniformDepth && crispMode)) for (let p = 0; p < state.smoothPasses; p++) hm = boxBlur(hm, rows, cols);

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
  // Keyed: the background was removed by color from a picture without its own transparency (JPEG, opaque PNG).
  const keyed = sourceCanvas !== img && !hasOwnAlpha(img);
  return { hm, rows, cols, alphaMap, mask, toastMsg, sourceScale, keyed, reliefInverted };
}

// ---------- Three.js preview ----------

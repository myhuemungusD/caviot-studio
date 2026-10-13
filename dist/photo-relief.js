'use strict';
// Photo-to-sleeve conversion. Pure pixel math: no DOM, no network.
// A 0.4 mm FDM nozzle cannot print camera detail on a small sleeve, so each style
// simplifies the photo and refuses features thinner than about 0.8 mm (two nozzle widths)
// at the real print size. See PHOTO-RESEARCH.md.
const PhotoRelief = (() => {
  const NOZZLE_MM = 0.4;
  const MIN_FEATURE_MM = 0.8;
  const STYLES = ['off', 'silhouette', 'line', 'poster', 'smooth', 'lithophane'];
  const TONE_STYLES = ['poster', 'smooth', 'lithophane'];
  const DEFAULTS = { style: 'off', detail: 40, lineMm: 1.2, brightness: 0, contrast: 0, gamma: 1, focus: false, swap: false, aspect: 'free', crop: null };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function toneStyle(style) { return TONE_STYLES.indexOf(style) !== -1; }

  function luminanceOf(rgba, width, height) {
    const n = width * height, out = new Float32Array(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      const a = rgba[p + 3] / 255;
      out[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255 * a;
    }
    return out;
  }

  // brightness, contrast and gamma in the same units as the sliders.
  function adjustChannel(v, brightness, contrast, gamma) {
    let x = v / 255 + brightness / 200;
    x = (x - 0.5) * (1 + contrast / 100) + 0.5;
    x = clamp(x, 0, 1);
    if (gamma !== 1) x = Math.pow(x, gamma);
    return x;
  }

  function adjustRGBA(rgba, width, height, brightness, contrast, gamma) {
    const out = new Uint8ClampedArray(rgba.length);
    const flat = brightness === 0 && contrast === 0 && gamma === 1;
    for (let i = 0; i < rgba.length; i += 4) {
      out[i + 3] = rgba[i + 3];
      if (flat) { out[i] = rgba[i]; out[i + 1] = rgba[i + 1]; out[i + 2] = rgba[i + 2]; continue; }
      out[i] = Math.round(adjustChannel(rgba[i], brightness, contrast, gamma) * 255);
      out[i + 1] = Math.round(adjustChannel(rgba[i + 1], brightness, contrast, gamma) * 255);
      out[i + 2] = Math.round(adjustChannel(rgba[i + 2], brightness, contrast, gamma) * 255);
    }
    return { rgba: out, width, height };
  }

  function gaussianKernel(sigma) {
    const radius = Math.max(1, Math.ceil(sigma * 2.5));
    const k = new Float32Array(radius * 2 + 1);
    let sum = 0;
    for (let i = -radius; i <= radius; i++) {
      const v = Math.exp(-(i * i) / (2 * sigma * sigma));
      k[i + radius] = v;
      sum += v;
    }
    for (let i = 0; i < k.length; i++) k[i] /= sum;
    return { k, radius };
  }

  function blur(src, width, height, sigma) {
    if (!(sigma > 0.34)) return Float32Array.from(src);
    const { k, radius } = gaussianKernel(sigma);
    const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let s = 0;
        for (let i = -radius; i <= radius; i++) s += src[row + Math.min(width - 1, Math.max(0, x + i))] * k[i + radius];
        tmp[row + x] = s;
      }
    }
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let s = 0;
      for (let i = -radius; i <= radius; i++) s += tmp[Math.min(height - 1, Math.max(0, y + i)) * width + x] * k[i + radius];
      out[y * width + x] = s;
    }
    return out;
  }

  // Edge-preserving smooth. A small range sigma keeps a face outline; a large one melts texture.
  // radiusCap stays at 5 for the usual pass. Tonal separation asks for a wider window.
  function bilateral(src, width, height, sigmaS, sigmaR, radiusCap) {
    const radius = Math.max(1, Math.min(radiusCap || 5, Math.ceil(sigmaS * 1.6)));
    const spatial = new Float32Array(radius + 1);
    for (let i = 0; i <= radius; i++) spatial[i] = Math.exp(-(i * i) / (2 * sigmaS * sigmaS));
    const twoR = 2 * sigmaR * sigmaR;
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, center = src[i];
      let weight = 0, acc = 0;
      const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);
      const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
      for (let yy = y0; yy <= y1; yy++) {
        const sy = spatial[Math.abs(yy - y)];
        const row = yy * width;
        for (let xx = x0; xx <= x1; xx++) {
          const diff = src[row + xx] - center;
          const w = sy * spatial[Math.abs(xx - x)] * Math.exp(-(diff * diff) / twoR);
          weight += w;
          acc += w * src[row + xx];
        }
      }
      out[i] = weight ? acc / weight : center;
    }
    return out;
  }

  function stretch(src, lowQ, highQ) {
    const sample = src.length > 40000 ? src.filter((_, i) => i % 7 === 0) : Array.from(src);
    sample.sort((a, b) => a - b);
    const a = sample[Math.floor(sample.length * lowQ)], b = sample[Math.min(sample.length - 1, Math.floor(sample.length * highQ))];
    if (!(b - a > 1e-4)) return Float32Array.from(src);
    const out = new Float32Array(src.length);
    for (let i = 0; i < src.length; i++) out[i] = clamp((src[i] - a) / (b - a), 0, 1);
    return out;
  }

  function otsu(src) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < src.length; i++) hist[Math.round(clamp(src[i], 0, 1) * 255)]++;
    let sum = 0;
    for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sumB = 0, wB = 0, max = -1, mid = 0.5;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (!wB) continue;
      const wF = src.length - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) * (mB - mF);
      if (between > max) { max = between; mid = (mB + mF) / 2 / 255; }
    }
    return mid;
  }

  function axisFilter(src, width, height, radius, horizontal, grow) {
    const out = new Uint8Array(src.length);
    if (horizontal) {
      for (let y = 0; y < height; y++) {
        const row = y * width;
        for (let x = 0; x < width; x++) {
          let v = grow ? 0 : 1;
          const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
          for (let xx = x0; xx <= x1; xx++) v = grow ? (v | src[row + xx]) : (v & src[row + xx]);
          out[row + x] = v;
        }
      }
    } else {
      for (let x = 0; x < width; x++) for (let y = 0; y < height; y++) {
        let v = grow ? 0 : 1;
        const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);
        for (let yy = y0; yy <= y1; yy++) v = grow ? (v | src[yy * width + x]) : (v & src[yy * width + x]);
        out[y * width + x] = v;
      }
    }
    return out;
  }

  function morph(src, width, height, radius, grow) {
    const r = Math.round(radius);
    if (r <= 0) return Uint8Array.from(src);
    return axisFilter(axisFilter(src, width, height, r, true, grow), width, height, r, false, grow);
  }
  function dilate(src, width, height, radius) { return morph(src, width, height, radius, true); }
  function erode(src, width, height, radius) { return morph(src, width, height, radius, false); }
  function close(src, width, height, radius) { return erode(dilate(src, width, height, radius), width, height, radius); }
  function open(src, width, height, radius) { return dilate(erode(src, width, height, radius), width, height, radius); }

  function components(mask, width, height, minArea, keepRatio) {
    const seen = new Uint8Array(mask.length), out = new Uint8Array(mask.length);
    const groups = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      const stack = [i], pixels = [];
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        pixels.push(p);
        const x = p % width;
        if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x + 1 < width && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (p >= width && mask[p - width] && !seen[p - width]) { seen[p - width] = 1; stack.push(p - width); }
        if (p + width < mask.length && mask[p + width] && !seen[p + width]) { seen[p + width] = 1; stack.push(p + width); }
      }
      groups.push(pixels);
    }
    let largest = 0;
    for (const g of groups) if (g.length > largest) largest = g.length;
    const floor = Math.max(minArea, largest * (keepRatio || 0));
    let kept = 0;
    for (const g of groups) if (g.length >= floor) { kept++; for (const p of g) out[p] = 1; }
    return { mask: out, kept, largest };
  }

  // How many pixels a millimetre is, at this print width. Radius of a disk that wide.
  function pxPerMm(printWidthMm, width) { return width / Math.max(1, printWidthMm); }
  function radiusForMm(mm, printWidthMm, width) {
    const px = mm * pxPerMm(printWidthMm, width);
    return Math.max(0, (px - 1) / 2);
  }

  // Border colors are the background. Whatever is not connected to the border through those colors is the subject.
  function subjectMask(rgba, width, height) {
    const bins = 16, hist = new Uint32Array(bins * bins * bins);
    const border = Math.max(2, Math.round(Math.min(width, height) * 0.08));
    const at = (i) => ((rgba[i] >> 4) * bins + (rgba[i + 1] >> 4)) * bins + (rgba[i + 2] >> 4);
    let borderCount = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x >= border && y >= border && x < width - border && y < height - border) continue;
      const i = (y * width + x) * 4;
      if (rgba[i + 3] < 16) continue;
      hist[at(i)]++;
      borderCount++;
    }
    if (!borderCount) return null;
    const ranked = [];
    for (let i = 0; i < hist.length; i++) if (hist[i]) ranked.push(i);
    ranked.sort((a, b) => hist[b] - hist[a]);
    const keep = new Uint8Array(hist.length);
    let covered = 0;
    for (const bin of ranked) {
      keep[bin] = 1;
      covered += hist[bin];
      if (covered >= borderCount * 0.9) break;
    }
    const background = (p) => {
      const i = p * 4;
      return rgba[i + 3] < 16 || keep[at(i)] === 1;
    };
    const seen = new Uint8Array(width * height), stack = [];
    const push = (p) => { if (!seen[p] && background(p)) { seen[p] = 1; stack.push(p); } };
    for (let x = 0; x < width; x++) { push(x); push((height - 1) * width + x); }
    for (let y = 0; y < height; y++) { push(y * width); push(y * width + width - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % width;
      if (x > 0) push(p - 1);
      if (x + 1 < width) push(p + 1);
      if (p >= width) push(p - width);
      if (p + width < seen.length) push(p + width);
    }
    const mask = new Uint8Array(width * height);
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (!seen[i]) { mask[i] = 1; n++; }
    if (n < mask.length * 0.02 || n > mask.length * 0.98) return null;
    return close(open(mask, width, height, 1), width, height, 1);
  }

  function xdog(lum, width, height, sigma, strictness) {
    const s = strictness || 0;
    const fine = blur(lum, width, height, Math.max(0.6, sigma));
    const coarse = blur(lum, width, height, Math.max(0.8, sigma * (1.6 + s * 0.5)));
    const ink = new Uint8Array(lum.length);
    const tau = 0.98, epsilon = 0.004 + s * 0.008, phi = 32, cutoff = 0.82 - s * 0.12;
    for (let i = 0; i < lum.length; i++) {
      const dog = fine[i] - tau * coarse[i];
      const shaped = dog >= epsilon ? 1 : 1 + Math.tanh(phi * (dog - epsilon));
      ink[i] = shaped < cutoff ? 1 : 0;
    }
    return ink;
  }

  // Last resort: every pixel of the tone that covers the middle. Used when the region cut
  // cannot find an edge between the center and the frame.
  function centerSubject(lum, width, height, level) {
    const dark = new Uint8Array(lum.length), light = new Uint8Array(lum.length);
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const rad = Math.max(2, 0.16 * Math.min(width, height));
    const r2 = rad * rad;
    let darkW = 0, lightW = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const darkPx = lum[i] < level;
      if (darkPx) dark[i] = 1;
      else light[i] = 1;
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      if (darkPx) darkW++;
      else lightW++;
    }
    if (darkW === lightW) {
      const center = lum[Math.round(cy) * width + Math.round(cx)];
      return center < level ? dark : light;
    }
    return darkW > lightW ? dark : light;
  }

  // The subject is the region covering the middle. It grows from the center and
  // stops at edges before it reaches border colors that are not the center color,
  // so a bright sky does not stay raised just because the fur is also light.
  function centerRegion(rgba, width, height) {
    const n = width * height;
    const lum = luminanceOf(rgba, width, height);
    const soft = new Float32Array(n);
    const rad = 2;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let s = 0, c = 0;
      for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
        const xx = Math.min(width - 1, Math.max(0, x + dx));
        const yy = Math.min(height - 1, Math.max(0, y + dy));
        s += lum[yy * width + xx];
        c++;
      }
      soft[y * width + x] = s / c;
    }
    const mag = sobelMag(soft, width, height);
    const cx = (width - 1) / 2, cy = (height - 1) / 2;
    const disk = Math.max(2, 0.1 * Math.min(width, height)), r2 = disk * disk;
    let cr = 0, cg = 0, cb = 0, cn = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * width + x) * 4;
      cr += rgba[i]; cg += rgba[i + 1]; cb += rgba[i + 2]; cn++;
    }
    if (!cn) return centerSubject(lum, width, height, otsu(lum));
    cr /= cn; cg /= cn; cb /= cn;
    const dist = new Float32Array(n);
    dist.fill(1e9);
    const lab = new Uint8Array(n);
    const heap = [];
    function push(i, d, kind) {
      if (d >= dist[i]) return;
      dist[i] = d;
      lab[i] = kind;
      heap.push(i);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (dist[heap[p]] <= dist[heap[k]]) break;
        const t = heap[p]; heap[p] = heap[k]; heap[k] = t;
        k = p;
      }
    }
    function pop() {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let s = k;
          if (l < heap.length && dist[heap[l]] < dist[heap[s]]) s = l;
          if (r < heap.length && dist[heap[r]] < dist[heap[s]]) s = r;
          if (s === k) break;
          const t = heap[s]; heap[s] = heap[k]; heap[k] = t;
          k = s;
        }
      }
      return top;
    }
    push((cy | 0) * width + (cx | 0), 0, 1);
    const border = Math.max(1, (0.02 * Math.min(width, height)) | 0);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      if (x >= border && y >= border && x < width - border && y < height - border) continue;
      const i4 = (y * width + x) * 4;
      const d = Math.hypot(rgba[i4] - cr, rgba[i4 + 1] - cg, rgba[i4 + 2] - cb);
      if (d > 42) push(y * width + x, 0, 2);
    }
    let steps = 0;
    while (heap.length && steps++ < n * 12) {
      const p = pop();
      const x = p % width, y = (p - x) / width, kind = lab[p];
      const next = [x + 1, y, x - 1, y, x, y + 1, x, y - 1];
      for (let k = 0; k < 8; k += 2) {
        const nx = next[k], ny = next[k + 1];
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        const nd = dist[p] + 1 + mag[q] * 14;
        if (nd < dist[q]) push(q, nd, kind);
      }
    }
    const mask = new Uint8Array(n);
    let ink = 0;
    for (let i = 0; i < n; i++) if (lab[i] === 1) { mask[i] = 1; ink++; }
    if (ink < n * 0.02 || ink > n * 0.92) return centerSubject(lum, width, height, otsu(lum));
    return close(mask, width, height, 1);
  }

  // Dark compact marks inside the subject (eyes, nose, mouth). Marks that touch the
  // outside of the subject are the edge of the head, so they stay filled.
  function featureHoles(mask, lum, width, height, px) {
    const holes = new Uint8Array(mask.length);
    const vals = [];
    for (let i = 0; i < mask.length; i++) if (mask[i]) vals.push(lum[i]);
    if (vals.length < 16) return holes;
    vals.sort((a, b) => a - b);
    const med = vals[vals.length >> 1];
    const dark = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) if (mask[i] && lum[i] < med - 0.14) dark[i] = 1;
    const seen = new Uint8Array(mask.length);
    const minA = Math.max(4, Math.round(Math.pow(0.5 * px, 2)));
    const maxA = Math.max(minA + 1, Math.round(Math.pow(4.5 * px, 2)));
    const groups = [];
    for (let i = 0; i < dark.length; i++) {
      if (!dark[i] || seen[i]) continue;
      const stack = [i], pixels = [];
      let touches = false, minX = width, maxX = 0, minY = height, maxY = 0;
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        pixels.push(p);
        const x = p % width, y = (p - x) / width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        const look = (q, outside) => {
          if (outside || !mask[q]) touches = true;
          else if (dark[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        };
        look(p - 1, x === 0);
        look(p + 1, x + 1 === width);
        look(p - width, y === 0);
        look(p + width, y + 1 === height);
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      const compact = Math.max(bw, bh) <= Math.min(bw, bh) * 5;
      if (!touches && compact && pixels.length >= minA && pixels.length <= maxA) groups.push(pixels);
    }
    groups.sort((a, b) => b.length - a.length);
    for (const pixels of groups.slice(0, 6)) for (const p of pixels) holes[p] = 1;
    return holes;
  }

  // Grow from a tap. A neighbor joins when its color is close and the step is not an edge.
  function floodSubject(rgba, width, height, sx, sy) {
    const x0 = clamp(Math.round(sx), 0, width - 1);
    const y0 = clamp(Math.round(sy), 0, height - 1);
    const lum = luminanceOf(rgba, width, height);
    const mag = sobelMag(blur(lum, width, height, 0.8), width, height);
    const mask = new Uint8Array(width * height);
    const seen = new Uint8Array(width * height);
    const stack = [y0 * width + x0];
    seen[y0 * width + x0] = 1;
    const colorTol = 46;
    const edgeTol = 0.28;
    while (stack.length) {
      const p = stack.pop();
      mask[p] = 1;
      const x = p % width, y = (p - x) / width;
      const i = p * 4;
      for (let n = 0; n < 4; n++) {
        const nx = x + (n === 0 ? 1 : n === 1 ? -1 : 0);
        const ny = y + (n === 2 ? 1 : n === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (seen[q]) continue;
        const j = q * 4;
        const dr = rgba[j] - rgba[i], dg = rgba[j + 1] - rgba[i + 1], db = rgba[j + 2] - rgba[i + 2];
        if (Math.sqrt(dr * dr + dg * dg + db * db) > colorTol) continue;
        if (mag[q] > edgeTol && Math.abs(lum[q] - lum[p]) > 0.12) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    return mask;
  }

  function resampleMask(mask, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return Uint8Array.from(mask);
    const out = new Uint8Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / dh));
      for (let x = 0; x < dw; x++) {
        const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / dw));
        out[y * dw + x] = mask[sy * sw + sx] ? 1 : 0;
      }
    }
    return out;
  }

  function fitPlane(src, width, height, maxSide) {
    const long = Math.max(width, height);
    if (long <= maxSide) return { src: Float32Array.from(src), width, height };
    const scale = maxSide / long;
    const dw = Math.max(8, Math.round(width * scale));
    const dh = Math.max(8, Math.round(height * scale));
    const out = new Float32Array(dw * dh);
    const stepX = width / dw, stepY = height / dh;
    for (let y = 0; y < dh; y++) {
      const y0 = Math.min(height - 1, Math.floor(y * stepY));
      const y1 = Math.min(height - 1, Math.max(y0, Math.floor((y + 1) * stepY) - 1));
      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(width - 1, Math.floor(x * stepX));
        const x1 = Math.min(width - 1, Math.max(x0, Math.floor((x + 1) * stepX) - 1));
        let s = 0, n = 0;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) { s += src[yy * width + xx]; n++; }
        out[y * dw + x] = s / n;
      }
    }
    return { src: out, width: dw, height: dh };
  }

  function fitRGBA(rgba, width, height, dw, dh) {
    if (width === dw && height === dh) return rgba;
    const out = new Uint8ClampedArray(dw * dh * 4);
    const stepX = width / dw, stepY = height / dh;
    for (let y = 0; y < dh; y++) {
      const y0 = Math.min(height - 1, Math.floor(y * stepY));
      const y1 = Math.min(height - 1, Math.max(y0, Math.floor((y + 1) * stepY) - 1));
      for (let x = 0; x < dw; x++) {
        const x0 = Math.min(width - 1, Math.floor(x * stepX));
        const x1 = Math.min(width - 1, Math.max(x0, Math.floor((x + 1) * stepX) - 1));
        let r = 0, g = 0, b = 0, a = 0, n = 0;
        for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
          const i = (yy * width + xx) * 4;
          r += rgba[i]; g += rgba[i + 1]; b += rgba[i + 2]; a += rgba[i + 3]; n++;
        }
        const o = (y * dw + x) * 4;
        out[o] = r / n; out[o + 1] = g / n; out[o + 2] = b / n; out[o + 3] = a / n;
      }
    }
    return out;
  }

  function upsampleFloat(src, sw, sh, dw, dh) {
    if (sw === dw && sh === dh) return Float32Array.from(src);
    const out = new Float32Array(dw * dh);
    for (let y = 0; y < dh; y++) {
      const fy = (y + 0.5) * sh / dh - 0.5;
      const y0 = clamp(Math.floor(fy), 0, sh - 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const ty = clamp(fy - y0, 0, 1);
      for (let x = 0; x < dw; x++) {
        const fx = (x + 0.5) * sw / dw - 0.5;
        const x0 = clamp(Math.floor(fx), 0, sw - 1);
        const x1 = Math.min(sw - 1, x0 + 1);
        const tx = clamp(fx - x0, 0, 1);
        const v00 = src[y0 * sw + x0], v10 = src[y0 * sw + x1], v01 = src[y1 * sw + x0], v11 = src[y1 * sw + x1];
        out[y * dw + x] = (v00 * (1 - tx) + v10 * tx) * (1 - ty) + (v01 * (1 - tx) + v11 * tx) * ty;
      }
    }
    return out;
  }

  // Contrast inside small neighborhoods, so a face is not one flat gray.
  function clahe(src, width, height, grid, clipLimit) {
    const gx = grid || 8, gy = grid || 8, bins = 256;
    const maps = new Float32Array(gx * gy * bins);
    const tw = width / gx, th = height / gy;
    for (let ty = 0; ty < gy; ty++) for (let tx = 0; tx < gx; tx++) {
      const hist = new Uint32Array(bins);
      const x0 = Math.min(width - 1, Math.floor(tx * tw));
      const x1 = Math.min(width, Math.max(x0 + 1, Math.floor((tx + 1) * tw)));
      const y0 = Math.min(height - 1, Math.floor(ty * th));
      const y1 = Math.min(height, Math.max(y0 + 1, Math.floor((ty + 1) * th)));
      let count = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        hist[Math.round(clamp(src[y * width + x], 0, 1) * (bins - 1))]++;
        count++;
      }
      const limit = Math.max(1, Math.round((count / bins) * (clipLimit || 2.4)));
      let excess = 0;
      for (let i = 0; i < bins; i++) if (hist[i] > limit) { excess += hist[i] - limit; hist[i] = limit; }
      const add = Math.floor(excess / bins);
      let rem = excess - add * bins;
      for (let i = 0; i < bins; i++) hist[i] += add;
      for (let i = 0; rem > 0; i = (i + 1) % bins) { hist[i]++; rem--; }
      let acc = 0;
      const base = (ty * gx + tx) * bins;
      for (let i = 0; i < bins; i++) { acc += hist[i]; maps[base + i] = count ? acc / count : i / (bins - 1); }
    }
    const out = new Float32Array(src.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const fx = clamp(x / tw - 0.5, 0, gx - 1.001);
      const fy = clamp(y / th - 0.5, 0, gy - 1.001);
      const tx0 = Math.floor(fx), ty0 = Math.floor(fy);
      const tx1 = Math.min(gx - 1, tx0 + 1), ty1 = Math.min(gy - 1, ty0 + 1);
      const dx = fx - tx0, dy = fy - ty0;
      const b = Math.round(clamp(src[y * width + x], 0, 1) * (bins - 1));
      const m = (txi, tyi) => maps[(tyi * gx + txi) * bins + b];
      out[y * width + x] = m(tx0, ty0) * (1 - dx) * (1 - dy) + m(tx1, ty0) * dx * (1 - dy) + m(tx0, ty1) * (1 - dx) * dy + m(tx1, ty1) * dx * dy;
    }
    return out;
  }

  function sobelMag(src, width, height) {
    const out = new Float32Array(src.length);
    for (let y = 1; y < height - 1; y++) for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const a = src[i - width - 1], b = src[i - width], c = src[i - width + 1];
      const d = src[i - 1], e = src[i + 1];
      const f = src[i + width - 1], g = src[i + width], h = src[i + width + 1];
      const gx = -a + c - 2 * d + 2 * e - f + h;
      const gy = -a - 2 * b - c + f + 2 * g + h;
      out[i] = Math.hypot(gx, gy);
    }
    return out;
  }

  function maskPercentile(values, mask, p) {
    const sample = [];
    for (let i = 0; i < values.length; i++) if (mask[i]) sample.push(values[i]);
    if (!sample.length) return 0;
    sample.sort((a, b) => a - b);
    return sample[Math.min(sample.length - 1, Math.floor((sample.length - 1) * p))];
  }

  function hysteresis(mag, width, height, mask, high, low) {
    const strong = new Uint8Array(mag.length);
    const stack = [];
    for (let i = 0; i < mag.length; i++) if (mask[i] && mag[i] >= high) { strong[i] = 1; stack.push(i); }
    while (stack.length) {
      const p = stack.pop();
      const x = p % width, y = (p - x) / width;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
        const q = yy * width + xx;
        if (strong[q] || !mask[q] || mag[q] < low) continue;
        strong[q] = 1;
        stack.push(q);
      }
    }
    return strong;
  }

  // At 30 mm wide this is about 15 to 25 strokes. Wider prints can hold a few more.
  function strokeBudget(printWidthMm, detail) {
    const d = clamp(Number(detail) || 0, 0, 100) / 100;
    const mid = Math.max(1, printWidthMm) / 30 * 20;
    const scaled = mid * (0.75 + 0.45 * d);
    const cap = Math.max(1, printWidthMm) < 45 ? 25 : 36;
    return Math.round(clamp(scaled, 8, cap));
  }

  function fillSmallHoles(mask, width, height, maxArea) {
    const inv = new Uint8Array(mask.length);
    for (let i = 0; i < mask.length; i++) inv[i] = mask[i] ? 0 : 1;
    const seen = new Uint8Array(mask.length);
    const out = Uint8Array.from(mask);
    for (let i = 0; i < inv.length; i++) {
      if (!inv[i] || seen[i]) continue;
      const stack = [i], pixels = [];
      let touchesBorder = false;
      seen[i] = 1;
      while (stack.length) {
        const p = stack.pop();
        pixels.push(p);
        const x = p % width;
        if (x === 0 || x + 1 === width || p < width || p + width >= inv.length) touchesBorder = true;
        if (x > 0 && inv[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
        if (x + 1 < width && inv[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
        if (p >= width && inv[p - width] && !seen[p - width]) { seen[p - width] = 1; stack.push(p - width); }
        if (p + width < inv.length && inv[p + width] && !seen[p + width]) { seen[p + width] = 1; stack.push(p + width); }
      }
      if (!touchesBorder && pixels.length <= maxArea) for (const p of pixels) out[p] = 1;
    }
    return out;
  }

  function keepLongest(mask, mag, width, height, minLen, budget) {
    const seen = new Uint8Array(mask.length);
    const groups = [];
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || seen[i]) continue;
      const stack = [i], pixels = [];
      seen[i] = 1;
      let strength = 0;
      while (stack.length) {
        const p = stack.pop();
        pixels.push(p);
        strength += mag[p] || 0;
        const x = p % width;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const xx = x + dx, yy = (p - x) / width + dy;
          if (xx < 0 || yy < 0 || xx >= width || yy >= height) continue;
          const q = yy * width + xx;
          if (!mask[q] || seen[q]) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
      if (pixels.length >= minLen) groups.push({ pixels, score: pixels.length * (strength / pixels.length) });
    }
    groups.sort((a, b) => b.score - a.score);
    const out = new Uint8Array(mask.length);
    const kept = groups.slice(0, Math.max(0, budget));
    for (const g of kept) for (const p of g.pixels) out[p] = 1;
    return { mask: out, strokes: kept.length };
  }

  function separateTones(src, width, height, simplify, px) {
    const sigmaS = Math.max(1.1, (0.55 + simplify * 1.15) * Math.max(1, px));
    const sigmaR = 0.05 + simplify * 0.045;
    const cap = Math.min(8, Math.max(2, Math.ceil(sigmaS)));
    let out = bilateral(src, width, height, sigmaS, sigmaR, cap);
    out = bilateral(out, width, height, Math.max(1, sigmaS * 0.75), sigmaR, cap);
    return stretch(out, 0.04, 0.96);
  }

  function decodeSubject(options, width, height) {
    const raw = options && options.subjectMask;
    if (!raw || typeof raw.length !== 'number') return null;
    const sw = options.subjectWidth | 0, sh = options.subjectHeight | 0;
    if (sw < 2 || sh < 2 || raw.length !== sw * sh) return null;
    const mask = raw instanceof Uint8Array ? raw : Uint8Array.from(raw);
    return resampleMask(mask, sw, sh, width, height);
  }

  function resolveSubject(lum, rgba, width, height, options) {
    const given = decodeSubject(options, width, height);
    let mask = given;
    let how = given ? 'mask' : '';
    if (!mask && options && options.seed && Number.isFinite(options.seed.x) && Number.isFinite(options.seed.y)) {
      mask = floodSubject(rgba, width, height, options.seed.x, options.seed.y);
      how = 'seed';
    }
    if (!mask && options && options.focus) {
      mask = subjectMask(rgba, width, height);
      how = mask ? 'focus' : '';
    }
    if (!mask) {
      mask = centerRegion(rgba, width, height);
      how = 'center';
    }
    if (options && options.swap) {
      const flipped = new Uint8Array(mask.length);
      for (let i = 0; i < mask.length; i++) flipped[i] = mask[i] ? 0 : 1;
      mask = flipped;
    }
    return { mask, how, focusFailed: !!(options && options.focus) && how !== 'focus' && how !== 'mask' && how !== 'seed' };
  }

  function quantize3(lum) {
    const sample = [];
    const step = Math.max(1, Math.floor(lum.length / 8000));
    for (let i = 0; i < lum.length; i += step) sample.push(lum[i]);
    sample.sort((a, b) => a - b);
    const at = (q) => sample[Math.min(sample.length - 1, Math.floor(sample.length * q))];
    let means = [at(0.16), at(0.5), at(0.84)];
    for (let k = 1; k < 3; k++) if (means[k] < means[k - 1] + 0.04) means[k] = Math.min(1, means[k - 1] + 0.04);
    const labels = new Uint8Array(lum.length);
    for (let iter = 0; iter < 8; iter++) {
      const sum = [0, 0, 0], count = [0, 0, 0];
      for (let i = 0; i < lum.length; i++) {
        let best = 0, dist = Infinity;
        for (let k = 0; k < 3; k++) {
          const d = Math.abs(lum[i] - means[k]);
          if (d < dist) { dist = d; best = k; }
        }
        labels[i] = best;
        sum[best] += lum[i];
        count[best]++;
      }
      for (let k = 0; k < 3; k++) if (count[k]) means[k] = sum[k] / count[k];
    }
    const order = [0, 1, 2].sort((a, b) => means[a] - means[b]);
    const rank = [0, 0, 0];
    order.forEach((k, i) => { rank[k] = i; });
    const levels = new Uint8Array(lum.length);
    for (let i = 0; i < lum.length; i++) levels[i] = rank[labels[i]];
    return levels;
  }

  // Specks smaller than the nozzle are given to whichever neighbor level they touch most.
  function cleanLevels(levels, width, height, minArea) {
    const out = new Uint8Array(levels);
    for (let level = 0; level < 3; level++) {
      const mask = new Uint8Array(levels.length);
      for (let i = 0; i < levels.length; i++) mask[i] = levels[i] === level ? 1 : 0;
      const seen = new Uint8Array(levels.length);
      for (let i = 0; i < mask.length; i++) {
        if (!mask[i] || seen[i]) continue;
        const stack = [i], pixels = [];
        seen[i] = 1;
        while (stack.length) {
          const p = stack.pop();
          pixels.push(p);
          const x = p % width;
          if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack.push(p - 1); }
          if (x + 1 < width && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack.push(p + 1); }
          if (p >= width && mask[p - width] && !seen[p - width]) { seen[p - width] = 1; stack.push(p - width); }
          if (p + width < mask.length && mask[p + width] && !seen[p + width]) { seen[p + width] = 1; stack.push(p + width); }
        }
        if (pixels.length >= minArea) continue;
        const votes = [0, 0, 0];
        for (const p of pixels) {
          const x = p % width, y = (p - x) / width;
          const look = (q) => { if (q >= 0 && q < levels.length && levels[q] !== level) votes[levels[q]]++; };
          if (x > 0) look(p - 1);
          if (x + 1 < width) look(p + 1);
          if (y > 0) look(p - width);
          if (y + 1 < height) look(p + width);
        }
        let next = level === 0 ? 1 : level - 1, best = -1;
        for (let k = 0; k < 3; k++) if (votes[k] > best) { best = votes[k]; next = k; }
        if (!best) next = level === 0 ? 1 : level - 1;
        for (const p of pixels) out[p] = next;
      }
    }
    return out;
  }

  function paint(values, alpha, width, height) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < values.length; i++) {
      const a = alpha ? (alpha[i] ? 255 : 0) : 255;
      const v = a ? Math.round(clamp(values[i], 0, 1) * 255) : 0;
      rgba[i * 4] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = a;
    }
    return rgba;
  }

  function inkFromLevels(levels, on) {
    const mask = new Uint8Array(levels.length);
    for (let i = 0; i < levels.length; i++) mask[i] = on(levels[i]) ? 1 : 0;
    return mask;
  }

  function countEdges(lum, width, height) {
    let n = 0;
    for (let y = 0; y < height; y++) for (let x = 0; x < width - 1; x++) {
      if (Math.abs(lum[y * width + x] - lum[y * width + x + 1]) > 0.12) n++;
    }
    return n;
  }

  function warningFor(style, printWidthMm, printHeightMm, detail, lostNote, focusFailed) {
    const parts = [];
    const wide = Math.max(1, printWidthMm);
    if (focusFailed) parts.push('Focus on subject could not separate a subject. Crop so the background touches the edges, or turn Focus off.');
    if (wide < 20) parts.push('At ' + wide.toFixed(0) + ' mm wide a 0.4 mm nozzle can only hold a bold shape. Fine detail in this photo will not print.');
    else if (style === 'smooth' && wide < 50) parts.push('Smooth gray needs room. At ' + wide.toFixed(0) + ' mm wide a face turns soft. Bold silhouette or 3-level relief will be easier to recognize.');
    else if (style === 'lithophane' && wide < 40) parts.push('A lithophane this small (' + wide.toFixed(0) + ' mm) holds little of the photo. It reads when a larger flat plate is held up to the light.');
    else if ((style === 'line' || style === 'poster' || style === 'silhouette') && wide < 60) parts.push('At ' + wide.toFixed(0) + ' × ' + Math.max(1, printHeightMm).toFixed(0) + ' mm, anything thinner than 0.8 mm (two nozzle widths) is thickened or removed.');
    if (detail > 75 && wide < 70 && style !== 'smooth') parts.push('Detail is turned up, but this size cannot hold it. The result stays at the 0.8 mm minimum.');
    if (lostNote) parts.push(lostNote);
    return parts.join(' ');
  }

  function process(rgba, width, height, options) {
    if (!rgba || rgba.length !== width * height * 4 || width < 8 || height < 8) throw Error('Photo is too small to convert.');
    if (width * height > 4e6) throw Error('Photo is too large to convert. It will be scaled down first.');
    const style = options && options.style;
    if (STYLES.indexOf(style) === -1 || style === 'off') throw Error('Unknown photo style: ' + style);
    const detail = clamp(Number(options.detail) || 0, 0, 100);
    const requested = Number(options.lineMm);
    const lineMm = clamp(Number.isFinite(requested) ? requested : DEFAULTS.lineMm, MIN_FEATURE_MM, 3);
    const brightness = clamp(Number(options.brightness) || 0, -100, 100);
    const contrast = clamp(Number(options.contrast) || 0, -100, 100);
    const gamma = clamp(Number.isFinite(Number(options.gamma)) ? Number(options.gamma) : 1, 0.3, 3);
    const printWidthMm = Math.max(1, Number(options.printWidthMm) || 30);
    const printHeightMm = Math.max(1, Number(options.printHeightMm) || printWidthMm);
    const simplify = 1 - detail / 100;
    const adjusted = adjustRGBA(rgba, width, height, brightness, contrast, gamma);
    const px = pxPerMm(printWidthMm, width);
    const featureMm = lineMm;
    const radius = radiusForMm(featureMm, printWidthMm, width);
    const minArea = Math.max(4, Math.round(Math.pow(Math.max(1, featureMm * px), 2) * 0.35));
    const fittedMax = 360;
    let lum = luminanceOf(adjusted.rgba, width, height);
    const edgesBefore = countEdges(lum, width, height);
    const fitted = fitPlane(lum, width, height, fittedMax);
    const flat = separateTones(fitted.src, fitted.width, fitted.height, simplify, fitted.width / printWidthMm);
    const explicit = !!(options && (options.subjectMask || options.focus || (options.seed && Number.isFinite(Number(options.seed.x)) && Number.isFinite(Number(options.seed.y)))));
    let subject, subjectSmall, how, focusFailed;
    if (explicit) {
      const full = resolveSubject(lum, adjusted.rgba, width, height, options);
      subject = full.mask;
      how = full.how;
      focusFailed = full.focusFailed;
      subjectSmall = resampleMask(subject, width, height, fitted.width, fitted.height);
    } else {
      const color = fitRGBA(adjusted.rgba, width, height, fitted.width, fitted.height);
      const fit = resolveSubject(flat, color, fitted.width, fitted.height, options);
      subjectSmall = fit.mask;
      how = fit.how;
      focusFailed = false;
      subject = resampleMask(subjectSmall, fitted.width, fitted.height, width, height);
    }
    let values, alpha, lostNote = '', strokes = 0;

    if (style === 'silhouette') {
      // A 1 px open drops salt. A short close joins ears. Eyes stay open: they are punched after the close.
      let ink = open(subject, width, height, 1);
      const seal = Math.max(1, Math.round(Math.min(radius, 0.55 * px)));
      ink = close(ink, width, height, seal);
      const holes = featureHoles(ink, lum, width, height, px);
      for (let i = 0; i < ink.length; i++) if (holes[i]) ink[i] = 0;
      const kept = components(ink, width, height, minArea, 0.02);
      values = new Float32Array(kept.mask.length);
      for (let i = 0; i < kept.mask.length; i++) values[i] = kept.mask[i] ? 1 : 0;
      alpha = kept.mask;
    } else if (style === 'line') {
      const smallPx = fitted.width / printWidthMm;
      const fw = fitted.width, fh = fitted.height;
      const holeArea = Math.max(4, Math.round(Math.PI * Math.pow(0.7 * smallPx, 2)));
      subjectSmall = fillSmallHoles(subjectSmall, fw, fh, holeArea);
      const holes = featureHoles(subjectSmall, flat, fw, fh, smallPx);
      let covered = 0;
      for (let i = 0; i < subjectSmall.length; i++) if (subjectSmall[i]) covered++;
      const drawOutline = covered / subjectSmall.length < 0.8;
      const eroded = erode(subjectSmall, fw, fh, 1);
      const boundary = new Uint8Array(subjectSmall.length);
      if (drawOutline) {
        for (let y = 1; y < fh - 1; y++) for (let x = 1; x < fw - 1; x++) {
          const i = y * fw + x;
          if (subjectSmall[i] && !eroded[i]) boundary[i] = 1;
        }
      }
      const holeEdge = new Uint8Array(subjectSmall.length);
      const holeErode = erode(holes, fw, fh, 1);
      let holeMarks = 0;
      for (let i = 0; i < holes.length; i++) if (holes[i] && !holeErode[i]) { holeEdge[i] = 1; holeMarks++; }
      const inner = subjectSmall;
      const mag = sobelMag(flat, fw, fh);
      const high = Math.max(0.12, maskPercentile(mag, inner, 0.97));
      const low = high * 0.45;
      let edges = hysteresis(mag, fw, fh, inner, high, low);
      if (drawOutline) for (let i = 0; i < edges.length; i++) if (boundary[i]) edges[i] = 0;
      edges = close(edges, fw, fh, 1);
      const minLen = Math.max(8, Math.round(5 * smallPx));
      const budget = strokeBudget(printWidthMm, detail);
      const reserved = (drawOutline ? 1 : 0) + (holeMarks ? 1 : 0);
      const picked = keepLongest(edges, mag, fw, fh, minLen, Math.max(1, budget - reserved));
      let ink = new Uint8Array(boundary.length);
      for (let i = 0; i < ink.length; i++) ink[i] = picked.mask[i] || boundary[i] || holeEdge[i] ? 1 : 0;
      const gap = Math.max(1, Math.round(0.4 * smallPx));
      ink = close(ink, fw, fh, gap);
      const thick = Math.max(1, Math.ceil(radiusForMm(featureMm, printWidthMm, fw)));
      ink = dilate(ink, fw, fh, thick);
      ink = resampleMask(ink, fw, fh, width, height);
      const kept = components(ink, width, height, minArea, 0);
      strokes = picked.strokes + reserved;
      values = new Float32Array(kept.mask.length);
      for (let i = 0; i < kept.mask.length; i++) values[i] = kept.mask[i] ? 1 : 0;
      alpha = kept.mask;
    } else if (style === 'poster') {
      const tone = upsampleFloat(flat, fitted.width, fitted.height, width, height);
      const local = clahe(lum, width, height, 8, 2.4);
      for (let i = 0; i < tone.length; i++) tone[i] = clamp(tone[i] * 0.4 + local[i] * 0.6, 0, 1);
      const work = Float32Array.from(tone);
      let mid = 0, n = 0;
      for (let i = 0; i < subject.length; i++) if (subject[i]) { mid += tone[i]; n++; }
      mid = n ? mid / n : 0.5;
      for (let i = 0; i < subject.length; i++) if (!subject[i]) work[i] = mid;
      const levels = cleanLevels(quantize3(work), width, height, minArea);
      values = new Float32Array(levels.length);
      // The whole subject stays raised. Darker features (eyes, nose) sit on the lower steps.
      const step = [0.5, 0.75, 1];
      for (let i = 0; i < levels.length; i++) values[i] = subject[i] ? step[levels[i]] : 0;
      alpha = subject;
    } else if (style === 'smooth') {
      const local = clahe(lum, width, height, 8, 2.6);
      let tone = new Float32Array(lum.length);
      for (let i = 0; i < lum.length; i++) tone[i] = clamp(lum[i] * 0.35 + local[i] * 0.65, 0, 1);
      tone = blur(tone, width, height, Math.max(0.6, 0.4 * px));
      tone = stretch(tone, 0.03, 0.97);
      values = new Float32Array(tone.length);
      for (let i = 0; i < tone.length; i++) values[i] = subject[i] ? 0.22 + 0.78 * tone[i] : 0;
      alpha = null;
    } else if (style === 'lithophane') {
      // Bright parts of the photo become thin. Local contrast is lifted first so a face is not one thickness.
      const local = clahe(lum, width, height, 8, 2.8);
      let tone = new Float32Array(lum.length);
      for (let i = 0; i < lum.length; i++) tone[i] = clamp(lum[i] * 0.35 + local[i] * 0.65, 0, 1);
      tone = blur(tone, width, height, Math.max(0.5, 0.3 * px));
      tone = stretch(tone, 0.02, 0.98);
      values = new Float32Array(tone.length);
      for (let i = 0; i < tone.length; i++) {
        let t = tone[i];
        if (subject[i]) t = clamp((t - 0.5) * 1.35 + 0.5, 0, 1);
        values[i] = 1 - t;
      }
      alpha = null;
    } else {
      throw Error('Unknown photo style: ' + style);
    }

    const edgesAfter = countEdges(values, width, height);
    if (edgesBefore > 40 && edgesAfter < edgesBefore * 0.45 && printWidthMm < 80 && style === 'line') {
      const dropped = Math.round((1 - edgesAfter / edgesBefore) * 100);
      lostNote = 'About ' + dropped + '% of the fine edges are thinner than 0.8 mm at this size, so they are dropped.';
    }
    const warning = warningFor(style, printWidthMm, printHeightMm, detail, lostNote, focusFailed);
    const stats = {
      style, detail, lineMm, featureMm, radiusPx: radius, minFeatureMm: MIN_FEATURE_MM, nozzleMm: NOZZLE_MM,
      edgesBefore, edgesAfter, focus: !!(options && options.focus), focusFailed, printWidthMm, printHeightMm,
      subject: how, strokes, strokeBudget: style === 'line' ? strokeBudget(printWidthMm, detail) : 0,
    };
    return { rgba: paint(values, alpha, width, height), width, height, warning, stats };
  }

  return {
    NOZZLE_MM, MIN_FEATURE_MM, STYLES, TONE_STYLES, DEFAULTS, toneStyle,
    adjustChannel, adjustRGBA, blur, bilateral, otsu, dilate, erode, open, close, clahe,
    pxPerMm, radiusForMm, subjectMask, centerSubject, floodSubject, strokeBudget, process,
  };
})();
globalThis.PhotoRelief = PhotoRelief;

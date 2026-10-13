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
  const DEFAULTS = { style: 'off', detail: 40, lineMm: 1.2, brightness: 0, contrast: 0, gamma: 1, focus: false, aspect: 'free', crop: null };

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

  // How many mask pixels sit on the image border.
  function borderContact(mask, width, height) {
    let n = 0;
    for (let x = 0; x < width; x++) {
      if (mask[x]) n++;
      if (height > 1 && mask[(height - 1) * width + x]) n++;
    }
    for (let y = 1; y < height - 1; y++) {
      const row = y * width;
      if (mask[row]) n++;
      if (width > 1 && mask[row + width - 1]) n++;
    }
    return n;
  }

  // Subject is the tone that touches the border least: a light head on a dark field, or a dark head on a light one.
  function chooseSubject(lum, width, height, level) {
    const dark = new Uint8Array(lum.length), light = new Uint8Array(lum.length);
    for (let i = 0; i < lum.length; i++) {
      if (lum[i] < level) dark[i] = 1;
      else light[i] = 1;
    }
    const darkBorder = borderContact(dark, width, height);
    const lightBorder = borderContact(light, width, height);
    if (darkBorder !== lightBorder) return darkBorder < lightBorder ? dark : light;
    let darkN = 0, lightN = 0;
    for (let i = 0; i < lum.length; i++) { darkN += dark[i]; lightN += light[i]; }
    return darkN <= lightN ? dark : light;
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
    let focus = null, focusFailed = false;
    if (options.focus) {
      focus = subjectMask(adjusted.rgba, width, height);
      focusFailed = !focus;
    }
    const sigmaS = 0.7 + simplify * 3.2;
    const sigmaR = 0.05 + simplify * 0.16;
    let lum = luminanceOf(adjusted.rgba, width, height);
    if (style === 'silhouette') {
      // Flatten fur and skin first, then threshold. A wide range melts texture; the subject/background step stays.
      const flatS = 2.2 + simplify * 3.4;
      const flatR = 0.18 + simplify * 0.14;
      lum = bilateral(lum, width, height, flatS, flatR, 12);
      lum = bilateral(lum, width, height, Math.max(1.5, flatS * 0.75), flatR, 12);
      lum = stretch(lum, 0.04, 0.96);
    } else {
      lum = bilateral(lum, width, height, sigmaS, sigmaR);
      if (style !== 'lithophane') lum = stretch(lum, 0.02, 0.98);
    }
    const featureMm = lineMm;
    const radius = radiusForMm(featureMm, printWidthMm, width);
    const minArea = Math.max(4, Math.round(Math.pow(Math.max(1, featureMm * pxPerMm(printWidthMm, width)), 2) * 0.35));
    const edgesBefore = countEdges(lum, width, height);
    let values, alpha, lostNote = '';

    if (style === 'silhouette') {
      // A 1 px open drops salt. Closing joins ears to the head. Opening by the full line width
      // eats the head down to a couple of blobs, so that step is not used.
      let ink = focus ? Uint8Array.from(focus) : chooseSubject(lum, width, height, otsu(lum));
      ink = open(ink, width, height, 1);
      const seal = Math.max(1, Math.round(radius * 0.35));
      ink = close(ink, width, height, seal);
      const kept = components(ink, width, height, minArea, 0.02);
      values = new Float32Array(kept.mask.length);
      for (let i = 0; i < kept.mask.length; i++) values[i] = kept.mask[i] ? 1 : 0;
      alpha = kept.mask;
    } else if (style === 'line') {
      const sigma = 0.7 + simplify * 2.4;
      let ink = xdog(lum, width, height, sigma, simplify);
      if (focus) for (let i = 0; i < ink.length; i++) if (!focus[i]) ink[i] = 0;
      // Join one-pixel breaks first so a real stroke is one piece, then drop islands under the
      // minimum feature area before they get thickened into specks.
      ink = close(ink, width, height, 1);
      const featurePx = Math.max(1, featureMm * pxPerMm(printWidthMm, width));
      const island = Math.max(minArea, Math.round(featurePx * featurePx));
      let kept = components(ink, width, height, island, 0);
      const gap = Math.max(1, Math.ceil(radius * 0.65));
      ink = close(kept.mask, width, height, gap);
      ink = dilate(ink, width, height, Math.max(1, Math.ceil(radius)));
      kept = components(ink, width, height, minArea, 0);
      values = new Float32Array(kept.mask.length);
      for (let i = 0; i < kept.mask.length; i++) values[i] = kept.mask[i] ? 1 : 0;
      alpha = kept.mask;
    } else if (style === 'poster') {
      let work = lum;
      if (focus) {
        work = Float32Array.from(lum);
        let mid = 0, n = 0;
        for (let i = 0; i < focus.length; i++) if (focus[i]) { mid += lum[i]; n++; }
        mid = n ? mid / n : 0.5;
        for (let i = 0; i < focus.length; i++) if (!focus[i]) work[i] = mid;
      }
      const levels = cleanLevels(quantize3(work), width, height, minArea);
      values = new Float32Array(levels.length);
      const step = [0, 0.5, 1];
      for (let i = 0; i < levels.length; i++) values[i] = step[levels[i]];
      alpha = focus ? Uint8Array.from(focus) : null;
      if (focus) for (let i = 0; i < focus.length; i++) if (!focus[i]) values[i] = 0;
    } else if (style === 'smooth') {
      values = Float32Array.from(lum);
      alpha = focus ? Uint8Array.from(focus) : null;
      if (focus) for (let i = 0; i < focus.length; i++) if (!focus[i]) values[i] = 0;
    } else if (style === 'lithophane') {
      // Bright parts of the photo become thin. The preview stores thickness, so white still means "sticks out"
      // under the studio's usual "Light parts stick out" switch.
      values = new Float32Array(lum.length);
      for (let i = 0; i < lum.length; i++) values[i] = 1 - lum[i];
      alpha = focus ? Uint8Array.from(focus) : null;
      if (focus) for (let i = 0; i < focus.length; i++) if (!focus[i]) values[i] = 0;
    } else {
      throw Error('Unknown photo style: ' + style);
    }

    const edgesAfter = countEdges(values, width, height);
    if (edgesBefore > 40 && edgesAfter < edgesBefore * 0.45 && printWidthMm < 80) {
      const dropped = Math.round((1 - edgesAfter / edgesBefore) * 100);
      lostNote = 'About ' + dropped + '% of the fine edges are thinner than 0.8 mm at this size, so they are dropped.';
    }
    const warning = warningFor(style, printWidthMm, printHeightMm, detail, lostNote, focusFailed);
    const stats = {
      style, detail, lineMm, featureMm, radiusPx: radius, minFeatureMm: MIN_FEATURE_MM, nozzleMm: NOZZLE_MM,
      edgesBefore, edgesAfter, focus: !!focus, focusFailed, printWidthMm, printHeightMm,
    };
    return { rgba: paint(values, alpha, width, height), width, height, warning, stats };
  }

  return {
    NOZZLE_MM, MIN_FEATURE_MM, STYLES, TONE_STYLES, DEFAULTS, toneStyle,
    adjustChannel, adjustRGBA, blur, bilateral, otsu, dilate, erode, open, close,
    pxPerMm, radiusForMm, subjectMask, process,
  };
})();
globalThis.PhotoRelief = PhotoRelief;

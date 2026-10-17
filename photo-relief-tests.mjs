// Photo-to-sleeve pixel transforms: contrast, subject focus, each print style, and the 0.8 mm floor.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ctx = { console, Uint8Array, Uint8ClampedArray, Float32Array, Array, Math, Error, Number, Object, Promise };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('dist/photo-relief.js', 'utf8'), ctx);
const P = ctx.PhotoRelief;
const tests = [];
const test = (name, fn) => tests.push({ name, fn });

function solid(w, h, rgba, paint) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = paint ? paint(x, y) : rgba;
    data.set(c, (y * w + x) * 4);
  }
  return data;
}
function grayAt(rgba, i) { return rgba[i * 4]; }
function alphaAt(rgba, i) { return rgba[i * 4 + 3]; }
function inkRun(rgba, w, h, x) {
  let run = 0, best = 0;
  for (let y = 0; y < h; y++) {
    if (alphaAt(rgba, y * w + x) > 128 && grayAt(rgba, y * w + x) > 128) { run++; best = Math.max(best, run); }
    else run = 0;
  }
  return best;
}

test('brightness lifts a mid gray and contrast leaves middle gray alone', () => {
  assert.ok(P.adjustChannel(128, 40, 0, 1) > 0.6);
  assert.ok(Math.abs(P.adjustChannel(128, 0, 0, 1) - 0.5) < 0.02);
  // Contrast pivots on middle gray: the middle stays, the light end goes lighter and the dark end goes darker.
  assert.ok(Math.abs(P.adjustChannel(128, 0, 80, 1) - 0.5) < 0.02);
  assert.ok(P.adjustChannel(200, 0, 80, 1) > 0.95);
  assert.ok(P.adjustChannel(40, 0, 80, 1) < 0.05);
  assert.ok(P.adjustChannel(200, 0, 0, 2) < 200 / 255);
});

test('bilateral keeps a step sharper than the same gaussian blur', () => {
  const w = 48, h = 24, src = new Float32Array(w * h);
  for (let i = 0; i < src.length; i++) src[i] = (i % w) < w / 2 ? 0.1 : 0.9;
  const soft = P.blur(src, w, h, 2.2);
  const kept = P.bilateral(src, w, h, 2.2, 0.08);
  const slope = (a) => Math.abs(a[h / 2 * w + w / 2] - a[h / 2 * w + w / 2 - 1]);
  assert.ok(slope(kept) > slope(soft), 'bilateral ' + slope(kept) + ' blur ' + slope(soft));
});

test('Otsu splits a two-tone image', () => {
  const src = new Float32Array(400);
  for (let i = 0; i < 300; i++) src[i] = 0.15;
  for (let i = 300; i < 400; i++) src[i] = 0.85;
  const t = P.otsu(src);
  assert.ok(t > 0.3 && t < 0.7, String(t));
});

test('bold silhouette keeps a light subject on a dark field', () => {
  const w = 80, h = 80;
  const rgba = solid(w, h, [28, 32, 36, 255], (x, y) => {
    const dx = x - 40, dy = y - 36;
    if (dx * dx + dy * dy < 20 * 20) return [236, 228, 210, 255];
    if (x === 0 && y === 12) return [250, 250, 250, 255];
    return [28, 32, 36, 255];
  });
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 40, lineMm: 0.8, printWidthMm: 80, printHeightMm: 80 });
  assert.equal(alphaAt(out.rgba, 36 * w + 40), 255, 'light head stays');
  assert.equal(alphaAt(out.rgba, 12), 0, 'light border speck is dropped');
  assert.equal(alphaAt(out.rgba, 8 * w + 8), 0, 'dark field is background');
});

test('silhouette keeps the tone that covers the center, even when that tone touches the frame', () => {
  const w = 80, h = 80;
  const rgba = solid(w, h, [230, 224, 210, 255], (x, y) => {
    const sky = y < 18 && (x < 16 || x > 64);
    return sky ? [32, 36, 48, 255] : [230, 224, 210, 255];
  });
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 30, lineMm: 0.8, printWidthMm: 80, printHeightMm: 80 });
  assert.equal(alphaAt(out.rgba, 40 * w + 40), 255, 'light head covering the center stays');
  assert.equal(alphaAt(out.rgba, 4 * w + 4), 0, 'dark sky in the corner is background');
  assert.equal(out.stats.subject, 'center');
});

test('swap subject and background flips the silhouette', () => {
  const w = 64, h = 64;
  const rgba = solid(w, h, [30, 30, 34, 255], (x, y) => {
    const dx = x - 32, dy = y - 30;
    return dx * dx + dy * dy < 16 * 16 ? [230, 220, 200, 255] : [30, 30, 34, 255];
  });
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 40, lineMm: 0.8, swap: true, printWidthMm: 60, printHeightMm: 60 });
  assert.equal(alphaAt(out.rgba, 30 * w + 32), 0, 'the tapped-off head is background after a swap');
  assert.equal(alphaAt(out.rgba, 4 * w + 4), 255, 'the field around it is now the subject');
});

test('a tap floods the clicked color, not whatever sits in the center', () => {
  const w = 60, h = 40;
  const rgba = solid(w, h, [40, 90, 200, 255], (x) => (x < 30 ? [210, 60, 50, 255] : [40, 90, 200, 255]));
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 40, lineMm: 0.8, seed: { x: 8, y: 20 }, printWidthMm: 60, printHeightMm: 40 });
  assert.equal(out.stats.subject, 'seed');
  assert.equal(alphaAt(out.rgba, 20 * w + 8), 255, 'clicked red side is the subject');
  assert.equal(alphaAt(out.rgba, 20 * w + 50), 0, 'blue side is background');
});

test('line art at sleeve width stays inside the stroke budget', () => {
  const w = 90, h = 60;
  const rgba = solid(w, h, [245, 240, 230, 255], (x, y) => {
    const dx = x - 46, dy = y - 30;
    const head = dx * dx + dy * dy < 18 * 18;
    const eye = (x - 40) * (x - 40) + (y - 26) * (y - 26) < 3 * 3;
    const noise = ((x * 13 + y * 7) % 11) === 0;
    if (eye) return [20, 20, 20, 255];
    if (head) return noise ? [180, 160, 140, 255] : [210, 190, 170, 255];
    return [245, 240, 230, 255];
  });
  const out = P.process(rgba, w, h, { style: 'line', detail: 40, lineMm: 0.8, printWidthMm: 30, printHeightMm: 20 });
  assert.ok(out.stats.strokeBudget >= 15 && out.stats.strokeBudget <= 25, 'budget ' + out.stats.strokeBudget);
  assert.ok(out.stats.strokes <= out.stats.strokeBudget + 1, 'strokes ' + out.stats.strokes);
  assert.equal(alphaAt(out.rgba, 2 * w + 2), 0, 'the corner stays empty');
});

test('smooth relief lifts a dark feature out of a flat neighborhood', () => {
  const w = 48, h = 48;
  const rgba = solid(w, h, [180, 180, 180, 255], (x, y) => {
    const dx = x - 24, dy = y - 24;
    return dx * dx + dy * dy < 5 * 5 ? [40, 40, 40, 255] : [180, 176, 170, 255];
  });
  const out = P.process(rgba, w, h, { style: 'smooth', detail: 50, lineMm: 0.8, printWidthMm: 80, printHeightMm: 80 });
  const spot = grayAt(out.rgba, 24 * w + 24);
  const skin = grayAt(out.rgba, 24 * w + 8);
  assert.ok(Math.abs(spot - skin) > 25, 'local contrast ' + spot + ' vs ' + skin);
});

test('bold silhouette drops specks and keeps the subject', () => {
  const w = 80, h = 80;
  const rgba = solid(w, h, [240, 240, 240, 255], (x, y) => {
    const dx = x - 40, dy = y - 40;
    if (dx * dx + dy * dy < 18 * 18) return [20, 20, 20, 255];
    if ((x === 4 && y === 4) || (x === 70 && y === 8)) return [0, 0, 0, 255];
    return [240, 240, 240, 255];
  });
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 40, lineMm: 0.8, printWidthMm: 40, printHeightMm: 40 });
  assert.equal(alphaAt(out.rgba, 40 * w + 40), 255);
  assert.equal(alphaAt(out.rgba, 4 * w + 4), 0);
  assert.equal(out.stats.lineMm, 0.8);
  assert.ok(out.warning, 'small print warns: ' + out.warning);
});

test('shadow raises nothing until a subject is chosen', () => {
  const w = 32, h = 32;
  const rgba = solid(w, h, [10, 10, 10, 255], (x, y) => (x > 8 && x < 24 && y > 8 && y < 24) ? [240, 240, 240, 255] : [10, 10, 10, 255]);
  const out = P.process(rgba, w, h, { style: 'shadow', detail: 40, lineMm: 0.8, printWidthMm: 32, printHeightMm: 32 });
  let ink = 0;
  for (let i = 0; i < w * h; i++) if (alphaAt(out.rgba, i) > 128) ink++;
  assert.equal(ink, 0);
  assert.match(out.warning, /Tap the subject/);
  assert.equal(out.stats.subject, 'none');
});

test('shadow keeps one solid shape and thickens only the thin parts', () => {
  const w = 160, h = 80;
  const mask = new Uint8Array(w * h);
  const set = (x, y) => { mask[y * w + x] = 1; };
  for (let y = 16; y <= 55; y++) for (let x = 20; x <= 99; x++) set(x, y);
  for (let y = 28; y <= 42; y++) for (let x = 40; x <= 55; x++) mask[y * w + x] = 0;
  for (let y = 56; y <= 76; y++) set(37, y);
  for (let y = 56; y <= 76; y++) set(72, y);
  for (let y = 24; y <= 39; y++) for (let x = 104; x <= 119; x++) set(x, y);
  for (let y = 4; y <= 6; y++) for (let x = 150; x <= 152; x++) set(x, y);
  const rgba = solid(w, h, [0, 0, 0, 255]);
  const out = P.process(rgba, w, h, {
    style: 'shadow', detail: 40, lineMm: 0.8, printWidthMm: 32, printHeightMm: 16,
    subjectMask: mask, subjectWidth: w, subjectHeight: h,
  });
  const on = (x, y) => alphaAt(out.rgba, y * w + x) > 128 && grayAt(out.rgba, y * w + x) > 200;
  assert.ok(on(48, 35), 'interior hole is filled');
  assert.equal(on(151, 5), false, 'distant speck is dropped');
  assert.ok(on(110, 30), 'large nearby part is kept');
  let x0 = -1, x1 = -1;
  for (let x = 20; x < 60; x++) if (on(x, 68)) { if (x0 < 0) x0 = x; x1 = x; }
  const legW = x1 - x0 + 1;
  assert.ok(legW >= 4, 'thin leg is at least 0.8 mm (' + legW + ' px)');
  let gap = false;
  for (let x = x1 + 1; x < 90; x++) if (!on(x, 68)) gap = true;
  assert.ok(gap, 'the two legs do not merge');
  let top = h;
  for (let y = 0; y < 40; y++) if (on(50, y)) { top = y; break; }
  assert.ok(top >= 13, 'the thick body is not grown into a blob (top row ' + top + ')');
  let mid = 0;
  for (let i = 0; i < w * h; i++) {
    const a = alphaAt(out.rgba, i), g = grayAt(out.rgba, i);
    if ((a > 8 && a < 247) || (a > 128 && g > 8 && g < 247)) mid++;
  }
  assert.equal(mid, 0);
});

test('shadow cut-out is a hole of the subject', () => {
  const w = 64, h = 48;
  const mask = new Uint8Array(w * h);
  for (let y = 12; y <= 36; y++) for (let x = 16; x <= 48; x++) mask[y * w + x] = 1;
  const rgba = solid(w, h, [0, 0, 0, 255]);
  const out = P.process(rgba, w, h, {
    style: 'shadow', detail: 40, lineMm: 0.8, inverse: true, printWidthMm: 64, printHeightMm: 48,
    subjectMask: mask, subjectWidth: w, subjectHeight: h,
  });
  assert.equal(alphaAt(out.rgba, 24 * w + 32), 0);
  assert.equal(alphaAt(out.rgba, 2 * w + 2), 255);
  assert.ok(grayAt(out.rgba, 2 * w + 2) > 200);
});

test('line art thickens a hairline to the nozzle floor', () => {
  const w = 80, h = 40;
  const rgba = solid(w, h, [250, 250, 250, 255], (x, y) => y === 20 ? [0, 0, 0, 255] : [250, 250, 250, 255]);
  const out = P.process(rgba, w, h, { style: 'line', detail: 80, lineMm: 0.2, printWidthMm: 40, printHeightMm: 20 });
  assert.equal(out.stats.lineMm, 0.8, 'thinner than 0.8 mm is clamped');
  const thick = inkRun(out.rgba, w, h, 40);
  const need = 0.8 * (w / 40);
  assert.ok(thick + 0.51 >= need, 'run ' + thick + ' px, need about ' + need);
});

test('line art drops an island and closes a gap', () => {
  const w = 200, h = 80;
  const rgba = solid(w, h, [250, 250, 250, 255], (x, y) => {
    const onLine = y >= 38 && y <= 42 && (x < 96 || x > 98);
    const speck = x === 8 && y === 6;
    if (onLine || speck) return [0, 0, 0, 255];
    return [250, 250, 250, 255];
  });
  const out = P.process(rgba, w, h, { style: 'line', detail: 50, lineMm: 0.8, printWidthMm: 40, printHeightMm: 16 });
  let gapInk = 0;
  for (let y = 0; y < h; y++) if (alphaAt(out.rgba, y * w + 97) > 128 && grayAt(out.rgba, y * w + 97) > 128) gapInk++;
  assert.ok(gapInk >= 2, 'gap in the stroke is closed (' + gapInk + ' px)');
  assert.equal(alphaAt(out.rgba, 6 * w + 8), 0, 'isolated speck is removed');
});

test('posterized relief uses three levels', () => {
  const w = 60, h = 40;
  const rgba = solid(w, h, [20, 90, 40, 255], (x, y) => {
    const dx = x - 30, dy = y - 20;
    if (dx * dx + dy * dy > 16 * 16) return [8, 8, 10, 255];
    const v = Math.round(100 + ((x - 14) / 32) * 140);
    return [v, v, v, 255];
  });
  const out = P.process(rgba, w, h, { style: 'poster', detail: 70, lineMm: 0.8, printWidthMm: 90, printHeightMm: 60 });
  const levels = new Set();
  for (let i = 0; i < w * h; i++) if (alphaAt(out.rgba, i) > 200) levels.add(grayAt(out.rgba, i));
  assert.ok(levels.size >= 2 && levels.size <= 3, [...levels].join(','));
  assert.equal(alphaAt(out.rgba, 0), 0, 'border stays down');
  let left = -1, right = -1;
  for (let x = 0; x < w; x++) if (alphaAt(out.rgba, 20 * w + x) > 200) { if (left < 0) left = x; right = x; }
  const lo = grayAt(out.rgba, 20 * w + left), hi = grayAt(out.rgba, 20 * w + right);
  assert.ok(right > left && hi > lo, 'poster steps rise across the subject (' + lo + ' at ' + left + ' → ' + hi + ' at ' + right + ')');
});

test('smooth relief keeps mid grays', () => {
  const w = 32, h = 32;
  const rgba = solid(w, h, [0, 0, 0, 255], (x) => {
    const v = Math.round(x / (w - 1) * 255);
    return [v, v, v, 255];
  });
  const out = P.process(rgba, w, h, { style: 'smooth', detail: 80, lineMm: 0.8, printWidthMm: 80, printHeightMm: 80 });
  const grays = new Set();
  for (let i = 0; i < w * h; i++) grays.add(grayAt(out.rgba, i));
  assert.ok(grays.size >= 6, 'levels ' + grays.size);
});

test('lithophane makes bright pixels thinner than dark ones', () => {
  const w = 24, h = 16;
  const rgba = solid(w, h, [0, 0, 0, 255], (x) => x < 12 ? [250, 250, 250, 255] : [15, 15, 15, 255]);
  const out = P.process(rgba, w, h, { style: 'lithophane', detail: 50, lineMm: 0.8, brightness: 0, contrast: 0, gamma: 1, printWidthMm: 80, printHeightMm: 50 });
  assert.ok(grayAt(out.rgba, 8) < grayAt(out.rgba, 20), grayAt(out.rgba, 8) + ' vs ' + grayAt(out.rgba, 20));
});

test('focus on subject clears a border background and keeps the center', () => {
  const w = 64, h = 64;
  const rgba = solid(w, h, [40, 90, 200, 255], (x, y) => {
    const dx = x - 32, dy = y - 32;
    return dx * dx + dy * dy < 14 * 14 ? [210, 60, 50, 255] : [40, 90, 200, 255];
  });
  const out = P.process(rgba, w, h, { style: 'silhouette', detail: 50, lineMm: 0.8, focus: true, printWidthMm: 60, printHeightMm: 60 });
  assert.equal(out.stats.focus, true);
  assert.equal(alphaAt(out.rgba, 0), 0);
  assert.equal(alphaAt(out.rgba, 32 * w + 32), 255);
});

test('the same photo converts to the same pixels twice', () => {
  const rgba = solid(40, 30, [10, 10, 10, 255], (x, y) => [(x * 5) % 255, (y * 8) % 255, 80, 255]);
  const opts = { style: 'poster', detail: 30, lineMm: 1.2, printWidthMm: 36, printHeightMm: 28, contrast: 10 };
  const a = P.process(rgba, 40, 30, opts), b = P.process(rgba, 40, 30, opts);
  assert.deepEqual(a.rgba, b.rgba);
});

test('unknown style and a tiny image are refused', () => {
  const rgba = solid(16, 16, [1, 2, 3, 255]);
  assert.throws(() => P.process(rgba, 16, 16, { style: 'watercolor' }), /Unknown photo style/);
  assert.throws(() => P.process(new Uint8ClampedArray(16), 2, 2, { style: 'line' }), /too small/);
});

test('a flat plate lithophane warning names the size', () => {
  const rgba = solid(32, 32, [100, 100, 100, 255], (x, y) => [x * 8, y * 8, 40, 255]);
  const out = P.process(rgba, 32, 32, { style: 'lithophane', detail: 20, lineMm: 0.8, printWidthMm: 18, printHeightMm: 18 });
  assert.match(out.warning, /18 mm/);
});

const heicCtx = { console, Uint8Array, Uint8ClampedArray, Promise, Error, String, Math, setTimeout, clearTimeout };
heicCtx.globalThis = heicCtx;
vm.createContext(heicCtx);
vm.runInContext(fs.readFileSync('dist/heic.js', 'utf8'), heicCtx);
test('HEIC brand detection', () => {
  const bytes = new Uint8Array(32);
  bytes.set([0, 0, 0, 28], 0);
  bytes.set([...'ftyp'].map((c) => c.charCodeAt(0)), 4);
  bytes.set([...'heic'].map((c) => c.charCodeAt(0)), 8);
  assert.equal(heicCtx.Heic.isHeicBytes(bytes), true);
  assert.equal(heicCtx.Heic.isHeicBytes(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])), false);
  const file = fs.readFileSync('test-fixtures/tiny.heic');
  assert.equal(heicCtx.Heic.isHeicBytes(file), true);
});

test('vendored libheif decodes the tiny HEIC fixture', async () => {
  const factory = require('./dist/vendor/libheif/libheif.js');
  let mod;
  mod = factory({});
  assert.equal(mod.calledRun, true);
  const images = new mod.HeifDecoder().decode(new Uint8Array(fs.readFileSync('test-fixtures/tiny.heic')));
  assert.equal(images.length, 1);
  assert.equal(images[0].get_width(), 32);
  assert.equal(images[0].get_height(), 24);
  const rgba = new Uint8ClampedArray(32 * 24 * 4);
  await new Promise((resolve) => images[0].display({ data: rgba, width: 32, height: 24 }, resolve));
  // Center of the fixture is the yellow rectangle (about 220, 180, 40).
  const p = (12 * 32 + 16) * 4;
  assert.ok(rgba[p] > 160 && rgba[p + 1] > 120 && rgba[p + 2] < 90, rgba[p] + ',' + rgba[p + 1] + ',' + rgba[p + 2]);
  assert.ok(rgba[3] > 200);
});

vm.runInContext(fs.readFileSync('dist/project-format.js', 'utf8'), ctx);
const baseSettings = { designAngle: 0, designY: 44.5, designWidth: 30, designHeight: 30, designRotation: 0, bgR: 255, bgG: 255, bgB: 255, bgTol: 40, smoothPasses: 0, letterSpacing: 0, letterThickness: 0, bgEnable: true, bgSoft: false, mirror: false, invert: true, depthMm: 0.4, relief: 'raised', uniformDepth: true, crisp: true, text: '' };
function project(extra) {
  return {
    format: 'icaviot-project', version: 4, name: 'Photo', source: 'labrador.jpg', settings: { mode: 'sleeve', templateId: 'etsyfolger-v1' }, image: null,
    activeSide: 0, linkSides: false, selectedIds: ['layer-1', null], template: null,
    layers: [[{ id: 'layer-1', kind: 'image', image: 'data:image/png;base64,AAAA', source: 'labrador.jpg', fontChoice: 'system', settings: { ...baseSettings }, ...extra }], []],
  };
}
test('a project without photo settings still opens', () => {
  const decoded = ctx.ProjectFormat.decode(JSON.stringify(project({})));
  assert.equal(decoded.layers[0][0].photo, undefined);
});
test('photo settings and the original PNG round-trip', () => {
  const photo = { style: 'poster', detail: 25, lineMm: 1.4, brightness: -10, contrast: 15, gamma: 1.2, focus: true, aspect: 'portrait', crop: { x: 0.1, y: 0.2, w: 0.5, h: 0.6 } };
  const decoded = ctx.ProjectFormat.decode(JSON.stringify(project({ photo, photoSource: 'data:image/png;base64,BBBB' })));
  assert.equal(decoded.layers[0][0].photo.style, 'poster');
  assert.equal(decoded.layers[0][0].photo.lineMm, 1.4);
  assert.equal(decoded.layers[0][0].photo.focus, true);
  assert.equal(decoded.layers[0][0].photo.crop.w, 0.5);
  assert.equal(decoded.layers[0][0].photoSource, 'data:image/png;base64,BBBB');
});
test('a photo line thinner than 0.8 mm is clamped when the project opens', () => {
  const decoded = ctx.ProjectFormat.decode(JSON.stringify(project({ photo: { style: 'line', lineMm: 0.2, detail: 10, brightness: 0, contrast: 0, gamma: 1, focus: false, aspect: 'free' } })));
  assert.equal(decoded.layers[0][0].photo.lineMm, 0.8);
});
test('a subject tap and a swap round-trip, and a bad tap is refused', () => {
  const photo = { style: 'line', detail: 40, lineMm: 0.8, brightness: 0, contrast: 0, gamma: 1, focus: false, aspect: 'free', swap: true, seed: { x: 0.25, y: 0.5 } };
  const decoded = ctx.ProjectFormat.decode(JSON.stringify(project({ photo })));
  assert.equal(decoded.layers[0][0].photo.swap, true);
  assert.equal(decoded.layers[0][0].photo.seed.x, 0.25);
  assert.throws(() => ctx.ProjectFormat.decode(JSON.stringify(project({ photo: { style: 'line', seed: { x: 2, y: 0 } } }))), /subject/);
});
test('a bad photo style is refused', () => {
  assert.throws(() => ctx.ProjectFormat.decode(JSON.stringify(project({ photo: { style: 'magic' } }))), /photo style/);
});
test('shadow settings and cut-out round-trip', () => {
  const photo = { style: 'shadow', detail: 40, lineMm: 0.8, brightness: 0, contrast: 0, gamma: 1, focus: false, aspect: 'free', inverse: true };
  const decoded = ctx.ProjectFormat.decode(JSON.stringify(project({ photo })));
  assert.equal(decoded.layers[0][0].photo.style, 'shadow');
  assert.equal(decoded.layers[0][0].photo.inverse, true);
  const plain = ctx.ProjectFormat.decode(JSON.stringify(project({ photo: { style: 'shadow', detail: 40, lineMm: 1.2, brightness: 0, contrast: 0, gamma: 1, focus: false, aspect: 'free' } })));
  assert.equal(plain.layers[0][0].photo.inverse, undefined);
});

let count = 0;
for (const item of tests) {
  await item.fn();
  count++;
  console.log('PASS ' + item.name);
}
console.log(count + ' photo checks passed');

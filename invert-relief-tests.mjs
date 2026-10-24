// "Invert relief" on the sleeve: the design sinks and a raised pad that hugs its outline takes its place.
// Removed background never becomes a full-size square, default (off) heightmaps are unchanged, and the
// switch survives a project save/load.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import './dist/project-format.js';

const core = { window: {}, console };
vm.createContext(core);
vm.runInContext(fs.readFileSync('dist/mesh-core.js', 'utf8'), core);
const mc = core.window.MeshCore;

const src = fs.readFileSync('dist/image-pipeline.js', 'utf8');
const fns = src.slice(src.indexOf('function applyBgRemoval'), src.indexOf('// ---------- Three.js preview'));
let sleeve = true;
// A minimal canvas: drawImage copies the image's RGBA bytes (same size), getImageData returns them.
const ctx = {
  AppState: {},
  console,
  updateBgSwatch() {},
  templateActive: () => sleeve,
  document: {
    createElement() {
      let data;
      return {
        getContext() {
          return {
            drawImage(img) {
              data = new Uint8ClampedArray(img.data || img.getContext('2d').getImageData().data);
            },
            getImageData() {
              return { data };
            },
            putImageData(d) {
              data = d.data;
            },
            createImageData(w, h) {
              return { data: new Uint8ClampedArray(w * h * 4) };
            },
            save() {},
            restore() {},
            translate() {},
            scale() {},
          };
        },
      };
    },
  },
};
vm.createContext(ctx);
vm.runInContext(
  fns + ';this.squaredDistanceToSet=squaredDistanceToSet;this.invertReliefMap=invertReliefMap;this.buildHeightmapAtDetail=buildHeightmapAtDetail;',
  ctx
);

let count = 0;
const test = (name, fn) => {
  fn();
  count++;
  console.log('PASS ' + name);
};
const at = (a, cols, x, y) => a[y * cols + x];

test('exact distance transform matches brute force', () => {
  const rows = 23,
    cols = 31,
    set = new Uint8Array(rows * cols);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let p = 0; p < set.length; p++) set[p] = rnd() < 0.04 ? 1 : 0;
  const d = ctx.squaredDistanceToSet(set, rows, cols);
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < cols; j++) {
      let best = Infinity;
      for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) if (set[y * cols + x]) best = Math.min(best, (y - i) ** 2 + (x - j) ** 2);
      assert.equal(d[i * cols + j], best);
    }
  assert(ctx.squaredDistanceToSet(new Uint8Array(12), 3, 4).every((v) => v === Infinity));
});

// 80x80 square outline (20..59, 3 px thick) on a transparent background, as background removal leaves it.
const N = 80;
const ring = new Float32Array(N * N);
for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const inOuter = x >= 20 && x <= 59 && y >= 20 && y <= 59,
      inInner = x >= 23 && x <= 56 && y >= 23 && y <= 56;
    ring[y * N + x] = inOuter && !inInner ? 1 : 0;
  }

test('the outline sinks, its inside fills, and the pad hugs the outline (no full-size square)', () => {
  const out = ctx.invertReliefMap(ring, N, N);
  assert.equal(at(out, N, 21, 21), 0, 'the old raised outline is now low');
  assert.equal(at(out, N, 40, 40), 1, 'the enclosed area is raised');
  assert.equal(at(out, N, 40, 21), 0);
  assert.equal(at(out, N, 19, 40), 1, 'a small margin is raised around the outline');
  assert.equal(at(out, N, 2, 2), 0, 'far background stays flat');
  assert.equal(at(out, N, 77, 40), 0);
  const raised = out.reduce((s, v) => s + (v > 0.5), 0);
  assert(raised < N * N * 0.4, 'pad is far smaller than the picture: ' + raised);
});

test('nearby parts are bridged into one pad, holes are filled', () => {
  const rows = 60,
    cols = 120,
    hm = new Float32Array(rows * cols);
  // Two letters "I I" 4 px apart and a letter "O" with a hole.
  for (let y = 15; y < 45; y++) {
    for (let x = 10; x < 18; x++) hm[y * cols + x] = 1;
    for (let x = 22; x < 30; x++) hm[y * cols + x] = 1;
    for (let x = 60; x < 100; x++) if (!(x >= 68 && x < 92 && y >= 23 && y < 37)) hm[y * cols + x] = 1;
  }
  const out = ctx.invertReliefMap(hm, rows, cols);
  assert.equal(at(out, cols, 20, 30), 1, 'gap between the I letters is raised');
  assert.equal(at(out, cols, 80, 30), 1, 'hole of the O is raised');
  assert.equal(at(out, cols, 12, 30), 0);
  assert.equal(at(out, cols, 115, 5), 0);
});

test('nothing to invert, or no background removed, leaves the design alone', () => {
  assert.equal(ctx.invertReliefMap(new Float32Array(400), 20, 20), null);
  assert.equal(ctx.invertReliefMap(new Float32Array(400).fill(1), 20, 20), null);
});

test('inverted sleeve design builds a watertight mesh', () => {
  const hm = ctx.invertReliefMap(ring, N, N);
  for (const negative of [false, true]) {
    const m = mc.buildMesh({
      heightmap: hm,
      rows: N,
      cols: N,
      maxHeight: 0.6,
      innerWidth: 25.5,
      innerDepth: 15.2,
      wall: 2.4,
      sleeveHeight: 40,
      width: 40,
      base: 1,
      mode: 'sleeve',
      negative,
      wrapAngle: 360,
    });
    const v = mc.validateMesh(m.positions, m.indices);
    assert.equal(v.boundary + v.nonManifold + v.zeroArea, 0);
  }
});

// Full pipeline on a 64x64 black badge on white, background removal on, sleeve, sharp outlines.
const W = 64,
  img = { width: W, height: W, data: new Uint8ClampedArray(W * W * 4) };
for (let y = 0; y < W; y++)
  for (let x = 0; x < W; x++) {
    const ink = x >= 16 && x < 48 && y >= 20 && y < 44 && !(x >= 26 && x < 38 && y >= 28 && y < 36);
    const v = ink ? 10 : 250;
    img.data.set([v, v, v, 255], (y * W + x) * 4);
  }
const state = {
  image: img,
  mode: 'sleeve',
  invert: true,
  crisp: true,
  uniformDepth: true,
  smoothPasses: 0,
  bgEnable: true,
  bgR: 255,
  bgG: 255,
  bgB: 255,
  bgTol: 40,
  bgSoft: false,
  mirror: false,
  silhouette: true,
  logoSizePct: 100,
};

test('switch off: heightmap is exactly the artwork (existing designs and exports unchanged)', () => {
  const a = ctx.buildHeightmapAtDetail(W, img, state),
    b = ctx.buildHeightmapAtDetail(W, img, { ...state, reliefInvert: false });
  assert.deepEqual(Array.from(a.hm), Array.from(b.hm));
  assert.equal(at(a.hm, W, 20, 22), 1);
  assert.equal(at(a.hm, W, 2, 2), 0);
  assert.equal(b.reliefInverted, false);
});

test('switch on: the badge sinks into a pad, the background stays flat', () => {
  const on = ctx.buildHeightmapAtDetail(W, img, { ...state, reliefInvert: true });
  assert.equal(on.reliefInverted, true);
  assert.equal(at(on.hm, W, 20, 22), 0, 'badge is low');
  assert.equal(at(on.hm, W, 32, 32), 1, 'the hole in the badge is raised');
  assert.equal(at(on.hm, W, 15, 32), 1, 'margin just outside the badge is raised');
  assert.equal(at(on.hm, W, 1, 1), 0, 'corners of the picture stay flat (no square)');
});

test('switch on with background removal off does not invert the whole picture', () => {
  const on = ctx.buildHeightmapAtDetail(W, img, { ...state, bgEnable: false, reliefInvert: true });
  assert.equal(on.reliefInverted, false);
});

test('switch is ignored off the sleeve (flat plates use the light/dark swap)', () => {
  sleeve = false;
  try {
    const a = ctx.buildHeightmapAtDetail(W, img, { ...state, mode: 'flat' });
    const b = ctx.buildHeightmapAtDetail(W, img, { ...state, mode: 'flat', reliefInvert: true });
    assert.deepEqual(Array.from(a.hm), Array.from(b.hm));
  } finally {
    sleeve = true;
  }
});

const settings = {
  designAngle: 0,
  designY: 44.5,
  designWidth: 30,
  designHeight: 20,
  designRotation: 0,
  bgR: 255,
  bgG: 255,
  bgB: 255,
  bgTol: 40,
  smoothPasses: 0,
  letterSpacing: 0,
  letterThickness: 0,
  bgEnable: true,
  bgSoft: false,
  mirror: false,
  invert: true,
  depthMm: 0.6,
  relief: 'raised',
  uniformDepth: true,
  crisp: true,
  text: '',
};
const layer = { id: 'layer-1', kind: 'image', fontChoice: 'system', image: null, source: 'Logo', settings };
const project = (s) => ({
  format: 'icaviot-project',
  version: 3,
  name: 'Invert',
  source: 'Logo',
  image: null,
  settings: {},
  layers: [[{ ...layer, settings: s }], []],
  activeSide: 0,
  selectedIds: ['layer-1', null],
  linkSides: false,
});

test('project files keep the switch, and old files load with it off', () => {
  const on = ProjectFormat.decode(JSON.stringify(project({ ...settings, reliefInvert: true })));
  assert.equal(on.layers[0][0].settings.reliefInvert, true);
  const old = ProjectFormat.decode(JSON.stringify(project(settings)));
  assert.equal('reliefInvert' in old.layers[0][0].settings, false);
  const off = ProjectFormat.decode(JSON.stringify(project({ ...settings, reliefInvert: false })));
  assert.equal('reliefInvert' in off.layers[0][0].settings, false);
  assert.throws(() => ProjectFormat.decode(JSON.stringify(project({ ...settings, reliefInvert: 'yes' }))));
});

console.log(`${count} invert relief checks passed`);

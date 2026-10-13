// Photo-to-sleeve: a real photo becomes a printable relief, the original is kept, and the sleeve wall does not change.
// usage: node e2e/photo-sleeve-e2e.mjs <baseURL> [shotDir]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const shots = process.argv[3] || '';
const IMAGE = new URL('./fixtures/labrador.jpg', import.meta.url).pathname;
const PORTRAIT = new URL('./fixtures/portrait.jpg', import.meta.url).pathname;
const HEIC = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'test-fixtures', 'tiny.heic');
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  PASS', msg); } else { failures++; console.log('  FAIL', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(p, ms = 120000) {
  const t = Date.now();
  await sleep(200);
  while (Date.now() - t < ms) {
    const ready = await p.evaluate(() => typeof templatePreviewRunning !== 'undefined' && !!templateBase && !templatePreviewRunning && !templatePending && !placementTimer && !AppState.rebuildTimer && !exportBusy && !photoBusy);
    if (ready) return true;
    await sleep(250);
  }
  return false;
}
async function open() {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('page: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  await settle(p);
  return { ctx, p, errors };
}
async function frame(p, kind) {
  await p.evaluate((kind) => {
    if (kind === 'sleeve') {
      if (typeof templateView === 'function') templateView('front');
      return;
    }
    if (typeof meshObj === 'undefined' || !meshObj || !camera || !controls) return;
    const box = new THREE.Box3().setFromObject(meshObj);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    const fov = ((camera.fov || 40) * Math.PI) / 180;
    const dist = (maxDim * 0.62) / Math.tan(fov / 2);
    const elev = (30 * Math.PI) / 180;
    const az = (16 * Math.PI) / 180;
    camera.up.set(0, 1, 0);
    camera.position.set(
      center.x + dist * Math.cos(elev) * Math.sin(az),
      center.y + dist * Math.sin(elev),
      center.z + dist * Math.cos(elev) * Math.cos(az),
    );
    controls.target.copy(center);
    camera.lookAt(center);
    controls.update();
  }, kind);
  await sleep(400);
}
async function shot(p, name, kind) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await frame(p, kind);
  await p.locator('#threeContainer').screenshot({ path: path.join(shots, name) });
}
function composite(original, resultName, outName) {
  if (!shots) return;
  const result = path.join(shots, resultName);
  const out = path.join(shots, outName);
  if (!fs.existsSync(original) || !fs.existsSync(result)) return;
  execFileSync('ffmpeg', ['-y', '-i', original, '-i', result, '-filter_complex',
    '[0:v]scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=white[a];[1:v]scale=640:640:force_original_aspect_ratio=decrease,pad=640:640:(ow-iw)/2:(oh-ih)/2:color=0x1a1a1a[b];[a][b]hstack=inputs=2',
    out], { stdio: 'ignore' });
}
async function useStyle(p, value) {
  await p.click('label[for="photoStyle' + value.charAt(0).toUpperCase() + value.slice(1) + '"]');
  await p.waitForFunction((style) => !!(AppState.photo && AppState.photo.style === style && !photoBusy && document.getElementById('photoPreview').width > 8), value, { timeout: 60000 });
  ok(await settle(p), value + ' preview settled');
}
function previewSig(p) {
  return p.evaluate(() => {
    const c = document.getElementById('photoPreview');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let ink = 0, sum = 0;
    for (let i = 0; i < d.length; i += 16) { sum += d[i]; if (d[i + 3] > 128 && d[i] > 128) ink++; }
    return { sum, ink, w: c.width, h: c.height, warning: document.getElementById('photoWarning').textContent };
  });
}

{
  console.log('HEIC upload');
  const { ctx, p, errors } = await open();
  await p.setInputFiles('#fileInput', HEIC);
  await p.waitForFunction(() => !!AppState.image && AppState.image.width >= 8, null, { timeout: 30000 });
  const heic = await p.evaluate(() => ({ w: AppState.image.width, h: AppState.image.height, name: AppState.sourceLabel }));
  ok(heic.w === 32 && heic.h === 24, 'tiny HEIC decoded to 32×24 (' + heic.w + '×' + heic.h + ', ' + heic.name + ')');
  ok(!errors.some((e) => /libheif|HEIC|wasm/i.test(e)), 'no HEIC page errors ' + errors.filter((e) => /heic|wasm/i.test(e)).join(' | '));
  await ctx.close();
}

{
  console.log('Photo styles on the sleeve and the flat plate');
  const { ctx, p, errors } = await open();
  const wall = await p.evaluate(() => AppState.wall);
  ok(await p.evaluate(() => document.getElementById('photoTools').hidden && document.getElementById('photoStyleOff').checked), 'photo style starts off');
  await p.setInputFiles('#fileInput', IMAGE);
  await p.waitForFunction(() => !!AppState.image, null, { timeout: 30000 });
  ok(await settle(p), 'labrador placed on the sleeve');
  if (shots) {
    fs.mkdirSync(shots, { recursive: true });
    fs.copyFileSync(IMAGE, path.join(shots, 'original-labrador.jpg'));
  }
  await shot(p, 'sleeve-original.png', 'sleeve');

  const styles = ['silhouette', 'line', 'poster', 'smooth', 'lithophane'];
  const sigs = [];
  for (const style of styles) {
    await useStyle(p, style);
    const sig = await previewSig(p);
    sigs.push(sig.sum + ':' + sig.ink);
    ok(sig.w > 8 && sig.h > 8, style + ' preview is drawn (' + sig.w + '×' + sig.h + ')');
    if (style === 'silhouette') {
      const depth = await p.evaluate(() => AppState.depthMm);
      ok(Math.abs(depth - 0.8) < 0.05, 'silhouette depth defaults to 0.8 mm (' + depth + ')');
    }
    if (style === 'poster') {
      const depth = await p.evaluate(() => AppState.depthMm);
      ok(depth >= 1.1 && depth <= 1.3, 'poster depth defaults to 1.2 mm (' + depth + ')');
    }
    await shot(p, 'sleeve-' + style + '.png', 'sleeve');
    composite(IMAGE, 'sleeve-' + style + '.png', 'compare-sleeve-' + style + '.png');
    const previewShot = path.join(shots || '', 'preview-' + style + '.png');
    if (shots) await p.locator('#photoPreview').screenshot({ path: previewShot });
  }
  ok(new Set(sigs).size >= 4, 'styles do not all print the same pixels (' + sigs.join(' | ') + ')');
  const warn = await p.evaluate(() => document.getElementById('photoWarning').textContent);
  ok(/mm/.test(warn), 'small lithophane warns: ' + warn);
  const limits = await p.evaluate(() => ({ min: Number(document.getElementById('photoLine').min), value: Number(document.getElementById('photoLine').value), wall: AppState.wall }));
  ok(limits.min === 0.8 && limits.value >= 0.8, 'line thickness stays at least 0.8 mm (' + limits.value + ')');
  ok(limits.wall === wall, 'sleeve wall unchanged (' + limits.wall + ')');

  const widthNow = await p.evaluate(() => {
    const el = document.getElementById('designWidthNumber');
    el.value = '18';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return AppState.designWidth;
  });
  ok(widthNow === 18, 'design width is 18 mm (' + widthNow + ')');
  ok(await settle(p), 'narrower sleeve settled');
  const narrow = await p.evaluate(() => document.getElementById('photoWarning').textContent);
  ok(/18 mm|0\.8 mm/.test(narrow), 'narrow print warns: ' + narrow);

  const saved = await p.evaluate(() => {
    const data = buildProjectData();
    const layer = data.layers.flat().find((item) => item.photo);
    return {
      style: layer && layer.photo.style,
      line: layer && layer.photo.lineMm,
      original: !!(layer && typeof layer.photoSource === 'string' && layer.photoSource.startsWith('data:image/png;base64,')),
      image: !!(layer && typeof layer.image === 'string' && layer.image.startsWith('data:image/png;base64,')),
    };
  });
  ok(saved.style === 'lithophane' && saved.line >= 0.8 && saved.original && saved.image, 'project keeps the original and the lithophane settings');

  await sleep(700);
  const undone = await p.evaluate(() => { if ($('undoEdit').disabled) return 'disabled'; $('undoEdit').click(); return 'clicked'; });
  await sleep(400);
  ok(undone === 'clicked', 'undo was available (' + undone + ')');
  ok(await settle(p), 'undo settled');
  ok(await p.evaluate(() => AppState.wall) === wall, 'wall still unchanged after undo');

  await p.click('label[for="exportFlat"]');
  await p.waitForFunction(() => AppState.mode === 'flat', null, { timeout: 10000 });
  ok(await settle(p), 'flat plate mode');
  for (const style of styles) {
    await useStyle(p, style);
    await shot(p, 'plate-' + style + '.png', 'plate');
    composite(IMAGE, 'plate-' + style + '.png', 'compare-plate-' + style + '.png');
    if (style === 'silhouette' || style === 'line' || style === 'poster') {
      const mesh = await p.evaluate(() => ({ err: AppState.lastTextReliefError, sharp: !!AppState.lastTextRelief }));
      ok(!mesh.err && mesh.sharp, 'flat ' + style + ' uses an outline mesh' + (mesh.err ? ' (' + mesh.err + ')' : ''));
    }
  }
  const plate = await p.evaluate(() => ({ mode: AppState.mode, wall: AppState.wall, style: AppState.photo && AppState.photo.style }));
  ok(plate.mode === 'flat' && plate.style === 'lithophane' && plate.wall === wall, 'flat plate lithophane, wall still ' + plate.wall);
  ok(!errors.some((e) => /PhotoRelief|photo-worker|is not defined/.test(e)), 'no photo script errors ' + errors.slice(0, 4).join(' | '));

  console.log('Portrait on the sleeve and the flat plate');
  await p.click('label[for="exportSleeve"]');
  await p.waitForFunction(() => AppState.mode === 'sleeve', null, { timeout: 10000 });
  await p.setInputFiles('#fileInput', PORTRAIT);
  await p.waitForFunction(() => !!AppState.image && AppState.image.height > AppState.image.width, null, { timeout: 30000 });
  ok(await settle(p), 'portrait placed on the sleeve');
  if (shots) fs.copyFileSync(PORTRAIT, path.join(shots, 'original-portrait.jpg'));
  await shot(p, 'portrait-sleeve-original.png', 'sleeve');
  for (const style of styles) {
    await useStyle(p, style);
    await shot(p, 'portrait-sleeve-' + style + '.png', 'sleeve');
    composite(PORTRAIT, 'portrait-sleeve-' + style + '.png', 'compare-portrait-sleeve-' + style + '.png');
  }
  await p.click('label[for="exportFlat"]');
  await p.waitForFunction(() => AppState.mode === 'flat', null, { timeout: 10000 });
  ok(await settle(p), 'portrait flat plate');
  for (const style of styles) {
    await useStyle(p, style);
    await shot(p, 'portrait-plate-' + style + '.png', 'plate');
    composite(PORTRAIT, 'portrait-plate-' + style + '.png', 'compare-portrait-plate-' + style + '.png');
    if (style === 'poster') {
      const mesh = await p.evaluate(() => ({ err: AppState.lastTextReliefError, sharp: !!AppState.lastTextRelief, depth: AppState.depthMm }));
      ok(!mesh.err && mesh.sharp && mesh.depth >= 1.1, 'portrait poster is an outline at ' + mesh.depth + ' mm' + (mesh.err ? ' (' + mesh.err + ')' : ''));
    }
  }
  await ctx.close();
}

console.log(passes + ' passed, ' + failures + ' failed');
await browser.close();
process.exit(failures ? 1 : 0);

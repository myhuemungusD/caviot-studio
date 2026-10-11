// Slider grab target, number field, keyboard steps and phone gestures.
// usage: node e2e/slider-e2e.mjs <baseURL>
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import { chromium, devices } from 'playwright-core';
const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const IMAGE = process.env.IMAGE || new URL('./fixtures/badge.png', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failures = 0, passes = 0;
const ok = (cond, msg) => { if (cond) { passes++; console.log('  PASS', msg); } else { failures++; console.log('  FAIL', msg); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(p, ms = 90000) {
  const t = Date.now();
  await sleep(200);
  while (Date.now() - t < ms) {
    const ready = await p.evaluate(() => typeof templatePreviewRunning !== 'undefined' && !!templateBase && !templatePreviewRunning && !templatePending && !placementTimer && !AppState.rebuildTimer && !exportBusy);
    if (ready) return true;
    await sleep(250);
  }
  return false;
}
const touch = async (cdp, type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 })) });
async function pinch(cdp, c, from, to, steps = 10) {
  const pts = (d) => [[c[0] - d, c[1]], [c[0] + d, c[1]]];
  await touch(cdp, 'touchStart', [pts(from)[0]]);
  await sleep(10);
  await touch(cdp, 'touchStart', pts(from));
  for (let i = 1; i <= steps; i++) { await touch(cdp, 'touchMove', pts(from + (to - from) * i / steps)); await sleep(16); }
  await touch(cdp, 'touchEnd', []);
}
async function twist(cdp, c, radius, degrees, steps = 10) {
  const at = (deg) => {
    const a = deg * Math.PI / 180;
    return [[c[0] + Math.cos(a) * radius, c[1] + Math.sin(a) * radius], [c[0] + Math.cos(a + Math.PI) * radius, c[1] + Math.sin(a + Math.PI) * radius]];
  };
  await touch(cdp, 'touchStart', [at(0)[0]]);
  await sleep(10);
  await touch(cdp, 'touchStart', at(0));
  for (let i = 1; i <= steps; i++) { await touch(cdp, 'touchMove', at(degrees * i / steps)); await sleep(16); }
  await touch(cdp, 'touchEnd', []);
}
const designPoint = (p) => p.evaluate(() => {
  const t = (AppState.designAngle + 90) * Math.PI / 180, R = 30;
  const v = new THREE.Vector3(Math.cos(t) * R, AppState.designY, Math.sin(t) * R).project(camera);
  const r = renderer.domElement.getBoundingClientRect();
  const c = [r.left + (v.x + 1) / 2 * r.width, r.top + (1 - v.y) / 2 * r.height];
  for (let ring = 0; ring < 30; ring++) for (let a = 0; a < Math.max(1, ring * 6); a++) {
    const ang = a / Math.max(1, ring * 6) * Math.PI * 2, x = c[0] + Math.cos(ang) * ring * 8, y = c[1] + Math.sin(ang) * ring * 8;
    if (document.elementFromPoint(x, y) === renderer.domElement && touchHitsSelectedDesign({ clientX: x, clientY: y })) return [x, y];
  }
  return c;
});
async function metrics(p) {
  return p.evaluate(() => {
    // getComputedStyle on the thumb pseudo reports the input's box in this Chrome,
    // so the painted size is read from the rules that actually apply.
    // Style rules also expose cssRules in this Chrome, so only real groups are walked.
    const group = (rule) => rule.cssRules && !rule.selectorText;
    const declared = [];
    const walk = (rules) => {
      for (const rule of rules) {
        if (group(rule)) { if (!rule.conditionText || matchMedia(rule.conditionText).matches) walk(rule.cssRules); continue; }
        if (rule.selectorText && rule.selectorText.includes('::-webkit-slider-thumb') && rule.style.width)
          declared.push(parseFloat(rule.style.width) || 0);
      }
    };
    for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* cross-origin */ } }
    const thumb = declared.length ? declared[declared.length - 1] : 0;
    let track = 0;
    const walkTrack = (rules) => {
      for (const rule of rules) {
        if (group(rule)) { if (!rule.conditionText || matchMedia(rule.conditionText).matches) walkTrack(rule.cssRules); continue; }
        if (rule.selectorText && rule.selectorText.includes('::-webkit-slider-runnable-track') && rule.style.height)
          track = parseFloat(rule.style.height) || track;
      }
    };
    for (const sheet of document.styleSheets) { try { walkTrack(sheet.cssRules); } catch { /* cross-origin */ } }
    return [...document.querySelectorAll('input[type=range]')].map((range) => {
      const box = range.getBoundingClientRect();
      const num = range._sliderNum;
      return {
        id: range.id,
        h: box.height,
        shown: !!range.offsetParent,
        thumb,
        track,
        fill: range.style.getPropertyValue('--fill'),
        text: range.getAttribute('aria-valuetext') || '',
        reset: range.dataset.sliderReset || '',
        numId: num ? num.id : '',
        numType: num ? num.type : '',
        numFont: num ? parseFloat(getComputedStyle(num).fontSize) || 0 : 0,
      };
    });
  });
}

async function openPage(ctxOptions) {
  const ctx = await browser.newContext({ ...ctxOptions, acceptDownloads: true });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('page: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase && !!document.getElementById('depthIn')?.dataset.sliderReady, null, { timeout: 120000 });
  await settle(p);
  return { ctx, p, errors };
}

console.log('== desktop');
{
  const { ctx, p, errors } = await openPage({ viewport: { width: 1280, height: 900 } });
  const rows = await metrics(p);
  ok(rows.length >= 15, 'every range is enhanced (' + rows.length + ')');
  ok(rows.every((r) => r.thumb >= 24), 'desktop thumbs are at least 24px ' + JSON.stringify(rows.filter((r) => r.thumb < 24).map((r) => r.id)));
  ok(rows.every((r) => r.track >= 8), 'tracks are at least 8px');
  ok(rows.every((r) => r.numType === 'number' && r.numId), 'each slider has a number field');
  ok(rows.every((r) => r.text.length > 0 && r.fill.endsWith('%')), 'fill and aria-valuetext are set');
  const depth = rows.find((r) => r.id === 'depthIn');
  ok(depth && depth.shown && depth.h >= 36, 'depth row is a tall hit target (' + (depth && depth.h) + 'px)');
  ok(depth && /millimeters/.test(depth.text), 'depth announces millimeters (' + (depth && depth.text) + ')');
  ok(depth && depth.numFont >= 20, 'depth number stays a large figure (' + (depth && depth.numFont) + 'px)');
  ok(depth && depth.reset === '0.4', 'double-click target is the designed 0.4 mm');
  const placed = rows.find((r) => r.id === 'designWidthRange');
  ok(placed && placed.numId === 'designWidthNumber', 'placement keeps its existing number field');
  ok(await p.evaluate(() => document.getElementById('designRotationNumber').max === ''), 'rotation number still has no max, so it can wrap');
  const focus = await p.evaluate(() => {
    document.getElementById('depthIn').focus({ focusVisible: true });
    const s = getComputedStyle(document.getElementById('depthIn'));
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) || 0 };
  });
  ok(focus.style !== 'none' && focus.width >= 2, 'keyboard focus ring is visible ' + JSON.stringify(focus));
  await p.focus('#depthIn');
  await p.keyboard.press('Shift+ArrowRight');
  await sleep(50);
  const shifted = await p.evaluate(() => Number(document.getElementById('depthIn').value));
  ok(Math.abs(shifted - 0.5) < 0.001, 'shift+arrow jumps ten steps (0.40 → ' + shifted + ')');
  await p.keyboard.press('ArrowRight');
  const stepped = await p.evaluate(() => Number(document.getElementById('depthIn').value));
  ok(Math.abs(stepped - 0.51) < 0.001, 'arrow moves one step (' + stepped + ')');
  await p.fill('#depthInNumber', '1.25');
  await p.dispatchEvent('#depthInNumber', 'change');
  const typed = await p.evaluate(() => ({ range: Number(document.getElementById('depthIn').value), state: AppState.depthMm }));
  ok(Math.abs(typed.range - 1.25) < 0.001 && Math.abs(typed.state - 1.25) < 0.001, 'typing the number sets the depth (' + JSON.stringify(typed) + ')');
  await p.dblclick('#depthIn');
  await sleep(50);
  const reset = await p.evaluate(() => Number(AppState.depthMm));
  ok(Math.abs(reset - 0.4) < 0.001, 'double-click restores 0.4 mm (' + reset + ')');
  await p.focus('#depthInNumber');
  await p.fill('#depthInNumber', '1.80');
  await p.dispatchEvent('#depthInNumber', 'input');
  await p.dblclick('#depthInNumber');
  await p.keyboard.press('Tab');
  const resetNum = await p.evaluate(() => ({ num: document.getElementById('depthInNumber').value, range: Number(document.getElementById('depthIn').value), state: AppState.depthMm }));
  ok(Math.abs(resetNum.state - 0.4) < 0.001 && Math.abs(resetNum.range - 0.4) < 0.001 && Math.abs(Number(resetNum.num) - 0.4) < 0.001, 'double-click on the number resets and stays reset ' + JSON.stringify(resetNum));
  await p.focus('#depthInNumber');
  await p.keyboard.press('Shift+ArrowUp');
  const shiftMid = await p.evaluate(() => ({ num: document.getElementById('depthInNumber').value, range: Number(document.getElementById('depthIn').value), state: AppState.depthMm }));
  await p.keyboard.press('Tab');
  const shiftAfter = await p.evaluate(() => ({ num: document.getElementById('depthInNumber').value, range: Number(document.getElementById('depthIn').value), state: AppState.depthMm }));
  ok(Math.abs(shiftMid.state - 0.5) < 0.001 && Math.abs(Number(shiftMid.num) - 0.5) < 0.001 && Math.abs(shiftAfter.state - 0.5) < 0.001 && Math.abs(Number(shiftAfter.num) - 0.5) < 0.001 && Math.abs(shiftAfter.range - 0.5) < 0.001, 'shift+arrow in the number jumps ten steps and the figure stays ' + JSON.stringify({ shiftMid, shiftAfter }));
  const box = await p.locator('#depthIn').boundingBox();
  await p.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
  await sleep(80);
  const jumped = await p.evaluate(() => ({ value: Number(document.getElementById('depthIn').value), max: Number(document.getElementById('depthIn').max) }));
  ok(jumped.value > jumped.max * 0.8, 'clicking the track jumps the thumb (' + jumped.value + ' of ' + jumped.max + ')');
  const real = errors.filter((e) => !/willReadFrequently/.test(e));
  ok(!real.length, 'no page errors ' + JSON.stringify(real.slice(0, 3)));
  await ctx.close();
}

for (const name of ['iPhone 14', 'Pixel 7']) {
  console.log('==', name);
  const { ctx, p, errors } = await openPage({ ...devices[name] });
  await p.evaluate(() => { if (typeof setSettingsOpen === 'function') setSettingsOpen(true); });
  await sleep(400);
  const sheet = await p.evaluate(() => {
    const side = document.querySelector('.sidebar').getBoundingClientRect();
    const range = [...document.querySelectorAll('input[type=range]')].find((el) => el.offsetParent);
    const thumb = (() => { let w = 0; const group = (rule) => rule.cssRules && !rule.selectorText; const walk = (rules) => { for (const rule of rules) { if (group(rule)) { if (!rule.conditionText || matchMedia(rule.conditionText).matches) walk(rule.cssRules); continue; } if (rule.selectorText && rule.selectorText.includes('::-webkit-slider-thumb') && rule.style.width) w = parseFloat(rule.style.width) || w; } }; for (const sheet of document.styleSheets) { try { walk(sheet.cssRules); } catch { /* ignore */ } } return w; })();
    return { open: document.body.classList.contains('phone-ui') && typeof settingsAreOpen === 'function' && settingsAreOpen(), h: range ? range.getBoundingClientRect().height : 0, thumb, top: side.top, id: range && range.id };
  });
  ok(sheet.open, 'tools sheet opens');
  ok(sheet.h >= 44, 'touch slider hit area is at least 44px (' + sheet.h + ' on ' + sheet.id + ')');
  ok(sheet.thumb >= 24, 'touch thumb stays at least 24px (' + sheet.thumb + ')');
  await p.focus('#depthInNumber');
  await p.fill('#depthInNumber', '1.10');
  await p.dispatchEvent('#depthInNumber', 'input');
  await p.dblclick('#depthInNumber');
  await p.keyboard.press('Tab');
  const phoneReset = await p.evaluate(() => ({ num: document.getElementById('depthInNumber').value, range: Number(document.getElementById('depthIn').value), state: AppState.depthMm }));
  ok(Math.abs(phoneReset.state - 0.4) < 0.001 && Math.abs(phoneReset.range - 0.4) < 0.001 && Math.abs(Number(phoneReset.num) - 0.4) < 0.001, 'double-click on the number resets on ' + name + ' ' + JSON.stringify(phoneReset));
  if (name === 'iPhone 14') {
    await p.evaluate(() => setSettingsOpen(false));
    await p.setInputFiles('#fileInput', IMAGE);
    await p.waitForFunction(() => !!AppState.image, null, { timeout: 30000 });
    ok(await settle(p), 'artwork settled before gestures');
    const pt = await designPoint(p);
    const cdp = await ctx.newCDPSession(p);
    const size0 = await p.evaluate(() => [AppState.designWidth, AppState.designHeight, AppState.designRotation]);
    await pinch(cdp, pt, 28, 90);
    await sleep(500);
    const size1 = await p.evaluate(() => [AppState.designWidth, AppState.designHeight, AppState.designRotation]);
    ok(size1[0] > size0[0] * 1.15, 'pinch still resizes the design (' + size0[0] + ' → ' + size1[0] + ')');
    const rot0 = await p.evaluate(() => AppState.designRotation);
    await twist(cdp, pt, 70, 50);
    await sleep(500);
    const rot1 = await p.evaluate(() => AppState.designRotation);
    ok(Math.abs(rot1 - rot0) > 5, 'twist still rotates the design (' + rot0 + '° → ' + rot1 + '°)');
    await p.evaluate(() => setSettingsOpen(true));
    await sleep(300);
    ok(await p.evaluate(() => settingsAreOpen() && document.getElementById('depthIn').getBoundingClientRect().height >= 44), 'sheet still opens over the new sliders');
  }
  const real = errors.filter((e) => !/willReadFrequently/.test(e));
  ok(!real.length, 'no page errors ' + JSON.stringify(real.slice(0, 3)));
  await ctx.close();
}

await browser.close();
console.log(`\nslider e2e: ${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

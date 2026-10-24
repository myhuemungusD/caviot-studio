// "Invert relief": one button swaps what sticks out. On the sleeve the logo sinks and a raised pad that follows its
// outline takes its place (never a full-size square); a second tap restores the original exactly. Works with one
// tap on desktop and in the phone app (Classic Sleeve, no vape wording), and flat plates swap light/dark.
// usage: node e2e/invert-relief-e2e.mjs <baseURL> [shotDir]
// needs: npm i playwright-core; Chrome at $CHROME (default /usr/bin/google-chrome).
import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const LOGO = new URL('../dist/branding/design-mainline.png', import.meta.url).pathname;
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let failures = 0,
  passes = 0;
const ok = (cond, msg) => {
  if (cond) {
    passes++;
    console.log('  PASS', msg);
  } else {
    failures++;
    console.log('  FAIL', msg);
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BAD = /vape|vaping|foger|fogger|geek ?bar|tobacco|nicotine|smok/i;
async function settle(p, ms = 180000) {
  const t = Date.now();
  await sleep(300);
  while (Date.now() - t < ms) {
    const ready = await p.evaluate(
      () =>
        typeof templatePreviewRunning !== 'undefined' &&
        !!templateBase &&
        !templatePreviewRunning &&
        !templatePending &&
        !placementTimer &&
        !AppState.rebuildTimer &&
        !exportBusy
    );
    if (ready) return true;
    await sleep(250);
  }
  return false;
}
// What the sleeve design currently prints: checksum, raised share, and whether the picture's corners are raised.
const design = (p) =>
  p.evaluate(() => {
    const d = sleeveDesignOptions(768)[0];
    if (!d) return null;
    const { heightmap: hm, rows, cols } = d;
    let sum = 0,
      raised = 0;
    for (let i = 0; i < hm.length; i++) {
      sum = (sum * 31 + Math.round(hm[i] * 255)) >>> 0;
      if (hm[i] > 0.5) raised++;
    }
    const corners = [0, cols - 1, (rows - 1) * cols, rows * cols - 1].map((i) => hm[i]);
    return { sum, raised: raised / hm.length, corners, inverted: !!designLayers.flat()[0]?.cache?.built?.reliefInverted };
  });
const shot = async (p, name) => {
  if (shots) await p.screenshot({ path: path.join(shots, name) });
};
const pressed = (p) => p.getAttribute('#invertRelief', 'aria-pressed');

// ---------- Desktop ----------
{
  console.log('desktop');
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  await settle(p);
  await p.setInputFiles('#fileInput', LOGO);
  await p.waitForFunction(() => !!AppState.image, null, { timeout: 30000 });
  await settle(p);
  const button = p.locator('#invertRelief');
  ok(await button.isVisible(), 'Invert relief button is visible');
  ok(await p.evaluate(() => !!document.querySelector('#selectedFinish #invertRelief')), 'button sits with Emboss/Deboss under the selected design');
  ok((await button.textContent()).includes('Invert relief'), 'button is labelled "Invert relief"');
  ok(!(await p.isVisible('#invert')), 'the old "Light parts stick out" checkbox is not shown twice');
  ok((await pressed(p)) === 'false', 'starts off');
  const before = await design(p);
  ok(before && before.corners.every((v) => v === 0), 'before: background removed around the logo');
  await p.locator('#invertRelief').scrollIntoViewIfNeeded();
  await shot(p, 'desktop-before.png');
  await button.click();
  await settle(p);
  const after = await design(p);
  ok((await pressed(p)) === 'true' && (await p.evaluate(() => AppState.reliefInvert)), 'one click turns it on');
  ok(after.inverted && after.sum !== before.sum, 'the sleeve design is inverted');
  ok(
    after.corners.every((v) => v === 0),
    'after: picture corners stay flat (no full-size square)'
  );
  ok(after.raised < 0.9 && after.raised > 0.05, 'after: the raised pad hugs the logo (' + (after.raised * 100).toFixed(1) + '% of the picture)');
  ok((await p.textContent('#invertReliefHint')).includes('raised pad'), 'hint explains what happened');
  ok(
    await p.evaluate(() => getComputedStyle(els.invertRelief).backgroundColor === getComputedStyle(document.querySelector('.btn-primary')).backgroundColor),
    'the button lights up while on (even under the mouse)'
  );
  await shot(p, 'desktop-after.png');
  await button.click();
  await settle(p);
  const back = await design(p);
  ok((await pressed(p)) === 'false' && back.sum === before.sum, 'a second click restores the original exactly');
  await p.keyboard.press('i');
  await settle(p);
  ok((await pressed(p)) === 'true', 'keyboard shortcut I toggles it');
  await p.keyboard.press('i');
  await settle(p);
  // Flat plate: the same button swaps light and dark.
  await p.evaluate(() => {
    AppState.mode = 'flat';
    projectStateToUI();
    scheduleRebuild();
  });
  await sleep(800);
  ok((await pressed(p)) === 'false', 'flat plate: off by default');
  await button.click();
  ok(
    (await pressed(p)) === 'true' && (await p.evaluate(() => AppState.invert === false && !AppState.reliefInvert)),
    'flat plate: one click makes dark parts stick out'
  );
  await button.click();
  await p.evaluate(() => {
    AppState.mode = 'sleeve';
    projectStateToUI();
    scheduleRebuild();
  });
  await settle(p);
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

// ---------- Phone app (native labels) ----------
{
  console.log('phone app (iPhone 14)');
  const ctx = await browser.newContext({ ...devices['iPhone 14'] });
  await ctx.addInitScript(() => {
    window.CAVIOT_NEUTRAL_LABELS = true;
  });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  if (await p.isVisible('#emptyStartClassic')) {
    ok((await p.textContent('#emptyStartClassic')).includes('Classic Sleeve'), 'start screen offers Classic Sleeve');
    await p.tap('#emptyStartClassic');
  }
  await settle(p);
  await p.setInputFiles('#fileInput', LOGO);
  await p.waitForFunction(() => !!AppState.image, null, { timeout: 30000 });
  await settle(p);
  // Open the settings sheet, then jump to the Emboss section.
  if (!(await p.evaluate(() => settingsAreOpen()))) await p.tap('#mobileSettingsBtn');
  await p.waitForFunction(() => settingsAreOpen() && getComputedStyle(document.querySelector('.sidebar')).transform === 'none', null, { timeout: 15000 });
  await p.tap('.phone-rail-btn[data-target="phoneSecFinish"]');
  await sleep(900);
  await p.locator('#invertRelief').scrollIntoViewIfNeeded();
  ok(await p.evaluate(() => !!document.querySelector('#phoneSecFinish #invertRelief')), 'button is in the Emboss section');
  const box = await p.locator('#invertRelief').boundingBox();
  ok(box && box.height >= 44 && box.width >= 200, 'button is a full-width 44 px tap target');
  const before = await design(p);
  await shot(p, 'phone-before.png');
  await p.tap('#invertRelief');
  await settle(p);
  const after = await design(p);
  ok((await pressed(p)) === 'true' && after.inverted && after.sum !== before.sum, 'one tap inverts the relief');
  ok(
    after.corners.every((v) => v === 0),
    'no full-size square on the phone either'
  );
  await shot(p, 'phone-after.png');
  const text = await p.evaluate(
    () =>
      document.body.innerText +
      ' ' +
      [...document.querySelectorAll('[title],[aria-label]')].map((e) => (e.title || '') + ' ' + (e.getAttribute('aria-label') || '')).join(' ')
  );
  ok(!BAD.test(text), 'no vape wording in the phone app');
  ok(
    await p.evaluate(() => [...document.querySelectorAll('option')].some((o) => o.textContent.includes('Classic Sleeve'))),
    'template is called Classic Sleeve'
  );
  await p.tap('#invertRelief');
  await settle(p);
  ok((await design(p)).sum === before.sum, 'second tap restores the original');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await ctx.close();
}

await browser.close();
console.log(`${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);

// usage: node e2e/empty-start-e2e.mjs <url> [shotsDir]
// Phone apps (native flag) open on "Choose a template": nothing to export until Classic Sleeve or an imported
// STL/OBJ/3MF is chosen. Classic Sleeve then exports the same bytes as the website. The website is unchanged.
import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? '  PASS ' : '  FAIL ') + m);
};
const settledFn = () =>
  typeof templatePreviewRunning !== 'undefined' &&
  !!templateBase &&
  !templatePreviewRunning &&
  !templatePending &&
  !placementTimer &&
  !AppState.rebuildTimer &&
  !exportBusy;
const native = () => {
  window.CAVIOT_NEUTRAL_LABELS = true;
};
async function open(opts, flag = true) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
  if (flag) await ctx.addInitScript(native);
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  await sleep(500);
  return { ctx, p, errors };
}
async function hashOf(d) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(await d.path()))
    .digest('hex')
    .slice(0, 8);
}
const cube =
  [
    'v 0 0 0',
    'v 20 0 0',
    'v 20 20 0',
    'v 0 20 0',
    'v 0 0 30',
    'v 20 0 30',
    'v 20 20 30',
    'v 0 20 30',
    'f 1 3 2',
    'f 1 4 3',
    'f 5 6 7',
    'f 5 7 8',
    'f 1 2 6',
    'f 1 6 5',
    'f 2 3 7',
    'f 2 7 6',
    'f 3 4 8',
    'f 3 8 7',
    'f 4 1 5',
    'f 4 5 8',
  ].join('\n') + '\n';
const objFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'es-')), 'cube.obj');
fs.writeFileSync(objFile, cube);

for (const [name, dev] of [
  ['iphone', devices['iPhone 14']],
  ['android', devices['Pixel 7']],
]) {
  console.log(name);
  const { ctx, p, errors } = await open(dev);
  const s = await p.evaluate(() => {
    const r = $('emptyStart'),
      b = r.getBoundingClientRect();
    return {
      active: CaviotEmptyStart.active,
      shown: !r.hidden && b.width >= innerWidth - 1 && b.height >= innerHeight - 1,
      title: $('emptyStartTitle').textContent,
      classic: $('emptyStartClassic').textContent,
      imp: $('emptyStartImport').textContent,
      gen: els.generateBtn.disabled,
      top: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.closest('#emptyStart') !== null,
      tpl: AppState.templateId,
    };
  });
  ok(s.active && s.shown && s.top && s.title === 'Choose a template', 'start screen covers the app: ' + JSON.stringify(s));
  ok(/Classic Sleeve/.test(s.classic) && /^Import STL/.test(s.imp) && /OBJ or 3MF/.test(s.imp), 'offers Classic Sleeve and Import STL (STL, OBJ, 3MF)');
  ok(s.gen, 'Export button is disabled until a template is chosen');
  await p.waitForFunction(settledFn, null, { timeout: 120000 });
  await sleep(1500);
  const still = await p.evaluate(() => [els.generateBtn.disabled, els.downloadObjBtn.disabled]);
  ok(still.every(Boolean), 'export buttons stay disabled after the background preview settles ' + JSON.stringify(still));
  if (shots) await p.screenshot({ path: `${shots}/${name}-choose-template.png` });
  const dl = p.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  const r = await p.evaluate(async () => {
    const v = await exportCurrent('stl');
    return { v, toast: document.querySelector('.toast')?.textContent || document.body.innerText.match(/Choose a template first[^\n]*/)?.[0] || '' };
  });
  ok(!(await dl) && r.v == null && /Choose a template first/.test(r.toast), 'export with no template does nothing and explains why ' + JSON.stringify(r.toast));
  // Import STL: OBJ goes through the same picker.
  const chooser = p.waitForEvent('filechooser', { timeout: 10000 }).catch(() => null);
  await p.tap('#emptyStartImport');
  const fc = await chooser;
  ok(!!fc, 'Import STL opens the file picker');
  if (fc) {
    await fc.setFiles(objFile);
    await p.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 120000 }).catch(() => {});
    const after = await p.evaluate(() => ({
      active: CaviotEmptyStart.active,
      tpl: AppState.templateId,
      gen: els.generateBtn.disabled,
      own: $('phoneOwnSleeve').textContent,
      startOwn: $('phoneStartOwnSleeve').textContent,
    }));
    ok(!after.active && after.tpl === 'custom-stl' && !after.gen, 'importing an OBJ chooses it as the template ' + JSON.stringify(after));
    ok(after.own === 'Import STL' && after.startOwn === 'Import STL', 'phone app buttons say "Import STL" ' + JSON.stringify([after.own, after.startOwn]));
    if (shots) {
      await p.waitForFunction(settledFn, null, { timeout: 120000 }).catch(() => {});
      await p.screenshot({ path: `${shots}/${name}-after-import.png` });
    }
  }
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await ctx.close();
  // Classic Sleeve: one tap, then the normal phone start card.
  {
    const { ctx, p, errors } = await open(dev);
    await p.tap('#emptyStartClassic');
    await p.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 60000 });
    await p.waitForFunction(settledFn, null, { timeout: 120000 });
    await sleep(400);
    const a = await p.evaluate(() => ({ tpl: AppState.templateId, start: !$('phoneStart').hidden, gen: els.generateBtn.disabled }));
    ok(a.tpl === 'etsyfolger-v1' && a.start && !a.gen, 'Classic Sleeve opens the normal start card ' + JSON.stringify(a));
    if (shots) await p.screenshot({ path: `${shots}/${name}-after-classic.png` });
    ok(errors.length === 0, 'no page errors');
    await ctx.close();
  }
}
// Export bytes after choosing Classic Sleeve match the website (desktop-size window, plain sleeve).
const hashes = {};
for (const flag of [false, true]) {
  const { ctx, p } = await open({ viewport: { width: 1440, height: 900 } }, flag);
  if (flag) {
    ok(await p.evaluate(() => CaviotEmptyStart.active), 'native desktop-size window also starts empty');
    await p.click('#emptyStartClassic');
    await p.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 60000 });
  } else ok(await p.evaluate(() => !CaviotEmptyStart.active && !document.getElementById('emptyStart')), 'website: no start screen');
  await p.waitForFunction(settledFn, null, { timeout: 120000 });
  const dl = p.waitForEvent('download', { timeout: 600000 });
  await p.click('#generateBtn');
  hashes[flag ? 'app' : 'web'] = await hashOf(await dl);
  await ctx.close();
}
ok(hashes.web === 'ffd3123a' && hashes.app === hashes.web, 'plain export bytes unchanged ' + JSON.stringify(hashes));
{
  const { ctx, p } = await open(devices['iPhone 14'], false);
  const t = await p.evaluate(() => $('phoneStartOwnSleeve').textContent);
  ok(/Use my own sleeve/.test(t), 'website keeps "Use my own sleeve (STL)…"');
  await ctx.close();
}
await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

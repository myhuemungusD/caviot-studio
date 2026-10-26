// usage: node e2e/status-strip-e2e.mjs <url> [shotsDir]
// The stats bar along the bottom (SRC/GRID/TRIS/SIZE/DIM/MESH/QUAL) must never print one value on top of the
// next label. Long values ellipsize inside their own cell (full text in the tooltip), the strip never scrolls
// sideways, and phones hide it. Checked on iPad 13"/11"/10.2" portrait and landscape, a 1280 laptop, a wide
// desktop and a phone, with deliberately long values (long file name, template stats, long quality text).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? '  PASS ' : '  FAIL ') + m);
};
const ipadUA = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const phoneUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const touch = (ua) => ({ isMobile: true, hasTouch: true, userAgent: ua });
// [name, width, height, context extras, native app flag, cells expected visible]
const cases = [
  ['ipad-13-portrait', 1032, 1376, touch(ipadUA), true, 5],
  ['ipad-13-landscape', 1376, 1032, touch(ipadUA), true, 7],
  ['ipad-11-portrait', 834, 1194, touch(ipadUA), true, 1],
  ['ipad-10-landscape', 1024, 768, touch(ipadUA), false, 5],
  ['laptop-1180', 1180, 800, {}, false, 5],
  ['laptop-1280', 1280, 800, {}, false, 7],
  ['desktop-1600', 1600, 900, {}, false, 7],
  ['phone', 390, 844, touch(phoneUA), true, 0],
];
const LONG = {
  statSource: 'my-really-long-company-logo-final-final-v7-transparent.png',
  statGrid: '1024×1024',
  statTris: '1,234,567',
  statSize: '61.73 MB',
  statVol: 'Original STL · 89 mm tall · 74 mm across',
  statQuality: 'Original cavity kept · closed edges',
  statQualityMode: 'sharp lettering · same in export',
};
for (const [name, width, height, extra, nativeApp, expectCells] of cases) {
  console.log(name + ' ' + width + '×' + height);
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...extra });
  if (nativeApp)
    await ctx.addInitScript(() => {
      window.CAVIOT_NEUTRAL_LABELS = true;
    });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(e.message));
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof els !== 'undefined' && !!els.statSource, null, { timeout: 60000 });
  // Phone/iPad app builds open on "Choose a template"; pick Classic Sleeve so the editor (and its stats bar) shows.
  if (await p.evaluate(() => !!(window.CaviotEmptyStart && CaviotEmptyStart.active))) {
    await p.click('#emptyStartClassic');
    await p.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 60000 });
  }
  await p.evaluate((vals) => {
    for (const [id, t] of Object.entries(vals)) document.getElementById(id).textContent = t;
  }, LONG);
  await p.waitForTimeout(150);
  const r = await p.evaluate(() => {
    const s = document.querySelector('.status-strip');
    const shown = s && getComputedStyle(s).display !== 'none';
    const kids = shown ? [...s.children].filter((e) => getComputedStyle(e).display !== 'none') : [];
    const boxes = kids.map((e) => {
      const b = e.getBoundingClientRect();
      // Right edge of what is actually painted: the text can spill past a shrunken cell unless clipped.
      const painted = getComputedStyle(e).overflow === 'hidden' ? b.right : b.left + e.scrollWidth;
      return { t: e.textContent.trim().slice(0, 24), l: b.left, r: b.right, painted, top: b.top, bot: b.bottom };
    });
    const overlaps = [];
    for (let i = 0; i + 1 < boxes.length; i++) if (boxes[i].painted > boxes[i + 1].l + 0.5) overlaps.push(boxes[i].t + ' → ' + boxes[i + 1].t);
    const sb = shown ? s.getBoundingClientRect() : null;
    const values = shown ? [...s.querySelectorAll('.stat-cell')].filter((c) => getComputedStyle(c).display !== 'none') : [];
    return {
      shown,
      cells: values.length,
      overlaps,
      scrolls: shown ? s.scrollWidth > s.clientWidth + 1 : false,
      oneLine: boxes.every((b) => b.bot - b.top <= 26),
      inside: shown ? boxes.every((b) => b.l >= sb.left - 0.5 && b.r <= sb.right + 0.5) : true,
      ellipsis: values.every((c) => {
        const v = c.querySelector('.v');
        return v.scrollWidth <= v.clientWidth + 1 || getComputedStyle(v).textOverflow === 'ellipsis';
      }),
      titles: values.every((c) => {
        const v = c.querySelector('.v');
        return v.title === v.textContent.trim();
      }),
      tips: shown ? document.getElementById('tipsToggle').getBoundingClientRect().height <= 20 : true,
      vw: document.documentElement.scrollWidth <= innerWidth,
    };
  });
  if (expectCells === 0) {
    ok(!r.shown, 'phone layout hides the stats bar');
  } else {
    ok(r.shown, 'stats bar visible');
    ok(r.cells === expectCells, `${expectCells} stat cells shown (got ${r.cells})`);
    ok(r.overlaps.length === 0, 'no value runs into the next label' + (r.overlaps.length ? ': ' + r.overlaps.join(', ') : ''));
    ok(!r.scrolls, 'stats bar fits without sideways scrolling');
    ok(r.inside, 'every cell and the Print tips link stay inside the bar');
    ok(r.oneLine, 'every cell stays on one line');
    ok(r.tips, 'Print tips stays on one line');
    ok(r.ellipsis, 'long values ellipsize inside their cell');
    ok(r.titles, 'full value kept as the tooltip');
  }
  ok(r.vw, 'page does not scroll sideways');
  ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors[0] : ''));
  if (shots) {
    const y = Math.max(0, height - 80);
    await p.screenshot({ path: `${shots}/status-strip-${name}.png`, clip: { x: 0, y, width, height: height - y } });
  }
  await ctx.close();
}
await browser.close();
console.log(`status strip: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

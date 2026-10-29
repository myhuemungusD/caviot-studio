// Full user journey in a real browser on desktop, iPhone (web) and Android (phone-app flag) viewports:
// import an STL as the template, add a logo, emboss / deboss / invert, add a photo and text, export STL and OBJ
// (checked for a well-formed, closed mesh), save the project, reopen it in a fresh page and export identical bytes,
// then switch templates from the phone picker. Any console error/warning, page error, failed request or HTTP
// error fails the run.
// usage: node e2e/journey-e2e.mjs <url> [shotsDir]   (ONLY=desktop|phone-web-iphone|phone-android-app runs one)
import { chromium, devices } from 'playwright-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const base = (process.argv[2] || 'http://127.0.0.1:4173/').replace(/\/?$/, '/');
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
const FIX = new URL('./fixtures/', import.meta.url).pathname;
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
async function openText(p) {
  if (await p.locator('#textInput').isVisible()) return 'visible';
  const b = p.locator('[data-add="text"]:visible').first();
  if (await b.count()) {
    await b.tap().catch(() => b.click());
    await sleep(400);
    if (await p.locator('#textInput').isVisible()) return 'tapped Text button';
  }
  await p
    .locator('#mobileSettingsBtn')
    .tap()
    .catch(() => {});
  await sleep(600);
  await p
    .locator('.phone-rail-btn[data-target="phoneSecAdd"]')
    .tap()
    .catch(() => {});
  await sleep(600);
  const b2 = p.locator('[data-add="text"]:visible').first();
  if (await b2.count()) {
    await b2.tap();
    await sleep(400);
  }
  return 'opened sheet > Add > Text: visible=' + (await p.locator('#textInput').isVisible());
}
const settledFn = () =>
  typeof templatePreviewRunning !== 'undefined' &&
  !!templateBase &&
  !templatePreviewRunning &&
  !templatePending &&
  !placementTimer &&
  !AppState.rebuildTimer &&
  !exportBusy;
async function settle(p, ms = 240000) {
  await sleep(300);
  await p.waitForFunction(settledFn, null, { timeout: ms, polling: 250 }).catch(() => ok(false, 'settle timeout'));
  await sleep(200);
}
// binary STL cube 40x40x60 (a sleeve-ish block)
function stlBox(w, d, h) {
  const v = [
    [0, 0, 0],
    [w, 0, 0],
    [w, d, 0],
    [0, d, 0],
    [0, 0, h],
    [w, 0, h],
    [w, d, h],
    [0, d, h],
  ];
  const f = [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [1, 2, 6],
    [1, 6, 5],
    [2, 3, 7],
    [2, 7, 6],
    [3, 0, 4],
    [3, 4, 7],
  ];
  const b = Buffer.alloc(84 + 50 * f.length);
  b.writeUInt32LE(f.length, 80);
  f.forEach((t, i) => {
    let o = 84 + i * 50 + 12;
    for (const k of t)
      for (const c of v[k]) {
        b.writeFloatLE(c, o);
        o += 4;
      }
  });
  return b;
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jr-'));
const stlFile = path.join(tmp, 'block.stl');
fs.writeFileSync(stlFile, stlBox(40, 40, 60));
function parseStl(buf) {
  if (buf.slice(0, 5).toString() === 'solid' && buf.toString('latin1').includes('facet')) {
    const n = (buf.toString().match(/facet normal/g) || []).length;
    return { ascii: true, tris: n };
  }
  const n = buf.readUInt32LE(80);
  let bad = 0;
  const edges = new Map();
  const key = (o) => buf.toString('hex', o, o + 12);
  for (let i = 0; i < n; i++) {
    const o = 84 + i * 50 + 12;
    const vs = [key(o), key(o + 12), key(o + 24)];
    for (let j = 0; j < 3; j++) {
      const a = vs[j],
        c = vs[(j + 1) % 3];
      const k = a < c ? a + '|' + c : c + '|' + a;
      edges.set(k, (edges.get(k) || 0) + 1);
    }
    for (let j = 0; j < 9; j++) if (!Number.isFinite(buf.readFloatLE(o + j * 4))) bad++;
  }
  let open = 0,
    nonman = 0;
  for (const c of edges.values()) {
    if (c === 1) open++;
    else if (c > 2) nonman++;
  }
  return { tris: n, size: buf.length, expected: 84 + 50 * n, bad, open, nonman };
}
async function open(name, opts, nativeFlag) {
  const ctx = await browser.newContext({ ...opts, acceptDownloads: true });
  if (nativeFlag)
    await ctx.addInitScript(() => {
      window.CAVIOT_NEUTRAL_LABELS = true;
    });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  p.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300));
  });
  p.on('requestfailed', (r) => errs.push('requestfailed: ' + r.url() + ' ' + (r.failure()?.errorText || '')));
  p.on('response', (r) => {
    if (r.status() >= 400) errs.push('http ' + r.status() + ' ' + r.url());
  });
  await p.goto(base, { waitUntil: 'load' });
  await p.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  return { ctx, p, errs };
}
async function download(p, fn) {
  const dl = p.waitForEvent('download', { timeout: 600000 }).catch(() => null);
  let done = false;
  dl.then(() => {
    done = true;
  });
  const run = Promise.resolve(fn()).catch((e) => console.log('   fn error ' + e.message));
  // Phones show a "file ready" sheet (iOS always; Android when the browser can share): tap its Download button.
  (async () => {
    while (!done) {
      const hit = await p
        .evaluate(() => {
          const b = document.querySelector('dialog[open] [data-act="download"]');
          if (b && !b.hidden) {
            b.click();
            return true;
          }
          return false;
        })
        .catch(() => false);
      if (hit) {
        sheetTaps++;
        break;
      }
      await sleep(250);
    }
  })();
  const d = await dl;
  await run;
  await p.evaluate(() => document.querySelector('dialog[open] [data-act="close"]')?.click()).catch(() => {});
  if (!d) return null;
  return { name: d.suggestedFilename(), buf: fs.readFileSync(await d.path()) };
}
let sheetTaps = 0;
async function exportStl(p) {
  return download(p, () => p.evaluate(() => exportCurrent('stl')));
}
async function exportObj(p) {
  return download(p, () => p.evaluate(() => exportCurrent('obj')));
}

async function journey(name, opts, nativeFlag) {
  console.log('== ' + name);
  const { ctx, p, errs } = await open(name, opts, nativeFlag);
  if (nativeFlag) {
    const es = await p.evaluate(() => typeof CaviotEmptyStart !== 'undefined' && CaviotEmptyStart.active);
    ok(es, 'native start screen shows "Choose a template"');
    if (shots) if (shots) await p.screenshot({ path: `${shots}/${name}-0-start.png` });
  }
  // 1. Import STL as template
  await p.setInputFiles('#templateStlInput', stlFile);
  await p.waitForFunction(() => AppState.templateId === 'custom-stl', null, { timeout: 120000 }).catch(() => {});
  await settle(p);
  const tpl = await p.evaluate(() => ({
    id: AppState.templateId,
    es: typeof CaviotEmptyStart !== 'undefined' ? CaviotEmptyStart.active : null,
    gen: els.generateBtn.disabled,
  }));
  ok(tpl.id === 'custom-stl' && !tpl.es && !tpl.gen, 'import STL becomes the template ' + JSON.stringify(tpl));
  if (shots) await p.screenshot({ path: `${shots}/${name}-1-stl.png` });
  // 2. Logo / photo
  await p.setInputFiles('#fileInput', FIX + 'badge.png');
  await p.waitForFunction(() => !!AppState.image, null, { timeout: 60000 }).catch(() => {});
  await settle(p);
  ok(await p.evaluate(() => !!AppState.image), 'logo image added');
  const e1 = await exportStl(p);
  const s1 = e1 && parseStl(e1.buf);
  ok(e1 && s1.tris > 12 && s1.size === s1.expected && !s1.bad && !s1.open && !s1.nonman, 'emboss logo STL export ' + JSON.stringify({ n: e1?.name, ...s1 }));
  // deboss
  await p.evaluate(() => document.getElementById('modeCarved').click());
  await settle(p);
  const e2 = await exportStl(p);
  const s2 = e2 && parseStl(e2.buf);
  ok(e2 && s2.tris > 12 && !s2.bad && e2.buf.compare(e1.buf) !== 0, 'deboss STL export differs from emboss ' + JSON.stringify(s2));
  await p.evaluate(() => document.getElementById('modeRaised').click());
  await settle(p);
  // invert
  const inv0 = await p.getAttribute('#invertRelief', 'aria-pressed');
  await p.evaluate(() => document.getElementById('invertRelief').click());
  await settle(p);
  const inv1 = await p.getAttribute('#invertRelief', 'aria-pressed');
  ok(inv0 !== inv1, 'invert toggles ' + inv0 + '->' + inv1);
  const e3 = await exportStl(p);
  ok(e3 && e3.buf.compare(e1.buf) !== 0, 'inverted export differs');
  await p.evaluate(() => document.getElementById('invertRelief').click());
  await settle(p);
  if (shots) await p.screenshot({ path: `${shots}/${name}-2-logo.png` });
  // 3. Photo (replace image)
  const nImg = await p.evaluate(() => designLayers.flat().filter((s) => s.image).length);
  await p.setInputFiles('#fileInput', FIX + 'portrait.jpg');
  await p.waitForSelector('#dropChoice[open], dialog[open] [data-choice="add"]', { timeout: 15000 }).catch(() => {});
  await p.evaluate(() => document.querySelector('dialog[open] [data-choice="add"]')?.click());
  await p.waitForFunction((n) => designLayers.flat().filter((s) => s.image).length > n, nImg, { timeout: 60000 }).catch(() => {});
  await settle(p);
  ok(await p.evaluate((n) => designLayers.flat().filter((s) => s.image).length === n + 1, nImg), 'photo added as a second design layer');
  if (shots) await p.screenshot({ path: `${shots}/${name}-3-photo.png` });
  // 4. Text
  console.log('   text: ' + (await openText(p)));
  await p.fill('#textInput', 'CAVIOT');
  await sleep(500);
  await settle(p);
  const tl = await p.evaluate(() => ({
    kind: designSides[activeDesignSide]?.kind,
    text: AppState.text,
    src: AppState.sourceLabel,
    layers: designLayers.flat().map((s) => s.kind),
  }));
  ok(tl.kind === 'text' && tl.text === 'CAVIOT' && tl.layers.length === 3, 'text layer CAVIOT ' + JSON.stringify(tl));
  if (shots) await p.screenshot({ path: `${shots}/${name}-4-text.png` });
  const st = await exportStl(p);
  const ss = st && parseStl(st.buf);
  ok(st && ss.tris > 12 && ss.size === ss.expected && !ss.bad && !ss.open && !ss.nonman, 'text STL export ' + JSON.stringify({ n: st?.name, ...ss }));
  const ob = await exportObj(p);
  const otxt = ob ? ob.buf.toString() : '';
  const vN = (otxt.match(/^v /gm) || []).length,
    fN = (otxt.match(/^f /gm) || []).length;
  let maxIdx = 0;
  for (const l of otxt.match(/^f .*/gm) || [])
    for (const x of l.slice(2).trim().split(/\s+/)) {
      const k = +x.split('/')[0];
      if (k > maxIdx) maxIdx = k;
    }
  ok(ob && /\.obj$/i.test(ob.name) && vN > 0 && fN > 0 && maxIdx <= vN && !/NaN/.test(otxt), 'OBJ export ' + JSON.stringify({ n: ob?.name, vN, fN, maxIdx }));
  // 5. Save + reopen
  const summ = () => ({
    tpl: AppState.templateId,
    layers: designLayers.flat().map((s) => [s.kind, !!s.image, s.text || '', s.fontChoice || '']),
    mode: document.querySelector('input[name=reliefMode]:checked')?.value,
  });
  const before = await p.evaluate(summ);
  const sv = await download(p, () => p.evaluate(() => document.getElementById('saveProject').click()));
  let proj = null;
  try {
    proj = JSON.parse(sv.buf.toString());
  } catch {}
  ok(sv && /\.icaviot$/.test(sv.name) && proj, 'project saved ' + sv?.name + ' ' + (sv?.buf.length || 0) + 'B v' + proj?.version);
  const { ctx: c2, p: p2, errs: errs2 } = await open(name + '-reopen', opts, nativeFlag);
  const pf = path.join(tmp, name + '.icaviot');
  fs.writeFileSync(pf, sv.buf);
  await p2.setInputFiles('#projectFile', pf);
  await sleep(1000);
  await settle(p2);
  const after = await p2.evaluate(summ);
  ok(JSON.stringify(after) === JSON.stringify(before), 'reopened project matches ' + JSON.stringify({ before, after }));
  const st2 = await exportStl(p2);
  ok(st2 && st2.buf.compare(st.buf) === 0, 'reopened project exports identical STL bytes');
  if (shots) await p2.screenshot({ path: `${shots}/${name}-5-reopen.png` });
  ok(errs.length === 0, 'no console errors/warnings/failed requests ' + JSON.stringify(errs.slice(0, 8)));
  ok(errs2.length === 0, 'no console errors on reopen ' + JSON.stringify(errs2.slice(0, 8)));
  await c2.close();
  await ctx.close();
}
async function phonePicker(name, opts, nativeFlag) {
  console.log('== template picker ' + name);
  const { ctx, p, errs } = await open(name, opts, nativeFlag);
  if (nativeFlag) {
    await p.tap('#emptyStartClassic');
    await p.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 60000 });
  }
  await settle(p);
  const info = await p.evaluate(() => {
    const s = $('templateChoice');
    return { tag: s?.tagName, opts: s ? [...(s.options || [])].map((o) => o.value + ':' + o.textContent.trim()) : [], cur: AppState.templateId };
  });
  ok(info.opts.length >= 1, 'template choices ' + JSON.stringify(info));
  // switch to every non-custom option and back
  for (const v of info.opts.map((o) => o.split(':')[0]).filter((v) => v && !/custom/.test(v))) {
    await p.evaluate((v) => {
      const s = $('templateChoice');
      s.value = v;
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }, v);
    await settle(p);
    const cur = await p.evaluate(() => AppState.templateId);
    ok(cur === v || cur.startsWith(v), 'switch template -> ' + v + ' (' + cur + ')');
  }
  if (shots) await p.screenshot({ path: `${shots}/${name}-picker.png` });
  ok(errs.length === 0, 'no console errors ' + JSON.stringify(errs.slice(0, 8)));
  await ctx.close();
}
const only = process.env.ONLY || '';
const runs = [
  ['desktop', { viewport: { width: 1440, height: 900 } }, false],
  ['phone-web-iphone', devices['iPhone 14'], false],
  ['phone-android-app', devices['Pixel 7'], true],
];
for (const [n, o, f] of runs)
  if (!only || only === n) {
    try {
      await journey(n, o, f);
    } catch (e) {
      ok(false, n + ' threw ' + e.message.split('\n')[0]);
    }
  }
for (const [n, o, f] of runs.slice(1))
  if (!only || only === n) {
    try {
      await phonePicker(n, o, f);
    } catch (e) {
      ok(false, n + ' picker threw ' + e.message.split('\n')[0]);
    }
  }
console.log('file-ready sheet taps: ' + sheetTaps);
console.log(`journey: ${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);

// usage: node e2e/pro-paywall-e2e.mjs [wwwDir] [shotsDir]
// The iPhone/iPad app's Caviot Studio Pro paywall, with the native StoreKit bridge mocked in the page.
// Serves the phone-app copy (mobile/www, from `node mobile/scripts/sync-www.mjs`) and checks:
// export opens the paywall when locked, saving a project stays free, offline and failed purchases explain
// themselves, Restore Purchases works, a purchase continues the export, TestFlight builds before the product
// exists stay unlocked, an owned unlock skips the paywall, and Android and the website never show it.
import { chromium } from 'playwright-core';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'mobile/www');
const shots = process.argv[3] || '';
if (shots) fs.mkdirSync(shots, { recursive: true });
if (!fs.existsSync(path.join(root, 'pro-paywall.js'))) {
  console.error('Missing ' + root + '/pro-paywall.js. Run: node mobile/scripts/sync-www.mjs');
  process.exit(1);
}

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
};
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (path.relative(root, file).startsWith('..')) {
    res.writeHead(403);
    return res.end();
  }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404);
      return res.end();
    }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': stat.size });
    fs.createReadStream(file).pipe(res);
  });
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port + '/';

const browser = await chromium.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let pass = 0;
let fail = 0;
const ok = (condition, message) => {
  if (condition) pass += 1;
  else fail += 1;
  console.log((condition ? '  PASS ' : '  FAIL ') + message);
};

// Runs in the page before any script: a Capacitor shell whose CaviotNative plugin answers like the Swift side.
// window.__mock can be changed during a test; every call is logged in window.__calls.
function mockNative(scenario) {
  const mock = (window.__mock = { ...scenario });
  const calls = (window.__calls = []);
  const writes = (window.__writes = []);
  const listeners = {};
  const fail = (code, message) => Promise.reject(Object.assign(new Error(message || code), { code }));
  const native = {
    getLaunchFlags: async () => ({ smoke: false }),
    report: async () => ({}),
    takePendingFiles: async () => ({ files: [] }),
    addListener(name, fn) {
      (listeners[name] = listeners[name] || []).push(fn);
      return Promise.resolve({ remove() {} });
    },
    async proStatus() {
      calls.push('status');
      return { pro: !!mock.owned, environment: mock.environment, productId: 'com.caviot.studio.pro' };
    },
    async proProduct() {
      calls.push('product');
      if (mock.product === 'hang') return new Promise(() => {});
      if (mock.product === 'offline') return fail('offline', 'The Internet connection appears to be offline.');
      if (mock.product === 'not-found') return { available: false, reason: 'not-found', environment: mock.environment };
      return {
        available: true,
        productId: 'com.caviot.studio.pro',
        displayName: 'Caviot Studio Pro',
        description: 'Unlock export',
        displayPrice: '$9.99',
        environment: mock.environment,
      };
    },
    async proPurchase() {
      calls.push('purchase');
      await new Promise((resolve) => setTimeout(resolve, 50));
      switch (mock.purchase) {
        case 'purchased':
          mock.owned = true;
          return { status: 'purchased', pro: true };
        case 'cancelled':
          return { status: 'cancelled', pro: false };
        case 'pending':
          return { status: 'pending', pro: false };
        case 'offline':
          return fail('offline', 'The Internet connection appears to be offline.');
        case 'not-allowed':
          return fail('not-allowed', 'Purchases are not allowed.');
        default:
          return fail('store', 'Something went wrong.');
      }
    },
    async proRestore() {
      calls.push('restore');
      if (mock.restore === 'offline') return fail('offline', 'The Internet connection appears to be offline.');
      if (mock.restore === 'restored') {
        mock.owned = true;
        return { status: 'restored', pro: true };
      }
      return { status: 'none', pro: false };
    },
  };
  window.__emit = (name, data) => (listeners[name] || []).forEach((fn) => fn(data));
  const sizes = {};
  const decoded = (data) => Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  const filesystem = {
    async writeFile({ path, data }) {
      sizes[path] = decoded(data);
      writes.push(path);
      return { uri: 'file:///Documents/' + path };
    },
    async appendFile({ path, data }) {
      sizes[path] += decoded(data);
    },
    async stat({ path }) {
      return { size: sizes[path] };
    },
    async getUri({ path }) {
      return { uri: 'file:///Documents/' + path };
    },
    async deleteFile() {},
  };
  const share = {
    canShare: async () => ({ value: true }),
    share: async () => fail('cancelled', 'Share canceled'),
  };
  window.Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => scenario.platform || 'ios',
    registerPlugin: (name) => (name === 'CaviotNative' ? native : {}),
    Plugins: { Filesystem: filesystem, Share: share },
  };
}

async function open(scenario) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, serviceWorkers: 'block' });
  if (scenario) await context.addInitScript(mockNative, scenario);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('dialog', (dialog) => dialog.accept());
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForFunction(() => typeof templateBase !== 'undefined' && !!templateBase, null, { timeout: 120000 });
  if (await page.evaluate(() => typeof CaviotEmptyStart !== 'undefined' && CaviotEmptyStart.active)) {
    await page.click('#emptyStartClassic');
    await page.waitForFunction(() => !CaviotEmptyStart.active, null, { timeout: 60000 });
  }
  await page.waitForFunction(() => !document.getElementById('generateBtn').disabled, null, { timeout: 120000 });
  if (scenario && (scenario.platform || 'ios') === 'ios') await page.waitForFunction(() => globalThis.CaviotPro, null, { timeout: 10000 });
  return { context, page, errors };
}

const paywallOpen = (page) => page.evaluate(() => !!document.getElementById('proPaywall')?.open);
const message = (page) => page.evaluate(() => document.getElementById('proPaywallMessage')?.textContent || '');
const writes = (page) => page.evaluate(() => window.__writes.slice());
async function waitWrite(page, pattern, ms = 300000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const list = await writes(page);
    const hit = list.find((name) => pattern.test(name));
    if (hit) return hit;
    await sleep(300);
  }
  return null;
}
async function idle(page) {
  await page.waitForFunction(() => typeof exportBusy === 'undefined' || !exportBusy, null, { timeout: 300000 });
}

// 1. App Store build, starts offline, then buys Pro.
{
  console.log('ios production: locked, offline, failures, purchase');
  const { context, page, errors } = await open({ environment: 'production', product: 'offline', purchase: 'cancelled', restore: 'offline' });
  await page.evaluate(() => CaviotPro.ready());
  ok(await page.evaluate(() => document.documentElement.classList.contains('caviot-pro-locked')), 'export buttons are marked Pro while locked');
  await page.click('#saveProject');
  ok(!!(await waitWrite(page, /\.icaviot$/, 30000)), 'saving a .icaviot project stays free');
  ok(!(await paywallOpen(page)), 'saving a project does not open the paywall');
  await page.click('#generateBtn');
  await page.waitForFunction(() => document.getElementById('proPaywall')?.open, null, { timeout: 10000 });
  ok(true, 'Export STL opens the paywall when Pro is locked');
  const offline = await page.evaluate(() => ({
    price: document.getElementById('proPaywallPrice').textContent,
    buy: document.querySelector('[data-pro="buy"]').disabled,
  }));
  ok(/offline/i.test(offline.price) && offline.buy, 'offline: the price explains it is offline and Unlock waits ' + JSON.stringify(offline));
  ok(
    await page.evaluate(() => /Free:.*save projects/i.test(document.getElementById('proPaywall').textContent)),
    'the paywall says designing and saving stay free'
  );
  ok(
    await page.evaluate(() => !!document.querySelector('#proPaywall a[href*="stdeula"]') && !!document.querySelector('#proPaywall a[href*="privacy"]')),
    'Terms of Use and Privacy Policy links are shown'
  );
  await page.click('#proPaywall [data-pro="restore"]');
  await page.waitForFunction(() => /offline/i.test(document.getElementById('proPaywallMessage').textContent), null, { timeout: 10000 });
  ok(true, 'offline Restore Purchases says it is offline');
  if (shots) await page.screenshot({ path: shots + '/paywall-offline.png' });
  await page.click('#proPaywall [data-pro="close"]');
  ok(!(await paywallOpen(page)), 'Not now closes the paywall');
  await sleep(500);
  ok(!(await writes(page)).some((name) => /\.stl$/.test(name)), 'no STL is written without Pro');

  await page.evaluate(() => {
    window.__mock.product = 'ready';
  });
  await page.click('#downloadObjBtn');
  await page.waitForFunction(
    () => document.getElementById('proPaywall')?.open && /\$9\.99/.test(document.getElementById('proPaywallPrice').textContent),
    null,
    { timeout: 10000 }
  );
  ok(
    await page.evaluate(
      () => document.querySelector('[data-pro="buy"]').textContent === 'Unlock Pro for $9.99' && !document.querySelector('[data-pro="buy"]').disabled
    ),
    'back online: OBJ opens the paywall with the App Store price'
  );
  if (shots) await page.screenshot({ path: shots + '/paywall.png' });
  await page.click('#proPaywall [data-pro="buy"]');
  await page.waitForFunction(() => window.__calls.includes('purchase') && !document.querySelector('[data-pro="buy"]').disabled, null, { timeout: 10000 });
  ok((await paywallOpen(page)) && (await message(page)) === '', 'a cancelled purchase keeps the paywall open quietly');
  await page.evaluate(() => {
    window.__mock.purchase = 'pending';
  });
  await page.click('#proPaywall [data-pro="buy"]');
  await page.waitForFunction(() => /approv/i.test(document.getElementById('proPaywallMessage').textContent), null, { timeout: 10000 });
  ok(true, 'Ask to Buy (pending) explains it is waiting for approval');
  await page.evaluate(() => {
    window.__mock.purchase = 'store';
  });
  await page.click('#proPaywall [data-pro="buy"]');
  await page.waitForFunction(() => /could not complete/i.test(document.getElementById('proPaywallMessage').textContent), null, { timeout: 10000 });
  ok(await page.evaluate(() => document.getElementById('proPaywallMessage').dataset.kind === 'error'), 'a failed purchase shows an error and nothing unlocks');
  await page.evaluate(() => {
    window.__mock.restore = 'none';
  });
  await page.click('#proPaywall [data-pro="restore"]');
  await page.waitForFunction(() => /No Caviot Studio Pro purchase/.test(document.getElementById('proPaywallMessage').textContent), null, { timeout: 10000 });
  ok(true, 'Restore Purchases with nothing bought says so');
  ok(!(await writes(page)).some((name) => /\.(stl|obj)$/.test(name)), 'still no mesh export after failures');

  await page.evaluate(() => {
    window.__mock.purchase = 'purchased';
  });
  await page.click('#proPaywall [data-pro="buy"]');
  const obj = await waitWrite(page, /\.obj$/);
  ok(!!obj && !(await paywallOpen(page)), 'buying Pro closes the paywall and continues the OBJ export (' + obj + ')');
  ok(
    await page.evaluate(() => document.documentElement.classList.contains('caviot-pro') && !document.documentElement.classList.contains('caviot-pro-locked')),
    'the app shows Pro as unlocked'
  );
  await idle(page);
  await page.click('#generateBtn');
  await sleep(300);
  ok(!(await paywallOpen(page)), 'after buying, Export STL skips the paywall');
  ok(!!(await waitWrite(page, /\.stl$/)), 'and writes the STL');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await context.close();
}

// 2. Restore Purchases on a new device continues the export; also the Ctrl/Cmd+E shortcut is gated.
{
  console.log('ios production: restore');
  const { context, page, errors } = await open({ environment: 'production', product: 'ready', purchase: 'store', restore: 'restored' });
  await page.evaluate(() => CaviotPro.ready());
  await page.keyboard.press('Control+e');
  await page.waitForFunction(() => document.getElementById('proPaywall')?.open, null, { timeout: 10000 });
  ok(true, 'the Ctrl/Cmd+E shortcut opens the paywall too');
  await page.click('#proPaywall [data-pro="restore"]');
  ok(!!(await waitWrite(page, /\.stl$/)), 'Restore Purchases unlocks and continues the export');
  ok(
    await page.evaluate(() => !!document.querySelector('#proPanel') && /unlocked/i.test(document.getElementById('proPanelStatus').textContent)),
    'the settings Pro row says unlocked'
  );
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await context.close();
}

// 3. Already owned (bought earlier; StoreKit entitlements also work offline).
{
  console.log('ios production: owned');
  const { context, page, errors } = await open({ environment: 'production', owned: true, product: 'offline' });
  await page.evaluate(() => CaviotPro.ready());
  await page.click('#generateBtn');
  await sleep(300);
  ok(!(await paywallOpen(page)), 'an owned unlock exports with no paywall, even offline');
  ok(!!(await waitWrite(page, /\.stl$/)), 'owned: STL written');
  ok(await page.evaluate(() => !window.__calls.includes('product')), 'owned: the App Store product is not even requested');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await context.close();
}

// 4. App Store build where the product is missing: stays locked (never a free unlock in production).
{
  console.log('ios production: product missing');
  const { context, page } = await open({ environment: 'production', product: 'not-found' });
  await page.evaluate(() => CaviotPro.ready());
  await page.click('#generateBtn');
  await page.waitForFunction(() => document.getElementById('proPaywall')?.open, null, { timeout: 10000 });
  const state = await page.evaluate(() => ({
    buy: document.querySelector('[data-pro="buy"]').disabled,
    price: document.getElementById('proPaywallPrice').textContent,
  }));
  ok(state.buy && /not available/i.test(state.price), 'production with no product: paywall stays, Unlock disabled ' + JSON.stringify(state));
  await context.close();
}

// 4b. The App Store never answers the product lookup: Export still opens the paywall straight away.
{
  console.log('ios production: App Store not answering');
  const { context, page, errors } = await open({ environment: 'production', product: 'hang' });
  await sleep(300);
  await page.click('#generateBtn');
  await page.waitForFunction(() => document.getElementById('proPaywall')?.open, null, { timeout: 3000 });
  ok(true, 'a stalled product lookup does not block the paywall');
  ok(!(await writes(page)).some((name) => /\.stl$/.test(name)), 'stalled lookup: nothing exported');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await context.close();
}

// 5. TestFlight (sandbox) before the product exists in App Store Connect: export stays open for testers.
{
  console.log('ios sandbox: product not created yet');
  const { context, page, errors } = await open({ environment: 'sandbox', product: 'not-found' });
  await page.evaluate(() => CaviotPro.ready());
  await page.click('#generateBtn');
  await sleep(300);
  ok(!(await paywallOpen(page)), 'TestFlight before the product exists: no paywall');
  ok(!!(await waitWrite(page, /\.stl$/)), 'TestFlight before the product exists: STL written');
  ok(await page.evaluate(() => /Test build/.test(document.getElementById('proPanelStatus').textContent)), 'the Pro row says this is a test build');
  ok(errors.length === 0, 'no page errors ' + JSON.stringify(errors));
  await context.close();
}

// 6. TestFlight once the product exists: the real paywall (sandbox purchases are free for testers).
{
  console.log('ios sandbox: product exists');
  const { context, page } = await open({ environment: 'sandbox', product: 'ready', purchase: 'purchased' });
  await page.evaluate(() => CaviotPro.ready());
  await page.click('#generateBtn');
  await page.waitForFunction(() => document.getElementById('proPaywall')?.open, null, { timeout: 10000 });
  ok(true, 'TestFlight with the product: the paywall shows');
  await page.click('#proPaywall [data-pro="buy"]');
  ok(!!(await waitWrite(page, /\.stl$/)), 'TestFlight sandbox purchase unlocks and exports');
  await context.close();
}

// 7. Android and the website never see Pro.
for (const [name, scenario] of [
  ['android', { platform: 'android', environment: 'production', product: 'ready' }],
  ['website', null],
]) {
  console.log(name);
  const { context, page, errors } = await open(scenario);
  await sleep(500);
  const state = await page.evaluate(() => ({
    api: typeof globalThis.CaviotPro,
    dialog: !!document.getElementById('proPaywall'),
    panel: !!document.getElementById('proPanel'),
    locked: document.documentElement.classList.contains('caviot-pro-locked'),
    calls: (window.__calls || []).length,
  }));
  ok(
    state.api === 'undefined' && !state.dialog && !state.panel && !state.locked && state.calls === 0,
    name + ': no paywall, no Pro row, no StoreKit calls ' + JSON.stringify(state)
  );
  ok(errors.length === 0, name + ': no page errors ' + JSON.stringify(errors));
  await context.close();
}

await browser.close();
server.close();
console.log('pro paywall e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

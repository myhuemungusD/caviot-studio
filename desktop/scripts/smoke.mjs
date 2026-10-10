// Headless smoke test for the desktop wrapper.
// Launches the Electron app and the same dist/ over the local web server, adds
// lettering on the default ETSYFOLGER sleeve, and compares the STL bytes.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { _electron as electron } from 'playwright-core';
import { testSafePath } from './safe-path.test.mjs';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '..');
const exportDir = fs.mkdtempSync(path.join(os.tmpdir(), 'caviot-export-'));
function writableDir(preferred) {
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    return preferred;
  } catch {
    const fallback = path.join(os.tmpdir(), 'caviot-screenshots');
    fs.mkdirSync(fallback, { recursive: true });
    return fallback;
  }
}
const shotDir = writableDir(process.env.CAVIOT_SCREENSHOT_DIR || '/opt/cursor/artifacts/screenshots');
const TEXT = 'CAVIOT';
const EXPORT_TIMEOUT_MS = 8 * 60 * 1000;

testSafePath();
console.log('safe-path: ok');

const failures = [];
function check(cond, message) {
  if (cond) console.log('  PASS', message);
  else {
    failures.push(message);
    console.error('  FAIL', message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port) {
  const url = `http://127.0.0.1:${port}/__caviot_health`;
  const started = Date.now();
  while (Date.now() - started < 20000) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      /* server still starting */
    }
    await sleep(100);
  }
  throw new Error('Local studio server did not start');
}

function startWebServer(port) {
  const child = spawn(process.execPath, ['serve.mjs', String(port)], {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let log = '';
  const take = (chunk) => {
    log = (log + chunk.toString()).slice(-4000);
  };
  child.stdout.on('data', take);
  child.stderr.on('data', take);
  child.log = () => log;
  return child;
}

async function settle(page, ms = 180000) {
  const started = Date.now();
  while (Date.now() - started < ms) {
    const ready = await page.evaluate(() => {
      const preview = typeof templatePreviewRunning !== 'undefined' && (templatePreviewRunning || templatePending);
      return !AppState.rebuildTimer && !exportBusy && !preview;
    });
    if (ready) return true;
    await sleep(200);
  }
  return false;
}

async function waitReady(page) {
  await page.waitForFunction(() => {
    const button = document.getElementById('generateBtn');
    const logo = document.getElementById('bottomBrandEnabled');
    const status = document.getElementById('templateStatus')?.textContent || '';
    return typeof templateBase !== 'undefined' && !!templateBase
      && AppState.templateId === 'etsyfolger-v1'
      && document.getElementById('templateChoice')?.value === 'etsyfolger-v1'
      && button && !button.disabled
      && logo && !logo.disabled
      && !exportBusy
      && !/Loading your sleeve/i.test(status);
  }, null, { timeout: 180000 });
  await settle(page);
}

function clearDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}

async function waitForExport(dir) {
  const started = Date.now();
  while (Date.now() - started < EXPORT_TIMEOUT_MS) {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    const statusName = names.find((name) => name.endsWith('.status'));
    if (statusName) {
      const state = fs.readFileSync(path.join(dir, statusName), 'utf8').trim();
      if (state !== 'completed') throw new Error(`Save finished as ${state} (${names.join(', ')})`);
      const stlName = names.find((name) => name.toLowerCase().endsWith('.stl'));
      if (!stlName) throw new Error(`No STL was written (${names.join(', ')})`);
      return path.join(dir, stlName);
    }
    await sleep(250);
  }
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  throw new Error(`Timed out waiting for an STL in ${dir} (${names.join(', ') || 'empty'})`);
}

async function exportStl(page, dir, label) {
  clearDir(dir);
  await waitReady(page);
  const started = Date.now();
  const timer = setInterval(() => {
    page.evaluate(() => ({
      button: document.getElementById('generateBtn')?.textContent || '',
      status: document.getElementById('templateStatus')?.textContent || '',
    })).then((info) => {
      console.log(`[smoke] ${label} ${Math.round((Date.now() - started) / 1000)}s ${info.button.trim()} | ${info.status.trim()}`);
    }).catch(() => {});
  }, 5000);
  try {
    await page.click('#generateBtn');
    const file = await waitForExport(dir);
    const bytes = fs.readFileSync(file);
    console.log(`[smoke] ${label} wrote ${path.basename(file)} (${bytes.length} bytes) in ${Math.round((Date.now() - started) / 1000)}s`);
    return { file, bytes };
  } finally {
    clearInterval(timer);
  }
}

function stlCount(bytes) {
  if (bytes.length < 84) return 0;
  return bytes.readUInt32LE(80);
}

function assertIdentical(left, right, label) {
  const same = left.bytes.length === right.bytes.length && left.bytes.equals(right.bytes);
  const count = stlCount(left.bytes);
  const expected = 84 + count * 50;
  check(count > 0 && left.bytes.length === expected, `${label}: STL has ${count} triangles (${left.bytes.length} bytes)`);
  if (same) {
    check(true, `${label}: desktop STL matches the web build byte for byte`);
    return;
  }
  const length = Math.min(left.bytes.length, right.bytes.length);
  let offset = 0;
  while (offset < length && left.bytes[offset] === right.bytes[offset]) offset += 1;
  check(false, `${label}: STL bytes differ at ${offset} (desktop ${left.bytes.length}, web ${right.bytes.length})`);
}

async function addText(page) {
  await page.fill('#textInput', TEXT);
  await page.waitForFunction((text) => (AppState.sourceLabel || '').startsWith('text:' + text) && !!AppState.image, TEXT, { timeout: 60000 });
  const settled = await settle(page);
  check(settled, 'text design finished rebuilding');
}

async function shot(page, name) {
  try {
    const file = path.join(shotDir, name);
    await page.screenshot({ path: file, animations: 'disabled' });
    console.log('[smoke] screenshot', file);
    return file;
  } catch (error) {
    console.error('[smoke] screenshot skipped:', error instanceof Error ? error.message : error);
    return '';
  }
}

const port = await freePort();
const server = startWebServer(port);
let electronApp;
try {
  await waitForHealth(port);
  console.log('[smoke] web server on', port);
  electronApp = await electron.launch({
    cwd: desktopDir,
    args: [desktopDir],
    env: {
      ...process.env,
      CAVIOT_SMOKE: '1',
      CAVIOT_EXPORT_DIR: exportDir,
      CAVIOT_WEB_URL: `http://127.0.0.1:${port}/`,
    },
    timeout: 120000,
  });
  electronApp.process().stdout?.on('data', (chunk) => process.stdout.write(chunk));
  electronApp.process().stderr?.on('data', (chunk) => process.stderr.write(chunk));

  const deadline = Date.now() + 30000;
  let desktop;
  let web;
  while (Date.now() < deadline) {
    const pages = electronApp.windows();
    desktop = pages.find((page) => page.url().startsWith('caviot://studio'));
    web = pages.find((page) => page.url().startsWith('http://127.0.0.1'));
    if (desktop && web) break;
    await sleep(200);
  }
  if (!desktop || !web) {
    const urls = electronApp.windows().map((page) => page.url());
    throw new Error('Desktop and web windows did not both open: ' + (urls.join(' | ') || 'no windows'));
  }
  for (const page of [desktop, web]) {
    page.on('pageerror', (error) => console.error('[pageerror]', page.url(), error.message));
    page.on('dialog', (dialog) => {
      console.log('[dialog]', dialog.message());
      dialog.accept().catch(() => {});
    });
  }

  await waitReady(desktop);
  await waitReady(web);
  const facts = await desktop.evaluate(() => ({
    template: AppState.templateId,
    choice: document.getElementById('templateChoice').value,
    tier: typeof CaviotDevice !== 'undefined' ? CaviotDevice.tier : '',
    width: window.innerWidth,
    require: typeof require,
    process: typeof process,
    indexed: typeof indexedDB,
    worker: typeof Worker,
  }));
  console.log('[smoke] studio', facts);
  check(facts.template === 'etsyfolger-v1' && facts.choice === 'etsyfolger-v1', 'ETSYFOLGER is the selected template');
  check(facts.tier === 'full', `desktop quality tier is full (${facts.tier})`);
  check(facts.width >= 960, `window is wide enough for the desktop layout (${facts.width}px)`);
  check(facts.require === 'undefined' && facts.process === 'undefined', 'the page has no Node.js');
  check(facts.indexed === 'object' && facts.worker === 'function', 'IndexedDB and Worker exist');

  const stored = await desktop.evaluate(async () => {
    const name = 'caviot.desktop.smoke';
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('kv');
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put({ ok: true }, 'k');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
    });
    const value = await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const get = db.transaction('kv', 'readonly').objectStore('kv').get('k');
        get.onsuccess = () => { db.close(); resolve(get.result); };
        get.onerror = () => reject(get.error);
      };
    });
    indexedDB.deleteDatabase(name);
    return value;
  });
  check(stored && stored.ok === true, 'IndexedDB round-trip');

  const asset = await desktop.evaluate(async () => {
    const response = await fetch('templates/ETSYFOLGER.stl', { cache: 'no-store' });
    const csp = response.headers.get('content-security-policy') || '';
    const bytes = response.ok ? (await response.arrayBuffer()).byteLength : 0;
    const blocked = await fetch('caviot://evil/index.html').then((result) => result.status).catch(() => 0);
    return { ok: response.ok, bytes, csp, type: response.headers.get('content-type') || '', blocked, nosniff: response.headers.get('x-content-type-options') };
  });
  check(asset.ok && asset.bytes > 84, `bundled ETSYFOLGER.stl loads (${asset.bytes} bytes)`);
  check(asset.csp.includes("script-src 'self'") && !asset.csp.includes('unsafe-eval') && !asset.csp.includes('*'), 'CSP is present and has no unsafe-eval or wildcard');
  check(asset.nosniff === 'nosniff', 'nosniff is set');
    check(asset.blocked !== 200, `a different caviot host is not loaded (${asset.blocked})`);

  const workerOk = await desktop.evaluate(() => new Promise((resolve) => {
    const worker = new Worker('repair-worker.js');
    const timer = setTimeout(() => { worker.terminate(); resolve(false); }, 20000);
    worker.onmessage = () => { clearTimeout(timer); worker.terminate(); resolve(true); };
    worker.onerror = () => { clearTimeout(timer); worker.terminate(); resolve(false); };
    worker.postMessage({ positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), indices: new Uint32Array([0, 1, 2]) });
  }));
  check(workerOk, 'classic worker importScripts and fetch-backed scripts run');

  const menuLabels = await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const names = [];
    const walk = (items) => {
      for (const item of items) {
        if (item.label) names.push(item.label);
        if (item.submenu) walk(item.submenu.items);
      }
    };
    walk(menu.items);
    return names;
  });
  for (const label of ['Open Image…', 'Open STL Template…', 'Open Project…', 'Export STL…', 'Undo', 'Redo', 'Copy', 'Paste']) {
    check(menuLabels.includes(label), `menu has ${label}`);
  }

  const prefs = await electronApp.evaluate(({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().find((item) => item.caviotRole === 'studio');
    const read = typeof win.webContents.getLastWebPreferences === 'function'
      ? win.webContents.getLastWebPreferences()
      : null;
    return read && {
      contextIsolation: read.contextIsolation,
      nodeIntegration: read.nodeIntegration,
      sandbox: read.sandbox,
    };
  });
  if (prefs) {
    check(prefs.contextIsolation === true && prefs.nodeIntegration === false && prefs.sandbox === true, 'contextIsolation, no nodeIntegration, sandbox');
  } else {
    check(true, 'webPreferences API unavailable; page has no Node.js (checked above)');
  }

  await shot(desktop, 'caviot-desktop-loaded.png');

  const plainDesktop = await exportStl(desktop, path.join(exportDir, 'desktop'), 'desktop default sleeve');
  const plainWeb = await exportStl(web, path.join(exportDir, 'web'), 'web default sleeve');
  assertIdentical(plainDesktop, plainWeb, 'default sleeve');

  await addText(desktop);
  await addText(web);
  await shot(desktop, 'caviot-desktop-text.png');
  const textDesktop = await exportStl(desktop, path.join(exportDir, 'desktop'), 'desktop text sleeve');
  const textWeb = await exportStl(web, path.join(exportDir, 'web'), 'web text sleeve');
  assertIdentical(textDesktop, textWeb, 'default sleeve with text');

  const badge = path.join(repoRoot, 'e2e', 'fixtures', 'badge.png');
  await electronApp.evaluate(async ({ BrowserWindow }, filePath) => {
    const win = BrowserWindow.getAllWindows().find((item) => item.caviotRole === 'studio');
    await globalThis.__caviotDeliverFile(win, filePath, 'image');
  }, badge);
  await desktop.waitForFunction(() => {
    const add = document.querySelector('dialog[open] [data-choice="add"]');
    if (add) add.click();
    const name = document.getElementById('fileName')?.textContent || '';
    const toast = document.getElementById('toast')?.textContent || '';
    return name.includes('badge.png') || /could not|too large|png or jpg/i.test(toast);
  }, null, { timeout: 20000 });
  const opened = await desktop.evaluate(() => ({
    name: document.getElementById('fileName')?.textContent || '',
    toast: document.getElementById('toast')?.textContent || '',
  }));
  check(opened.name.includes('badge.png'), `Open path delivers an image (${opened.name || opened.toast || 'no result'})`);
} catch (error) {
  console.error(error);
  failures.push(error instanceof Error ? error.message : String(error));
  if (electronApp) {
    try {
      const pages = electronApp.windows();
      const page = pages.find((item) => item.url().startsWith('caviot:')) || pages[0];
      if (page) await page.screenshot({ path: path.join(os.tmpdir(), 'caviot-desktop-failure.png') });
    } catch (shotError) {
      console.error(shotError);
    }
  }
} finally {
  if (electronApp) {
    const proc = electronApp.process();
    await Promise.race([electronApp.close().catch(() => {}), sleep(8000)]);
    if (proc && proc.exitCode === null && !proc.killed) proc.kill('SIGKILL');
  }
  server.kill('SIGTERM');
  fs.rmSync(exportDir, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`\nsmoke: ${failures.length} failed`);
  for (const failure of failures) console.error(' -', failure);
  process.exit(1);
}
console.log('\nsmoke: passed');

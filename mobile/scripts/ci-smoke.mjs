// Launches the unsigned simulator build, adds a text design, and checks that an STL was written.
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { binaryStlOk } from '../native/bridge-logic.js';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundleId = 'com.caviot.studio';
const outDir = path.join(mobileRoot, 'build', 'smoke');
const appPath = path.join(mobileRoot, 'build', 'DerivedData', 'Build', 'Products', 'Debug-iphonesimulator', 'App.app');
const timeoutMs = 18 * 60 * 1000;

fs.mkdirSync(outDir, { recursive: true });

function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options });
}

function pickIphone() {
  const listed = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '-j']));
  const phones = [];
  for (const [runtime, devices] of Object.entries(listed.devices)) {
    const match = runtime.match(/iOS-(\d+)(?:-(\d+))?/);
    const version = match ? Number(match[1]) * 100 + Number(match[2] || 0) : 0;
    for (const device of devices) {
      if (!device.isAvailable || !/iPhone/.test(device.name)) continue;
      phones.push({ ...device, version });
    }
  }
  const score = (name) => (/SE/.test(name) ? 0 : /Pro Max/.test(name) ? 1 : /Pro/.test(name) ? 2 : 3);
  phones.sort((a, b) => (b.version - a.version) || (score(b.name) - score(a.name)));
  if (!phones.length) throw new Error('No available iPhone simulator. Install an iOS simulator runtime in Xcode.');
  return phones[0];
}

function shot(udid, name) {
  const file = path.join(outDir, name);
  try { run('xcrun', ['simctl', 'io', udid, 'screenshot', file]); }
  catch (error) { fs.writeFileSync(file + '.error.txt', String(error.stderr || error.message || error)); }
}

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    try { events.push(JSON.parse(line)); }
    catch { /* a line can be half-written while the app appends the next stage */ }
  }
  return events;
}

function dumpLogs(udid) {
  try {
    const logs = run('xcrun', ['simctl', 'spawn', udid, 'log', 'show', '--last', '5m', '--style', 'compact', '--predicate', 'eventMessage CONTAINS "CAVIOT_SMOKE"']);
    fs.writeFileSync(path.join(outDir, 'simulator.log'), logs);
  } catch (error) {
    fs.writeFileSync(path.join(outDir, 'simulator.log'), String(error.stderr || error.message || error));
  }
}

if (!fs.existsSync(appPath)) {
  console.error('Missing ' + appPath + '. Build the simulator app first.');
  process.exit(1);
}

const phone = pickIphone();
console.log('Using simulator', phone.name, phone.udid);
try { run('xcrun', ['simctl', 'boot', phone.udid]); }
catch (error) {
  const text = String(error.stderr || error.message || '');
  if (!/current state: Booted/i.test(text)) throw error;
}
run('xcrun', ['simctl', 'bootstatus', phone.udid, '-b']);
const simulator = spawn('open', ['-a', 'Simulator', '--args', '-CurrentDeviceUDID', phone.udid], { detached: true, stdio: 'ignore' });
simulator.unref();

try { run('xcrun', ['simctl', 'uninstall', phone.udid, bundleId]); } catch { /* not installed yet */ }
run('xcrun', ['simctl', 'install', phone.udid, appPath]);
run('xcrun', ['simctl', 'launch', phone.udid, bundleId, '-CaviotSmoke']);

const started = Date.now();
let container = '';
let events = [];
let lastStage = '';
const seen = new Set();
while (Date.now() - started < timeoutMs) {
  if (!container) {
    try { container = run('xcrun', ['simctl', 'get_app_container', phone.udid, bundleId, 'data']).trim(); }
    catch { container = ''; }
  }
  const report = container ? path.join(container, 'Documents', 'caviot-smoke.json') : '';
  if (report && fs.existsSync(report)) {
    try { events = readEvents(report); }
    catch { events = []; }
  }
  const stage = events.at(-1)?.stage || '';
  if (stage && stage !== lastStage && !seen.has(stage)) {
    seen.add(stage);
    lastStage = stage;
    shot(phone.udid, stage + '.png');
    console.log('stage', stage);
  }
  if (stage === 'export-ok' || stage === 'failed') break;
  const elapsed = Math.round((Date.now() - started) / 1000);
  if (elapsed > 0 && elapsed % 30 === 0) console.log('waiting', stage || 'no-report', elapsed + 's');
  run('sleep', ['1']);
}
if (!seen.has('launch')) shot(phone.udid, 'launch-missing.png');
shot(phone.udid, 'final.png');

const result = { simulator: phone.name, events };
const failed = events.find((event) => event.stage === 'failed');
const exported = events.find((event) => event.stage === 'export-ok');
const ready = events.find((event) => event.stage === 'ready');
const text = events.find((event) => event.stage === 'text-added');
const problems = [];
if (!events.some((event) => event.stage === 'launch')) problems.push('the app did not report launch');
if (!ready) problems.push('the studio did not become ready');
if (ready && ready.template !== 'etsyfolger-v1') problems.push('ETSYFOLGER was not the default (' + ready.template + ')');
if (ready && ready.phone !== true) problems.push('the iPhone simulator was not classified as a phone');
if (ready && ready.exportTriangleBudget !== 700000) problems.push('iPhone export budget was ' + ready.exportTriangleBudget + ', expected 700000');
if (ready && ready.shareReady !== true) problems.push('the native share plugin was not available');
const memoryEvent = ready || events.find((event) => event.stage === 'launch');
const memory = Number(memoryEvent?.availableMemory);
// The simulator often reports 0. A missing or non-numeric value means the call did not run.
if (!memoryEvent || !Number.isFinite(memory) || memory < 0) problems.push('the app process did not report available memory');
if (!text) problems.push('a text design was not added');
if (failed) problems.push(failed.message || 'smoke test failed');
if (!exported) problems.push('export did not finish');
if (exported && !(exported.bytes > 84)) problems.push('exported file is too small');

let stlPath = '';
if (exported && container) {
  stlPath = path.join(container, 'Documents', exported.filename);
  if (!fs.existsSync(stlPath)) problems.push('saved STL is missing at ' + stlPath);
  else {
    const bytes = fs.readFileSync(stlPath);
    fs.copyFileSync(stlPath, path.join(outDir, 'export.stl'));
    if (!binaryStlOk(bytes.length, bytes.subarray(0, 84))) problems.push('saved file is not a binary STL of the reported size');
    if (bytes.length !== exported.bytes) problems.push('STL size does not match the smoke report');
  }
}
result.problems = problems;
result.stl = stlPath;
fs.writeFileSync(path.join(outDir, 'result.json'), JSON.stringify(result, null, 2));
if (problems.length) {
  dumpLogs(phone.udid);
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Smoke test passed:', exported.filename, exported.bytes, 'bytes');

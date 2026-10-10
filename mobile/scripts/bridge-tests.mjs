import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  WKWEBVIEW_LIMITS,
  nativeActive,
  safeExportName,
  binaryStlOk,
  shouldConfirmIpadExport,
  iphoneMemoryHolds,
  shareWasCancelled,
  cameraOutcome,
  nativePickerKind
} from '../native/bridge-logic.js';
import { injectNativeBridge } from './sync-www.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('the bridge does nothing unless Capacitor says this is the native app', () => {
  assert.equal(nativeActive(undefined), false);
  assert.equal(nativeActive({}), false);
  assert.equal(nativeActive({ isNativePlatform: () => false }), false);
  assert.equal(nativeActive({ isNativePlatform: () => true }), true);
});

test('export filenames cannot escape the Documents directory', () => {
  assert.equal(safeExportName('../etc/passwd.stl'), 'passwd.stl');
  assert.equal(safeExportName('folder/my design.STL'), 'my_design.stl');
  assert.equal(safeExportName(''), 'caviot-export.stl');
  assert.equal(safeExportName('notes.icaviot'), 'notes.icaviot');
  assert.equal(safeExportName('.hidden.obj'), 'hidden.obj');
  const long = safeExportName('a'.repeat(200) + '.stl');
  assert.equal(long.length, 120);
  assert.ok(long.endsWith('.stl'));
});

test('a binary STL is accepted only when the triangle count matches the file size', () => {
  const header = new Uint8Array(84);
  new DataView(header.buffer).setUint32(80, 2, true);
  assert.equal(binaryStlOk(84 + 2 * 50, header), true);
  assert.equal(binaryStlOk(84 + 2 * 50 + 1, header), false);
  assert.equal(binaryStlOk(80, header), false);
  new DataView(header.buffer).setUint32(80, 0, true);
  assert.equal(binaryStlOk(84, header), false);
});

test('iPhone keeps the existing phone budget; only a large iPad export asks first', () => {
  const phone = { exportTriangleBudget: 700000, customMaxTriangles: 1200000, displayTriangles: 120000 };
  assert.equal(iphoneMemoryHolds(phone), true);
  assert.equal(iphoneMemoryHolds({ ...phone, exportTriangleBudget: Infinity }), false);
  assert.equal(WKWEBVIEW_LIMITS.iphoneExportTriangleBudget, 700000);
  assert.equal(shouldConfirmIpadExport({ ios: true, phone: true, triangles: 5e6 }), false);
  assert.equal(shouldConfirmIpadExport({ ios: true, phone: false, triangles: 1_400_000 }), false);
  assert.equal(shouldConfirmIpadExport({ ios: true, phone: false, triangles: 1_400_001 }), true);
  assert.equal(shouldConfirmIpadExport({ ios: false, phone: false, triangles: 9e6 }), false);
});

test('share cancel and camera denial are not generic failures', () => {
  assert.equal(shareWasCancelled({ name: 'AbortError' }), true);
  assert.equal(shareWasCancelled(new Error('User cancelled')), true);
  assert.equal(shareWasCancelled(new Error('disk full')), false);
  assert.equal(cameraOutcome({ code: 'OS-PLUG-CAMR-0006', message: 'cancelled' }), 'cancel');
  assert.equal(cameraOutcome({ code: 'OS-PLUG-CAMR-0020' }), 'cancel');
  assert.equal(cameraOutcome({ message: 'User denied access to camera' }), 'denied');
  assert.equal(cameraOutcome({ code: 'OS-PLUG-CAMR-0005' }), 'denied');
  assert.equal(cameraOutcome({ message: 'picker failed' }), 'error');
  assert.equal(nativePickerKind('camera'), 'camera');
  assert.equal(nativePickerKind('photos'), 'photos');
  assert.equal(nativePickerKind('files'), null);
  assert.equal(nativePickerKind('text'), null);
  assert.equal(nativePickerKind('nope'), null);
});

test('the website index is not edited; the iOS copy gains the bridge once', () => {
  const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.equal(html.includes('caviot-native.js'), false);
  assert.equal(html.includes('page-bridge.js'), false);
  const once = injectNativeBridge(html);
  assert.ok(once.includes('<script src="page-bridge.js"></script>'));
  assert.ok(once.includes('<script type="module" src="caviot-native.js"></script>'));
  assert.ok(once.includes('href="native.css"'));
  const bridge = fs.readFileSync(path.join(root, 'mobile', 'native', 'page-bridge.js'), 'utf8');
  assert.equal(bridge.includes('import '), false);
  assert.ok(bridge.includes('__caviotPage'));
  assert.equal(injectNativeBridge(once), once);
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8'), html);
});

test('importing the bridge without Capacitor does not throw', async () => {
  await import('../native/caviot-native.js');
  assert.equal(globalThis.Capacitor, undefined);
});

let passed = 0;
for (const [name, fn] of tests) {
  await fn();
  passed += 1;
  console.log('ok -', name);
}
console.log('bridge-tests: ' + passed + ' passed');

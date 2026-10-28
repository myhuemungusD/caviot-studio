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
  nativePickerKind,
  PRO_PRODUCT_ID,
  proGateApplies,
  isGatedExportFormat,
  betaUnlockApplies,
  exportUnlocked,
  storeOutcome,
  proMessage
} from '../native/bridge-logic.js';
import { injectNativeBridge } from './sync-www.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test('Android manifest opens STL, OBJ and 3MF and keeps the app id', () => {
  const manifest = fs.readFileSync(path.join(root, 'mobile/android/app/src/main/AndroidManifest.xml'), 'utf8');
  for (const mime of ['model/stl', 'model/obj', 'model/3mf', 'application/sla']) assert.ok(manifest.includes('"' + mime + '"'), mime);
  for (const action of ['android.intent.action.VIEW', 'android.intent.action.SEND']) assert.ok(manifest.includes(action), action);
  assert.ok(manifest.includes('.*\\\\.stl'), 'extension match for octet-stream STL');
  const gradle = fs.readFileSync(path.join(root, 'mobile/android/app/build.gradle'), 'utf8');
  assert.ok(gradle.includes('applicationId "com.caviot.studio"'));
  const config = JSON.parse(fs.readFileSync(path.join(root, 'mobile/capacitor.config.json'), 'utf8'));
  assert.equal(config.appId, 'com.caviot.studio');
});

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
  assert.ok(once.indexOf('<script src="native-flags.js"></script>') >= 0 && once.indexOf('native-flags.js') < once.indexOf('brand-labels.js'), 'phone build sets the neutral-label flag before brand-labels.js');
  assert.ok(fs.readFileSync(path.join(root, 'mobile', 'native', 'native-flags.js'), 'utf8').includes('CAVIOT_NEUTRAL_LABELS = true'));
  assert.equal(/Vapes|Foger|Geek Bar/.test(once.match(/<select id="lighterChoice"[\s\S]*?<\/select>/)[0]), false, 'phone copy has no vape presets in its markup');
  assert.ok(html.includes('Vapes — Geek Bar'), 'website markup keeps them');
  const bridge = fs.readFileSync(path.join(root, 'mobile', 'native', 'page-bridge.js'), 'utf8');
  assert.equal(bridge.includes('import '), false);
  assert.ok(bridge.includes('__caviotPage'));
  assert.equal(injectNativeBridge(once), once);
  assert.equal(fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8'), html);
});

test('Pro is a one-time unlock sold only in the iOS app', () => {
  assert.equal(PRO_PRODUCT_ID, 'com.caviot.studio.pro');
  assert.equal(proGateApplies('ios'), true);
  for (const platform of ['android', 'web', 'electron', '', undefined]) assert.equal(proGateApplies(platform), false, String(platform));
  const swift = fs.readFileSync(path.join(root, 'mobile/native/ios/CaviotNativePlugin.swift'), 'utf8');
  assert.ok(swift.includes('static let proProductId = "' + PRO_PRODUCT_ID + '"'));
  assert.ok(swift.includes('import StoreKit'));
  for (const method of ['proStatus', 'proProduct', 'proPurchase', 'proRestore']) {
    assert.ok(swift.includes('CAPPluginMethod(name: "' + method + '"'), method);
  }
  assert.ok(swift.includes('AppStore.sync()'), 'Restore Purchases syncs with the App Store');
  assert.ok(swift.includes('Transaction.currentEntitlements'), 'ownership comes from verified on-device entitlements');
  assert.ok(swift.includes('revocationDate == nil'), 'refunded purchases do not unlock');
  // The Xcode copy is what the build compiles; it must match the source of truth.
  assert.equal(fs.readFileSync(path.join(root, 'mobile/ios/App/App/CaviotNativePlugin.swift'), 'utf8'), swift);
});

test('mesh export is gated; projects and the website are not', () => {
  for (const format of ['stl', 'STL', 'obj', '3mf', undefined]) assert.equal(isGatedExportFormat(format), true, String(format));
  for (const format of ['icaviot', 'json', 'png']) assert.equal(isGatedExportFormat(format), false, format);
  assert.equal(exportUnlocked({ pro: true, environment: 'production', productState: 'ready' }), true);
  assert.equal(exportUnlocked({ pro: false, environment: 'production', productState: 'ready' }), false);
  assert.equal(exportUnlocked({ pro: false, environment: 'production', productState: 'not-found' }), false, 'the App Store build never unlocks without a purchase');
  assert.equal(exportUnlocked({ pro: false, environment: 'production', productState: 'offline' }), false);
  assert.equal(exportUnlocked({ pro: false, environment: 'sandbox', productState: 'not-found' }), true, 'TestFlight before the product exists');
  assert.equal(exportUnlocked({ pro: false, environment: 'sandbox', productState: 'ready' }), false, 'TestFlight once the product exists uses sandbox purchases');
  assert.equal(exportUnlocked({ pro: false, environment: 'sandbox', productState: 'offline' }), false);
  assert.equal(betaUnlockApplies('development', 'not-found'), true);
  assert.equal(betaUnlockApplies('development', 'error'), false);
  assert.equal(exportUnlocked(null), false);
});

test('store failures become clear messages, offline included', () => {
  assert.equal(storeOutcome({ code: 'offline', message: 'x' }), 'offline');
  assert.equal(storeOutcome({ code: 'not-allowed' }), 'not-allowed');
  assert.equal(storeOutcome({ code: 'unverified' }), 'unverified');
  assert.equal(storeOutcome(new Error('The Internet connection appears to be offline.')), 'offline');
  assert.equal(storeOutcome(new Error('boom'), false), 'offline');
  assert.equal(storeOutcome({ code: 'store', message: 'boom' }), 'store');
  assert.equal(storeOutcome(new Error('User cancelled')), 'cancelled');
  assert.equal(storeOutcome(undefined), 'store');
  assert.equal(proMessage('cancelled'), '');
  assert.match(proMessage('offline'), /offline/i);
  assert.match(proMessage('offline'), /saving projects/i);
  assert.match(proMessage('pending'), /approv/i);
  assert.match(proMessage('none'), /No Caviot Studio Pro purchase/);
  assert.match(proMessage('not-allowed', '$9.99'), /\$9\.99/);
  assert.match(proMessage('anything-else'), /could not complete/i);
  for (const outcome of ['purchased', 'restored', 'offline', 'pending', 'store', 'unverified']) {
    assert.doesNotMatch(proMessage(outcome), /vape|nicotine/i, outcome);
  }
});

test('the StoreKit test store matches the product and is never bundled', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'mobile/native/ios/CaviotStudio.storekit'), 'utf8'));
  const [product] = config.products;
  assert.equal(product.productID, PRO_PRODUCT_ID);
  assert.equal(product.type, 'NonConsumable');
  assert.equal(product.displayPrice, '9.99');
  assert.equal(fs.readFileSync(path.join(root, 'mobile/ios/App/App/CaviotStudio.storekit'), 'utf8'), fs.readFileSync(path.join(root, 'mobile/native/ios/CaviotStudio.storekit'), 'utf8'));
  const pbx = fs.readFileSync(path.join(root, 'mobile/ios/App/App.xcodeproj/project.pbxproj'), 'utf8');
  assert.ok(pbx.includes('/* CaviotStudio.storekit */ = {isa = PBXFileReference'));
  assert.ok(!pbx.includes('CaviotStudio.storekit in '), 'not in any build phase');
  const scheme = fs.readFileSync(path.join(root, 'mobile/ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme'), 'utf8');
  assert.ok(scheme.includes('identifier = "../../App/CaviotStudio.storekit"'));
  const privacy = fs.readFileSync(path.join(root, 'mobile/native/ios/PrivacyInfo.xcprivacy'), 'utf8');
  assert.ok(!/NSPrivacyCollectedDataTypePurchaseHistory/.test(privacy), 'no purchase data is collected');
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

// Pure decisions for the iOS bridge. No DOM and no Capacitor calls, so the website never runs them
// and the simulator smoke test can check the same rules the app uses.

// WKWebView runs page JavaScript in a separate content process. iOS jetsam kills that process when it
// passes a device-specific ceiling. There is no supported API to raise the ceiling.
// Practical ranges (not a guarantee): about 1.0–1.5 GB on iPhone, often 2–4 GB on iPad.
// os_proc_available_memory reports the app process, which is not the web content process.
// The phone export budget already in the web app is 700,000 triangles × about 0.5 KB ≈ 350 MB,
// which stays under the iPhone ceiling. ETSYFOLGER stays the default template either way.
export const WKWEBVIEW_LIMITS = {
  iphoneExportTriangleBudget: 700000,
  iphoneCustomMaxTriangles: 1200000,
  iphoneDisplayTriangles: 120000,
  ipadConfirmTriangles: 1400000,
  maxHandoffBytes: 80 * 1024 * 1024
};

const CANCEL_CODES = new Set(['OS-PLUG-CAMR-0006', 'OS-PLUG-CAMR-0013', 'OS-PLUG-CAMR-0020']);
const DENIED_CODES = new Set(['OS-PLUG-CAMR-0003', 'OS-PLUG-CAMR-0005']);

export function nativeActive(cap) {
  return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

export function safeExportName(filename) {
  const raw = String(filename || '').split(/[/\\]/).pop() || '';
  const extMatch = /\.(stl|obj|icaviot)$/i.exec(raw);
  const ext = extMatch ? extMatch[0].toLowerCase() : '.stl';
  let base = raw.replace(/\.(stl|obj|icaviot)$/i, '');
  base = base.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^\.+/, '').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!base) base = 'caviot-export';
  if (base.length + ext.length <= 120) return base + ext;
  return base.slice(0, 120 - ext.length) + ext;
}

export function binaryStlOk(size, header) {
  if (!Number.isFinite(size) || size < 84 || !header || header.byteLength < 84) return false;
  const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
  const count = view.getUint32(80, true);
  return count > 0 && size === 84 + count * 50;
}

export function shouldConfirmIpadExport({ ios, phone, triangles }) {
  if (!ios || phone) return false;
  return Number(triangles) > WKWEBVIEW_LIMITS.ipadConfirmTriangles;
}

export function iphoneMemoryHolds(device) {
  return !!device
    && device.exportTriangleBudget === WKWEBVIEW_LIMITS.iphoneExportTriangleBudget
    && device.customMaxTriangles === WKWEBVIEW_LIMITS.iphoneCustomMaxTriangles
    && device.displayTriangles === WKWEBVIEW_LIMITS.iphoneDisplayTriangles;
}

export function shareWasCancelled(error) {
  const name = error && error.name;
  const message = String((error && (error.message || error)) || '');
  return name === 'AbortError' || /cancel/i.test(message);
}

export function cameraOutcome(error) {
  const code = String((error && error.code) || '');
  const message = String((error && (error.message || error)) || '');
  if (CANCEL_CODES.has(code) || /cancel/i.test(message)) return 'cancel';
  if (DENIED_CODES.has(code) || /denied/i.test(message)) return 'denied';
  return 'error';
}

// Photos and Camera use the native pickers. Files stays on the system document picker the web app already opens.
export function nativePickerKind(kind) {
  switch (kind) {
    case 'camera':
    case 'photos':
      return kind;
    case 'files':
    case 'text':
      return null;
    default: {
      const unexpected = kind;
      return unexpected ? null : null;
    }
  }
}

// ---------- Caviot Studio Pro (one-time In-App Purchase, iPhone and iPad only) ----------
// Must match the product created in App Store Connect and mobile/native/ios/CaviotNativePlugin.swift.
export const PRO_PRODUCT_ID = 'com.caviot.studio.pro';
const GATED_EXPORT_FORMATS = new Set(['stl', 'obj', '3mf']);
const STORE_OUTCOMES = new Set([
  'purchased', 'restored', 'none', 'cancelled', 'pending', 'offline', 'not-allowed',
  'not-found', 'not-available', 'not-entitled', 'unverified', 'store', 'unknown'
]);

// Release switch for Caviot Studio Pro. Version 1.0 ships FREE: false keeps export always open and never
// installs the paywall, the Pro settings row, the "PRO" export badges or any StoreKit call. The StoreKit code
// (pro-paywall.js, CaviotNativePlugin.swift) stays in place but inert. For 1.1, once the In-App Purchase
// exists in App Store Connect, set this to true; nothing else changes and the paywall works exactly as tested.
export const PRO_GATE_ENABLED = false;

// Only the native iOS app sells Pro, and only while the gate is on. The website, the Mac app and Android
// keep every export free. `enabled` defaults to the release switch; tests pass it to check both modes.
export function proGateApplies(platform, enabled = PRO_GATE_ENABLED) {
  return enabled === true && platform === 'ios';
}

// Mesh files for printing need Pro. Designing, previewing and saving a .icaviot project stay free.
export function isGatedExportFormat(format) {
  return GATED_EXPORT_FORMATS.has(String(format || 'stl').toLowerCase());
}

// TestFlight, App Review and Xcode builds run against the sandbox. Until the product exists in
// App Store Connect, StoreKit finds nothing there; export then stays open so testing is not blocked.
// An App Store (production) build never unlocks this way.
export function betaUnlockApplies(environment, productState) {
  return (environment === 'sandbox' || environment === 'development') && productState === 'not-found';
}

export function exportUnlocked(state, enabled = PRO_GATE_ENABLED) {
  // Gate off (1.0): export is always open, whatever StoreKit says.
  if (enabled !== true) return true;
  if (!state) return false;
  return !!(state.pro || state.smokeBypass || betaUnlockApplies(state.environment, state.productState));
}

// A Capacitor rejection carries the code set in Swift; anything else is named from the error text.
export function storeOutcome(error, online = true) {
  const code = String((error && error.code) || '');
  if (STORE_OUTCOMES.has(code) && code !== 'store') return code;
  const message = String((error && (error.message || error)) || '');
  if (online === false || /offline|network|internet connection|timed out/i.test(message)) return 'offline';
  if (/cancel/i.test(message)) return 'cancelled';
  return 'store';
}

export function proMessage(outcome, price) {
  const cost = price ? ' (' + price + ')' : '';
  switch (outcome) {
    case 'purchased':
      return 'Caviot Studio Pro is unlocked. Thank you!';
    case 'restored':
      return 'Your Caviot Studio Pro purchase is restored.';
    case 'none':
      return 'No Caviot Studio Pro purchase was found for this Apple Account.';
    case 'cancelled':
      return '';
    case 'pending':
      return 'The purchase is waiting for approval (for example Ask to Buy). Export unlocks as soon as it is approved.';
    case 'offline':
      return 'You appear to be offline. Connect to the internet and try again. You can keep designing and saving projects meanwhile.';
    case 'not-allowed':
      return 'Purchases are turned off on this device (Screen Time). Ask the device owner to allow In-App Purchases' + cost + '.';
    case 'not-found':
    case 'not-available':
      return 'Caviot Studio Pro is not available from the App Store right now. Please try again later.';
    case 'not-entitled':
    case 'unverified':
      return 'The App Store could not verify this purchase. Try Restore Purchases, or try again later.';
    default:
      return 'The App Store could not complete the request. Please try again.';
  }
}

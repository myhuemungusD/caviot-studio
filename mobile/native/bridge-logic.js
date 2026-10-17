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

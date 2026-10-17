'use strict';
// HEIC / HEIF (iPhone photos). The browser's own decoder is used first (Safari, and some
// desktop builds). Everywhere else, vendor/libheif (LGPL-3.0, loaded only when needed) decodes
// the file on this device. See vendor/libheif/SOURCE.txt.
const Heic = (() => {
  const BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'];

  function fourcc(bytes, offset) {
    if (bytes.length < offset + 4) return '';
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }

  function isHeicBytes(bytes) {
    const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u.length < 12 || fourcc(u, 4) !== 'ftyp') return false;
    if (BRANDS.indexOf(fourcc(u, 8)) !== -1) return true;
    // Compatible brands follow the minor version at byte 16.
    for (let i = 16; i + 4 <= Math.min(u.length, 64); i += 4) if (BRANDS.indexOf(fourcc(u, i)) !== -1) return true;
    return false;
  }

  function looksLikeHeic(file) {
    const name = (file && file.name) || '';
    const type = (file && file.type) || '';
    return /heic|heif/i.test(type) || /\.hei[cf]$/i.test(name);
  }

  let modulePromise = null;
  function loadLibheif() {
    if (modulePromise) return modulePromise;
    modulePromise = new Promise((resolve, reject) => {
      if (typeof document === 'undefined') { reject(Error('HEIC decoder is not available here')); return; }
      const script = document.createElement('script');
      script.src = 'vendor/libheif/libheif.js';
      script.async = true;
      script.onload = () => {
        const factory = globalThis.libheif;
        if (typeof factory !== 'function') { reject(Error('HEIC decoder failed to start')); return; }
        // The vendored build reads wasm synchronously. Browsers block that on the page,
        // so the bytes are fetched first and passed in.
        fetch('vendor/libheif/libheif.wasm').then((response) => {
          if (!response.ok) throw Error('HEIC decoder failed to load');
          return response.arrayBuffer();
        }).then((wasmBinary) => {
          let settled = false, mod;
          const finish = () => { if (!settled && mod) { settled = true; resolve(mod); } };
          try {
            mod = factory({
              wasmBinary,
              locateFile: (name) => 'vendor/libheif/' + name,
              onRuntimeInitialized() { finish(); },
            });
          } catch (error) { reject(error); return; }
          if (mod && mod.calledRun) finish();
        }).catch(reject);
      };
      script.onerror = () => reject(Error('HEIC decoder failed to load'));
      document.head.appendChild(script);
    }).catch((error) => { modulePromise = null; throw error; });
    return modulePromise;
  }

  function displayImage(image) {
    const width = image.get_width(), height = image.get_height();
    if (!width || !height || width * height > 40e6) throw Error('This HEIC photo is too large');
    const rgba = new Uint8ClampedArray(width * height * 4);
    return new Promise((resolve, reject) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) reject(Error('HEIC decode timed out')); }, 20000);
      try {
        image.display({ data: rgba, width, height }, () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ rgba, width, height });
        });
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
  }

  async function decodeWithLibheif(bytes) {
    const mod = await loadLibheif();
    const decoder = new mod.HeifDecoder();
    const images = decoder.decode(bytes);
    if (!images || !images.length) throw Error('This HEIC photo has no picture');
    try { return await displayImage(images[0]); }
    finally { try { images.forEach((image) => image.free && image.free()); } catch (_) { /* already freed */ } }
  }

  async function decodeNative(file) {
    if (typeof createImageBitmap !== 'function') return null;
    try {
      const bitmap = await createImageBitmap(file);
      if (!bitmap.width || !bitmap.height) return null;
      return bitmap;
    } catch (_) { return null; }
  }

  // Returns {bitmap} from the browser, or {rgba, width, height} from libheif.
  async function decodeFile(file) {
    const native = await decodeNative(file);
    if (native) return { bitmap: native };
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!isHeicBytes(bytes) && !looksLikeHeic(file)) throw Error('This file is not a HEIC photo');
    try { return await decodeWithLibheif(bytes); }
    catch (error) {
      const message = (error && error.message) || '';
      if (/too large|timed out|no picture|not a HEIC/i.test(message)) throw error;
      throw Error('Could not read this HEIC photo. Export a JPEG from the Photos app and try that.');
    }
  }

  return { isHeicBytes, looksLikeHeic, decodeFile, decodeWithLibheif, loadLibheif };
})();
globalThis.Heic = Heic;

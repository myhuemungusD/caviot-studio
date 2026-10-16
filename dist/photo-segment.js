'use strict';
// Find subject. Loads U2-Netp the first time it is asked, and never on a light-tier phone.
// The model and the ONNX runtime live in vendor/ and are not precached. See vendor/u2net/SOURCE.txt.
const PhotoSegment = (() => {
  const SIZE = 320;
  const MEAN = [0.485, 0.456, 0.406];
  const STD = [0.229, 0.224, 0.225];
  let sessionPromise = null;

  function allowed() {
    return !(typeof CaviotDevice !== 'undefined' && CaviotDevice.tier === 'light');
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (globalThis.ort) { resolve(); return; }
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => resolve();
      script.onerror = () => reject(Error('Could not load the subject finder.'));
      document.head.appendChild(script);
    });
  }

  function session() {
    if (!allowed()) throw Error('Find subject needs a computer. Tap the subject on this phone.');
    if (!sessionPromise) {
      sessionPromise = (async () => {
        await loadScript('vendor/onnx/ort.wasm.min.js');
        const ort = globalThis.ort;
        if (!ort || !ort.InferenceSession) throw Error('Could not load the subject finder.');
        ort.env.wasm.wasmPaths = 'vendor/onnx/';
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = true;
        return ort.InferenceSession.create('vendor/u2net/u2netp.onnx', { executionProviders: ['wasm'] });
      })().catch((error) => {
        sessionPromise = null;
        throw error;
      });
    }
    return sessionPromise;
  }

  function plane(imageData) {
    const src = imageData.data, sw = imageData.width, sh = imageData.height;
    const out = new Float32Array(3 * SIZE * SIZE);
    for (let y = 0; y < SIZE; y++) {
      const sy = Math.min(sh - 1, Math.floor((y + 0.5) * sh / SIZE));
      for (let x = 0; x < SIZE; x++) {
        const sx = Math.min(sw - 1, Math.floor((x + 0.5) * sw / SIZE));
        const i = (sy * sw + sx) * 4;
        const o = y * SIZE + x;
        out[o] = ((src[i] / 255) - MEAN[0]) / STD[0];
        out[SIZE * SIZE + o] = ((src[i + 1] / 255) - MEAN[1]) / STD[1];
        out[2 * SIZE * SIZE + o] = ((src[i + 2] / 255) - MEAN[2]) / STD[2];
      }
    }
    return out;
  }

  function maskFrom(data, width, height) {
    const n = SIZE * SIZE;
    const map = data.length >= n ? data : null;
    if (!map) throw Error('Find subject returned an empty result.');
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < n; i++) {
      const v = map[i];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    const span = hi - lo || 1;
    const small = new Uint8Array(n);
    for (let i = 0; i < n; i++) small[i] = (map[i] - lo) / span >= 0.45 ? 1 : 0;
    const mask = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
      const sy = Math.min(SIZE - 1, Math.floor((y + 0.5) * SIZE / height));
      for (let x = 0; x < width; x++) {
        const sx = Math.min(SIZE - 1, Math.floor((x + 0.5) * SIZE / width));
        mask[y * width + x] = small[sy * SIZE + sx];
      }
    }
    return mask;
  }

  async function findSubject(imageData, opts) {
    const sess = await session();
    const ort = globalThis.ort;
    const inputName = sess.inputNames[0];
    const tensor = new ort.Tensor('float32', plane(imageData), [1, 3, SIZE, SIZE]);
    const result = await sess.run({ [inputName]: tensor });
    const outputName = sess.outputNames[0];
    const output = result[outputName];
    if (!output || !output.data) throw Error('Find subject returned an empty result.');
    let mask = maskFrom(output.data, imageData.width, imageData.height);
    // Shadow does its own close, hole fill and thin-part thicken. Opening here would delete a leg.
    if (!(opts && opts.raw) && globalThis.PhotoRelief) {
      mask = PhotoRelief.open(mask, imageData.width, imageData.height, 1);
      mask = PhotoRelief.close(mask, imageData.width, imageData.height, 2);
    }
    let ink = 0;
    for (let i = 0; i < mask.length; i++) ink += mask[i];
    if (ink < mask.length * 0.02 || ink > mask.length * 0.98) throw Error('Find subject could not separate a subject. Tap the subject instead.');
    return mask;
  }

  return { allowed, findSubject };
})();
globalThis.PhotoSegment = PhotoSegment;

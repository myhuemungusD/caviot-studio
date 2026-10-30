// ---------- Text design ----------
function renderTextToImage(text) {
  const c = document.createElement('canvas');
  c.width = 2048;
  c.height = 1024;
  const ctx = c.getContext('2d');
  ctx.scale(2,2);
  const textWidth=1024,textHeight=512;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, textWidth, textHeight);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const family = AppState.customFontFamily || 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif';
  let fontSize = 220;
  ctx.font = '400 ' + fontSize + 'px ' + family;
  const spacing = AppState.letterSpacing;
  // Simple letter-spacing draw
  const chars = text.split('');
  while (fontSize > 40) {
    ctx.font = '400 ' + fontSize + 'px ' + family;
    let total = 0;
    chars.forEach((ch, i) => {
      total += ctx.measureText(ch).width;
      if (i < chars.length - 1) total += spacing;
    });
    if ((spacing===0?ctx.measureText(text).width:total) < textWidth * 0.9) break;
    fontSize -= 8;
  }
  // thickness via stroke
  if (AppState.letterThickness > 0) {
    ctx.lineWidth = AppState.letterThickness * 2;
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
  }
  let total = 0;
  chars.forEach((ch, i) => {
    total += ctx.measureText(ch).width;
    if (i < chars.length - 1) total += spacing;
  });
  let x = (textWidth - total) / 2;
  const y = textHeight / 2;
  if(spacing===0){
    if(AppState.letterThickness>0)ctx.strokeText(text,textWidth/2,y);
    ctx.fillText(text,textWidth/2,y);
  } else chars.forEach((ch) => {
    const w = ctx.measureText(ch).width;
    if (AppState.letterThickness > 0) ctx.strokeText(ch, x + w / 2, y);
    ctx.fillText(ch, x + w / 2, y);
    x += w + spacing;
  });
  const img = new Image();
  return new Promise((resolve) => {
    img.onload = () => resolve(img);
    img.src = c.toDataURL('image/png');
  });
}

async function applyTextDesign() {
  const t = (AppState.text || '').trim();
  if (!t) return;
  const renderId = ++AppState.textRenderId;
  if(typeof selectedFontReady!=='undefined')await selectedFontReady;
  if(renderId!==AppState.textRenderId)return;
  const img = await renderTextToImage(t);
  if (renderId !== AppState.textRenderId || t !== (AppState.text || '').trim()) return;
  setDesignImage(img, 'text:' + t.slice(0, 24));
}

// ---------- Image load / transform ----------
function setDesignImage(img, label) {
  AppState.image = img;
  AppState.imageName = label || 'image';
  AppState.sourceLabel = label || 'image';
  if (els.fileName) {
    els.fileName.style.display = '';
    els.fileName.textContent = AppState.sourceLabel;
  }
  if (AppState.bgEnable) autoDetectBgColor(img);
  setEmptyState(false);
  scheduleRebuild(true);
  saveSettings();
}

function loadImageFile(file) {
  if (!file) return;
  const uploadSide=typeof activeDesignSide==='number'&&templateActive()?activeDesignSide:null;
  // Accept any image the browser can decode (PNG, JPG, WebP, GIF, HEIC on Safari); camera photos arrive as JPEG.
  if (typeof Heic !== 'undefined' && Heic.looksLikeHeic(file)) {
    loadHeicFile(file, uploadSide);
    return;
  }
  const looksLikeImage = /^image\//i.test(file.type || '') || (!file.type && /\.(png|jpe?g|webp|gif|heic|heif|avif|bmp)$/i.test(file.name || ''));
  if (!looksLikeImage) {
    toast('Use a PNG, JPG or HEIC image', 'error');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Image is too large — maximum 20 MB', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const deliver = (image) => {
      if(uploadSide!==null&&typeof receiveSideUpload==='function')receiveSideUpload(image,file.name||'image',uploadSide);else setDesignImage(image,file.name||'image');
    };
    // Phones and tablets: large camera photos are scaled down instead of refused (iOS cannot draw canvases over
    // ~16 megapixels, and phones run short of memory well before that). Desktop keeps the 24 MP limit.
    const mobile = typeof CaviotDevice !== 'undefined' && (CaviotDevice.touch || CaviotDevice.tier === 'light') && (CaviotDevice.iOS || CaviotDevice.android || CaviotDevice.phone);
    const limit = mobile ? Math.min(MAX_IMAGE_PIXELS, CaviotDevice.limits.maxImagePixels) : MAX_IMAGE_PIXELS;
    // Phones also cap the longest side (2,048 px): the relief is sampled at 1,024 px at most, and a decoded 12 MP
    // photo would hold about 48 MB (plus its background-removal copies) for no visible gain.
    const maxSide = mobile && CaviotDevice.device ? CaviotDevice.device.maxImageSide : Infinity;
    const longSide = Math.max(img.width, img.height);
    if (img.width * img.height > limit || longSide > maxSide) {
      const scale = Math.min(Math.sqrt(limit / (img.width * img.height)) * 0.999, maxSide / longSide);
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(img.width * scale));
      c.height = Math.max(1, Math.floor(img.height * scale));
      const ctx = c.getContext('2d');
      if (!ctx) { toast('Not enough memory to read this photo — try a smaller image', 'error'); return; }
      ctx.drawImage(img, 0, 0, c.width, c.height);
      const out = new Image();
      out.onload = () => { toast('Large photo resized to ' + c.width + '×' + c.height + ' to save memory on this device', 'success'); deliver(out); };
      out.onerror = () => toast('Not enough memory to read this photo — try a smaller image', 'error');
      out.src = c.toDataURL('image/png');
      return;
    }
    deliver(img);
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    const sniff = file.slice ? file.slice(0, 64).arrayBuffer() : Promise.reject();
    sniff.then((buf) => {
      if (typeof Heic !== 'undefined' && Heic.isHeicBytes(new Uint8Array(buf))) loadHeicFile(file, uploadSide);
      else toast('Could not read this image — use a PNG, JPG or HEIC', 'error');
    }).catch(() => toast('Could not read this image — use a PNG, JPG or HEIC', 'error'));
  };
  img.src = url;
}

function deliverLoadedImage(image, name, uploadSide) {
  if (uploadSide !== null && typeof receiveSideUpload === 'function') receiveSideUpload(image, name, uploadSide);
  else setDesignImage(image, name);
}

function downscalePhotoCanvas(canvas) {
  const mobile = typeof CaviotDevice !== 'undefined' && (CaviotDevice.touch || CaviotDevice.tier === 'light') && (CaviotDevice.iOS || CaviotDevice.android || CaviotDevice.phone);
  const limit = mobile ? Math.min(MAX_IMAGE_PIXELS, CaviotDevice.limits.maxImagePixels) : MAX_IMAGE_PIXELS;
  const maxSide = mobile && CaviotDevice.device ? CaviotDevice.device.maxImageSide : Infinity;
  const longSide = Math.max(canvas.width, canvas.height);
  if (canvas.width * canvas.height <= limit && longSide <= maxSide) return canvas;
  const scale = Math.min(Math.sqrt(limit / (canvas.width * canvas.height)) * 0.999, maxSide / longSide);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.floor(canvas.width * scale));
  c.height = Math.max(1, Math.floor(canvas.height * scale));
  const ctx = c.getContext('2d');
  if (!ctx) { toast('Not enough memory to read this photo — try a smaller image', 'error'); return null; }
  ctx.drawImage(canvas, 0, 0, c.width, c.height);
  canvas.width = canvas.height = 0;
  toast('Large photo resized to ' + c.width + '×' + c.height + ' to save memory on this device', 'success');
  return c;
}

async function loadHeicFile(file, uploadSide) {
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Image is too large — maximum 20 MB', 'error');
    return;
  }
  try {
    toast('Reading HEIC photo…', 'success');
    const decoded = await Heic.decodeFile(file);
    const canvas = document.createElement('canvas');
    if (decoded.bitmap) {
      canvas.width = decoded.bitmap.width;
      canvas.height = decoded.bitmap.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Not enough memory to read this photo — try a smaller image');
      ctx.drawImage(decoded.bitmap, 0, 0);
      if (typeof decoded.bitmap.close === 'function') decoded.bitmap.close();
    } else {
      canvas.width = decoded.width;
      canvas.height = decoded.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw Error('Not enough memory to read this photo — try a smaller image');
      ctx.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0);
    }
    const scaled = downscalePhotoCanvas(canvas);
    if (scaled) deliverLoadedImage(scaled, file.name || 'photo.heic', uploadSide);
  } catch (error) {
    toast((error && error.message) || 'Could not read this HEIC photo. Export a JPEG from the Photos app and try that.', 'error');
  }
}

function transformImage(fn) {
  if (!AppState.image) return;
  const img = AppState.image;
  const c = document.createElement('canvas');
  // fn decides dimensions
  const result = fn(img, c);
  const out = new Image();
  out.onload = () => setDesignImage(out, AppState.imageName || 'image');
  out.src = result;
}

function rotateImage(deg) {
  transformImage((img, c) => {
    const rad = deg * Math.PI / 180;
    const w = img.width, h = img.height;
    if (deg % 180 === 0) { c.width = w; c.height = h; }
    else { c.width = h; c.height = w; }
    const ctx = c.getContext('2d');
    ctx.translate(c.width / 2, c.height / 2);
    ctx.rotate(rad);
    ctx.drawImage(img, -w / 2, -h / 2);
    return c.toDataURL('image/png');
  });
}

function flipImageH() {
  transformImage((img, c) => {
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.translate(c.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(img, 0, 0);
    return c.toDataURL('image/png');
  });
}

// ---------- Simplified STL flatten import ----------
function parseSTLPositions(buf) {
  const view = new DataView(buf);
  // Binary STL if size matches
  if (buf.byteLength > 84) {
    const triCount = view.getUint32(80, true);
    const expected = 84 + triCount * 50;
    if (expected === buf.byteLength && triCount > 0 && triCount <= MAX_STL_TRIANGLES) {
      const positions = new Float32Array(triCount * 9);
      let o = 84, p = 0;
      for (let t = 0; t < triCount; t++) {
        o += 12; // normal
        for (let v = 0; v < 3; v++) {
          positions[p++] = view.getFloat32(o, true); o += 4;
          positions[p++] = view.getFloat32(o, true); o += 4;
          positions[p++] = view.getFloat32(o, true); o += 4;
        }
        o += 2;
      }
      return positions;
    }
  }
  // ASCII fallback
  const text = new TextDecoder().decode(buf);
  if (!/solid/i.test(text)) return null;
  const re = /vertex\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)\s+([-+eE0-9.]+)/g;
  const arr = [];
  let m;
  while ((m = re.exec(text))) {
    arr.push(parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]));
  }
  return new Float32Array(arr);
}

function importSTLFile(file) {
  if (!file) return;
  if (file.size > MAX_STL_BYTES) {
    toast('STL is too large — maximum 100 MB', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const positions = parseSTLPositions(reader.result);
      if (!positions || positions.length < 9) {
        toast('Could not parse STL', 'error');
        return;
      }
      const c = document.createElement('canvas');
      const size = 256;
      c.width = size; c.height = size;
      // inline raster
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (let i = 0; i < positions.length; i += 3) {
        minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
        minY = Math.min(minY, positions[i + 1]); maxY = Math.max(maxY, positions[i + 1]);
        minZ = Math.min(minZ, positions[i + 2]); maxZ = Math.max(maxZ, positions[i + 2]);
      }
      const ctx = c.getContext('2d');
      const imgData = ctx.createImageData(size, size);
      const heightBuf = new Float32Array(size * size);
      heightBuf.fill(-Infinity);
      const rx = maxX - minX || 1, rz = maxZ - minZ || 1, ry = maxY - minY || 1;
      for (let i = 0; i < positions.length; i += 3) {
        const u = Math.min(size - 1, Math.max(0, Math.floor(((positions[i] - minX) / rx) * (size - 1))));
        const v = Math.min(size - 1, Math.max(0, Math.floor(((positions[i + 2] - minZ) / rz) * (size - 1))));
        const h = (positions[i + 1] - minY) / ry;
        const idx = v * size + u;
        if (h > heightBuf[idx]) heightBuf[idx] = h;
      }
      for (let i = 0; i < heightBuf.length; i++) {
        const h = heightBuf[i] === -Infinity ? 0 : heightBuf[i];
        const g = Math.round(h * 255);
        imgData.data[i * 4] = g;
        imgData.data[i * 4 + 1] = g;
        imgData.data[i * 4 + 2] = g;
        imgData.data[i * 4 + 3] = heightBuf[i] === -Infinity ? 0 : 255;
      }
      ctx.putImageData(imgData, 0, 0);
      const im = new Image();
      im.onload = () => {
        setDesignImage(im, 'stl:' + (file.name || 'import'));
        toast('STL flattened to heightmap', 'success');
      };
      im.src = c.toDataURL('image/png');
    } catch (e) {
      console.error(e);
      toast('STL import failed', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ---------- Browser self-tests ----------
function runBrowserMeshTests() {
  const results = [];
  function check(name, cond, detail) {
    results.push({ name, ok: !!cond, detail: detail || '' });
  }
  // cube
  {
    const positions = new Float32Array([
      0,0,0, 1,0,0, 1,1,0, 0,1,0, 0,0,1, 1,0,1, 1,1,1, 0,1,1,
    ]);
    const indices = [0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,2,3,7,2,7,6,0,4,7,0,7,3,1,2,6,1,6,5];
    const v = MC.validateMesh(positions, indices);
    check('closed cube', v.boundary === 0 && v.nonManifold === 0, JSON.stringify(v));
  }
  const rows = 16, cols = 24;
  const hm = new Float32Array(rows * cols);
  for (let i = 0; i < hm.length; i++) hm[i] = Math.random();
  const modes = [
    { mode: 'sleeve', wrapAngle: 360, negative: false },
    { mode: 'sleeve', wrapAngle: 180, negative: true },
    { mode: 'logo-only', wrapAngle: 360, negative: false },
    { mode: 'flat', negative: false },
  ];
  modes.forEach((m) => {
    const mesh = MC.buildMesh({
      mode: m.mode,
      heightmap: hm,
      rows, cols,
      maxHeight: 1.2,
      negative: !!m.negative,
      innerWidth: 25.5, innerDepth: 15.2, wall: 2.4, sleeveHeight: 40,
      wrapAngle: m.wrapAngle || 360,
      width: 40, base: 1,
    });
    const v = MC.validateMesh(mesh.positions, mesh.indices);
    check(m.mode + (m.wrapAngle || '') + (m.negative ? '-carved' : '-raised'),
      v.boundary === 0 && v.nonManifold === 0 && v.zeroArea === 0, JSON.stringify(v));
  });
  const failed = results.filter((r) => !r.ok);
  const msg = results.length - failed.length + '/' + results.length + ' passed';
  if (failed.length) toast('Mesh tests: ' + msg, 'error');
  else toast('Mesh tests: ' + msg, 'success');
  console.table(results);
  return results;
}

window.__icaviotTests = runBrowserMeshTests;
window.AppState = AppState;
window.MeshCore = MC;

// ---------- Wire UI ----------

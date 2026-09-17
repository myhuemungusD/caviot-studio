const PATTERNS = [
  { id: 'plain', name: 'Plain', draw: (ctx, w, h) => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); } },
  { id: 'knurl', name: 'Knurl', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    for (let y = -h; y < h * 2; y += 10) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y + w * 0.6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y - w * 0.6); ctx.stroke();
    }
  }},
  { id: 'hex', name: 'Hex', draw: (ctx, w, h) => {
    ctx.fillStyle = '#1a1a1a'; ctx.fillRect(0, 0, w, h);
    const R = 14;
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2;
    for (let row = 0; row < h / (R * 1.5) + 2; row++) {
      for (let col = 0; col < w / (R * Math.sqrt(3)) + 2; col++) {
        const cx = col * R * Math.sqrt(3) + (row % 2 ? R * Math.sqrt(3) / 2 : 0);
        const cy = row * R * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + k * Math.PI / 3;
          const x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath(); ctx.stroke();
      }
    }
  }},
  { id: 'lines', name: 'Lines', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 3;
    for (let x = 0; x < w; x += 12) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
  }},
  { id: 'diamond', name: 'Diamond', draw: (ctx, w, h) => {
    ctx.fillStyle = '#111'; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#eee'; ctx.lineWidth = 2;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(Math.PI / 4);
    ctx.translate(-w / 2, -h / 2);
    const s = 16;
    for (let y = -h; y < h * 2; y += s) {
      for (let x = -w; x < w * 2; x += s) {
        ctx.strokeRect(x, y, s, s);
      }
    }
    ctx.restore();
  }},
];

let patternModalReturnFocus = null;

function closePatternModal() {
  if (!els.patternModal) return;
  els.patternModal.classList.add('hidden');
  if (patternModalReturnFocus && typeof patternModalReturnFocus.focus === 'function') {
    patternModalReturnFocus.focus();
  }
  patternModalReturnFocus = null;
}

function openPatternModal() {
  if (!els.patternModal || !els.patternGrid) return;
  patternModalReturnFocus = document.activeElement;
  els.patternGrid.innerHTML = '';
  PATTERNS.forEach((p) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pattern-card';
    const c = document.createElement('canvas');
    c.width = 120; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.save();
    p.draw(ctx, 120, 80);
    ctx.restore();
    btn.appendChild(c);
    const lab = document.createElement('span');
    lab.textContent = p.name;
    btn.appendChild(lab);
    btn.addEventListener('click', () => {
      applyPattern(p);
      closePatternModal();
    });
    els.patternGrid.appendChild(btn);
  });
  els.patternModal.classList.remove('hidden');
  requestAnimationFrame(() => {
    const first = els.patternGrid.querySelector('button');
    if (first) first.focus();
  });
}

function applyPattern(p) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  p.draw(ctx, 512, 512);
  const img = new Image();
  img.onload = () => {
    setDesignImage(img, 'pattern:' + p.id);
  };
  img.src = c.toDataURL('image/png');
}

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
  if (!/^image\/(png|jpe?g)$/i.test(file.type || '')) {
    toast('Use a PNG or JPG image', 'error');
    return;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    toast('Image is too large — maximum 20 MB', 'error');
    return;
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    if (img.width * img.height > MAX_IMAGE_PIXELS) {
      URL.revokeObjectURL(url);
      toast('Image dimensions are too large — use 24 megapixels or less', 'error');
      return;
    }
    URL.revokeObjectURL(url);
    if(uploadSide!==null&&typeof receiveSideUpload==='function')receiveSideUpload(img,file.name||'image',uploadSide);else setDesignImage(img,file.name||'image');
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    toast('Could not load image', 'error');
  };
  img.src = url;
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

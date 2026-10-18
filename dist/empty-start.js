'use strict';
// Phone apps only (iOS + Android native mode, see brand-labels.js): the app opens on an empty
// "Choose a template" screen instead of showing a sleeve straight away. The built-in Classic Sleeve still
// loads in the background, so picking it is instant and its exports are byte-identical to the website.
// Until a template is chosen the studio is covered, and export is refused with a helpful message.
// Website and Mac are unchanged (CaviotLabels.native is false there).
const CaviotEmptyStart = (() => {
  const native = typeof CaviotLabels !== 'undefined' && CaviotLabels.native;
  const api = { native, active: false, choose: null };
  if (!native || typeof document === 'undefined') return api;
  const MSG = 'Choose a template first: Classic Sleeve or Import STL.';
  const style = document.createElement('style');
  style.textContent =
    '#emptyStart{position:fixed;inset:0;z-index:900;display:flex;align-items:center;justify-content:center;padding:max(24px,env(safe-area-inset-top)) 20px max(24px,env(safe-area-inset-bottom));background:var(--bg,#0f1115);color:var(--text,#e8eaf0)}' +
    '#emptyStart[hidden]{display:none}#emptyStart .es-card{width:100%;max-width:420px;text-align:center}' +
    '#emptyStart h2{margin:0 0 6px;font-size:1.6rem}#emptyStart p{margin:0 0 22px;opacity:.75;line-height:1.4}' +
    '#emptyStart .es-choices{display:grid;gap:12px}#emptyStart button{display:flex;flex-direction:column;align-items:flex-start;gap:4px;width:100%;min-height:64px;padding:16px 18px;border-radius:14px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.06);color:inherit;font:inherit;text-align:left;cursor:pointer}' +
    '#emptyStart button.es-primary{background:var(--accent,#ff6a1a);border-color:transparent;color:#fff}#emptyStart button strong{font-size:1.08rem}#emptyStart button small{opacity:.8}' +
    '#emptyStart button:disabled{opacity:.6}#emptyStart button:focus-visible{outline:3px solid #fff;outline-offset:2px}';
  document.head.appendChild(style);
  const root = document.createElement('div');
  root.id = 'emptyStart';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'emptyStartTitle');
  root.innerHTML =
    '<div class="es-card"><h2 id="emptyStartTitle">Choose a template</h2><p>Pick the sleeve shape to design on. You can change it later under All settings.</p><div class="es-choices">' +
    '<button type="button" class="es-primary" id="emptyStartClassic" data-template="etsyfolger-v1"><strong>' +
    CaviotLabels.template +
    '</strong><small id="emptyStartClassicNote">Built-in sleeve</small></button>' +
    '<button type="button" id="emptyStartImport"><strong>Import STL</strong><small>STL, OBJ or 3MF from Files, a scan app or your computer</small></button></div></div>';
  document.body.appendChild(root);
  const classic = root.querySelector('#emptyStartClassic'),
    note = root.querySelector('#emptyStartClassicNote');
  let chosen = false,
    wantClassic = false,
    importing = false;
  // Other modules re-enable the export buttons as the preview settles; keep them off until a template is chosen.
  function exportButtons() {
    return ['generateBtn', 'downloadObjBtn'].map((id) => document.getElementById(id)).filter(Boolean);
  }
  function lockButtons() {
    for (const b of exportButtons()) if (!b.disabled) b.disabled = true;
  }
  const observer = new MutationObserver(() => {
    if (!chosen) lockButtons();
  });
  for (const b of exportButtons()) observer.observe(b, { attributes: true, attributeFilter: ['disabled'] });
  function gateOn() {
    return !chosen;
  }
  function finish() {
    chosen = true;
    api.active = false;
    root.hidden = true;
    document.body.classList.remove('empty-start');
    observer.disconnect();
    for (const b of exportButtons()) b.disabled = false;
    window.dispatchEvent(new Event('resize'));
    if (typeof syncAll === 'function')
      try {
        syncAll();
      } catch {}
  }
  function builtinReady() {
    return typeof templateBase !== 'undefined' && !!templateBase && typeof builtinTemplateBase !== 'undefined' && templateBase === builtinTemplateBase;
  }
  function tick() {
    if (chosen) return;
    lockButtons();
    const st = typeof AppState !== 'undefined' ? AppState : null;
    if (st && st.templateId === 'custom-stl' && typeof templateBase !== 'undefined' && templateBase) {
      finish();
      return;
    }
    if (wantClassic) {
      if (st && st.templateId !== 'etsyfolger-v1') {
        const sel = document.getElementById('templateChoice');
        if (sel) {
          sel.value = 'etsyfolger-v1';
          sel.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
      if (builtinReady()) finish();
    } else note.textContent = builtinReady() ? 'Built-in sleeve' : 'Built-in sleeve · loading…';
  }
  classic.onclick = () => {
    wantClassic = true;
    classic.disabled = true;
    note.textContent = 'Opening…';
    tick();
  };
  root.querySelector('#emptyStartImport').onclick = () => {
    importing = true;
    if (typeof openTemplateUpload === 'function') openTemplateUpload();
    else if (typeof toast === 'function') toast('Import is not available.', 'error');
  };
  // Export is refused while no template is chosen (button, keyboard shortcut or native bridge).
  if (typeof exportCurrent === 'function') {
    const prior = exportCurrent;
    exportCurrent = function (...args) {
      if (gateOn()) {
        if (typeof toast === 'function') toast(MSG, 'error');
        return Promise.resolve(null);
      }
      return prior.apply(this, args);
    };
  }
  document.addEventListener(
    'click',
    (e) => {
      if (gateOn() && e.target.closest && e.target.closest('#generateBtn,#downloadObjBtn')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof toast === 'function') toast(MSG, 'error');
      }
    },
    true
  );
  api.active = true;
  document.body.classList.add('empty-start');
  api.choose = (which) => {
    if (which === 'import') root.querySelector('#emptyStartImport').click();
    else classic.click();
  };
  api.isImporting = () => importing;
  setInterval(tick, 250);
  tick();
  return api;
})();
if (typeof window !== 'undefined') window.CaviotEmptyStart = CaviotEmptyStart;
if (typeof module !== 'undefined') module.exports = CaviotEmptyStart;

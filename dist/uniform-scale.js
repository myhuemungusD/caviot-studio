'use strict';
/* "Uniform scale" under the Design width / height / rotation sliders: grows or shrinks the selected sleeve design and
   keeps its proportions. 100% is the size when the slider was last at rest; any other size change (the width or
   height controls, a pinch, another design) starts again from 100%. Lives inside #designSizing, so the phone layout
   carries it into its Size section with the other sizing controls. */
(function () {
  const fields = $('placementFields');
  if (!fields || typeof updatePlacement !== 'function') return;
  const wrap = document.createElement('div');
  wrap.className = 'field placement-field uniform-scale';
  wrap.id = 'uniformScaleField';
  wrap.innerHTML = '<div class="placement-label"><label for="uniformScaleRange">Uniform scale</label><div><output id="uniformScaleVal" for="uniformScaleRange">100</output><span>%</span></div></div>' +
    '<input type="range" id="uniformScaleRange" min="10" max="300" step="1" value="100" aria-describedby="uniformScaleHelp" aria-valuetext="100 percent">' +
    '<p class="muted-tip" id="uniformScaleHelp">Width and height together, keeping the proportions.</p>';
  fields.after(wrap);
  const range = $('uniformScaleRange'), out = $('uniformScaleVal');
  let ref = null; // {w, h, slot, image, lastW, lastH}: the size at 100% and the size this slider last set
  const slot = () => (typeof designSides !== 'undefined' ? designSides[activeDesignSide] : null);
  const stale = () => !ref || ref.slot !== slot() || ref.image !== AppState.image || Math.abs(AppState.designWidth - ref.lastW) > 1e-6 || Math.abs(AppState.designHeight - ref.lastH) > 1e-6;
  function show(pct) { range.value = String(pct); out.textContent = String(pct); range.setAttribute('aria-valuetext', pct + ' percent'); }
  function refresh() {
    wrap.hidden = !templateActive() || !AppState.image;
    if (stale()) { ref = null; if (range.value !== '100') show(100); }
  }
  // Proportions kept, inside the template limits, and at least 2 mm on each side when that still fits.
  // The 2 mm floor must not grow one side past the other side's maximum.
  function fit(w, h) {
    if (!(w > 0) || !(h > 0)) return [w, h];
    const maxW = placementLimit('designWidth', 2, 160), maxH = placementLimit('designHeight', 2, 89);
    const kMax = Math.min(maxW / w, maxH / h);
    const kFloor = Math.min(kMax, Math.max(2 / w, 2 / h));
    const k = Math.min(kMax, Math.max(kFloor, 1));
    return [Math.round(w * k * 100) / 100, Math.round(h * k * 100) / 100];
  }
  range.addEventListener('input', () => {
    if (!templateActive() || !AppState.image) return;
    if (stale()) ref = { w: AppState.designWidth, h: AppState.designHeight, slot: slot(), image: AppState.image };
    const pct = Math.round(Number(range.value)) || 100, [w, h] = fit(ref.w * pct / 100, ref.h * pct / 100);
    AppState.designWidth = w; AppState.designHeight = h; ref.lastW = w; ref.lastH = h;
    out.textContent = String(pct); range.setAttribute('aria-valuetext', pct + ' percent');
    showPlacementValue('designWidth'); showPlacementValue('designHeight');
    updatePlacement();
  });
  range.addEventListener('change', () => finishPlacement());
  for (const name of ['syncDesignSides', 'updateStats', 'syncTemplateUI']) {
    const original = globalThis[name];
    if (typeof original === 'function') globalThis[name] = function () { const r = original.apply(this, arguments); refresh(); return r; };
  }
  refresh();
})();

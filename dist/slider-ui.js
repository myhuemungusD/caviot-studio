'use strict';
/* Range sliders are easy to miss: a 14px thumb on a 4px track. This makes every
   one the same control — a 24px thumb, an 8px track filled up to the value, a
   typeable number when the row did not already have one, Shift+arrow for a
   ten-step jump, and double-click back to the value the control was designed
   with. Nothing here writes a value on load, so a fresh sleeve still exports
   the same file as before. */
(function () {
  const UNITS = {
    letterSpacingIn: '', letterThicknessIn: '', imageScale: 'percent', depthIn: 'millimeters',
    wrapWall: 'millimeters', wrapHeight: 'millimeters', wrapTol: 'millimeters',
    wrapCapThick: 'millimeters', wrapCapHole: 'millimeters', outlineMarginIn: 'millimeters',
    curveDiamIn: 'millimeters', curveAngleIn: 'degrees', curveFalloffIn: 'percent',
    bgTol: '', resIn: '', smoothIn: '', edgeSmoothIn: '', uniformScaleRange: 'percent',
    designWidthRange: 'millimeters', designHeightRange: 'millimeters', designRotationRange: 'degrees',
    designAngleRange: 'degrees', designYRange: 'millimeters'
  };
  const READOUT = {
    letterSpacingIn: 'letterSpacingVal', letterThicknessIn: 'letterThicknessVal',
    imageScale: 'imageScaleVal', depthIn: 'depthVal', wrapWall: 'wrapWallVal',
    wrapHeight: 'wrapHeightVal', wrapTol: 'wrapTolVal', wrapCapThick: 'wrapCapThickVal',
    wrapCapHole: 'wrapCapHoleVal', outlineMarginIn: 'outlineMarginVal',
    curveDiamIn: 'curveDiamVal', curveAngleIn: 'curveAngleVal', curveFalloffIn: 'curveFalloffVal',
    bgTol: 'bgTolVal', resIn: 'resVal', smoothIn: 'smoothVal', edgeSmoothIn: 'edgeSmoothVal',
    uniformScaleRange: 'uniformScaleVal'
  };
  // Placement angles wrap past ±180. Curve angle is a clamped amount, not a heading.
  const WRAPS = new Set(['designAngleRange', 'designRotationRange']);

  function stepOf(el) {
    const step = Number(el.step);
    return Number.isFinite(step) && step > 0 ? step : 1;
  }
  function decimals(step) {
    const text = String(step);
    const dot = text.indexOf('.');
    return dot < 0 ? 0 : Math.min(6, text.length - dot - 1);
  }
  function roundTo(n, step) {
    const places = decimals(step);
    const snapped = Math.round(Math.round((n / step) * 1e6) / 1e6);
    return Number((snapped * step).toFixed(places));
  }
  function formatValue(n, step) {
    return Number.isFinite(n) ? roundTo(n, step).toFixed(decimals(step)) : '';
  }
  function unitOf(id) { return UNITS[id] || ''; }

  function paint(range) {
    const min = Number(range.min), max = Number(range.max), value = Number(range.value);
    const span = max - min;
    const pct = span > 0 && Number.isFinite(value) ? Math.min(100, Math.max(0, (value - min) / span * 100)) : 0;
    range.style.setProperty('--fill', pct + '%');
    const unit = unitOf(range.id);
    const shown = formatValue(value, stepOf(range));
    range.setAttribute('aria-valuetext', unit && shown !== '' ? shown + ' ' + unit : shown || range.value);
    const num = range._sliderNum;
    if (!num || num.dataset.sliderOwned !== '1' || document.activeElement === num || num._sliderSync) return;
    num.min = range.min;
    num.max = range.max;
    num.step = range.step;
    if (shown !== '') num.value = shown;
  }

  function commit(range) {
    range.dispatchEvent(new Event('input', { bubbles: true }));
    range.dispatchEvent(new Event('change', { bubbles: true }));
    paint(range);
  }

  function nudge(range, direction, coarse) {
    const step = stepOf(range);
    let next = roundTo(Number(range.value) + direction * step * (coarse ? 10 : 1), step);
    if (WRAPS.has(range.id)) {
      if (next > 180 || next < -180) next = next - 360 * Math.ceil((next - 180) / 360);
      if (!next) next = 0;
    } else {
      const min = Number(range.min), max = Number(range.max);
      if (Number.isFinite(min)) next = Math.max(min, next);
      if (Number.isFinite(max)) next = Math.min(max, next);
      next = roundTo(next, step);
    }
    range.value = String(next);
    commit(range);
  }

  function reset(range) {
    if (range.dataset.sliderReset == null || String(range.value) === range.dataset.sliderReset) return;
    range.value = range.dataset.sliderReset;
    commit(range);
  }

  function labelFor(range) {
    const explicit = document.querySelector('label[for="' + range.id + '"]');
    if (explicit) return explicit.textContent.replace(/\s+/g, ' ').trim();
    const field = range.closest('.field, .big-field, .placement-field, .uniform-scale');
    const label = field && field.querySelector('.field-label, .big-field-label, label');
    const text = (label ? label.textContent : range.getAttribute('aria-label') || range.id).replace(/\s+/g, ' ').trim();
    return text;
  }

  function bindNumber(range, num) {
    range._sliderNum = num;
    num._sliderRange = range;
    // Placement and bottom-brand numbers already write their slider. Mirroring
    // them again would undo angle wrap (200° must stay -160°, not snap back).
    num.addEventListener('input', () => {
      if (num.dataset.sliderOwned !== '1' || num._sliderSync || num.value === '' || !Number.isFinite(Number(num.value))) return;
      num._sliderSync = true;
      range.value = num.value;
      range.dispatchEvent(new Event('input', { bubbles: true }));
      num._sliderSync = false;
      paint(range);
    });
    num.addEventListener('change', () => {
      if (num.dataset.sliderOwned !== '1') return;
      if (num.value === '' || !Number.isFinite(Number(num.value))) { paint(range); return; }
      range.value = num.value;
      range.dispatchEvent(new Event('change', { bubbles: true }));
      paint(range);
    });
    num.addEventListener('keydown', (event) => {
      if (!event.shiftKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
      event.preventDefault();
      nudge(range, event.key === 'ArrowUp' ? 1 : -1, true);
    });
    num.addEventListener('dblclick', (event) => { event.preventDefault(); reset(range); });
  }

  function ensureNumber(range) {
    const pairedId = range.id.endsWith('Range') ? range.id.replace(/Range$/, 'Number') : '';
    const paired = pairedId ? document.getElementById(pairedId) : null;
    if (paired && paired.type === 'number') { bindNumber(range, paired); return; }
    const num = document.createElement('input');
    num.type = 'number';
    num.id = range.id + 'Number';
    num.className = 'slider-num';
    num.dataset.sliderOwned = '1';
    num.min = range.min;
    num.max = range.max;
    num.step = range.step;
    num.inputMode = 'decimal';
    num.value = formatValue(Number(range.value), stepOf(range));
    const unit = unitOf(range.id);
    num.setAttribute('aria-label', labelFor(range) + (unit ? ' in ' + unit : ''));
    num.title = 'Type a value. Shift+arrow jumps further. Double-click resets.';
    const readout = document.getElementById(READOUT[range.id] || '');
    if (readout) {
      readout.classList.add('slider-readout-off');
      readout.before(num);
      if (readout.closest('.big-field-value')) num.classList.add('slider-num-lg');
    } else range.before(num);
    bindNumber(range, num);
  }

  function enhance(range) {
    if (range.dataset.sliderReady) return;
    range.dataset.sliderReady = '1';
    range.classList.add('caviot-slider');
    const designed = range.getAttribute('value');
    range.dataset.sliderReset = designed != null ? designed : String(range.value);
    if (!range.title) range.title = 'Drag the thumb or click the track. Shift+arrow for a larger step. Double-click resets.';
    ensureNumber(range);
    range.addEventListener('input', () => paint(range));
    range.addEventListener('change', () => paint(range));
    // Capture so Shift+arrow runs instead of the placement wrap, which only handles a single step.
    range.addEventListener('keydown', (event) => {
      if (!event.shiftKey) return;
      const up = event.key === 'ArrowRight' || event.key === 'ArrowUp';
      const down = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
      if (!up && !down) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      nudge(range, up ? 1 : -1, true);
    }, true);
    range.addEventListener('dblclick', (event) => { event.preventDefault(); reset(range); });
    paint(range);
  }

  function refreshAll() {
    document.querySelectorAll('input[type=range]').forEach((range) => {
      if (!range.dataset.sliderReady) enhance(range);
      else paint(range);
    });
  }

  document.querySelectorAll('input[type=range]').forEach(enhance);
  for (const name of ['projectStateToUI', 'syncTemplateUI', 'showPlacementValue', 'syncDesignSides']) {
    const original = globalThis[name];
    if (typeof original !== 'function') continue;
    globalThis[name] = function () {
      const result = original.apply(this, arguments);
      refreshAll();
      return result;
    };
  }
  new MutationObserver(() => {
    document.querySelectorAll('input[type=range]:not([data-slider-ready])').forEach(enhance);
  }).observe(document.body, { childList: true, subtree: true });
  // Uniform scale and placement write the range directly. Repaint only when the
  // value actually changed, so the filled track stays honest without extra events.
  const seen = new WeakMap();
  function watch() {
    document.querySelectorAll('input[type=range]').forEach((range) => {
      if (seen.get(range) === range.value) return;
      seen.set(range, range.value);
      if (!range.dataset.sliderReady) enhance(range);
      else paint(range);
    });
    requestAnimationFrame(watch);
  }
  requestAnimationFrame(watch);
})();

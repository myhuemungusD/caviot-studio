'use strict';
/* Flat text prints: "Backing behind the text" Outline / Rounded rectangle / Connector bar / Solid plate / None.
   Built on the existing flat-plate settings, so projects, autosave and undo keep working:
   Solid plate = trim off (the full plate); with trim on, AppState.textBacking picks the backing:
   'none' (letters only, the old trimmed text plate), 'outline' (follows the letters), 'rounded' (rounded rectangle)
   or 'bar' (letters joined by a bar along the baseline). Outline and bar are bridged into one piece.
   Shown instead of the "Trim flat plate to image" checkbox while a text design is on a flat plate. */
(function () {
  const field = $('textBackingField');
  if (!field) return;
  const originalProjectStateToUI = projectStateToUI;
  const marginField = $('outlineMarginField'), marginIn = $('outlineMarginIn'), marginVal = $('outlineMarginVal'), tip = $('textBackingTip');
  const KINDS = ['outline', 'rounded', 'bar', 'solid', 'none'];
  const radios = Object.fromEntries(KINDS.map((k) => [k, $('textBacking' + k[0].toUpperCase() + k.slice(1))]));
  const backed = (k) => k === 'outline' || k === 'rounded' || k === 'bar';
  const current = () => (!AppState.silhouette ? 'solid' : backed(AppState.textBacking) ? AppState.textBacking : 'none');
  const mm = (v) => (Math.round(v * 10) / 10).toFixed(1) + ' mm';
  const shown = () => AppState.mode === 'flat' && isTextDesign();
  const NAMES = { outline: 'Outline backing', rounded: 'Rounded rectangle', bar: 'Connector bar' };

  function describe() {
    if (!AppState.crisp) return 'Turn on Sharp edges for crisp outline lettering.';
    const base = AppState.baseThickness, depth = Math.max(0, AppState.depthMm), negative = AppState.relief === 'carved';
    const level = (h) => (negative ? base + depth - h : base + h);
    const inkH = AppState.invert !== false ? depth : 0, letters = level(inkH), back = level(depth - inkH);
    const info = AppState.lastTextRelief, pieces = info && info.pieces ? info.pieces : 0;
    const relation = letters >= back ? 'stand ' + mm(letters - back) + ' above it' : 'are cut ' + mm(back - letters) + ' into it';
    const kind = current();
    if (kind === 'solid') return 'Plate ' + mm(back) + ' thick; letters ' + relation + '.';
    if (backed(kind)) return NAMES[kind] + ' ' + mm(back) + ' thick, ' + mm(AppState.outlineMargin) + ' around the letters; letters ' + relation + '. Prints as ' + (pieces > 1 ? pieces + ' pieces' : 'one piece') + '.';
    return 'Letters ' + mm(letters) + ' thick (Backing + Depth)' + (pieces > 1 ? ', ' + pieces + ' separate pieces. Choose Outline or Connector bar to join them.' : pieces === 1 ? ', one piece.' : '.');
  }

  // Standalone letters need real height: the sleeve-style 0.4 mm relief would print 1.4 mm thin letters. When a text
  // design lands on a flat plate (mode switch or typing text there), start at 2 mm letters; switching away again restores
  // the previous Depth/relief if the user has not changed them meanwhile. Not applied to the first sync after load, so
  // saved settings and projects open as saved.
  let lastShown = null, autoDepth = null;
  function autoDefaults(show) {
    if (lastShown === null || show === lastShown) return;
    if (show && AppState.depthMm < 1) {
      autoDepth = { depth: AppState.depthMm, relief: AppState.relief, set: 2 };
      AppState.depthMm = 2;
      AppState.relief = 'raised';
      toast('Text print: letters start 2 mm tall (' + mm(AppState.baseThickness + 2) + ' thick as letters only). Adjust Depth and Backing as needed.', 'success');
    } else if (!show && autoDepth) {
      if (AppState.depthMm === autoDepth.set && AppState.relief === 'raised') {
        AppState.depthMm = autoDepth.depth;
        AppState.relief = autoDepth.relief;
      }
      autoDepth = null;
    }
  }

  function sync() {
    const show = shown();
    const before = AppState.depthMm + AppState.relief;
    autoDefaults(show);
    lastShown = show;
    if (AppState.depthMm + AppState.relief !== before) { originalProjectStateToUI(); scheduleRebuild(); saveSettings(); }
    field.hidden = !show;
    const trimLabel = els.silhouette && els.silhouette.closest('label');
    if (trimLabel) trimLabel.hidden = show;
    if (!show) return;
    const value = current();
    for (const k of KINDS) radios[k].checked = k === value;
    marginField.hidden = !backed(value);
    marginIn.value = String(AppState.outlineMargin);
    marginVal.textContent = AppState.outlineMargin.toFixed(1);
    const text = describe();
    if (tip.textContent !== text) tip.textContent = text;
  }

  function choose(value) {
    if (value === current()) return;
    AppState.silhouette = value !== 'solid';
    if (value !== 'solid') AppState.textBacking = value;
    // The sleeve-style 0.4 mm relief is too thin for standalone letters: start at 2 mm letters.
    if (value !== 'solid' && AppState.depthMm < 1) {
      autoDepth = null;
      AppState.depthMm = 2;
      AppState.relief = 'raised';
      if (backed(value) && AppState.baseThickness < 1.5) AppState.baseThickness = 1.5;
      toast(backed(value) ? 'Letters 2 mm tall on a ' + mm(AppState.baseThickness) + ' backing. Adjust Depth and Backing as needed.' : 'Letters ' + mm(AppState.baseThickness + 2) + ' thick. Adjust Depth and Backing as needed.', 'success');
    }
    projectStateToUI();
    scheduleRebuild();
    saveSettings();
  }

  for (const k of KINDS) radios[k].addEventListener('change', () => { if (radios[k].checked) choose(k); });
  marginIn.addEventListener('input', () => {
    const v = parseFloat(marginIn.value);
    AppState.outlineMargin = Number.isFinite(v) ? Math.max(0.5, Math.min(10, v)) : 2;
    marginVal.textContent = AppState.outlineMargin.toFixed(1);
    scheduleRebuild();
  });
  marginIn.addEventListener('change', saveSettings);

  projectStateToUI = function () { originalProjectStateToUI.apply(this, arguments); sync(); };
  const originalUpdateStats = updateStats;
  updateStats = function () { originalUpdateStats.apply(this, arguments); sync(); };
  sync();
})();

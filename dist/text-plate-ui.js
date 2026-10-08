'use strict';
/* Flat text prints: "Print the text as" Plate / Outline / Letters only.
   Built on the existing flat-plate settings, so projects and undo keep working:
   Plate = trim off; Letters only = trim on (the old trimmed text plate); Outline = trim on + textOutline,
   a backing that follows the letters at AppState.outlineMargin and is bridged into one piece.
   Shown instead of the "Trim flat plate to image" checkbox while a text design is on a flat plate. */
(function () {
  const field = $('textBackingField');
  if (!field) return;
  const marginField = $('outlineMarginField'), marginIn = $('outlineMarginIn'), marginVal = $('outlineMarginVal'), tip = $('textBackingTip');
  const radios = { plate: $('textBackingPlate'), outline: $('textBackingOutline'), letters: $('textBackingLetters') };
  const current = () => (!AppState.silhouette ? 'plate' : AppState.textOutline ? 'outline' : 'letters');
  const mm = (v) => (Math.round(v * 10) / 10).toFixed(1) + ' mm';
  const shown = () => AppState.mode === 'flat' && isTextDesign();

  function describe() {
    if (!AppState.crisp) return 'Turn on Sharp edges for crisp outline lettering.';
    const base = AppState.baseThickness, depth = Math.max(0, AppState.depthMm), negative = AppState.relief === 'carved';
    const level = (h) => (negative ? base + depth - h : base + h);
    const inkH = AppState.invert !== false ? depth : 0, letters = level(inkH), back = level(depth - inkH);
    const info = AppState.lastTextRelief;
    const pieces = info && info.pieces ? info.pieces : 0;
    const relation = letters >= back ? 'stand ' + mm(letters - back) + ' above it' : 'are cut ' + mm(back - letters) + ' into it';
    if (current() === 'plate') return 'Plate ' + mm(back) + ' thick; letters ' + relation + '.';
    if (current() === 'outline') return 'Backing ' + mm(back) + ' thick, ' + mm(AppState.outlineMargin) + ' around the letters; letters ' + relation + '. Prints as ' + (pieces > 1 ? pieces + ' pieces' : 'one piece') + '.';
    return 'Letters ' + mm(letters) + ' thick (Backing + Depth)' + (pieces > 1 ? ', ' + pieces + ' separate pieces. Choose Outline to join them.' : pieces === 1 ? ', one piece.' : '.');
  }

  function sync() {
    const show = shown();
    field.hidden = !show;
    const trimLabel = els.silhouette && els.silhouette.closest('label');
    if (trimLabel) trimLabel.hidden = show;
    if (!show) return;
    const value = current();
    for (const [key, radio] of Object.entries(radios)) radio.checked = key === value;
    marginField.hidden = value !== 'outline';
    marginIn.value = String(AppState.outlineMargin);
    marginVal.textContent = AppState.outlineMargin.toFixed(1);
    const text = describe();
    if (tip.textContent !== text) tip.textContent = text;
  }

  function choose(value) {
    if (value === current()) return;
    AppState.silhouette = value !== 'plate';
    AppState.textOutline = value === 'outline';
    // Sleeve-style 0.4 mm relief is too thin for standalone letters: start at 2 mm letters.
    if (value !== 'plate' && AppState.depthMm < 1) {
      AppState.depthMm = 2;
      AppState.relief = 'raised';
      if (value === 'outline' && AppState.baseThickness < 1.5) AppState.baseThickness = 1.5;
      toast(value === 'outline' ? 'Letters 2 mm tall on a ' + mm(AppState.baseThickness) + ' backing. Adjust Depth and Backing as needed.' : 'Letters ' + mm(AppState.baseThickness + 2) + ' thick. Adjust Depth and Backing as needed.', 'success');
    }
    projectStateToUI();
    scheduleRebuild();
    saveSettings();
  }

  for (const [key, radio] of Object.entries(radios)) radio.addEventListener('change', () => { if (radio.checked) choose(key); });
  marginIn.addEventListener('input', () => {
    const v = parseFloat(marginIn.value);
    AppState.outlineMargin = Number.isFinite(v) ? Math.max(0.5, Math.min(10, v)) : 2;
    marginVal.textContent = AppState.outlineMargin.toFixed(1);
    scheduleRebuild();
  });
  marginIn.addEventListener('change', saveSettings);

  const originalProjectStateToUI = projectStateToUI;
  projectStateToUI = function () { originalProjectStateToUI.apply(this, arguments); sync(); };
  const originalUpdateStats = updateStats;
  updateStats = function () { originalUpdateStats.apply(this, arguments); sync(); };
  sync();
})();

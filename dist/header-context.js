'use strict';
/* Top-bar context: the left panel no longer repeats "01 / Your design" and "Size & rotation · selected design";
   the project bar names what the sizing controls apply to, and the sleeve status line (#templateStatus, a polite
   live region) sits beside it as one compact line. Long messages are truncated with the full text on hover; an
   error that does not fit is also shown as a toast so it is never cut off. On a phone the status goes back to
   its place in the tools sheet, where the phone layout expects it. */
(function () {
  const bar = $('projectContext'), label = $('contextLabel'), status = $('templateStatus'), home = $('templateStatusHome');
  if (!bar || !label || !status) return;
  const phone = () => typeof CaviotDevice !== 'undefined' && CaviotDevice.phoneLayout();

  function contextText() {
    if (!AppState.image) return 'Your design';
    const slot = typeof designSides !== 'undefined' ? designSides[activeDesignSide] : null, parts = [];
    if (templateActive()) parts.push(activeDesignSide ? 'Back' : 'Front');
    const name = slot && slot.kind === 'text' ? (AppState.text || '').trim() : (AppState.sourceLabel || '').replace(/^(pattern|stl):/, '');
    // CSS ellipsis clips the bar; the full name stays in the text so a screen reader and the tooltip get it.
    if (name) parts.push(name);
    parts.push('Size & rotation');
    return parts.join(' · ');
  }
  function syncContext() {
    const text = contextText();
    if (label.textContent !== text) { label.textContent = text; label.title = text; }
  }

  function placeStatus() {
    const target = phone() && home ? home : bar;
    if (target === home) { if (status.previousElementSibling !== home) home.after(status); }
    else if (status.parentElement !== bar) bar.appendChild(status);
    status.classList.toggle('in-topbar', target === bar);
  }

  let lastError = '';
  const originalStatus = templateStatus;
  templateStatus = function (message, error = false) {
    originalStatus.call(this, message, error);
    status.title = message || '';
    if (!error) { lastError = ''; return; }
    if (message === lastError) return;
    lastError = message;
    // A cut-off failure message would hide the reason: show it in full once.
    if (status.classList.contains('in-topbar') && status.scrollWidth > status.clientWidth + 1 && typeof toast === 'function') toast(message, 'error');
  };
  status.title = status.textContent;

  for (const name of ['syncDesignSides', 'updateStats']) {
    const original = globalThis[name];
    if (typeof original === 'function') globalThis[name] = function () { const r = original.apply(this, arguments); syncContext(); return r; };
  }
  els.textInput?.addEventListener('input', () => setTimeout(syncContext, 0));
  if (typeof CaviotDevice !== 'undefined' && CaviotDevice.PHONE_QUERY) {
    const q = matchMedia(CaviotDevice.PHONE_QUERY);
    q.addEventListener ? q.addEventListener('change', placeStatus) : q.addListener(placeStatus);
  } else addEventListener('resize', placeStatus);
  placeStatus();
  syncContext();
})();

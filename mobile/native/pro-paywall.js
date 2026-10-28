import { PRO_PRODUCT_ID, isGatedExportFormat, exportUnlocked, betaUnlockApplies, storeOutcome, proMessage } from './bridge-logic.js';

// Caviot Studio Pro on iPhone and iPad: a one-time In-App Purchase that unlocks mesh export (STL and OBJ;
// 3MF is gated too if an export for it is added).
// Designing, previewing and saving .icaviot projects stay free. StoreKit 2 runs in CaviotNativePlugin.swift;
// this module only shows the paywall and asks the plugin. Nothing is sent anywhere else.
const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const PRIVACY_URL = 'https://www.designmainline.com/caviot/privacy';

export function installProGate({ plugin, pageApi, say, online = () => navigator.onLine !== false }) {
  const state = {
    pro: false,
    environment: 'unknown',
    productState: 'unknown',
    product: null,
    smokeBypass: false,
    busy: false,
    betaNoticeShown: false,
  };
  const notify = typeof say === 'function' ? say : () => {};
  const dialog = buildDialog();
  const panel = buildPanel();
  let pendingChoice = null;
  let productLoad = null;

  const statusReady = refreshStatus();
  listenForChanges();
  wrapExport();
  render();

  const api = {
    productId: PRO_PRODUCT_ID,
    get state() {
      return { ...state, product: state.product ? { ...state.product } : null };
    },
    get unlocked() {
      return exportUnlocked(state);
    },
    // Status plus the product lookup (bounded, so a slow App Store never blocks a caller).
    ready: () => statusReady.then(() => (state.pro ? null : withTimeout(loadProduct(), 15000))).then(() => api.state),
    open: (reason) => openPaywall(reason),
    close: () => finish(false),
    purchase,
    restore,
    // Simulator smoke test only (launch argument -CaviotSmoke), after it checks that the paywall opens.
    allowSmokeExport() {
      state.smokeBypass = true;
      render();
    },
  };
  globalThis.CaviotPro = api;
  return api;

  async function refreshStatus() {
    try {
      const status = await plugin.proStatus();
      state.pro = !!(status && status.pro);
      state.environment = String((status && status.environment) || 'production');
    } catch (error) {
      // Without an answer the safe default is locked; the paywall still offers Restore.
      console.warn('Could not read the Caviot Studio Pro status:', error);
      state.environment = 'production';
    }
    render();
    // The price loads in the background; export never waits on it in an App Store build.
    if (!state.pro) void loadProduct();
  }

  function loadProduct(force = false) {
    if (productLoad && !force) return productLoad;
    // A retry keeps a known "not set up yet" answer, so a test build never flickers back to locked.
    if (state.productState !== 'not-found') state.productState = 'loading';
    render();
    productLoad = (async () => {
      try {
        const product = await plugin.proProduct();
        if (product && product.available) {
          state.product = {
            displayPrice: String(product.displayPrice || ''),
            displayName: String(product.displayName || 'Caviot Studio Pro'),
            description: String(product.description || ''),
          };
          state.productState = 'ready';
        } else {
          state.product = null;
          state.productState = 'not-found';
        }
      } catch (error) {
        state.product = null;
        state.productState = storeOutcome(error, online()) === 'offline' ? 'offline' : 'error';
      }
      if (betaUnlockApplies(state.environment, state.productState) && !state.betaNoticeShown) {
        state.betaNoticeShown = true;
        console.info(
          'Caviot Studio Pro: ' + PRO_PRODUCT_ID + ' is not set up in App Store Connect; export stays unlocked in this ' + state.environment + ' build.'
        );
      }
      render();
      return state.productState;
    })();
    const current = productLoad;
    // A failed load (offline) is retried the next time the paywall opens.
    current.then((result) => {
      if (result !== 'ready' && result !== 'not-found' && productLoad === current) productLoad = null;
    });
    return current;
  }

  function listenForChanges() {
    if (!plugin || typeof plugin.addListener !== 'function') return;
    try {
      const added = plugin.addListener('proChanged', (event) => {
        const was = state.pro;
        state.pro = !!(event && event.pro);
        render();
        if (state.pro && !was) {
          notify(proMessage('purchased'), 'success');
          if (dialog.open) finish(true);
        }
      });
      if (added && typeof added.catch === 'function') added.catch(() => {});
    } catch {
      /* purchases made in the paywall still unlock without the listener */
    }
  }

  function wrapExport() {
    if (!pageApi || typeof pageApi.exportCurrent !== 'function') return;
    const previous = pageApi.exportCurrent;
    pageApi.exportCurrent = function (format) {
      const args = arguments;
      if (!isGatedExportFormat(format) || exportUnlocked(state)) return previous.apply(this, args);
      return (async () => {
        await statusReady;
        // Test builds decide the beta unlock from the product lookup, so give it a moment.
        if (!exportUnlocked(state) && state.environment !== 'production' && productLoad) await withTimeout(productLoad, 8000);
        if (!exportUnlocked(state)) {
          const unlocked = await openPaywall('export');
          if (!unlocked) return undefined;
        }
        return previous.apply(this, args);
      })();
    };
  }

  function openPaywall(reason) {
    if (pendingChoice) return pendingChoice.promise;
    let resolve;
    const promise = new Promise((r) => {
      resolve = r;
    });
    pendingChoice = { promise, resolve, reason };
    setMessage('', '');
    render();
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        dialog.setAttribute('open', '');
      }
    }
    if (state.productState !== 'ready' && state.productState !== 'loading') void loadProduct(true);
    const first = dialog.querySelector('[data-pro="buy"]:not([disabled])') || dialog.querySelector('[data-pro="close"]');
    first?.focus();
    return promise;
  }

  function finish(unlocked) {
    if (dialog.open) {
      try {
        dialog.close();
      } catch {
        dialog.removeAttribute('open');
      }
    }
    const choice = pendingChoice;
    pendingChoice = null;
    if (choice) choice.resolve(!!unlocked);
  }

  async function purchase() {
    if (state.busy) return state.pro;
    state.busy = true;
    setMessage('Contacting the App Store…', 'info');
    render();
    let outcome;
    try {
      if (state.productState !== 'ready') await loadProduct(true);
      if (state.productState !== 'ready') {
        outcome = state.productState === 'offline' ? 'offline' : state.productState === 'not-found' ? 'not-found' : 'store';
      } else {
        const result = await plugin.proPurchase();
        outcome = String((result && result.status) || 'unknown');
        if (result && result.pro) state.pro = true;
      }
    } catch (error) {
      outcome = storeOutcome(error, online());
    }
    state.busy = false;
    report(outcome);
    return state.pro;
  }

  async function restore() {
    if (state.busy) return state.pro;
    state.busy = true;
    setMessage('Checking your purchases with the App Store…', 'info');
    render();
    let outcome;
    try {
      const result = await plugin.proRestore();
      outcome = String((result && result.status) || 'none');
      state.pro = !!(result && result.pro);
      if (state.pro && outcome !== 'purchased') outcome = 'restored';
    } catch (error) {
      outcome = storeOutcome(error, online());
    }
    state.busy = false;
    report(outcome);
    return state.pro;
  }

  function report(outcome) {
    const text = proMessage(outcome, state.product && state.product.displayPrice);
    render();
    if (state.pro) {
      setMessage('', '');
      notify(text || proMessage('purchased'), 'success');
      finish(true);
      return;
    }
    if (!dialog.open) {
      if (text) notify(text, outcome === 'none' || outcome === 'pending' ? 'info' : 'error');
      return;
    }
    setMessage(text, outcome === 'pending' || outcome === 'none' || outcome === 'cancelled' ? 'info' : 'error');
  }

  function setMessage(text, kind) {
    const line = dialog.querySelector('#proPaywallMessage');
    line.textContent = text;
    line.dataset.kind = kind || '';
  }

  function render() {
    const root = document.documentElement;
    root.classList.toggle('caviot-pro', !!state.pro);
    root.classList.toggle('caviot-pro-locked', !exportUnlocked(state));
    const price = state.product && state.product.displayPrice;
    const priceLine = dialog.querySelector('#proPaywallPrice');
    const buy = dialog.querySelector('[data-pro="buy"]');
    const restoreButton = dialog.querySelector('[data-pro="restore"]');
    if (state.productState === 'ready' && price) priceLine.textContent = price + ', one-time purchase. No subscription.';
    else if (state.productState === 'loading' || state.productState === 'unknown') priceLine.textContent = 'Loading the price from the App Store…';
    else if (state.productState === 'offline') priceLine.textContent = 'The App Store price could not load because you appear to be offline.';
    else priceLine.textContent = 'The App Store price is not available right now.';
    buy.textContent = state.productState === 'ready' && price ? 'Unlock Pro for ' + price : 'Unlock Pro';
    buy.disabled = state.busy || state.pro || state.productState !== 'ready';
    restoreButton.disabled = state.busy;
    dialog.setAttribute('aria-busy', String(state.busy));
    if (panel) {
      const status = panel.querySelector('#proPanelStatus');
      const unlock = panel.querySelector('[data-pro="panel-buy"]');
      if (state.pro) status.textContent = 'Pro is unlocked. STL and OBJ export are on.';
      else if (exportUnlocked(state)) status.textContent = 'Test build: export is unlocked because the In-App Purchase is not set up yet.';
      else status.textContent = 'Designing and saving projects are free. Exporting print files needs Pro' + (price ? ' (' + price + ', one time).' : '.');
      unlock.hidden = !!state.pro;
      panel.querySelector('[data-pro="panel-restore"]').disabled = state.busy;
    }
  }

  function buildDialog() {
    const element = document.createElement('dialog');
    element.className = 'product-dialog mobile-dialog pro-paywall';
    element.id = 'proPaywall';
    element.setAttribute('aria-labelledby', 'proPaywallTitle');
    element.innerHTML =
      '<p class="guide-kicker">CAVIOT STUDIO PRO</p>' +
      '<h2 id="proPaywallTitle">Unlock print-ready export</h2>' +
      '<p>Export your sleeve as an STL or OBJ file for your 3D printer or print service.</p>' +
      '<ul class="pro-paywall-list">' +
      '<li><strong>Free:</strong> design, preview and save projects (.icaviot).</li>' +
      '<li><strong>Pro:</strong> export STL and OBJ print files, on every iPhone and iPad signed in to your Apple Account.</li>' +
      '</ul>' +
      '<p class="pro-paywall-price" id="proPaywallPrice"></p>' +
      '<p class="pro-paywall-message" id="proPaywallMessage" role="status" aria-live="polite"></p>' +
      '<div class="layer-actions">' +
      '<button type="button" class="btn btn-primary" data-pro="buy">Unlock Pro</button>' +
      '<button type="button" class="btn btn-ghost" data-pro="restore">Restore Purchases</button>' +
      '<button type="button" class="btn btn-ghost" data-pro="close">Not now</button>' +
      '</div>' +
      '<p class="pro-paywall-legal">Payment is charged to your Apple Account. ' +
      '<a href="' +
      TERMS_URL +
      '" target="_blank" rel="noopener">Terms of Use</a> · ' +
      '<a href="' +
      PRIVACY_URL +
      '" target="_blank" rel="noopener">Privacy Policy</a></p>';
    document.body.appendChild(element);
    element.querySelector('[data-pro="buy"]').onclick = () => {
      void purchase();
    };
    element.querySelector('[data-pro="restore"]').onclick = () => {
      void restore();
    };
    element.querySelector('[data-pro="close"]').onclick = () => finish(false);
    element.addEventListener('cancel', (event) => {
      event.preventDefault();
      if (!state.busy) finish(false);
    });
    return element;
  }

  // A short Pro row in the settings, so Restore Purchases is always reachable, not only from the paywall.
  function buildPanel() {
    const host = document.getElementById('phoneAllBody') || document.getElementById('appSidebar');
    if (!host) return null;
    const section = document.createElement('section');
    section.className = 'panel pro-panel';
    section.id = 'proPanel';
    section.setAttribute('aria-labelledby', 'proPanelTitle');
    section.innerHTML =
      '<h3 class="phone-section-title" id="proPanelTitle">Caviot Studio Pro</h3>' +
      '<p class="phone-hint" id="proPanelStatus"></p>' +
      '<div class="layer-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" data-pro="panel-buy">Unlock Pro</button>' +
      '<button type="button" class="btn btn-ghost btn-sm" data-pro="panel-restore">Restore Purchases</button>' +
      '</div>';
    host.appendChild(section);
    section.querySelector('[data-pro="panel-buy"]').onclick = () => {
      void openPaywall('settings');
    };
    section.querySelector('[data-pro="panel-restore"]').onclick = () => {
      void restore();
    };
    return section;
  }
}

function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((resolve) => setTimeout(resolve, ms))]);
}

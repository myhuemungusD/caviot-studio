// What the iOS simulator smoke (ci-smoke.mjs) expects from the app's 'pro-gate' report, in both modes of
// the Pro release switch (PRO_GATE_ENABLED in mobile/native/bridge-logic.js). Kept separate so
// bridge-tests.mjs can check both modes without a simulator.
export function proGateSmokeProblems(event, enabled) {
  if (!event) return ['the Pro gate check did not run'];
  if (event.enabled !== enabled) {
    return ['the app reported the Pro gate ' + (event.enabled ? 'on' : 'off') + ' but PRO_GATE_ENABLED is ' + enabled];
  }
  if (!enabled) {
    // 1.0 ships free: nothing Pro on the page, and export is open.
    const problems = [];
    if (event.shown || event.panel) problems.push('the Pro gate is off but a paywall or Pro settings row was added');
    if (event.badge) problems.push('the Pro gate is off but the export buttons carry the PRO badge');
    if (event.api) problems.push('the Pro gate is off but CaviotPro was installed');
    if (event.unlocked !== true) problems.push('the Pro gate is off but export is not unlocked');
    return problems;
  }
  // Gate on: the paywall opened before export and closing it did not unlock anything.
  if (!event.shown || !event.restore) return ['the Pro paywall or its Restore Purchases button did not show'];
  if (event.environment !== 'development') return ['the simulator build reported the ' + event.environment + ' App Store environment'];
  if (event.product === 'not-found' && event.unlocked !== true) return ['a debug build without the product did not keep export unlocked'];
  return [];
}

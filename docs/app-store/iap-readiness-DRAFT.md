# In-app purchase readiness: Caviot Studio Pro ($9.99, one-time)

Status: **built in the iPhone/iPad app (StoreKit 2, no server, no third-party SDK)**. Nothing has been created in App Store Connect; the product must be created there by the Account Holder (steps below). The Mac app, Android app and website are unchanged and have no paywall.

**Release risk (October 29, 2026):** 1.0 was submitted with build 160 (Waiting for Review, release automatically after approval), which contains this gate, and no in-app purchase is attached to 1.0. App Review runs in sandbox, where a missing product leaves export unlocked. A production App Store build never unlocks without a purchase (`betaUnlockApplies` in `mobile/native/bridge-logic.js`), so once 1.0 is live, STL/OBJ export stays locked and the purchase cannot complete until `com.caviot.studio.pro` exists, is approved and is on sale. Planned: ship Pro with 1.1 (iPhone/iPad only).

## What shipped in code
- Product: `com.caviot.studio.pro`, Non-Consumable, one-time, $9.99 (the price shown in the app always comes from StoreKit, never hard-coded).
- Free: designing, preview, Save project / Open project (`.icaviot`), the fit-check ring.
- Pro: STL and OBJ export (Export STL, Export OBJ, Cmd/Ctrl+E). 3MF export is also gated if it is ever added.
- Native: `mobile/native/ios/CaviotNativePlugin.swift` (`proStatus`, `proProduct`, `proPurchase`, `proRestore`, plus a `Transaction.updates` listener). Entitlement comes from `Transaction.currentEntitlements` (signed by Apple, verified on device, works offline). Restore calls `AppStore.sync()`.
- Paywall: `mobile/native/pro-paywall.js`. Opens when a locked user taps Export. It shows the StoreKit price, "One-time purchase. No subscription.", Unlock, **Restore Purchases**, Not now, and links to Apple's standard EULA and the privacy policy. Restore and the Pro status also sit in Tools > All (the "Caviot Studio Pro" row).
- Failures: cancel says nothing; offline, pending (Ask to Buy), store errors and unverified transactions each show a plain message and never unlock. An owned unlock keeps working offline.
- Test builds: in TestFlight / App Review (sandbox) and Xcode debug builds, if the product does not exist in App Store Connect yet, export stays unlocked and the Pro row says "Test build". Once the product exists, the real paywall shows and sandbox purchases are free. A production App Store build never unlocks without a purchase.
- Local testing: `CaviotStudio.storekit` is attached to the App scheme (Run), so Xcode runs show the $9.99 product with no App Store Connect setup.
- Tests: `mobile/scripts/bridge-tests.mjs` (rules, Swift, .storekit, scheme), `e2e/pro-paywall-e2e.mjs` (mocked StoreKit bridge: purchase, cancel, offline, pending, restore, owned offline, product missing, stalled App Store, TestFlight, Android/website untouched), and the simulator smoke run checks the paywall and Restore button before its export.
- Privacy: unchanged, **Data Not Collected**. No new entry in `PrivacyInfo.xcprivacy`.


## Product model
- Free: import an STL, OBJ or 3MF or use the Classic Sleeve; add logos, text and photos; use emboss, deboss and invert; get a full 3D preview; save and open projects.
- Pro ($9.99, non-consumable, one-time): STL and OBJ export (sleeve, logo only, flat plate) and Make watertight export.
- Product ID suggestion: `com.caviot.studio.pro` (type: Non-Consumable, price tier USD 9.99, Family Sharing on).
- Paywall: show it when the user taps Export STL without Pro. Show the price from StoreKit, and add "Restore Purchases" and links to the Terms of Use (EULA) and Privacy Policy. Guideline 3.1.1 requires a Restore option for non-consumables. Apple's standard EULA is fine.
- Don't link to a web checkout from inside the app. US storefront external purchase links are now allowed in some cases. Check the current rules before using them; they aren't needed for this plan.

## Implementation options
| | StoreKit 2 directly (recommended) | RevenueCat (`@revenuecat/purchases-capacitor`) |
|---|---|---|
| Code | ~150 lines of Swift added to the existing `mobile/ios/App/App/CaviotNativePlugin.swift`: `Product.products`, `purchase()`, `Transaction.currentEntitlements`, `AppStore.sync()` for restore. A JS bridge exposes `isPro()`, `buyPro()` and `restore()` | SDK plus an API key; entitlement "pro" |
| Server / account | None, verified on device (JWS) | RevenueCat cloud account |
| Android later | You'd need to write Play Billing separately | One code path for both stores |
| Privacy label | Can stay **Data Not Collected** | Must declare data (see below) |
| Cost | Free | Free under $2.5k MTR, then 1% |

Recommendation: start with StoreKit 2 for iOS 1.x. It keeps the "Data Not Collected" label and the "no tracking, works offline" message. Switch to RevenueCat when Android billing becomes a priority.

## Privacy label changes
- StoreKit 2 with no server and no analytics: no change. Apple processes the purchase, and the developer doesn't collect that data.
- RevenueCat with anonymous app user IDs: add **Purchases → Purchase History**, with purposes **App Functionality** and **Analytics**. Linked to user: **No**. Used for tracking: **No**.
  - If you set a custom app user ID: also add **Identifiers → User ID** (App Functionality, linked).
  - Never enable IDFA collection. If you did, it would add Device ID and possibly the ATT prompt.
- Update the privacy policy at /caviot/privacy to say that purchases are processed by Apple, plus RevenueCat if used.
- `PrivacyInfo.xcprivacy` (mobile/ios/App/App/): the RevenueCat SDK ships its own manifest. StoreKit 2 needs no new entry.

## App Review notes after IAP (now in store-listing-DRAFT.md)
```
Designing, previewing and saving projects are free. Exporting STL/OBJ print files requires the one-time in-app purchase "Caviot Studio Pro" (com.caviot.studio.pro, non-consumable, $9.99). There is no subscription.

To test the purchase:
1. Tap "Classic Sleeve", then tap "Export STL". The Caviot Studio Pro screen appears with the price, "Unlock Pro for $9.99", "Restore Purchases" and "Not now".
2. Tap "Unlock Pro for $9.99" and confirm with the sandbox Apple Account. The export continues and the file can be saved to Files.
3. To test restore, delete and reinstall the app (or use another device with the same sandbox account), tap Export STL, then "Restore Purchases". Restore Purchases is also in Tools > All > Caviot Studio Pro.
No app account or sign-in is needed; the purchase is tied to the Apple Account and verified on the device by StoreKit. The app makes no other network calls.
```
- Give the IAP a **review screenshot** of the paywall and a short review note in its own App Store Connect entry.
- The first IAP must be **submitted together with an app version**. Select it on the version page before you submit.

## What is left (Account Holder, Design Mainline LLC)
1. The **Paid Applications Agreement** is accepted. **Banking and tax (W-9) are still pending**: the product can be created and tested in sandbox/TestFlight now, but it cannot go on sale (and App Review of a paid IAP may be held) until both show Active.
2. Enroll in the **App Store Small Business Program** (15% commission instead of 30%). Apply after the org account exists.
3. Create a sandbox tester in App Store Connect → Users and Access → Sandbox, then test on a device. TestFlight testers use their own Apple Account and are never charged. Locally, Xcode uses `CaviotStudio.storekit` automatically.
4. Listing: price stays "Free"; "In-App Purchases" appears automatically. The description and review notes in store-listing-DRAFT.md already say export is a one-time Pro unlock.
5. Android: Google Play Billing comes later, either through the RevenueCat path or Play Billing Library 7+.

## App Store Connect setup (Jason, in order)
1. My Apps → Caviot Studio → Monetization → In-App Purchases → "+" → type **Non-Consumable**. Reference Name `Caviot Studio Pro`, Product ID `com.caviot.studio.pro` (exactly; it can never be reused or changed).
2. Price Schedule → base country United States → **USD 9.99**. Let Apple set the other storefronts from it.
3. Availability: all countries where the app is sold.
4. App Store Localization (English U.S.): Display Name `Caviot Studio Pro`; Description `Unlock STL and OBJ export. One-time purchase.` (max 55 characters).
5. Family Sharing: decide before saving. Turning it on cannot be undone; the local .storekit file has it on.
6. Review Information: upload a screenshot of the paywall (an iPhone screenshot of the Pro screen) and paste the review note above.
7. When the next build is ready: on the version page, under "In-App Purchases and Subscriptions", select Caviot Studio Pro and submit it together with the build. The first IAP cannot be submitted alone.
8. Agreements, Tax, and Banking: finish the bank account and the U.S. tax form (W-9) until both show Active. Then enroll in the App Store Small Business Program.
9. Optional: Users and Access → Sandbox → add a sandbox tester for testing on your own device.

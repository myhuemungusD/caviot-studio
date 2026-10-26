# In-app purchase readiness: Caviot Studio Pro ($9.99, one-time)

Status: plan only. Nothing is built and nothing has been created in App Store Connect.

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

## App Review notes after IAP (replace step 4 in listing.md)
```
Designing and previewing are free. Exporting STL/OBJ files requires the one-time "Caviot Studio Pro" purchase ($9.99, non-consumable).
To test: tap "Export STL" -> the Pro screen appears -> buy with a sandbox account. "Restore Purchases" is on the same screen and under Tools > All.
No account or sign-in is required; purchases are tied to the Apple ID.
```
- Give the IAP a **review screenshot** of the paywall and a short review note in its own App Store Connect entry.
- The first IAP must be **submitted together with an app version**. Select it on the version page before you submit.

## What blocks this (needs the organization account)
1. The **Paid Applications Agreement** must be accepted by the **Account Holder**, and banking and tax forms (W-9) must be complete. Do this on the new org account; agreements usually have to be re-accepted after an account change or migration.
2. Enroll in the **App Store Small Business Program** (15% commission instead of 30%). Apply after the org account exists.
3. Create a sandbox tester in App Store Connect → Users and Access → Sandbox, then test on a device. Locally you can also test with a `.storekit` configuration file in Xcode.
4. Update the listing. Price stays "Free", and "In-App Purchases" will appear automatically. Change the description to: "Free to design and preview. One-time Pro unlock for export." Update COMPLIANCE-REPORT item 19 (monetization) to match.
5. Android: Google Play Billing comes later, either through the RevenueCat path or Play Billing Library 7+.

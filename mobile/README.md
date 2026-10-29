# Caviot Studio for iPhone and iPad

This folder is the App Store app. It bundles the same static site that lives in `dist/` and runs it inside a WKWebView with Capacitor. The files are inside the app. There is no `server.url`, so the app is not a thin wrapper around the website. Apple’s guideline 4.2 is the reason for that, and for the native share sheet, Files saving, camera, Photos, haptics, safe areas, icon, and splash.

The website in `dist/` is not modified. The Mac app lives in `desktop/` and the Android app in `mobile/android` (see `ANDROID.md`); this iOS shell does not touch them.

Status (October 29, 2026): 1.0 build 160 is Waiting for Review in App Store Connect (app 6823151777, Design Mainline LLC, review contact admin@designmainline.org, releases automatically after approval). Build 160 includes the Pro gate below; the `com.caviot.studio.pro` product has not been created in App Store Connect yet.

The phone apps open on **Choose a template** (`dist/empty-start.js`): Classic Sleeve (the Foger Sleeve, formerly ETSYFOLGER, renamed for the phone apps, with vape presets hidden) or Import STL (STL, OBJ or 3MF from Files). Export stays disabled until one is chosen. The website and the Mac app still open straight on the Foger Sleeve.

## Run it on a Mac

Xcode 26 or newer (App Store Connect only accepts builds from Xcode 26 since April 28, 2026; `scripts/ci-testflight.sh` checks), and Node.js 22.

```bash
cd mobile
npm ci
npm test
npm run sync
npm run assets
npx cap open ios
```

`npm run sync` copies `dist/` into `mobile/www`, adds `caviot-native.js` to that copy only, then runs `cap sync ios`. `npm run assets` rebuilds the icon and splash from `dist/branding/icons/icon-512.png`.

In Xcode, pick an iPhone or iPad simulator and press Run. The scheme is `App`. The bundle id is `com.caviot.studio`. The display name is Caviot Studio. The minimum system is iOS 16.4, because the sleeve mesh is gzip and WKWebView only gained `DecompressionStream` in 16.4.

Signing can stay automatic while you are only using the simulator. A paid Apple Developer account is not required for that.

## What is native

`native/caviot-native.js` loads only in the iOS copy of the page. If `Capacitor.isNativePlatform()` is false, it returns immediately and does not replace download, camera, or export. That is the path a normal browser hits, and it is what `npm test` checks. The studio’s limits live in `const` and `let` bindings a module cannot see, so `page-bridge.js` (a classic script, also only in the iOS copy) exposes them as `__caviotPage`.

| Action | What the app does |
| --- | --- |
| Export STL, OBJ, or a project | Writes the file into the app Documents folder in 512 KB chunks, then opens the system share sheet. Documents is visible in the Files app (`UIFileSharingEnabled` and `LSSupportsOpeningDocumentsInPlace`). |
| Photos | `Camera.chooseFromGallery` (the system photo picker). |
| Camera | `Camera.takePhoto` with the rear camera. Photos are not saved back to the library. |
| Files (add a logo) | The existing file input, which WKWebView presents as the system document picker. |
| Export, save, undo, redo, add | `Haptics` impact or notification. A failed picker or a failed save uses an error haptic and a toast. |
| Layout | The status bar overlays the webview. Phone layout already uses `env(safe-area-inset-*)`. iPad and other wide layouts get the same insets from `native.css`, without adding them a second time on an iPhone. |
| Low memory | iOS memory warnings become a toast, at most once a minute. |

Cancelling the share sheet or the camera is not an error. The file is already in Files if the share sheet was cancelled after a successful save. Permission denial tells the user which Settings switch to turn on.

Exports larger than 80 MB are refused before they are copied across the bridge. The phone-safe STL budget is well under that.

## Memory and WKWebView

WKWebView runs the page in a separate content process. iOS can kill that process when it uses too much memory. There is no API to raise the limit.

Rough ceilings, from jetsam on current devices, not a promise from Apple:

- iPhone: about 1.0–1.5 GB for the web content process.
- iPad: often about 2–4 GB.

`os_proc_available_memory()` reports the app process, which is a different process. The simulator smoke test records that number so we know the call works. On the iOS Simulator the call often returns 0. A device returns a positive byte count. Either way it is not the web content ceiling.

The web app’s existing phone limits stay in force on iPhone, including inside this shell:

- preview copy: 120,000 triangles
- warn before a custom STL above 600,000 triangles, refuse above 1,200,000
- export budget: 700,000 triangles, about 350 MB at 0.5 KB per triangle

That budget is what the smoke test asserts. It is the same budget the website uses for a phone. Turning on “Full quality” in the tools sheet still keeps those device guards; only the contour spacing changes, which is existing website behaviour.

On iPad the website uses full quality, and this app does too. If an export estimate goes past 1,400,000 triangles (about 700 MB), the app asks before continuing, because an iPad WKWebView can still be killed. The website does not show that question.

A reload during a large export still uses the website’s autosave on iPhone.

## Caviot Studio Pro (iPhone/iPad only)

Export (STL, OBJ, 3MF if added) is a one-time in-app purchase, `com.caviot.studio.pro` (Non-Consumable, $9.99). Designing, previewing, Save project / Open project and the fit-check ring stay free. Android, the Mac app and the website never load the gate.

- Swift: `native/ios/CaviotNativePlugin.swift` adds `proStatus`, `proProduct`, `proPurchase`, `proRestore` (StoreKit 2: `Product.products`, `purchase()`, `Transaction.currentEntitlements`, `AppStore.sync()`), and listens to `Transaction.updates` (`proChanged`). No server, no SDK; Privacy stays Data Not Collected.
- JS: `native/pro-paywall.js` wraps `__caviotPage.exportCurrent`, opens the paywall (`#proPaywall`) for a locked export, and adds the Caviot Studio Pro row (Unlock, Restore Purchases) to Tools > All. Rules and messages are in `native/bridge-logic.js`.
- Environments: debug/simulator builds report `development`, TestFlight and App Review report `sandbox`, App Store builds report `production`. Only in development/sandbox, a product that does not exist in App Store Connect yet leaves export unlocked so testers are never blocked. Production never unlocks without a purchase.
- Xcode: `native/ios/CaviotStudio.storekit` is copied into `ios/App/App/` and attached to the App scheme's Run action by `scripts/apply-ios.mjs`, so a local Run shows the $9.99 product. Debug > StoreKit > Manage Transactions resets or refunds test purchases.
- Tests: `npm test` (rules, Swift, .storekit, scheme), `node e2e/pro-paywall-e2e.mjs mobile/www` from the repo root after `npm run sync:www` (mocked bridge), and the simulator smoke run checks that the paywall and Restore button appear before its export.

## Tests on GitHub

`.github/workflows/ios.yml` runs on a macOS runner for pushes to `main` and pull requests that change `dist/**`, `mobile/**` (not `mobile/android/**` and not Markdown) or the workflow itself, and on manual dispatch:

1. `npm test` for the bridge rules.
2. `npm run sync`.
3. An unsigned `xcodebuild` for the iOS Simulator (`CODE_SIGNING_ALLOWED=NO`), then an ad-hoc `codesign` so the simulator will install the bundle. No Apple certificate is used.
4. Boot an available iPhone simulator, install the app, and launch it with `-CaviotSmoke`.
5. The app waits for the template to load, checks that Choose a template is shown and export is disabled, picks Classic Sleeve, types a text design, opens and closes the Pro paywall (checking Restore Purchases is there), exports an STL into Files, and writes `Documents/caviot-smoke.json`.
6. The workflow checks the template, the 700,000-triangle budget, the share plugin, and that the file is a binary STL whose triangle count matches its size.
7. The `.app`, screenshots, `result.json`, and a copy of the STL are uploaded as the `ios-simulator` artifact.

The share sheet is not presented during this run. A share sheet on the simulator waits for a tap, and the test would hang. The test does call `Share.canShare()`, which is the native plugin, and it does save the file the way a real export does before the sheet opens.

## What you need before TestFlight or the App Store

The simulator job does not need any of this. The TestFlight job stays skipped until every secret below is set. Do not put the key files in the repository.

1. **Apple Developer Program**, 99 USD per year, enrolled as an individual or an organization. A free Apple ID can run the simulator build. It cannot create the distribution certificate, the provisioning profile, or an App Store Connect record.
2. **Bundle id** `com.caviot.studio`. Register it as an explicit App ID with no special capabilities (no push, no iCloud, no associated domains). If you need a different id, change `appId` in `mobile/capacitor.config.json`, the export plist in `scripts/ci-testflight.sh`, and the App Store Connect app so they all match.
3. **Apple Distribution certificate**. Create it in the developer portal (Certificates → Apple Distribution), export a `.p12`, and note the password. The private key never goes in git.
4. **App Store provisioning profile** for `com.caviot.studio`, using that distribution certificate. Download the `.mobileprovision`.
5. **App Store Connect API key**. Users and Access → Integrations → App Store Connect API. Access level App Manager or Admin. Download the `AuthKey_XXXXXXXX.p8` once. You need the Key ID, the Issuer ID, and the contents of the `.p8`.
6. **Team ID**, the 10-character id on the membership page.

Create the app record in App Store Connect with the same bundle id, platform iOS, and name Caviot Studio, before the first upload. The first upload can be the TestFlight job. Processing takes a few minutes, then the build shows under TestFlight.

### GitHub Actions secrets

Add these on the repository (Settings → Secrets and variables → Actions). Names must match. The TestFlight job runs only when all of them are non-empty, and only after the simulator job is green.

| Secret | Value |
| --- | --- |
| `IOS_TEAM_ID` | 10-character Team ID |
| `IOS_DISTRIBUTION_CERTIFICATE_P12_BASE64` | `base64 < cert.p12` (one line) |
| `IOS_CERTIFICATE_PASSWORD` | password for that `.p12` |
| `IOS_PROVISIONING_PROFILE_BASE64` | `base64 < profile.mobileprovision` (one line) |
| `APPSTORE_API_KEY_ID` | Key ID from App Store Connect |
| `APPSTORE_ISSUER_ID` | Issuer ID from App Store Connect |
| `APPSTORE_API_PRIVATE_KEY` | full contents of `AuthKey_XXXXXXXX.p8`, including the BEGIN and END lines |

The job imports the certificate into a temporary keychain, archives a Release build, exports an `.ipa` with manual signing, and uploads it with `xcrun altool`. If Apple removes `altool`, use the Transporter app or `xcrun iTMSTransporter` with the same key. The script does not print the password or the private key.

After the build appears in TestFlight, install it on a phone you registered as a tester. Camera, Photos, the share sheet, and Files are the things the simulator job does not fully exercise.

## App Store listing

The listing entered in App Store Connect for 1.0 is in `docs/app-store/store-listing-DRAFT.md` (subtitle, keywords, description, review notes, screenshots). Do not claim a measured print fit, a subscription, or cloud backup. None of those exist.

## Privacy policy

Published at https://www.designmainline.com/caviot/privacy (source: `caviot/privacy.html` in the DesignMainline repo; draft history in `docs/app-store/privacy-policy-DRAFT.md`). App privacy questionnaire: Data Not Collected. The app does not track. Camera and Photos are optional permissions used only to pick a logo. Contact: admin@designmainline.org. Support page: https://www.designmainline.com/caviot/support.

## Version numbers

`MARKETING_VERSION` is 1.0 in the App target’s build settings. The TestFlight job sets `CURRENT_PROJECT_VERSION` to the GitHub run number (`scripts/ci-testflight.sh`), so every upload gets a new build number automatically (1.0 is build 160). Raise the marketing version when the listing should show a new version (1.1 is planned for Caviot Studio Pro).

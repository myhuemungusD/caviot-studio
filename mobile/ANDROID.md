# Caviot Studio for Android

`mobile/android` is a Capacitor 8 Android project that bundles the same offline `dist/` copy as the iPhone
app (`npm run sync:android` copies it in and injects `caviot-native.js`). The website and the iOS project
are unchanged. App id: `com.caviot.studio`. Min Android 7 (API 24), compile/target SDK 36; WebView updates through Play.

**Status (October 29, 2026):** 1.0 (versionCode 1106, the signed AAB from Android run 40864282259 on `main`
6ca7894) was submitted to Google Play **production** under the Design Mainline LLC organization account.
Free, no in-app purchases (the Pro gate is iOS only, `proGateApplies` in `native/bridge-logic.js`). Data
safety: no data collected. Target audience 18+, content rating Everyone. Like iPhone, the app opens on
**Choose a template** (Classic Sleeve or Import STL) and hides the vape presets. Store listing text:
`docs/play-store/store-listing.md`.

## Build locally

JDK 21 and the Android SDK (platform 36).

```bash
cd mobile
npm ci
npm test                    # bridge + manifest checks
npm run sync:android
npm run assets:android      # icons + splash from dist/branding (already committed)
cd android && ./gradlew assembleDebug testDebugUnitTest
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## What is native on Android

| Feature | How |
| --- | --- |
| Open with / Share to Caviot (STL, OBJ, 3MF) | Manifest VIEW/SEND/SEND_MULTIPLE filters (model/stl, application/sla, vnd.ms-pki.stl, model/obj, model/3mf, octet-stream by extension). `OpenedFiles.java` copies the content URI to cache off the UI thread, sniffs the type (`TemplateKinds.java`, JVM-tested), and the page loads it with the same `importTemplateFile` as iPhone and web. 100 MB cap. |
| Export | Written to app cache, then a native dialog: Save as… (system picker), Always save to a folder… (picked once, permission kept), Share…. With a folder set, exports save straight there. |
| Launcher shortcuts | Long-press the icon: Open STL template, Export folder. |
| Back button | Closes the top dialog, then the tools sheet, then sends the app to the background (state kept). |
| Edge-to-edge | `EdgeToEdge.enable` + Capacitor SystemBars `insetsHandling: "css"`; the page already pads with safe-area insets. |
| Frame rate | Top refresh rate (90/120 Hz) only while a finger is on the model or a slider; system default when idle. |
| Splash/icon | Adaptive icon + Android 12 splash on #101114. |

## CI (`.github/workflows/android.yml`)

Pushes to `main` and PRs that change `dist/**`, `mobile/**` (not `mobile/ios/**` and not Markdown) or the
workflow, plus manual dispatch: bridge tests → sync → `assembleDebug` + JVM unit tests → upload `caviot-android-debug-apk`
→ Pixel 6 / API 34 emulator smoke (cold start, Choose a template gate, Classic Sleeve, perf numbers, text design, STL export,
then an "Open with" VIEW intent for a real STL) → upload `android-smoke` (result.json, screenshots, logcat).
The emulator uses a software GPU, so its frame rates are far below a real phone; treat them as a floor.

Signed release AAB: only on `workflow_dispatch` or `main`, and only when the secrets below exist. A manual
run also uploads a **draft** to the Play internal track if the service account secret exists.
Release builds use versionCode `1000 + run number` (`-PcaviotVersionCode`) and versionName 1.0.

Set as of October 29, 2026: the four `ANDROID_KEY*`/`ANDROID_KEYSTORE*` secrets. Not set: `PLAY_SERVICE_ACCOUNT_JSON`,
so AABs are uploaded to Play Console by hand.

| Secret | What |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 upload.keystore` (the Play upload key, not the app signing key) |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password |
| `ANDROID_KEY_ALIAS` | key alias |
| `ANDROID_KEY_PASSWORD` | key password |
| `PLAY_SERVICE_ACCOUNT_JSON` | Google Cloud service-account JSON with Release Manager access in Play Console (optional) |

Create the upload key once: `keytool -genkeypair -v -keystore upload.keystore -alias caviot -keyalg RSA -keysize 4096 -validity 10000`.
Keep a backup; with Play App Signing a lost upload key can be reset through Play support.

## Google Play setup (Design Mainline LLC)

Steps 1–5 are done (organization account approved; app created; 1.0 submitted to production October 29, 2026).
Step 7 is not done.

1. Register at play.google.com/console as an **Organization**, not Personal. Use Design Mainline LLC, its
   D-U-N-S (14-018-2909, must match the D&B record name and address exactly), jason@designmainline.com, a
   public phone number, and https://designmainline.com. One-time $25 fee.
   Why: personal accounts created after Nov 13 2023 must run a closed test with 12 testers for 14 straight
   days before production. Organization accounts are not subject to that rule.
2. Verify the organization (Google checks D-U-N-S against the payments profile; allow a few days).
3. Create the app "Caviot Studio", package `com.caviot.studio`, free, category Art & Design.
4. Opt in to Play App Signing. Upload the first AAB by hand (Play requires the first one manually).
5. Fill in: privacy policy URL (https://www.designmainline.com/caviot/privacy), Data safety (no data collected; files stay on device),
   content rating questionnaire, target audience 18+, ads: none. Describe it as a 3D sleeve/relief design
   tool; Play restricts apps that facilitate tobacco/vape sales, so keep store text and screenshots off vaping.
6. Internal testing track → add your Google account → install from the opt-in link.
7. For CI uploads: Play Console → Users and permissions → invite the service account email as Release
   Manager for this app; put its JSON in `PLAY_SERVICE_ACCOUNT_JSON`.

Nothing in this repo creates a Play account, keystore, or secret.

# Caviot Studio for iPhone and iPad

This folder is the App Store app. It bundles the same static site that lives in `dist/` and runs it inside a WKWebView with Capacitor. The files are inside the app. There is no `server.url`, so the app is not a thin wrapper around the website. Apple’s guideline 4.2 is the reason for that, and for the native share sheet, Files saving, camera, Photos, haptics, safe areas, icon, and splash.

The website in `dist/` is not modified. A separate Mac app may live in `desktop/` on another branch; this folder does not touch it.

ETSYFOLGER is still the sleeve that opens on first launch. The native code never changes the template.

## Run it on a Mac

Xcode 16 or newer, and Node.js 22.

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

`native/caviot-native.js` loads only in the iOS copy of the page. If `Capacitor.isNativePlatform()` is false, it returns immediately and does not replace download, camera, or export. That is the path a normal browser hits, and it is what `npm test` checks.

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

`os_proc_available_memory()` reports the app process, which is a different process. The simulator smoke test records that number so we know the call works. It is not the web content ceiling.

The web app’s existing phone limits stay in force on iPhone, including inside this shell:

- preview copy: 120,000 triangles
- warn before a custom STL above 600,000 triangles, refuse above 1,200,000
- export budget: 700,000 triangles, about 350 MB at 0.5 KB per triangle

That budget is what the smoke test asserts. It is the same budget the website uses for a phone. Turning on “Full quality” in the tools sheet still keeps those device guards; only the contour spacing changes, which is existing website behaviour.

On iPad the website uses full quality, and this app does too. If an export estimate goes past 1,400,000 triangles (about 700 MB), the app asks before continuing, because an iPad WKWebView can still be killed. The website does not show that question.

A reload during a large export still uses the website’s autosave on iPhone.

## Tests on GitHub

`.github/workflows/ios.yml` runs on every push and pull request, on a macOS runner:

1. `npm test` for the bridge rules.
2. `npm run sync`.
3. An unsigned `xcodebuild` for the iOS Simulator (`CODE_SIGNING_ALLOWED=NO`), then an ad-hoc `codesign` so the simulator will install the bundle. No Apple certificate is used.
4. Boot an available iPhone simulator, install the app, and launch it with `-CaviotSmoke`.
5. The app waits for ETSYFOLGER, types a text design, exports an STL into Files, and writes `Documents/caviot-smoke.json`.
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

Fill these in App Store Connect. The text below is a draft you can edit. Do not claim a measured print fit, a subscription, or cloud backup. None of those exist.

**Name:** Caviot Studio

**Subtitle:** Design sleeves. Export STL.

**Category:** Graphics & Design. Secondary: Productivity.

**Age rating:** 4+. No unrestricted web, no user-generated public content, no accounts.

**Price:** Free.

**Keywords:** stl,3d print,sleeve,logo,emboss,deboss,relief,lettering

**Promotional text:** Turn a logo or a few words into a sleeve you can export for a 3D printer. The design stays on your device.

**Description:**

Caviot Studio turns a photo, a logo, or lettering into a 3D-printable sleeve or relief.

Open the app and the ETSYFOLGER sleeve is already there, with the DM mark on the underside. Add a picture from Photos or the camera, pick a file, or type text. Move it, resize it, and choose emboss or deboss. Export an STL and send it to Files, AirDrop, or a slicer with the share sheet.

Designs stay on this iPhone or iPad. There is no account and no upload. Large models are safer on a computer; the app warns you before an export that may be too big for the device.

**What’s New (1.0):** First iPhone and iPad release. Design on ETSYFOLGER, export STL, and share the file.

**Support URL:** a page you control, with a contact address. App Store Connect rejects an empty support URL.

**Marketing URL:** optional. The public studio site is fine if you have one.

**Copyright:** your name or your company’s name and the year.

**Screenshots:** App Store Connect lists the sizes it currently requires. Plan on a 6.9-inch iPhone set and a 13-inch iPad set, portrait. Three shots are enough: the sleeve on first launch, a text or logo design, and the share sheet or the file in Files. The CI screenshots are from a smaller iPhone simulator and are evidence the app launched, not the store images. Capture the store set from the Simulator’s Device → Trigger Screenshot, or from a device, after you have a signed build.

**Review notes:** No login. The app works offline. Camera and Photos are used only when the reviewer taps Camera or Photos to add a logo. Sample text is enough to reach Export. The sleeve that opens first is ETSYFOLGER.

**Export compliance:** the app uses only standard HTTPS inside the system frameworks. `ITSAppUsesNonExemptEncryption` is false, so the usual “no non-exempt encryption” answer applies.

**Sign-in:** there is none. Do not turn on Sign in with Apple.

## Privacy policy

Publish this at a public URL and paste that URL into App Store Connect. App privacy questionnaire: Data Not Collected. The app does not track. Camera and Photos are optional permissions used only to pick a logo.

---

**Privacy policy for Caviot Studio (iPhone and iPad)**

Caviot Studio is a design tool that runs on your device. The developer does not operate an account system, an analytics service, or a server that receives your designs.

**Data the app does not collect.** The app does not collect, transmit, or sell personal information. It does not use advertising identifiers, tracking, or third-party analytics. There is no account, no email capture, and no payment inside the app.

**What stays on your device.** Artwork, text, project files, and autosave data are stored locally (on disk and in the web view’s on-device database). Exports are written to the app’s Documents folder, which you can open in the Files app, and can be sent somewhere else only if you use the system share sheet. Deleting the app deletes that local data.

**Camera and Photos.** If you tap Camera, iOS asks to use the camera so you can photograph a logo. If you tap Photos, the system photo picker opens and the app receives only the picture you select. The picture is used to build the 3D design on the device. The app does not upload it, does not read the rest of your library, and does not add it to your photo library. You can refuse camera access and still type text, choose a photo, or open an image from Files.

**Files.** Exported STL, OBJ, and project files are saved in the app’s Documents folder so you can find them in Files. Sharing a file uses Apple’s share sheet. Where it goes after that is up to the app you pick.

**Children.** The app is not directed at children under 13, and it does not knowingly collect personal information from anyone.

**Changes.** If this policy changes, the new text will be published at this same URL. The app does not gain a collection practice that this policy does not describe.

**Contact.** Replace this sentence with a real email address before you publish the policy.

---

## Version numbers

`MARKETING_VERSION` is 1.0 and `CURRENT_PROJECT_VERSION` is 1, in the App target’s build settings. Raise the build number for every upload. Raise the marketing version when the listing should show a new version.

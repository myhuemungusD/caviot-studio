# Caviot Studio iOS: App Store compliance audit (Oct 16, 2026)

Scope: mobile/ (Capacitor 8), bundle com.caviot.studio, App Store Connect app 6823151777, build 1.0 (78).
Legend: PASS, FIXED (in this PR), NEEDS JASON (decision listed).

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | 4.2 Minimum functionality | PASS (moderate risk) | The web code is bundled in the app (no `server.url`), so it works fully offline. Native features: camera/photo picker, Files import, "Open in Caviot" document types for STL/OBJ/3MF, share sheet export, haptics. Reviewers reject Capacitor apps that are a URL in a frame; this is not one. Recommend review notes plus a 30 s screen video showing import → design → export. |
| 2 | 2.5.2 No remote code | PASS | No network calls at all in dist/ (no fetches to remote hosts, no eval/new Function). The ONNX cutout model ships inside the app. |
| 3 | Privacy manifest (app) | FIXED | PrivacyInfo.xcprivacy now declares FileTimestamp (C617.1, 3B52.1). It is used by @capacitor/filesystem (IONFilesystemLib reads ctime/mtime), which ships no manifest of its own. IONCameraLib has a manifest in its repo, but its Package.swift doesn't list it as a resource, so the app-level declaration covers it. Tracking false, no tracking domains, no collected data. |
| 4 | Privacy manifests (packages) | PASS with FIXED cover | Capacitor and CapacitorCordova ship manifests. Camera, Filesystem, App, Share, Haptics, SplashScreen and StatusBar do not; none of them use other required-reason APIs (UserDefaults, boot time, disk space, keyboards: none found in sources). |
| 5 | Info.plist usage strings | PASS | Camera and Photo Library strings are specific and accurate. No add-to-library permission is needed because saveToGallery is false. Files access uses the document picker, so no permission string is needed. |
| 6 | App Privacy labels (ASC) | NEEDS JASON | Apple's API can't set these, so it's a web form. Answer: **"Data Not Collected"**. That's accurate: no analytics, no accounts, nothing leaves the device. |
| 7 | Privacy policy URL | NEEDS JASON | Required for every app. Draft: docs/app-store/privacy-policy-DRAFT.md. Decision: publish it at https://designmainline.com/caviot/privacy (or another URL), then I set it in ASC. |
| 8 | Support URL | NEEDS JASON | Draft: docs/app-store/support-page-DRAFT.md. Decision: publish it at https://designmainline.com/caviot/support. |
| 9 | Export compliance | PASS | ITSAppUsesNonExemptEncryption = false; build 78 is already answered "no". |
| 10 | Age rating | NEEDS JASON | The questionnaire in ASC is still blank. Proposed: all "None" → 4+, **but** see item 11. While the app shows vape product names, "Alcohol, Tobacco or Drug Use or References" honestly needs "Infrequent/Mild", which gives a higher rating and draws reviewer attention to 1.4.3. |
| 11 | 1.4.3 / vaping references | **NEEDS JASON (critical)** | In-app text the reviewer will see: the Size & fit device list has groups "Vapes — Geek Bar" and "Vapes — Foger / Fogger" (Geek Bar Pulse, Foger Switch Pro), and the tip "vapes vary by batch". The default template is named "Foger Sleeve" (Foger is a vape brand). The 3D template data is fine. Decision needed: (a) recommended: in the iOS/Android apps only, hide the vape presets and rename the default template to a neutral name such as "Classic Sleeve", keeping the website as is; or (b) keep everything and accept a high chance of a 1.4.3 rejection. I did not change any in-app wording. |
| 12 | Store metadata & screenshots | NEEDS JASON | Neutral listing copy is in docs/app-store/store-listing-DRAFT.md. Screenshots must not show vapes or the "Foger" name. The subtitle, keywords, category and screenshots aren't entered yet. |
| 13 | App icon | PASS | 1024×1024 RGB, no alpha (the new C icon). |
| 14 | Launch screen | PASS | LaunchScreen.storyboard plus the Splash asset. |
| 15 | iPad / multitasking | PASS | Device family 1,2. All four iPad orientations, launch storyboard, UIRequiresFullScreen not set, so Split View and Stage Manager are supported. The phone layout already adapts to iPad sizes (tested in the e2e iPad gen 7 profile). Recommend a manual check on a real iPad. |
| 16 | Minimum SDK / Xcode | PASS + FIXED | Since Apr 28, 2026 uploads need Xcode 26 / the iOS 26 SDK. CI uses macos-latest and Apple accepted build 78. Added a guard in ci-testflight.sh that fails early if the Xcode major version is below 26. Deployment target 16.4 is fine. |
| 17 | Private APIs | PASS | Only public UIKit/WebKit/Foundation in CaviotNativePlugin and CaviotBridgeViewController. |
| 18 | Account deletion (5.1.1(v)) | N/A | No accounts. |
| 19 | Payments / external purchase links (3.1) | PASS | App is free, no purchases, no links out to buy anything. |
| 20 | 2.1 Completeness | PASS | No placeholder content. Builds pass simulator smoke tests and TestFlight. |
| 21 | Demo account / review notes | NEEDS JASON (minor) | No login, so no demo account. Suggested note: "No account needed. Tap Use my own sleeve or Add logo, then Export STL. All processing is on-device." |

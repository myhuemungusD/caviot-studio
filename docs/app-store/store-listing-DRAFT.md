# App Store listing copy (neutral wording)

Status (checked in App Store Connect on October 29, 2026): this copy is entered for **1.0, build 160, Waiting for Review**, Design Mainline LLC, release automatically after approval. Entered for 1.0 **without** the Pro wording: the description's export line reads "• Export STL or OBJ for any slicer", review note step 4 reads "Tap "Export STL" to make a 3D-printable file, which can be saved to Files or shared.", What's New is empty, and no in-app purchase exists in App Store Connect. The Pro wording below (marked **1.1**) is for the Caviot Studio Pro release. Note that build 160 already contains the Pro export gate (PR #51); see iap-readiness-DRAFT.md. The "14 included fonts" lines match main after PR #52 (merged October 29, 2026); build 160 was built before it and still bundles the 120 old fonts, so the next build is the first to match them.
Wording rules (Guideline 1.4.3): don't use vape, vaping, Foger/Fogger, Geek Bar, pod, cartridge or smoke anywhere: not in the text, the screenshots or the preview video. Also leave other apps' names (Blender, Cura, Bambu and so on) out of the keywords (Guideline 2.3.7).

| Field | Value | Limit |
|---|---|---|
| App name | Caviot Studio | 13/30 |
| Subtitle | Logos on curved 3D prints | 25/30 |
| Primary category | Graphics & Design | |
| Secondary category | Productivity | |
| Price | 1.0: Free, no In-App Purchase. Planned for 1.1: Caviot Studio Pro, $9.99 one-time (see iap-readiness-DRAFT.md) | |
| Version | 1.0 (MARKETING_VERSION in the Xcode project) | |
| Bundle ID | com.caviot.studio | |

## Promotional text (153/170)
Wrap a logo or lettering around any curved 3D model in one step. Import an STL, place your design, and export a print-ready file. No 3D modeling or UV maps.

## Description
Put your logo on anything you can 3D print.

Caviot Studio wraps logos, lettering and photos around curved 3D models in one step. Import a tumbler, a sleeve, a case or any other shape, place your design, and it follows the surface exactly, with no 3D modeling, sculpting or UV mapping. Then export a watertight, print-ready file.

PUT YOUR DESIGN ON ANY CURVE
• Import your own model as STL, OBJ or 3MF from Files or a 3D-scanning app
• Or start right away with the built-in Classic Sleeve
• Designs follow the curve of the surface instead of sitting flat on top

LOGOS, LETTERING AND PHOTOS
• Add a logo, a screenshot or a photo, and remove the background on your device
• Type lettering in 14 included fonts, or import your own
• Photo styles: shadow, bold silhouette, line art, 3-level relief, smooth relief and lithophane
• Separate designs for the front and back

EMBOSS, DEBOSS OR INVERT
• Raise the design, engrave it, or tap Invert relief to sink it into a raised pad that follows its outline
• Set the size, position, rotation and depth to the hundredth of a millimeter
• Undo and redo

PRINT-READY EXPORT
• Export STL or OBJ for any slicer (1.1 adds: "(one-time Caviot Studio Pro unlock, no subscription)")
• Export as the full sleeve, the logo only or a flat plate
• Make watertight checks and repairs the mesh and keeps the cavity of your sleeve
• Save and reopen projects

PRIVATE BY DESIGN
• Everything runs on your device and works offline
• No account, no sign-in, no ads, no tracking

## Keywords 
`stl,emboss,engrave,deboss,relief,sleeve,tumbler,wrap,3mf,obj,maker,lithophane,text,font,cad,printer`

(99/100 characters. The words in the app name and subtitle are indexed already, so they aren't repeated here.)

## What's New (1.0)
First release. Wrap logos, lettering and photos around any curved 3D model and export print-ready STL files.

## URLs (all returned 200 on Oct 25, 2026; the same URLs are set in App Store Connect)
- Support URL: https://www.designmainline.com/caviot/support
- Privacy Policy URL: https://www.designmainline.com/caviot/privacy
- Marketing URL: https://www.designmainline.com/
- Public support/contact email: admin@designmainline.org (forwards to Jason's main inbox; also the EU trader contact email Apple shows on the store page)
- Copyright: 2026 Design Mainline LLC

## App Review notes (no sign-in required; 1.1 version with the Pro steps, 1.0 differs in step 4 and has no step 5)
```
No account or sign-in is needed. Everything runs on the device and the app works offline; there is no server component.

To test the main feature:
1. Launch the app. On "Choose a template", tap "Classic Sleeve" (or "Import STL" to pick any STL/OBJ/3MF file from Files).
2. Tap Tools > Add and pick any image from Photos/Files. It appears on the 3D sleeve, following the curved surface. Drag it to move it.
3. Optional: under Tools > Front/back, tap "T+ Text" and type some text. Under Tools > Emboss, try Emboss, Deboss or Invert relief.
4. Tap "Export STL". Designing, previewing and saving projects are free; exporting STL/OBJ print files needs the one-time in-app purchase "Caviot Studio Pro" (com.caviot.studio.pro, non-consumable, $9.99, no subscription). The Pro screen appears with the price, "Unlock Pro for $9.99", "Restore Purchases" and "Not now". Tap "Unlock Pro for $9.99" and confirm with the sandbox Apple Account; the export continues and the file can be saved to Files or shared.
5. To test restore: delete and reinstall the app, tap "Export STL", then "Restore Purchases". Restore is also in Tools > All > Caviot Studio Pro. The purchase is verified on the device by StoreKit; there is no app account.

The app is a general-purpose tool for customizing 3D-printable covers, sleeves and objects. It does not sell or promote any regulated products.
```
Contact for review: entered in App Store Connect; email admin@designmainline.org. No demo account is needed.

## App Privacy (nutrition label)
Data Not Collected, including with the Pro in-app purchase: it uses StoreKit 2 on the device (Apple processes the payment; the developer receives no purchase data). No analytics or crash SDKs, and no network calls for user data. Re-check this if RevenueCat or analytics is added (see iap-readiness.md).

## Age rating
Answered in App Store Connect; the app shows as 4+ (checked October 29, 2026).

## Screenshots
Captioned PNGs (iPhone 6.9" 1320x2868 and iPad 13" 2064x2752, 6 each) are made outside the repo so they don't trigger CI. Captions:
1. Your logo on any curve: wraps cleanly around tumblers, sleeves and cases in one step, with no 3D modeling or UV maps needed (an imported tumbler STL with a logo)
2. Logos and lettering in 3D: a photo, a screenshot or typed text, with 14 fonts included or your own
3. Emboss, deboss or invert: raise it, engrave it, or flip what sticks out with one tap
4. Invert relief: sinks your design into a raised pad that hugs its outline
5. Bring your own shape: start with the Classic Sleeve or import an STL, OBJ or 3MF
6. Export print-ready STL: sleeve, logo only or flat plate (on iPad, the "Your file is ready" dialog)

No screenshot shows a vape, the Foger name or a vape preset. The demo artwork is a made-up "PEAK" logo and the text "TRAIL CREW".
- Order: 1 curve hero, 2 text, 3 emboss/invert, 4 invert close-up, 5 templates/import, 6 export

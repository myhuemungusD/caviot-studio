# App Store listing copy (DRAFT, neutral wording, ready to paste)

Status: draft. Nothing has been entered in App Store Connect. Enter it after the organization developer account is set up.
Wording rules (Guideline 1.4.3): don't use vape, vaping, Foger/Fogger, Geek Bar, pod, cartridge or smoke anywhere: not in the text, the screenshots or the preview video. Also leave other apps' names (Blender, Cura, Bambu and so on) out of the keywords (Guideline 2.3.7).

| Field | Value | Limit |
|---|---|---|
| App name | Caviot Studio | 13/30 |
| Subtitle | Logos on curved 3D prints | 25/30 |
| Primary category | Graphics & Design | |
| Secondary category | Productivity | |
| Price | Free (Pro unlock planned, see iap-readiness.md) | |
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
• Type lettering in any of 120 included fonts
• Photo styles: shadow, bold silhouette, line art, 3-level relief, smooth relief and lithophane
• Separate designs for the front and back

EMBOSS, DEBOSS OR INVERT
• Raise the design, engrave it, or tap Invert relief to sink it into a raised pad that follows its outline
• Set the size, position, rotation and depth to the hundredth of a millimeter
• Undo and redo

PRINT-READY EXPORT
• Export STL or OBJ for any slicer
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

## URLs (all returned 200 on Oct 25, 2026)
- Support URL: https://www.designmainline.com/caviot/support
- Privacy Policy URL: https://www.designmainline.com/caviot/privacy
- Marketing URL: https://www.designmainline.com/
- Public support/contact email: admin@designmainline.org (forwards to Jason's main inbox; also the EU trader contact email Apple shows on the store page)
- Copyright: © 2026 <organization legal name, set once the company account exists>

## App Review notes (no sign-in required)
```
No account or sign-in is needed. Everything runs on the device and the app works offline; there is no server component.

To test the main feature:
1. Launch the app. On "Choose a template", tap "Classic Sleeve" (or "Import STL" to pick any STL/OBJ/3MF file from Files).
2. Tap Tools > Add and pick any image from Photos/Files. It appears on the 3D sleeve, following the curved surface. Drag it to move it.
3. Optional: under Tools > Front/back, tap "T+ Text" and type some text. Under Tools > Emboss, try Emboss, Deboss or Invert relief.
4. Tap "Export STL" to make a 3D-printable file, which can be saved to Files or shared.

The app is a general-purpose tool for customizing 3D-printable covers, sleeves and objects. It does not sell or promote any regulated products.
```
Contact for review: <Jason's name, phone and email, entered in App Store Connect>. No demo account is needed.

## App Privacy (nutrition label) at launch (no IAP)
Data Not Collected: no analytics or crash SDKs, and no network calls for user data. Re-check this if RevenueCat or analytics is added (see iap-readiness.md).

## Age rating
Answer "None" for every content question. Expected result: 4+. Jason should confirm this in App Store Connect.

## Screenshots
Captioned PNGs (iPhone 6.9" 1320x2868 and iPad 13" 2064x2752, 6 each) are made outside the repo so they don't trigger CI. Captions:
1. Your logo on any curve: wraps cleanly around tumblers, sleeves and cases in one step, with no 3D modeling or UV maps needed (an imported tumbler STL with a logo)
2. Logos and lettering in 3D: a photo, a screenshot or typed text, with 120 fonts included
3. Emboss, deboss or invert: raise it, engrave it, or flip what sticks out with one tap
4. Invert relief: sinks your design into a raised pad that hugs its outline
5. Bring your own shape: start with the Classic Sleeve or import an STL, OBJ or 3MF
6. Export print-ready STL: sleeve, logo only or flat plate (on iPad, the "Your file is ready" dialog)

No screenshot shows a vape, the Foger name or a vape preset. The demo artwork is a made-up "PEAK" logo and the text "TRAIL CREW".
- Order: 1 curve hero, 2 text, 3 emboss/invert, 4 invert close-up, 5 templates/import, 6 export

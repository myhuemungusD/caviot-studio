# Google Play listing: Caviot Studio

Status: submitted to Google Play production on October 29, 2026 as 1.0 (versionCode 1106), Design Mainline LLC
organization account. This is the text that was prepared for Play Console; if it is edited in Play Console, update it here.

Wording rules: never use vape, vaping, Foger/Fogger, Geek Bar, pod, cartridge or smoke, and don't name other apps (Blender, Cura, Bambu and so on). No iOS terms (Files app, App Store, AirDrop, Safari). Checked with grep: clean.

The "120 included fonts" line matches the submitted build; change it if PR #52 (14 open-licence fonts) ships.

| Field | Value | Limit |
|---|---|---|
| App name | Caviot Studio | 13/30 |
| Short description | Wrap a logo around any curved 3D model in one step. Export a print-ready STL. | 77/80 |
| Category | Art & Design (alternative: Tools) | |
| Tags (suggested) | 3D printing, Design, Graphic design | |
| Price | Free. No in-app purchases on Android (Pro gate is iPhone/iPad only; Android never loads it) | |
| Contains ads | No | |
| Contact email | admin@designmainline.org | |
| Website | https://www.designmainline.com/ | |
| Privacy policy URL | https://www.designmainline.com/caviot/privacy | |
| Package | com.caviot.studio | |

## Full description (1727/4000)
```
Put your logo on anything you can 3D print.

Caviot Studio wraps logos, lettering and photos around curved 3D models in one step. Import a tumbler, a sleeve, a case or any other shape, place your design, and it follows the surface exactly, with no 3D modeling, sculpting or UV mapping. Then export a watertight, print-ready file.

PUT YOUR DESIGN ON ANY CURVE
• Import your own model as STL, OBJ or 3MF from your phone's storage, Google Drive, a 3D-scanning app or a download
• Open STL, OBJ and 3MF files straight from your file manager or share them to Caviot Studio from another app
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
• Pick an export folder once (Downloads, a USB drive, Google Drive or a network share) and every file lands there automatically, or use Save as and Share
• Make watertight checks and repairs the mesh and keeps the cavity of your sleeve
• Save and reopen projects

PRIVATE BY DESIGN
• Everything runs on your device and works offline
• No account, no sign-in, no ads, no tracking
```

Android-specific lines (open-with/share and pick-an-export-folder) are accurate: docs/ANDROID-RESEARCH.md marks both "Built", and origin/main has VIEW + SEND intent filters for STL/OBJ/3MF and ACTION_OPEN_DOCUMENT_TREE with a persisted folder permission in CaviotNativePlugin.java.

## Graphics

Icon 512x512 (same artwork as the launcher icon), feature graphic 1024x500, six phone screenshots (1440x2560) and five
tablet screenshots (1620x2880) made from the iPhone 6.9" and iPad 13" App Store sets. The iPad export shot is left out
because its dialog names Files, AirDrop and Safari. The source images are not in this repo.

## Data safety and content rating (as submitted)

Data safety: no data collected, no data shared (matches the iOS "Data Not Collected" label).
Target audience 18+. Content rating: Everyone.

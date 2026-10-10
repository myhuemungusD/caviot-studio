# Caviot Studio for Mac

A macOS app that opens the Caviot Studio files in `dist/`. The studio itself is unchanged: the same HTML, scripts, workers, fonts, and ETSYFOLGER sleeve. This folder only adds the window, menus, and disk image.

The app reads those files from disk, so it works offline. ETSYFOLGER stays the template you get on a new launch.

## Run from a checkout

From this `desktop/` folder:

```bash
npm install
npm start
```

Node.js 20 or newer is required. The window loads `../dist`. Nothing in `dist/` is copied or built for this command.

## Build a disk image

The disk image has to be built on a Mac. It is a universal app (Apple silicon and Intel in one file).

```bash
cd desktop
npm install
npm run dist
```

The image is written to `desktop/release/`. It is unsigned unless the signing secrets below are present in the environment. Building does not upload it anywhere.

## Install an unsigned app

macOS will refuse a normal double-click of an unsigned app.

1. Open the `.dmg`.
2. Drag **Caviot Studio** into Applications.
3. In Applications, **right-click** (or Control-click) **Caviot Studio** and choose **Open**.
4. In the dialog, choose **Open** again.

If Gatekeeper still blocks it: open **System Settings → Privacy & Security**, find the Caviot Studio note, and choose **Open Anyway**. Then use **Open** on the next prompt.

You only need the right-click Open the first time. After that, the Dock and Spotlight open it normally.

## Signing and notarization

They are optional. The GitHub Actions workflow builds an unsigned image when these repository secrets are absent, and signs (and notarizes) when they are set. Do not commit certificates or passwords.

| Secret | Purpose |
| --- | --- |
| `CSC_LINK` | Base64 of a Developer ID Application `.p12`, or a `file://` URL electron-builder can read. |
| `CSC_KEY_PASSWORD` | Password for that `.p12`. |
| `APPLE_ID` | Apple ID email for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com. |
| `APPLE_TEAM_ID` | 10-character Apple Developer team id. |

Create the base64 certificate locally with `base64 -i Certificates.p12 | pbcopy` and paste it into the `CSC_LINK` secret. With `CSC_LINK` set, the workflow signs the app. With all three Apple secrets set as well, electron-builder submits the signed app for notarization. If any Apple secret is missing, notarization is skipped so an unsigned or signed-only build still finishes.

The entitlements used when signing are `build/entitlements.mac.plist` (JIT and unsigned executable memory, which Electron needs).

## What the app does

- **Files.** A privileged `caviot://studio` origin serves `dist/`. Workers, `fetch` of the sleeve and fonts, and IndexedDB use that origin. The page is not given Node.js (`contextIsolation`, `sandbox`, no `nodeIntegration`).
- **Save.** Export STL, Export OBJ, and Save project go through the system save panel. The suggested name is the one the studio already uses.
- **Open.** File → Open Image…, Open STL Template…, and Open Project… use the system open panel and hand the file to the same inputs the buttons use. The on-screen buttons still open the system file panel directly.
- **Edit.** Undo and Redo call the studio history, and keep the field's own undo while you are typing. Cut, Copy, Paste, and Select All are the system commands.
- **Icon.** The Dock and disk image use `dist/branding/icons/icon-512.png`.

The browser service worker is not registered. It only turns on for `https:` pages (or `?sw=1`). The app reads the files on disk, so a cache in front of them would be a second copy. IndexedDB still works; the studio uses it for imported fonts. Autosave stays the studio's own rule: the desktop layout does not write the phone autosave.

## Tests

```bash
cd desktop
npm test
```

On Linux, run that under a display (`xvfb-run -a npm test`). The test launches the app and the local `node serve.mjs` server in the same Electron, checks that ETSYFOLGER is selected, writes an IndexedDB record, loads the sleeve file, runs a worker, checks the menu, exports the default sleeve, types CAVIOT, exports again, and requires those STL files to match the web build byte for byte. It also opens `e2e/fixtures/badge.png` through the desktop open path.

`npm run test:paths` checks the file-path guard without launching Electron.

GitHub Actions (`.github/workflows/macos-desktop.yml`) runs the smoke test on a macOS runner, builds the disk image, and uploads the `.dmg`.

## Engineering review

**Error handling.** Missing studio files quit with a dialog. A failed main-frame load (other than a cancelled navigation) explains itself. The protocol returns 400, 403, 404, 405, 413, or 500 instead of throwing into the window. Open and save failures surface a dialog; during the smoke test they are logged so a dialog cannot block the runner. A save the user cancels does not show an error. An interrupted write does. One-shot open tokens expire after a minute. Unknown open kinds throw before a dialog is shown.

**Memory.** Studio files are streamed from disk. The fallback buffered read is only used if that stream cannot be wrapped. An opened STL or image is not copied in the main process; the page reads it once, with the same 20 MB / 100 MB / 36 MB caps the studio already enforces. The open token stores a path, not bytes. Downloads are written by Electron to the path from the save panel. The smoke export directory is removed when the test exits.

**Accessibility.** The studio page is unchanged, including its names, status line, and keyboard shortcuts. The Mac menu adds Undo, Redo, Cut, Copy, Paste, Select All, zoom, and full screen with the system roles and shortcuts. Clipboard read and write are the only permissions granted, so Copy and Paste work; camera, microphone, and location stay denied. About uses the standard About panel. Open and save use the system panels, which VoiceOver already knows. The window title and minimum size keep the desktop layout on screen. Spellcheck stays on for text fields. Typing undo is left to the field; the studio undo is used everywhere else, matching the page. Closing the window on a Mac leaves the app running until you quit it; that is the usual Mac behavior, and clicking the Dock icon opens the window again.

**Performance.** The window paints its background before the first frame and is shown when ready outside the test. Workers are not background-throttled, so an export continues if the window is covered. Fonts are cacheable; HTML is not, so a replaced `dist/` is what the next launch runs in development. The packaged app keeps `dist/` outside the asar archive so those reads stay normal files. The disk image is one universal binary rather than two downloads.

**Docs.** This file covers the local run, the disk image, the right-click Open install, and the optional signing secrets. The repository README points here and does not duplicate the steps. The workflow file names the same secrets.

**Limits.** Physical printing is unchanged from the web app. The unsigned image needs the right-click Open above. Notarization only runs when the Apple secrets are set. A custom STL is still not restored on the next launch; that is the studio's rule, and this wrapper does not override it.

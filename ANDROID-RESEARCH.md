# Caviot Studio on Android: research (October 2026)

Question: what can Android do that iPhone can't, that actually helps a small vape-sleeve shop that turns
logos and photos into sleeve STLs? Sources: Android/ARCore/Play docs, Capacitor docs and GitHub issues,
OctoPrint/Moonraker/Bambu docs, Reddit (r/3Dprinting, r/3dprinter), a peer-reviewed scan accuracy study,
and the open-source Android STL viewer ModelViewer3D (213 stars) as a reference for file handling. An X
search for Capacitor/WebView WebGL complaints returned nothing recent, which matches the GitHub picture:
the complaints are old (2020–2022) and about weak devices, not Capacitor itself.

## Short answer

| Android ability | Helps Caviot? | Decision |
| --- | --- | --- |
| "Open with" / share target for any file type, no UTType declarations | Yes, every day: scans and downloads arrive as STL/OBJ/3MF | **Built** |
| Save straight into a folder you picked once (Storage Access Framework) | Yes: exports land in a Drive/OneDrive/NAS/USB folder Cura on the PC already watches | **Built** |
| Launcher shortcuts (long-press icon) | Small but free | **Built** (Open STL template, Export folder) |
| 90/120 Hz while orbiting | Yes for feel, but costs battery if left on | **Built, adaptive** (only while a finger is down) |
| Back button / edge-to-edge / insets | Required for an Android app to feel native | **Built** |
| Samsung DeX, Chromebook, split screen, stylus | Works for free: the web app already has a desktop layout and pointer support | Enabled (resizeable activity), not specially tuned |
| Send to printer (OctoPrint/Moonraker/Bambu LAN) | Not directly: Caviot makes STL; printers need G-code (slicing) | **Deferred**, see below |
| ARCore Raw Depth scanning on non-LiDAR phones | Not accurate enough for a 0.2 mm sleeve fit | **Deferred**; import scans from KIRI/Polycam instead |
| Home-screen widget | Nothing useful to show | Skipped |
| Trusted Web Activity instead of Capacitor | Smaller, but loses intents-to-template, SAF, native dialogs | Rejected |

## Why each one

**Open with / share target.** On iPhone we had to declare UTTypes, and STL still shows up grey in some
pickers. Android matches on MIME type and file extension in the manifest. The catch (seen in Cura issue
#4141 and ModelViewer3D) is that file managers disagree on STL's type: `model/stl` (the IANA type),
`application/sla`, `application/vnd.ms-pki.stl`, or just `application/octet-stream`. So the app listens for
all of them, matches `.stl/.obj/.3mf` by extension for octet-stream, and then sniffs the first bytes
(binary STL size check, `solid…facet`, OBJ `v ` lines, 3MF zip header) so a misnamed file still opens and a
photo sent by mistake is refused with a clear message. This is the same approach good Android viewers use.

**Save to a folder.** iPhone can only save into the app's own Files folder or ask every time. Android lets
the user pick a folder once (any provider: Downloads, a USB stick, Google Drive, a Samba share via a
file manager) and the app keeps permission. For Jason that means: export on the phone → the STL is already
in the folder Cura opens on the PC. Every export still offers Save as… and Share… too.

**Performance (WebView vs WKWebView).** Android's WebView is Chrome; it is updated through Play and is
not capped like WKWebView's ~1–1.5 GB content process. Capacitor discussion #3899 and the three.js forum
agree that WebGL in a WebView performs like Chrome on the same phone and that the real wins are app-side:
don't redraw when nothing changes, cap pixel ratio, cap frame rate under load. The studio already caps the
drawing buffer on phones; this branch adds render-on-demand (idle WebGL draws drop from 60 a second to
about 2) which helps iPhone and the website too. Android 15+ lets an app request 120 Hz per window;
older versions pick a display mode. We request the top rate only while a finger is on the model.

**Printers.** OctoPrint and Moonraker both accept uploads (`POST /api/files/local` with an API key, CORS
must be enabled). Bambu's 2025 firmware requires Bambu Connect or LAN-only + Developer Mode for third-party
control. But all three print G-code, and Caviot's output is an STL that still needs slicing (Jason slices in
Cura with tuned profiles). Phone slicers exist (MobileSlicer, Hotend, an Orca-based Reddit project) but are
young. Uploading an unsliced STL to OctoPrint does nothing useful. Worth revisiting only if Jason moves to
a printer that slices in the cloud, or wants a "send STL to my PC" button — the export folder already does that.

**Scanning.** ARCore Raw Depth works on many non-LiDAR Android phones, but Google's docs say depth is most
accurate at 0.5–5 m and on textured surfaces; a vape is small, glossy and close. A 2024 study measured
KIRI Engine photogrammetry at about 0.22 mm deviation on small models, close to a pro scanner — that is the
accuracy class a sleeve needs. So the best Android path is: scan in KIRI Engine/Polycam → export STL/OBJ →
"Open with Caviot" (built now). A native ARCore scanner is weeks of work for a worse result.

**Capacitor vs Trusted Web Activity.** A TWA is Chrome showing the website full-screen: tiny, auto-updating,
but it cannot receive a shared STL into the template loader without a Web Share Target round trip, cannot
remember a SAF folder, has no native save dialog, and needs the site online for first launch. Capacitor
reuses the iOS bridge (one `caviot-native.js`), ships the app offline inside the APK, and is what the iPhone
app already uses. Same reasoning as Apple guideline 4.2: a bundled offline app is a real app.

## Benchmarks against top apps

- **Nomad Sculpt** (native, GPU): renders on demand and drops resolution while you move. We now render on
  demand and keep the capped pixel ratio. Expect Caviot to feel close on a mid-range phone for a 120k-
  triangle preview; Nomad stays ahead on multi-million-triangle sculpts, which Caviot doesn't need.
- **Polycam / KIRI Engine / Scaniverse**: all share out as OBJ/STL/GLB; Caviot now receives OBJ/STL/3MF.
  GLB/USDZ are not read (the three.js r128 engine in the app has no loader bundled for them yet).
- **OctoApp / Mobileraker / Bambu Handy / Creality Cloud**: printer remotes that act on G-code. Not a fit
  for an STL designer; see Printers.
- **Slicer apps (MobileSlicer, Hotend)**: the right place for "print from phone"; Caviot's export folder and
  Share hand STLs to them.

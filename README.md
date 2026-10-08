# Caviot Studio — build 2026.09.21

This PC copy is **build 2026.09.21** (the independent design layers and Undo update). The same build label appears in the app header.

A browser-based tool for turning images, text and patterns into 3D-printable sleeves and reliefs. The existing mesh engine has been preserved and separated from the interface.

## Quick start on Windows

1. Extract the ZIP into a normal folder.
2. Install Node.js if it is not already installed.
3. Double-click `Start-Caviot.cmd`. The launcher starts the local server in the background and opens your browser automatically.
4. Use the same launcher next time; it reuses the running server. If port 4173 is busy, it chooses another available port. A restart of Windows stops the server; double-clicking the launcher starts it again.

The launcher checks common Node.js installation paths even when a desktop shortcut has an outdated PATH. Startup errors appear in a dialog; logs are kept in the local `.launcher` folder.

Alternatively run `node serve.mjs` from this folder. No npm install or build step is required. Use Save project for your artwork and settings; Export STL downloads the printable model. This repository contains the application itself.

## Run

Serve `dist/` with any static HTTP server. No build or dependency installation is required. Use HTTP rather than opening index.html directly: export processing uses a Web Worker. All runtime dependencies are included in `dist/vendor/`, with their license.

Run `node tests.mjs` from this directory to check geometry, project validation, worker export paths, JavaScript syntax and local asset references.

## Product routes

- `index.html`: design studio, STL/OBJ exports, portable projects and guide.
- `about.html`: product positioning, features and FAQ.

## Files

- `mesh-core.js`: geometry and export serialization.
- `app.js`: original image pipeline and 3D editing flow, with targeted fixes.
- `product.js`: project management, guide and background export orchestration.
- `project-format.js`: portable project validation.
- `export-worker.js`: mesh generation and validation off the UI thread.
- `text-relief.js`: sharp lettering — traced text outlines turned into closed polygon meshes (uses `vendor/earcut.js`).
- `text-plate-ui.js`, `uniform-scale.js`, `header-context.js`: flat text backings, the Uniform scale slider, and the top-bar context/status line.

## Sharp lettering, flat text prints and the top bar — October 8

**Why text looked blocky.** Typed text is drawn into a 2048 × 1024 image, but the relief was then resampled onto the heightmap grid (160 columns in preview, at most 400 in export: about 0.95 mm per cell on a 152 mm plate) and meshed cell by cell, so every letter edge became a staircase. Edge smoothing only blurred the steps.

**What text does now** (`dist/text-relief.js`, used by preview and export alike). The anti-aliased text image is traced at its 50 % level with sub-pixel marching squares, simplified (0.2 px Douglas–Peucker), cleaned, and triangulated (earcut, then Delaunay flips and re-inserted points). Letter edges become vertical walls exactly on the glyph outline. On curved surfaces (sleeve, logo only, curved flat plate) extra interior points keep the surface within about 0.01 mm of the true curve. Every build checks itself (closed, manifold, consistent winding on the lettering faces, matching volume). If the check fails, or the outline is too large (400,000 outline points or 1.5 million faces), that design falls back to the old grid mesh and a toast explains why. On a phone the bent-surface budget follows the phone export limit (700,000 triangles) and an outline backing that would allocate more than 6 million mask pixels falls back to letters only, with a toast. Desktop limits are unchanged. Applies to text with **Sharp edges** on, on Flat plate, Logo only and the parametric sleeve; Edge smoothing has no effect on it. Measured on a 152 mm plate: letter edges within 0.02 mm of the glyph outline (the grid export was about 0.3–0.66 mm off). The STL is exactly the preview mesh on flat plates. On sleeves, the export uses the same lettering on the finer export-detail body.

Unchanged on purpose: image designs (meshes and STL are byte-identical to before; `text-relief-tests.mjs` compares them with the previous `mesh-core.js`), and ETSYFOLGER/custom STL templates, which keep their own contour pipeline (`template-sharp.js`, 768-pixel vector field), so their exports also stay byte-identical.

**Flat text prints (name signs).** Choose **Flat plate**, type the text, then pick **Backing behind the text** in the Flat plate size panel:
- **Outline**: a backing that follows the letters at **Backing margin** (0.5–10 mm, default 2), with thin bridges that join separate letters into one piece.
- **Rounded rectangle**: a rounded rectangle around the text, margin as above.
- **Connector bar**: the letters joined by a bar along the baseline, plus the outline margin.
- **Solid plate**: the full rectangular plate (Width × the text's proportions).
- **None · letters only**: just the letters, lying on the bed. The tip under the choices shows the thickness and how many separate pieces will print.

When text lands on a flat plate, the letters start 2 mm tall (with the default 1 mm Backing: 3 mm thick as letters only, or 2 mm above a 1 mm backing). Switching back to the sleeve restores the previous depth unless you changed it. Saved settings and projects open as saved. A project file records the backing and its margin only when they are not the defaults (letters only, 2 mm), so a plain sleeve or an image design saves the same file as before. Backing thickness is the **Backing** field, letter height is **Depth**. Every option exports a closed STL.

**Uniform scale.** Under the design Width/Height/Rotation sliders, **Uniform scale** (10–300 %) resizes the selected sleeve design with its proportions kept, within the template's size limits. It reads 100 % at rest and starts again from 100 % after any other size change. On phones it sits in the Size section next to the proportion lock.

**Top bar.** The left-panel headings "01 / Your design" and "Size & rotation · selected design" are gone. The top bar shows the context next to LOCAL WORKSPACE (for example "Front · FOGER · Size & rotation") and the sleeve status line (`#templateStatus`, still `role=status`, `aria-live=polite`): one line with the full text on hover. Errors show in the warning colour with ⚠, and as a toast when they don't fit. Below 1100 px the context label is hidden. On phones the status stays in the tools sheet and the phone status overlay.

Known, not changed: on main, a closed bottom with a push-out hole builds the hole wall with reversed winding (80 duplicate directed edges in the test). Fixing it would change image exports, so it is left as is and noted here.

Tests: `node text-relief-tests.mjs` (131 checks: trace accuracy, closed meshes in every shape, exact volumes, deviation against the grid, fallback, byte-identical image meshes, a tight face budget coarsens bent lettering, and an outline backing over the pixel budget is refused). `node e2e/text-relief-e2e.mjs http://127.0.0.1:4190/` (83 checks in Chrome: five fonts within 0.05 mm with no stair steps; every flat backing, logo only and sleeve exported through Export STL closed and wound; spacing/thickness; templates and images untouched; text defaults; Uniform scale with undo).

## Validation boundaries

Automated tests cover closed-edge geometry for representative modes, caps, fit-ring height, serialized STL/OBJ, malformed projects and worker exports. Browser checks for the current template and repair flow are listed below. Physical printing has not been performed. Presets use an elliptical cross-section and are unverified starting dimensions. Checks do not detect all self-intersections, strength problems or printer-specific limitations.

Project files preserve each image, editable text and selected font, with PNG backups. Additional custom font files are not embedded. Settings and fonts persist locally; artwork requires an explicit project download. No cloud backup, customer accounts, payment system, licensing enforcement or analytics is implemented.

Keep your original HTML as the historical source. The included third-party Three.js distribution remains version 0.128.0 for compatibility; this release does not claim a dependency security audit.

## ETSYFOLGER sleeve and repair update

The supplied ETSYFOLGER STL is now the default template. It retains the source geometry, cavity, cutouts and dimensions, with a rigid rotation to display upright. Artwork can be moved, resized, rotated, embossed or debossed around the actual surface. Relief follows interpolated surface normals; even-depth mode uses the visible silhouette. Protected boundaries taper over 1.2 mm, and deboss is limited by measured wall thickness. Preview exterior spacing is 1.1 mm; print spacing is 0.5 mm. This is mesh resolution, not a printer accuracy claim.

Make watertight performs conservative welding, duplicate/degenerate-face cleanup, and patching of isolated missing triangles no larger than 2 mm. It checks edge incidence, disconnected vertex fans and winding conflicts. It does not boolean intersecting volumes, seal large holes, or prove absence of self-intersection. Once enabled in a session it also processes full-resolution exports. It does not alter the source STL file.

Validation: `node tests.mjs` (34 checks), `node repair-tests.mjs` (9 assertions), `node template-tests.mjs` (preview and print, emboss/deboss around four sides), and `node check-full-repair.mjs` (963,074-triangle template closed with consistent winding and manifold vertices). Browser checks include template loading, lettering, deboss, Make watertight and successful full-resolution repaired STL export. Physical print testing remains outstanding.

This is a personal tool. Billing and subscription work are deferred.

## Included fonts and sharp lettering

All 120 font files from the supplied 42 ZIP archives are bundled in `dist/fonts/`, including TTF/OTF alternatives and accompanying notices. The font picker is populated on first load. Fonts load when selected, selected included fonts are remembered in this browser, and custom uploads remain supported. Browser FontFace validation loaded all 120 successfully.

Sharp edges + Even depth now traces a silhouette contour with explicit sidewalls instead of a sloped grayscale height transition. The design region is refined to 0.24 mm preview spacing and 0.14 mm export spacing, with 768/1024-pixel artwork maps and separate sidewall shading normals. Text raster resolution is 2048 × 1024. The cavity is unchanged. This is a raster contour approximation rather than native vector font geometry. Sharp designs keep clear of opening boundaries instead of tapering there.

`node sharp-tests.mjs` checks raised, engraved and rotated designs: manifold edges and vertices, consistent winding, no degenerate faces, and unchanged original coordinates. Browser tests verified the picker, Blockletter, all font files and successful sharp-lettering STL export. Physical print testing remains outstanding.

## Responsive placement

Dragging, rotation and size controls now update a shader projection on the original 7,118-face sleeve, without rerasterizing the artwork or rebuilding relief geometry for each input. The full relief preview runs on release or after a 500 ms pause. Obsolete builds are cancelled, pointer updates are coalesced into animation frames, and settings are saved once after settling. The surface projection is a positioning aid; export continues to build and validate the detailed mesh from the current settings. Repair is unavailable while the geometry preview is pending.

`node placement-tests.mjs` checks that 1,000 input updates do not dispatch heavy builds, only one settled rebuild runs, and pointer updates coalesce. Browser resizing and direct dragging showed immediate placement updates without shader errors.

## Cleaner silhouette contours

Sharp edges + Even depth now interpolates a signed distance field in physical design units instead of saturated alpha values. This removes the tendency to place every outline crossing at a mesh-edge midpoint. Antialiased boundary crossings seed the distance field; width and height are handled independently for stretched designs. The thresholded source silhouette is retained without global image blur. Existing surface-normal relief, wall guards, mesh spacing, and lightweight placement remain in use.

`node contour-tests.mjs` checks straight outlines, curved outlines under non-uniform scaling, silhouette sign preservation and empty artwork. The synthetic curve test reduces mean crossing error from 0.750 to 0.039 source pixels. These are algorithmic measurements, not physical print accuracy. Raster source noise and features smaller than the mesh or printer resolution can still limit detail.

Cleanup now tries alternate short edges when the shortest candidate cannot be collapsed without changing topology. The scan avoids per-face temporary arrays. Full-resolution Pegasus emboss testing at 36 x 55 mm produced a 2,404,010-triangle STL with zero collapsed faces, open edges or non-manifold edges. Export allows up to five minutes for detailed artwork. This does not replace slicer inspection or physical print testing.

## Front and back artwork; large-design exports

The sleeve editor now keeps separate front/back artwork slots. Left-click a logo on the sleeve to select it and reveal its controls without moving the camera; stationary clicks are distinguished from orbit drags. Front/Back editing buttons also select an empty slot. Copy to the other side duplicates artwork and opposite placement. Link settings synchronizes size, placement and image processing; unlink to edit those independently. Text content and images stay separate. Finish, depth, Even depth and Sharp edges remain sleeve-wide controls, as stated in the editor.

Project format 2 embeds both PNGs, per-side settings, selection and linked state. Version 1 projects still load. Only one set of artwork controls is displayed. Selection reuses cached raster data and does not rebuild the mesh. The fast placement overlay displays both designs; STL/OBJ build a single sleeve with both masks, unioning overlaps instead of stacking duplicate sleeves.

Sharp refinement now concentrates the finest triangles in a conservative band around silhouette contours, with coarser 0.5 mm interior tessellation. If an exceptionally dense design still reaches the vertex budget, the worker retries with increased contour spacing up to 0.5 mm while preserving its physical size; export reports the actual spacing. The supplied Pegasus at 60 x 80 mm passed at the original 0.14 mm spacing with 2,349,588 triangles and no open, non-manifold or collapsed faces. Original template coordinates remain unchanged.

Validation: sides-tests.mjs (different artwork, copied artwork, deboss, overlap union and grayscale relief), side-project-tests.mjs (roundtrip, malformed input, legacy format), contour-tests.mjs, placement-tests.mjs and the 34 existing tests. Browser checks cover independent artwork, linked width, click selection, two-sided save/reopen, and successful STL export. Physical printing has not been performed.

## Scroll-wheel grab shortcut

Press and hold the middle mouse button (the scroll wheel) over either logo to select and drag it. The cursor-to-design offset is preserved, so the artwork does not jump to its center. Release, pointer cancellation, lost capture or window blur ends the temporary grab and restores the previous orbit/move mode. Rolling the wheel remains the existing zoom action. The Move design button remains available for left-button dragging.

`node wheel-grab-tests.mjs` verifies grab offset, release/cancel/blur cleanup, selection misses, previous move-mode restoration, and an untouched wheel event path. The placement scheduling checks also pass.

Bottom branding (now the DM logo by default; see *DM logo on the bottom* below): the supplied Design Mainline mark is included, with separate underside and inside-floor starting placements, middle-button dragging, and saved project settings. Both prepared template surfaces now include bottom normals, thickness checks, and opening margins.


## Design layers — September 19

Each side supports multiple images and text, with independent size, placement, image processing, depth and emboss/deboss settings. Select a design on the sleeve or in the design list. A new image prompts Add, Replace selected or Cancel. Link settings pairs the selected front and back designs. The bottom logo has separate depth and finish controls.

Undo/Redo retain up to 40 editing states during the session (Ctrl+Z / Ctrl+Shift+Z); text fields retain normal typing undo. Hide tools collapses the panel into accessible shortcut icons. Version 3 project files save all layers and editable text; older project files still open. Up to 12 design layers are supported per sleeve.

Automatic background detection uses the dominant border color and preserves transparent PNGs. Drop events load once, and the same file can be selected again. Mesh regression checks cover independent emboss/deboss depths and overlapping designs; overlapping different finishes can transition between depths, so inspect the exported mesh in your slicer.

## September 21 layout

Selected-design depth and finish sit directly below rotation. New designs and bottom branding start at 0.4 mm; saved project depths are retained. Hide tools sits at the left by the toolbar. Import STL sits beside export. Output shape, sleeve template and bottom branding are at the bottom of the tools. The extra Add Image and Pattern buttons are hidden; image drop/upload remains available. Add & view bottom logo enables the mark, turns to the selected surface and reports placement results.

## Start-up — September 30

The studio opens straight on the ETSYFOLGER sleeve with no start card or onboarding overlay over the canvas (the "Your sleeve. Your design." card with Upload design / Try lettering, and the older "Make it yours" empty-state panel, are removed). Add artwork from the side panel as before: upload, drop or paste an image, **Text**, or a pattern. Custom templates are not restored on start-up; see below.

## Custom STL templates

Any STL can now be the template, just like ETSYFOLGER. Click **Import STL template** (top bar) or **Upload STL template…** in the Sleeve template panel and choose a binary or ASCII STL (up to 100 MB / 2,000,000 triangles). ETSYFOLGER stays the default; switch back and forth with the template list.

- **What happens on upload** (in a Web Worker, `dist/custom-template.js` + `template-worker.js`): parse, weld coincident vertices (1e-5 mm), drop degenerate/duplicate faces, make face winding consistent and flip inside-out shells, then orient. At runtime it computes the same per-template data the ETSYFOLGER assets precompute with `build-template-assets.mjs`: refined outer surface, angle-weighted normals, wall thickness (inward ray cast), the 1.2 mm keep-out band around rims and openings, the cylindrical chart used for front/back placement, and bottom faces below 12 mm. A 1.1 mm+ preview surface is ready in seconds; the 0.5 mm+ print surface is prepared in the background (spacing grows for large objects to stay within the vertex budget).
- **Orientation**: Auto puts the longest side up and turns the widest side to the front (round outlines keep the file's own rotation). Override with Up axis (±X/±Y/±Z; the minus options flip the model), Turn (90° steps), File units (mm/cm/in/m) and the widest-side-to-front toggle. Exports are Z-up with the template's millimetre scale.
- **Checks**: open edges, non-manifold edges, winding conflicts, collapsed faces, tiny/huge size, thin walls and "no outer surface" are reported in the panel. Previews still work on open meshes, but export requires a closed mesh. Custom-template exports also collapse contour edges shorter than 0.1 µm and write OBJ coordinates with 6 decimals, so flat CAD facets re-import without folded faces (ETSYFOLGER exports are unchanged). **Make template watertight** runs the existing conservative repair on the uploaded mesh (tiny holes only); the canvas Make watertight still repairs exports.
- **Large meshes**: above 300,000 triangles the interactive preview uses a vertex-clustered copy; export always uses the full-resolution mesh. Already-dense meshes are refined only where their triangles are longer than the target spacing. The print surface budget is 900,000 vertices (input + 400,000 for dense meshes, at most 1.1 million so Sharp edges keeps room for contours); if refinement would exceed it the spacing is coarsened; if that still does not fit (or the mesh is already near the budget) only faces that are large in both directions are refined, and as a last resort the original triangles are used unrefined. Flat undersides and inside floors (within the bottom 12 mm) are remeshed first: new points on a hexagonal grid at about 0.8× the surface spacing are inserted into each planar patch with Delaunay flips, keeping the patch outline (and the edges it shares with the walls) unchanged, so fan-triangulated CAD bottoms get even detail for bottom branding without the refinement cascade that long thin triangles cause. Non-planar bottoms are left as they are. This costs up to 150,000 vertices (half the remaining budget at most; the unrefined fallback uses only what is left of the budget). Wall-thickness rays stop at 4 mm on closed meshes (relief never needs more than 3.8 mm). On a desktop CPU a 2,000,000-triangle mesh takes about 4 s for the preview surface, 10–15 s for the background print surface and 10–40 s for a sharp-edge export; a 626,000-triangle mesh takes about 1.5 s and 3 s. If a very dense template still cannot hold the sharp contours, export says so and suggests turning off Sharp edges (logos), smaller artwork or a simplified STL.
- **Loading and switching**: one preparation runs at a time; uploading another STL or removing the template cancels the one in progress, and choosing another template while an upload is still preparing keeps your choice. Choosing **Custom STL** before any upload shows a hint and moves focus to Upload STL template (it never opens a file dialog, so arrow keys on the list are safe). The studio always starts on ETSYFOLGER: a custom template is used only after you upload one or open a project that embeds one, and it is not remembered between visits (earlier builds kept the last upload in IndexedDB and restored it on start-up; that stored copy is now deleted on load).
- **Saving**: project format **4** embeds the template as a gzip-compressed binary STL with its orientation (formats 1–3 still open). Templates larger than about 24 MB after base64 encoding are not embedded; you are warned and asked to upload the STL again when reopening. Keep the STL or a saved project to use a custom template again later.
- The old Import STL behaviour (turn an STL's top view into height-map artwork) is still available as **Flatten STL into artwork**.
- **Textured templates** (outsides covered in discs, domes, knurling or ribs): draping artwork over the bumps broke it into scattered pieces, because every bump edge counted as a rim (1.2 mm keep-out), steep bump flanks were skipped and the thin wall between bumps failed the thickness guard. On upload the outer skin is now sampled on a 0.5 mm grid (arc length × height); a template counts as textured when its mid-height outline zigzags (outline at least 10 % longer than a smooth envelope over it) and the median local high-to-low spread is at least 0.5 mm. Then placement is measured along that smooth envelope (so a width in mm covers the right share of the sleeve), and **Raise embossed designs above the surface texture** (Sleeve template panel, shown only for textured templates, on by default, saved with the project) builds each embossed side design as a separate closed pad: its top follows the envelope over the bumps plus the design depth, its bottom sits 0.3 mm below the recesses (kept clear of the cavity), and vertical walls follow the artwork contour, with the usual 1.2 mm keep-out from rims and openings. The pad overlaps the template as its own shell (slicers merge overlapping shells of one object; the export mesh check passes because every shell is closed). Deboss cannot be cut into bumps without a boolean cut, so on textured templates it still only reaches the smooth patches: the preview says so, and an export where a deboss side finds no surface at all names that cause ("use Emboss for that side"). Bottom logos and plain templates are unchanged.

Limitations: placement uses a cylindrical chart around the vertical axis, so very concave or branching shapes can stretch artwork, and faces pointing mostly up (above the bottom 12 mm) or inward are not decorated. Flat, plate-like objects (coasters, tiles) have almost no side wall, so front/back designs find little or no surface; use bottom branding with the flat face down. The bottom-branding starting positions and inside-floor preview marker are tuned for ETSYFOLGER. Undersides that are curved, or bottoms of templates already over the vertex budget, are not remeshed; if a bottom logo then finds no printable vertices, the export message names the bottom logo and suggests moving/enlarging it or a simpler STL. Repair does not fix large holes or self-intersections. On textured templates deboss is not available, texture is only detected from the outline at mid-height (a band of texture elsewhere is not), and the raised pad follows the texture's envelope, so the relief stands at design depth above the bump tops rather than following each bump.

Validation: `node custom-template-tests.mjs` checks binary/ASCII parsing (including binary files whose header starts with "solid", trailing padding, truncated files and ASCII larger than one parse chunk), error messages, dense-mesh fallback, the 4 mm thickness-ray cap, welding and orientation fixes, auto/manual orientation, decimation, worker preparation, front/back placement, emboss/deboss (sharp and smooth) STL export re-imported as closed, open-template errors and template repair, export messages that name a bottom logo missing the underside, remeshing of fan-triangulated bottoms (watertight, volume-preserving, deterministic, non-planar bottoms untouched, bottom logo exports on a near-budget template), and project format 4 on a generated cube, a generated ASCII tube with inverted winding and ETSYFOLGER.stl loaded as a custom file (with the test-fixtures Design Mainline mask as artwork).

`node textured-template-tests.mjs` builds a synthetic textured sleeve (12.7 mm radius, 1.35 mm wall, 2.2 mm discs on a 3.6 mm hex pitch, generated in the test) and a plain one: texture detection and envelope perimeter, pad top above every bump and bottom embedded but clear of the cavity, one closed pad shell per connected design (the old draped result is fragmented), sharp and smooth exports that pass the mesh check and re-import closed, multiple sides with deboss reported, the option off and plain templates unchanged, the option saved in project format 4, and typed index arrays in `MeshCore.toThreeGeometry` (custom templates previously threw `onUploadCallback is not a function` on every frame while the placement overlay was shown).

`node custom-template-ui-tests.mjs` runs the template panel logic in a stubbed DOM: a newer upload or Remove cancels the running preparation, choosing another template while one loads keeps that choice, the empty Custom STL entry never opens a file dialog, worker crashes give readable errors, embedded templates are decompressed with a 100 MB cap, project-open notices are returned, and undo/redo keeps the displayed surface in step with the template.

## Phones, tablets and offline (PWA) — October 1

Caviot Studio now works on phones (iOS Safari, Android Chrome) and installs as an app.

- **Phone layout** (portrait up to 760 px wide, or a phone in landscape): full-screen 3D view, a compact top bar
  (project name, undo/redo, ⋮ menu with Save / Open / Export OBJ / Import STL template / Reset view / Guide) and a
  bottom bar with **Tools** and **Export STL**. Tools open as a bottom sheet (drag the handle up for full height,
  swipe down or Done to close); in landscape they open as a side sheet. Safe-area insets are respected. Desktop
  and tablet layouts are unchanged.
- **Touch**: one finger orbits, pinch zooms, two fingers pan. Tap a design to select it; drag the selected
  design to move it (a drag anywhere else still orbits). On a phone, two fingers on or next to the selected design
  resize it (proportions kept) and twist to rotate it (snaps to 0/90/180/270°); elsewhere they still zoom and pan.
  Tablets keep the earlier behaviour (a pinch that starts on the design zooms). Double-tap a design to open its
  settings. The "Move design on sleeve" toggle still makes every drag place the design.
- **Images**: the picker accepts any image (camera roll or camera). Phones scale very large photos down to
  12 MP and 2048 px on the long side instead of refusing them. Paste and drag-and-drop still work on desktop.
- **Downloads**: desktop saves directly. On phones a "file ready" sheet puts **Share…** first (Files, AirDrop,
  slicer apps) with Download as the fallback (and Open in new tab on iOS); Android phones whose browser cannot share
  files download directly. On phones the file name names every side's relief, e.g.
  `…_ETSYFOLGER_front-deboss_back-emboss.stl`.

### Phone layout (phase 1, `dist/phone-ui.js`, `dist/phone-ui.css`, `dist/project-store.js`)

Phone layout only (`CaviotDevice.PHONE_QUERY`); desktop and tablets are unchanged (same DOM order, labels and
byte-identical exports; checked against `main`).

- **Start card**: an empty sleeve shows "Add the customer's logo" with Photos, Camera (rear camera), Files and
  Text. Export with nothing on the sleeve asks first (Add logo / Export plain sleeve / Cancel).
- **Tools sheet** opens at under half the screen and shifts the 3D view up (`camera.setViewOffset`) so the logo
  stays visible. Sections in working order with labelled shortcuts: Add, Background (with the flat preview),
  Size (🔒 proportions locked by default), Emboss/Deboss + depth, Front/back, and **All settings** (template, image
  options, bottom logo, export quality, repair, …). Desktop section numbers are dropped on phones; Import font
  folder (not supported on iOS), Trim flat plate (sleeves) and the canvas Left/Right buttons are hidden.
- **Background colour**: tap Pick, then tap the background in the preview; Pick again, Done or Escape cancels.
- **Front/Back** on the canvas and in the sheet are one control: both choose the side and turn the camera, and show
  how many designs each side has.
- **Autosave**: the design in progress (artwork as PNG, placement, sides, settings; same data as Save project minus
  the custom STL) is kept in IndexedDB (`caviot.autosave.v1`), at most 30 MB, saved 1.5 s after a change and when the
  page is hidden. Less than 12 hours old, it comes back by itself after a reload ("Restored · Start new"); up to 14
  days old it is offered on the start card (Resume / Discard); older copies are deleted. A custom STL template is
  never restored: the design comes back on ETSYFOLGER with a button to import that STL again. **Start new design…**
  in the ⋮ menu clears it. ETSYFOLGER with the DM bottom logo stays the clean default; desktop never uses autosave.
- **Memory guards** (`CaviotDevice.device`, from the Oct 7 mobile audit: loading ≈ 0.3 KB per source triangle,
  exporting ≈ 0.5 KB per output triangle): on phones and low-memory devices a custom STL above 600k triangles asks
  first (with memory estimates), above 1.2M it is refused before it is read (use a computer); the preview copy is
  120k triangles (desktop 300k). Before an export the studio estimates the output (≈450k triangles for the sleeve
  plus ≈2.5 per contour cell of each design) and warns above 700k. If the page reloads during a large load or
  export, a banner says so and suggests a computer.
- **Phone-safe limits** (`dist/device-tier.js`): phones and low-memory devices use 0.20 mm outline spacing,
  a 900k-vertex budget and the lighter sleeve surface for sharp-edged designs (same sleeve shape; roughly 400k
  instead of 1.2M triangles), a 0.30 mm preview, export detail ≤ 250 for flat modes, and a 1.5× pixel-ratio cap.
  "Export quality on this device" in the tools sheet switches to full computer quality, with a warning before
  heavy exports. `?tier=light` / `?tier=full` overrides detection for testing.
- **Offline**: `dist/sw.js` caches the app, the sleeve template and the default font; other fonts and the print
  surface are cached on first use. Every file is stored under its content hash and verified, so an update can
  never mix old and new files; new versions install in the background and apply when you press Reload.
  **After changing anything in `dist/`, run `node build-sw.mjs`** (`pwa-tests.mjs` fails while `sw.js` is stale).
  The worker only registers on HTTPS, so the local launcher always serves the files on disk (`?sw=1` enables it
  locally for testing).
- **Hosting**: `vercel.json` serves `dist/` as a static site with no build step.
- **Tests**: `node pwa-tests.mjs`, `node phone-tests.mjs` (device limits, STL pre-check, autosave rules); browser
  checks in `e2e/` (`mobile-e2e.mjs` and `mobile-phase1-e2e.mjs` for iPhone 14 / SE, Pixel 7 and iPad with real
  touch input, `pwa-e2e.mjs` for offline and updates; all need `playwright-core` and Chrome).

## DM logo on the bottom — standard branding

Every new sleeve now carries the DM diamond (Design Mainline) on the **outside underside**, on by default:
**16 × 15.67 mm, raised 0.4 mm**, centred at (15.5, 1) mm on the flat pad beside the bottom hole. That is the
deepest flat part of the ETSYFOLGER underside (a 12.5 mm clear circle), so the logo stays **4.5 mm clear** of the
rim fillet and the hole countersink, well outside the 1.2 mm relief keep-out. It is a separate placement from the
sleeve designs: move it (middle-drag on desktop; on touch screens tap it, then drag it), type a position, resize
it, change depth, Emboss/Deboss or the surface, pick the earlier Design Mainline triangle, or untick
**Add bottom logo**. **Fit logo to this surface** returns it to the standard spot. Save project stores all of it.

- **Relief source**: `dist/branding/dm-diamond-relief.png` is a high-contrast black-on-white version made from the
  original gold artwork (`branding-src/dm-diamond-original.png`) by `branding-src/make-dm-relief.py`. Strokes are
  thickened evenly from 0.39 mm to **0.65 mm at 16 mm** (about 1.6 nozzle widths, so a 0.4 mm nozzle lays real
  lines rather than dropping them); separate strokes keep at least **0.5 mm** between them (thickening is held
  back near a neighbour, and the D bowl is trimmed back where it meets the M diagonal); each of the five strokes
  stays one continuous piece. The page traces it with the smooth-contour (vector outline) path.
  `dist/branding/dm-diamond.png` is the gold panel thumbnail.
- **Custom templates**: when a custom STL becomes the template, a logo that has not been placed by hand is
  fitted to it: `dist/bottom-fit.js` rasterises the downward faces in the bottom 12 mm, finds the largest clear
  circle, centres the logo there and shrinks it (never below 8 mm) to keep a 2 mm edge margin. If there is no room,
  the default logo switches itself off for that template with a note (it never makes exports fail) and comes back
  on the built-in template.
- **Projects**: the logo choice is saved (`bottomBrand.logo`). Older projects with an enabled bottom logo keep the
  triangle they were made with; projects saved before bottom branding existed open with it off.
- **Printing note**: a raised underside logo is what touches the bed when the sleeve prints upright. Use a raft (or
  print on supports), or choose **Deboss** to keep the bottom flat on the bed.
- **Tests**: `node dm-bottom-tests.mjs` (defaults, asset continuity, stroke/gap sizes, placement clearance on both
  surfaces, closed 0.4 mm exports at desktop and phone contour spacing with and without side designs, deboss and
  inside floor, custom-template fit, project rules). `e2e/bottom-brand-e2e.mjs <url> [baselineURL]` checks the
  default in the browser, a closed STL with the raised logo where expected, middle-drag and touch moving, logo
  switching, older projects, and that with the logo off the STL is byte-identical to a baseline build.

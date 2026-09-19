# Caviot Studio — build 2026.09.19

This PC copy is **build 2026.09.19** (the independent design layers and Undo update). The same build label appears in the app header.

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

Bottom branding: the supplied Design Mainline mark is included, with separate underside and inside-floor starting placements, middle-button dragging, and saved project settings. Both prepared template surfaces now include bottom normals, thickness checks, and opening margins.


## Design layers — September 19

Each side supports multiple images and text, with independent size, placement, image processing, depth and emboss/deboss settings. Select a design on the sleeve or in the design list. A new image prompts Add, Replace selected or Cancel. Link settings pairs the selected front and back designs. The bottom logo has separate depth and finish controls.

Undo/Redo retain up to 40 editing states during the session (Ctrl+Z / Ctrl+Shift+Z); text fields retain normal typing undo. Hide tools collapses the panel into accessible shortcut icons. Version 3 project files save all layers and editable text; older project files still open. Up to 12 design layers are supported per sleeve.

Automatic background detection uses the dominant border color and preserves transparent PNGs. Drop events load once, and the same file can be selected again. Mesh regression checks cover independent emboss/deboss depths and overlapping designs; overlapping different finishes can transition between depths, so inspect the exported mesh in your slicer.

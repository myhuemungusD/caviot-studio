# Sharp text / flat text / top bar: progress (branch sharp-text)

Verification pass recorded October 8. Feature work was already on the branch; this note covers the review fixes and the full green run.

## Done
- [x] Vendor earcut 2.2.4 (ISC) — b38a168
- [x] TextRelief: traced sub-pixel outlines -> closed polygon meshes (flat, curved flat, sleeve 180/360/cap, logo only), self-check + grid fallback — 6fd85e4
- [x] App wiring: preview/export use it for text with Sharp edges; creased normals; status bar — da5917b
- [x] Flat text prints first version (Plate / Outline / Letters only) — e99909f
- [x] Headings removed from left panel; context + #templateStatus in top bar — 06af926
- [x] Merged origin/main with PR #10 (phone phase 1), sw.js regenerated — 185c12e
- [x] Backing options Outline / Rounded rectangle / Connector bar / Solid plate / None; 2 mm letters by default on flat plates — 9563111
- [x] Uniform scale slider under the sizing sliders — 8c2dfe3
- [x] text-relief-e2e.mjs: 83/83 green — bf82b7e
- [x] Phone drawer check (iPhone 14 emulation, touch): backings in All settings, Uniform scale in Size, status in the sheet — all work
- [x] README section
- [x] Review fixes, each with `sw.js` regenerated:
  - 748a09f saved projects omit `textBacking` and `outlineMargin` when they are the defaults (`none`, 2 mm), so a plain sleeve or an image design stays byte-identical
  - 5f7d71e phones cap bent lettering at the phone export budget (700,000 triangles) and refuse an outline backing above 6 million mask pixels, with one toast, then letters only
  - 44bdef2 uniform scale cannot push one side past the template max; the top bar keeps the full design name (CSS ellipsis clips it); backing pills are 44 px on a coarse pointer or a narrow window
- [x] Node tests, one file at a time, on the final tree: all 26 files exited clean. `text-relief-tests.mjs` 131, `tests.mjs` 34, `custom-template-tests.mjs` 37, `custom-template-ui-tests.mjs` 10, `dm-bottom-tests.mjs` 8, `phone-tests.mjs` 9, `pwa-tests.mjs` 6, `fold-tests.mjs` 3, `invert-bg-tests.mjs` 11, `textured-template-tests.mjs` 9, `repair-tests.mjs` 9 regressions plus fine-contour. The rest (`bottom-brand`, `bottom-project`, `check-full-repair`, `contour`, `export-path`, `layer-editor`, `layer-mesh`, `placement`, `rotation`, `sharp`, `side-project`, `sides`, `smooth-contour`, `template`, `wheel-grab`) printed their pass lines with closed meshes where they build one.
- [x] E2E, one suite at a time, Chrome: text-relief 83/83, mobile-phase1 184/184, mobile 131/131 (iPhone 14, iPhone SE, Pixel 7, iPad gen 7), pwa 12/12, template-switch 18/18, bottom-brand 54/54. bottom-brand used a worktree of 4112315 as the logo-off baseline; the STL matched `8baa11180ff3`.
- [x] Desktop default exports byte-identical to main `8160dbf` (1440×900): plain ETSYFOLGER `9c82728f5815ce59`, image emboss `c87796aaed0a6185`, image deboss `f692bfd4560caaed`, saved project `ed1664503c5ffae0`. Text designs differ on purpose.
- [x] Screenshots: FOGER flat plate before (main) and after (branch); each backing; FOGER on the ETSYFOLGER sleeve; uniform scale; top bar; iPhone 14 Size and All settings.

## Not part of this merge
- [ ] Vercel production check
- [ ] Update Jason's PC

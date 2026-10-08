# Phone redesign: Phase 1 progress (branch `mobile-phase1`, NOT merged)

Updated: 2026-10-07 PT. Status: all 8 items done, all suites pass; draft PR open for review.

## Items
| # | Item | Status |
|---|------|--------|
| 1 | Autosave/restore (IndexedDB, 30 MB cap, auto-restore < 12 h, offer up to 14 d, Start new, custom STL never restored: offers re-import) | done, e2e on iPhone 14/SE/Pixel 7 |
| 2 | Add-logo start card (Photos/Camera/Files/Text); Export with an empty sleeve asks (Add logo / plain sleeve / Cancel) | done |
| 3 | Tools sheet: working order, labelled rail, no "NN /" numbers, Import font folder/Trim flat plate/Left-Right hidden, All settings, 46dvh drawer, view shifted so logo stays visible | done |
| 4 | Background Pick on phones (preview in sheet; Pick toggles; Done/Escape/pick ends it) | done |
| 5 | One Front/Back control (toolbar and sheet both select the side and turn the camera) | done |
| 6 | Aspect lock on by default; pinch on the selected logo resizes, twist rotates; camera elsewhere; tablets unchanged | done |
| 7 | Memory guards: STL warn > 600k / block > 1.2M before reading; 120k preview copy; export estimate warns > 700k; 2048 px photos; reload-during-heavy-job banner | done |
| 8 | Export: Share first, Download fallback, per-side relief in the file name | done |

## Test status (branch)
- Node: all 25 suites pass (incl. new `phone-tests.mjs`, 9 checks); main baseline also all pass
- `e2e/mobile-phase1-e2e.mjs`: 184/184 (iPhone 14, iPhone SE, Pixel 7, iPad)
- `e2e/mobile-e2e.mjs`: 164/164 (iPhone 14, SE, Pixel 7, iPad, iPhone 14 landscape)
- `e2e/pwa-e2e.mjs`: 12/12; `e2e/template-switch-e2e.mjs`: 18/18
- `e2e/bottom-brand-e2e.mjs`: 53/54. The one failure compares against a baseline build that has no DM logo; given current main (DM on by default) it fails the same way. A direct check shows the logo-off export is byte-identical on main and the branch (sha 8baa11180ff3)
- Desktop (1440×900): plain, emboss and deboss STL exports and the saved project are byte-identical to main; visible sidebar DOM and labels identical; screenshots identical apart from the animated status dot

## Not in this phase
- Phase 2 items; Paste button; "Save project" in the file-ready sheet

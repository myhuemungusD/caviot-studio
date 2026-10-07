# Phone redesign — Phase 1 progress (branch `mobile-phase1`, not merged)

Updated: 2026-10-07 PT

## Items
| # | Item | Code | e2e |
|---|------|------|-----|
| 1 | Autosave/restore (IndexedDB, 30 MB cap, 12 h auto / 14 d offer, custom STL never restored) | done (`project-store.js`, `phone-ui.js`) | iPhone 14 pass |
| 2 | Add-logo start card (Photos/Camera/Files/Text), guided export when empty | done | iPhone 14 pass |
| 3 | Reordered tools sheet, labelled rail, no section numbers, irrelevant controls hidden, shorter drawer, logo kept visible | done | iPhone 14 pass |
| 4 | Background Pick on phones (tap preview; exits properly) | done | iPhone 14 pass; SE/Pixel re-run pending |
| 5 | One Front/Back control (toolbar ↔ sheet in step) | done | iPhone 14 pass |
| 6 | Aspect lock default, pinch resizes / twist rotates selected logo, camera elsewhere | done | iPhone 14 pass; Pixel re-run pending |
| 7 | Phone memory limits (STL warn 600k / block 1.2M, 120k preview copy, export pre-flight, 2048 px photos, reload notice) | done (fixed preview-cap lookup bug) | re-run pending on Pixel |
| 8 | Export polish (Share first, per-side file names, download fallback) | done | iPhone 14 pass |

## Remaining
- Re-run phase-1 e2e on iPhone SE, Pixel 7, iPad after test-harness tap fixes
- Full node suite + all e2e suites on branch; compare with main baseline (`/tmp/base-node.txt`: all pass)
- Desktop: default ETSYFOLGER emboss export byte-identical to main; desktop screenshot diff
- Before/after screenshots `/workspace/mobile1-*.png`
- README section; self code review; push branch + draft PR (no merge)

## Test status
- `node phone-tests.mjs`: 9/9 pass
- `e2e/mobile-e2e.mjs` (branch): iPhone 14, SE, Pixel 7, iPad, iPhone 14 landscape pass (after updating pinch expectations and waits)
- `e2e/mobile-phase1-e2e.mjs`: iPhone 14 58/58; SE/Pixel had harness-timing failures (taps under sticky header, slow smooth scroll) — fixed in harness, re-run pending

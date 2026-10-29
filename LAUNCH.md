# iCaviot launch brief

## Product promise

Turn your artwork into a physical object, without starting from a blank CAD workspace.

Initial audience: independent 3D-printing makers who customize sleeves and small reliefs. Position this as a focused design utility with fit calibration, not general CAD or a guarantee that device presets fit.

## Launch offer

Original brief (September 2026): personal tool, no subscription, checkout or gated features. Current status (October 29, 2026): published by Design Mainline LLC; iOS 1.0 is in App Review and Android 1.0 is submitted to Google Play, both free. The only paid feature is the iPhone/iPad Caviot Studio Pro export unlock ($9.99 one-time, StoreKit, planned for 1.1); no subscriptions. See the Release status section in README.md.

## Suggested product copy

**Headline:** Your design. A physical thing.

**Short description:** Turn artwork and lettering into custom sleeves and reliefs. Shape it in your browser. Export it for your 3D printer.

**Demonstration:** Add artwork or lettering → set dimensions → export and print a fit ring → adjust fit → export the full model → inspect in a slicer → show the finished print. Record this using actual outputs and a real printer.

## Release gates before a paid public launch

1. Test upload, text, custom fonts, project save/open, STL/OBJ, error recovery and mobile controls in target browsers. Automated code checks are complete; browser interaction testing remains.
2. Print and measure representative half sleeves, whole sleeves, flat reliefs and fit rings. Document tested printer, material, settings and dimensional results.
3. Decide which device profiles to support. Elliptical cavities may not fit objects with flat sides. Replace unverified presets with measured, tested profiles where needed.
4. Done: support contact admin@designmainline.org, business Design Mainline LLC, support and privacy pages at designmainline.com/caviot. Still open: decide public access and domain. Add final terms appropriate to the business and distribution model.
5. If charging, connect a real payment and entitlement flow and test purchase, fulfillment, recovery and refunds. On iPhone/iPad the StoreKit 2 Pro purchase and restore flow is built (PR #51) but the product is not live yet; the website, Mac and Android apps have no payment flow.

## First customer validation

Recruit a small group of makers already producing custom printed accessories. Ask each to complete one design without coaching. Record whether they reach a successful physical print, where they get stuck, and whether they return for a second design. Use actual results before making time-saving, fit or revenue claims.

Potential paid directions to validate: a one-time offline studio license, or a subscription offering genuinely recurring value such as tested profile libraries and cloud project collaboration. Neither model has been validated or implemented here.

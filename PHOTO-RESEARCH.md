# Photo to sleeve: what actually prints

A phone photo is a bad heightmap. On a sleeve a few centimetres wide, a 0.4 mm nozzle (the Creality size this studio is aimed at) cannot draw fur, pores, or a beach. The picture has to be simplified until a person can still tell what it is. This note says what works, what does not, and why the studio does it the way it does.

## The nozzle sets the minimum

A 0.4 mm nozzle lays down a line about 0.4–0.45 mm wide. One line on its own is fragile and often fails to stick or to slice. Two lines, about **0.8 mm**, is the smallest feature that is reliable. Wall-thickness guides from print shops say the same thing: stay at two nozzle widths or more, and treat one nozzle width as a special case, not the default.

- [3D Print Calcs — minimum feature size](https://3dprintcalcs.uk/dimensions-and-scaling/minimum-feature-calculator/) walks the nozzle width up to a practical minimum.
- [Phorm — minimum wall thickness](https://phorm.to/blog/minimum-wall-thickness-3d-printing/) puts the everyday floor at two perimeters.
- A lithophane that is thinner than about 0.8 mm often will not slice. Cura users hit this directly: [Ultimaker/Cura #17679](https://github.com/Ultimaker/Cura/issues/17679).
- [US Lithophane thickness calculator](https://uscalculators.com/3d-printing/lithophane-thickness-calculator/) and the long-running [3dp.rocks lithophane](https://3dp.rocks/lithophane/) both default the thinnest part to **0.8 mm** and the thickest to around **3–3.2 mm**. Past roughly 3.5 mm, white PLA stops letting light through, so extra thickness does not add shades.
- Across a 100 mm panel you only get on the order of 250 extrusion lines ([3D Print Bounty — photo to lithophane](https://3dprintbounty.com/blog/photo-to-3d-printed-lithophane)). Contrast and framing matter more than megapixels.

So every photo style in the studio refuses a feature thinner than 0.8 mm **at the real print size**. A hairline in the photo is thickened or deleted. The line-thickness slider cannot go below 0.8 mm.

## What the existing tools are actually for

**Back-lit lithophanes** (ItsLitho, 3dp.rocks, ImageToSTL) are the wrong primary look for a sleeve. A sleeve is seen by reflected light. A lithophane is a thickness map you hold up to a lamp: dark in the photo becomes thick, bright becomes thin.

- [ItsLitho](https://itslitho.com/) and its [feature list](https://itslitho.com/itslitho-lithophane-features/) are the polished commercial version: crop, contrast, and a thickness range, aimed at a panel in front of a light. Their slicer notes match the 0.8–3 mm band.
- [3dp.rocks](https://3dp.rocks/lithophane/) ([GitHub](https://github.com/MarkDurbin104/3dp.rocks), MIT, about 112 stars, 15 issues) does the same job in the browser. It is still the reference people send beginners to.
- [ImageToSTL](https://github.com/mjouins/ImageToSTL) (MIT, about 166 stars) can also build a side-lit lithophane. Same idea, different light direction.
- A useful roundup of the generators is [labs.tekiela.dk/lithophane-generators](https://labs.tekiela.dk/lithophane-generators/).
- On Reddit, the practical recipe in [r/3Dprinting — lithophane question](https://www.reddit.com/r/3Dprinting/comments/neyv0t/lithophane_question/) is: make it grayscale, clip the histogram, boost contrast, and posterize down to the number of layer steps you can actually print. Dark is thick.

The studio still offers a lithophane style, but only as a **flat-plate thickness map**. It does not change the sleeve wall. The preview stores thickness the same way as the other styles (white sticks out when “Light parts stick out” is on), so a bright part of the photo is stored dark and prints thinner.

**Bambu MakerWorld Relief Sculpture Maker** tries to turn a photo into a relief with a depth model. Makers report that the depth guess falls apart on a busy photo, and that a high-contrast, outlined, or simple grayscale picture works better. It also needs an account, so it cannot run inside this offline studio.

- [Bambu forum — Relief Sculpture Maker is live](https://forum.bambulab.com/t/relief-sculpture-maker-is-live/159645)
- [Skip the CAD — MakerLab Relief Sculpture Maker](https://skipthecad.com/generators/makerlab-relief-sculpture-maker/)
- [3Druck — crop and text updates](https://3druck.com/en/programs/bambu-lab-extends-relief-sculpture-maker-text-tool-and-more-flexible-image-cropping-58149629/)

**Tracing to vectors** (Potrace, Inkscape “trace bitmap”) is the right tool for a logo, which this studio already handles with even-depth silhouettes. It is a poor photo tool: a face becomes a pile of tiny paths the nozzle drops. Potrace is GPL, so it is not vendored here. The nozzle prints a raster of thickened pixels either way.

- [LyraMaker image to STL](https://lyramaker.com/convert/image-to-stl/) uses a Potrace silhouette for logos and a separate lithophane (default about 0.8–3.2 mm). That split matches what we do.
- [r/3Dprinting — line drawings to embossed images](https://www.reddit.com/r/3Dprinting/comments/br4yjp/3d_software_line_drawings_to_3d_embossed_images/) and [raised surface from a 2D image](https://www.reddit.com/r/3Dprinting/comments/1kfhkp1/can_i_3d_print_a_2d_image_as_a_2d_raised_surface/) both land on “trace, then extrude” for line art, and on “keep the strokes thick.”
- [r/3Dprinting — raised mesh from a picture](https://www.reddit.com/r/3Dprinting/comments/1v7b8t2/generating_a_raised_mesh_from_a_picture/) and [flat model from an image](https://www.reddit.com/r/3Dprinting/comments/1vljfuw/looking_to_generate_a_flat_3d_model_from_an_image/) are full of raw heightmaps that look like noise. The replies that work say: crop tight, kill the background, and reduce the picture to a few shapes. One consistent shop-floor rule (repeated on r/3Dprinting and r/functionalprint) is that a printed line should be about two nozzle widths.

**Photoshop Stamp** is a harsh black-and-white edge filter. Alone it makes broken, one-pixel strokes. **Cutout** and a plain posterize are more useful: a handful of flat tones with simple edges. Laser-engraving people use the same posterize / toon step so the tool only has to cut a few levels. A short walkthrough of Cutout versus poster edges is the old [PCWorld piece on the Cutout filter](https://www.pcworld.com/article/524474/photoshop-cutout-filter.html) (levels around 3 or 4, edge simplicity high).

**XDoG** (eXtended Difference of Gaussians, Winnemöller) is the line-art method that survives engraving. Blur the photo twice, subtract, and keep the zero crossings. Then thicken the ink to the tool width. [DoG Studio](https://dougfenstermacher.com/dogpack/) is a practical write-up: the Gaussian has to be tuned to the cutter, or the lines are too fine to engrave.

## The pipeline that fits a sleeve

For reflected light on a small sleeve, the order that keeps the subject recognizable is:

1. **Crop** to the subject and to the sleeve face. Empty background wastes the few strokes you have.
2. **Brightness, contrast, gamma**, then stretch the histogram (clip the darkest and lightest couple of percent). This is the “clip, then boost” step from the lithophane thread, and it helps every other style too.
3. **Bilateral smooth** (Tomasi and Manduchi). A normal blur melts the outline of a face along with the skin texture. Bilateral blur melts texture and keeps the outline. The Detail slider is this: low detail uses a wider, more tolerant blur.
4. **Reduce to a few shapes**, picked by style:
   - **Bold silhouette** — edge-preserving tonal separation, then Otsu. The subject is the tone that covers the middle of the picture, so a head that also touches the frame is still the subject. Gaps in the head are closed. A full-width open is not used, because it eats the head down to a couple of blobs.
   - **Line art** — heavy bilateral smoothing, then only the subject outline and the longest interior edges (eyes, nose, mouth, ear line). Short texture is dropped. At 30 mm wide the budget is about 15 to 25 strokes, then each stroke is thickened to the line width.
   - **3-level relief** — three-means posterize inside the subject, seeded from the 16th, 50th and 84th percentiles, then absorb blobs smaller than the nozzle. The background stays down. While depth is still the 0.4 mm default, choosing this style sets 1.2 mm so the steps are 0.6 mm and 1.2 mm. A depth you set yourself is left alone. Silhouette and line do the same with 0.8 mm.
   - **Smooth gray** — CLAHE mixed back with the photo, so a face is not one flat gray. Depth defaults to 2 mm.
   - **Lithophane** — the same local contrast, inverted into thickness. Depth defaults to 2.2 mm and the plate backing to 0.8 mm, so the plate runs from 0.8 mm to 3 mm. The sleeve wall is not changed.
5. **Morphology** enforces the 0.8 mm floor. Dilate builds the minimum stroke. Open deletes peninsulas the nozzle would drop. Close fills pinholes. Specks smaller than the minimum area are thrown away before they become dust on the print.

The studio warns when the print is too small for the style, and when the conversion had to drop a large share of the fine edges.

## Subject / background

The automatic cut is the region covering the middle of the crop. It grows from the center and stops at edges before it reaches border colors that are not the center color, so a bright sky does not stay raised just because the fur is also light. A head that fills the frame and touches the edges still wins. If that cut cannot find an edge, the tone covering the center is used instead.

Tap the subject flood-fills from that point by color and edge. Swap subject / background flips the mask.

Find subject loads U2-Netp (about 4.4 MB, Apache-2.0) through ONNX Runtime Web 1.18 (one SIMD wasm thread, about 10 MB). Both sit in `dist/vendor/` and are fetched on that click only. They are not precached. A phone in the light memory tier does not load them; it keeps the center cut and the tap. MediaPipe’s selfie segmenter was not used: it is trained on people, and this sleeve also has to cut out a dog.

## HEIC

iPhone photos are often HEIC. Safari can decode them. Other browsers usually cannot. The fallback is [libheif-js 1.23.5](https://github.com/catdad-experiments/libheif-js) (LGPL-3.0), loaded only when a HEIC file arrives. The script and the wasm sit in `dist/vendor/libheif/` as separate files so they can be swapped, and they are not part of the precache (about 1.5 MB of wasm). `SOURCE.txt` next to them says how to replace them. The native decoder is tried first.

## What was not used from X

Live search on X was not available in this environment (the X connection was not signed in). The same conclusions show up in the Reddit threads, the Bambu forum, and the lithophane write-ups linked above. Nothing in those threads argues for printing a raw photo as a heightmap on a 30 mm sleeve.

## What the studio therefore does

| Style | When to use it | What it does |
| --- | --- | --- |
| Bold silhouette | Small sleeve, any subject | One shape, thickened, specks removed |
| Line art | A clear outline (a pet in profile, a building) | XDoG, then strokes at least 0.8 mm |
| 3-level relief | “It should still look like the photo” | Three printable heights |
| Smooth relief | Face or pet, larger print | Gray, texture smoothed, outline kept |
| Lithophane | Flat plate, held to a light | Thickness map, wall unchanged |

Off is the default, so a logo or a plain sleeve still exports the same file as before.

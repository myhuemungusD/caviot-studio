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
   - **Bold silhouette** — edge-preserving tonal separation, then Otsu. The subject is the tone that touches the border least (a light head on a dark field, or the reverse). Gaps in the head are closed. A full-width open is not used, because it eats the head down to a couple of blobs.
   - **Line art** — XDoG, drop islands smaller than the minimum feature, close the gaps, then dilate until every stroke is at least the line thickness.
   - **3-level relief** — three-means posterize, seeded from the 16th, 50th and 84th percentiles, then absorb blobs smaller than the nozzle. The three levels are the plate, half depth and full depth. While depth is still the 0.4 mm default, choosing this style sets 1.2 mm so the steps are 0.6 mm and 1.2 mm. A depth you set yourself is left alone. Silhouette and line do the same with 0.8 mm.
   - **Smooth gray** — the bilateral result, kept as gray. Use it for a face or a pet, and only when the print is large enough (the studio warns under about 50 mm). On a 30 mm sleeve it turns to mud.
   - **Lithophane** — invert the gray into thickness for a flat plate. Not a sleeve-wall change.
5. **Morphology** enforces the 0.8 mm floor. Dilate builds the minimum stroke. Open deletes peninsulas the nozzle would drop. Close fills pinholes. Specks smaller than the minimum area are thrown away before they become dust on the print.

The studio warns when the print is too small for the style, and when the conversion had to drop a large share of the fine edges.

## Subject / background, without a neural net

A clean cutout helps. Two in-browser models were checked and **not** shipped:

- MediaPipe’s selfie segmenter is small on paper (about 450 KB of weights, roughly 100k parameters, Apache-2.0 — [Qualcomm’s copy](https://huggingface.co/qualcomm/MediaPipe-Selfie-Segmentation) and the [model card](https://aihub.qualcomm.com/models/mediapipe_selfie)). The runtime in front of it (MediaPipe Tasks or ONNX Runtime Web, plus WASM) is several megabytes to well over 10 MB. That fights the phone memory limits this app already has.
- U2-Netp is about 4.6 MB of weights, also Apache-2.0 ([BritishWerewolf/U-2-Netp](https://huggingface.co/BritishWerewolf/U-2-Netp)), and it needs that same runtime.

The studio uses a classical cut instead. It looks at the colors on the border, keeps the bins that cover most of that border, and flood-fills inward through those colors. A small open/close cleans the edge. It works when the background touches the edges, which is what the crop box is for. If the subject fills the frame, or the background is as busy as the subject, it gives up and says so. “Focus on subject” is off unless you turn it on.

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

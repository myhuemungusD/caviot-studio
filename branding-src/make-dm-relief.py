"""Build the print relief mask and UI thumbnail for the DM diamond bottom logo.

Source: branding-src/dm-diamond-original.png (gold monoline DM on black, 1254 px).
Outputs (both in dist/branding/):
  dm-diamond-relief.png  8-bit grayscale, black logo on white, 1024 px wide with a 4 px margin,
                         so bottom-brand.js reads it 1:1 (it crops to ink + 4 px and resamples to 1024 columns).
  dm-diamond.png         gold on transparent, 384 px, the panel thumbnail.

Print tuning for the default 16 mm width and a 0.4 mm nozzle:
  * every stroke is thickened evenly to STROKE_MM (the source strokes are about 0.38 mm at 16 mm);
  * separate strokes keep at least GAP_MM between them; thickening is held back near a neighbour, and where the
    source gap is already narrower (the D bowl meeting the M diagonal) the smaller stroke is trimmed back;
  * every stroke stays one continuous piece (checked below).
Run with Python 3 + numpy, scipy, Pillow:  python branding-src/make-dm-relief.py
"""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'dm-diamond-original.png')
OUT = os.path.join(HERE, '..', 'dist', 'branding')
DEFAULT_WIDTH_MM, STROKE_MM, GAP_MM = 16.0, 0.65, 0.5
UP = 4            # work at 4x for round, smooth offsets
COLS, MARGIN = 1024, 4

rgb = np.asarray(Image.open(SRC).convert('RGB')).astype(np.float32) / 255
gray = rgb.max(axis=2)                                   # gold strokes are bright on black
big = np.asarray(Image.fromarray((gray * 255).astype(np.uint8)).resize((gray.shape[1] * UP, gray.shape[0] * UP), Image.BICUBIC)).astype(np.float32) / 255
ink = big > 0.5
ys, xs = np.nonzero(ink)
ink = ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
pad = 200
ink = np.pad(ink, pad)
src_w = xs.max() - xs.min() + 1                          # source ink width in work pixels

def stroke_px(mask):
    dt = ndimage.distance_transform_edt(mask)
    ridge = (dt >= ndimage.maximum_filter(dt, size=3) - 1e-6) & (dt > 2)
    return float(np.median(2 * dt[ridge]))

s0 = stroke_px(ink) / src_w                              # source stroke as a fraction of logo width
target = STROKE_MM / DEFAULT_WIDTH_MM
r_frac = (target - s0) / (2 - 2 * target)                # thickening keeps target after the width grows too
r = r_frac * src_w
gap = GAP_MM / DEFAULT_WIDTH_MM * src_w * (1 + 2 * r_frac)

lab, n = ndimage.label(ink)
comps = [lab == i for i in range(1, n + 1)]
dil = [ndimage.distance_transform_edt(~c) <= r for c in comps]
final = [d.copy() for d in dil]
sizes = [c.sum() for c in comps]
for i in range(n):
    for j in range(i + 1, n):
        small, large = (i, j) if sizes[i] <= sizes[j] else (j, i)
        near = ndimage.distance_transform_edt(~dil[large]) < gap
        if (final[small] & near).any():
            final[small] &= ~near
for i, f in enumerate(final):                            # trimming must not split a stroke
    l, k = ndimage.label(f)
    if k != 1:
        sys.exit('stroke %d split into %d pieces' % (i + 1, k))
mask = np.zeros_like(ink)
for f in final:
    mask |= f
ys, xs = np.nonzero(mask)
mask = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
h, w = mask.shape
inner = COLS - 2 * MARGIN
rows = round(inner * h / w)
cover = np.asarray(Image.fromarray(mask.astype(np.uint8) * 255).resize((inner, rows), Image.BOX)).astype(np.float32) / 255
out = np.full((rows + 2 * MARGIN, COLS), 255, np.uint8)
out[MARGIN:MARGIN + rows, MARGIN:MARGIN + inner] = np.round(255 * (1 - cover)).astype(np.uint8)
Image.fromarray(out, 'L').save(os.path.join(OUT, 'dm-diamond-relief.png'), optimize=True)

# Report at the default width.
px_mm = inner / DEFAULT_WIDTH_MM
binm = cover > 0.5
lab2, n2 = ndimage.label(binm)
dts = [ndimage.distance_transform_edt(lab2 != k) for k in range(1, n2 + 1)]
min_gap = min(dts[a][lab2 == b + 1].min() for a in range(n2) for b in range(a + 1, n2)) / px_mm
print('relief %dx%d, aspect %.4f, strokes %d -> %d pieces, stroke %.2f mm (source %.2f mm), min gap %.2f mm at %g mm wide'
      % (COLS, rows + 2 * MARGIN, rows / inner, n, n2, stroke_px(binm) / px_mm, s0 * DEFAULT_WIDTH_MM, min_gap, DEFAULT_WIDTH_MM))

# Thumbnail: original gold strokes on transparent.
alpha = np.clip((gray - 0.12) / 0.5, 0, 1)
ys, xs = np.nonzero(alpha > 0.05)
crop = slice(ys.min(), ys.max() + 1), slice(xs.min(), xs.max() + 1)
thumb = np.zeros(alpha[crop].shape + (4,), np.uint8)
gold = np.median(rgb[gray > 0.6], axis=0)               # the logo's own gold, flat
thumb[..., :3] = (gold * 255).astype(np.uint8)
thumb[..., 3] = (alpha[crop] * 255).astype(np.uint8)
im = Image.fromarray(thumb, 'RGBA')
im.thumbnail((384, 384), Image.LANCZOS)
im.save(os.path.join(OUT, 'dm-diamond.png'), optimize=True)
print('thumbnail', im.size)

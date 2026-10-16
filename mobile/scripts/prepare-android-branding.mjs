// Builds the Android launcher icons (legacy + adaptive foreground) and splash images from
// dist/branding/icons/icon-512.png on the studio background. Run: npm run assets:android
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(mobileRoot, '..', 'dist', 'branding', 'icons', 'icon-512.png');
const res = path.join(mobileRoot, 'android', 'app', 'src', 'main', 'res');
const background = { r: 16, g: 17, b: 20, alpha: 1 };
const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };

for (const [name, scale] of Object.entries(densities)) {
  const dir = path.join(res, 'mipmap-' + name);
  fs.mkdirSync(dir, { recursive: true });
  const legacy = Math.round(48 * scale);
  const icon = await sharp(source).resize(legacy, legacy, { fit: 'contain', background }).flatten({ background }).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'ic_launcher.png'), icon);
  const round = await sharp(icon).composite([{
    input: Buffer.from(`<svg width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`),
    blend: 'dest-in'
  }]).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'ic_launcher_round.png'), round);
  // Adaptive foreground: 108dp canvas, the mark inside the 66dp safe zone.
  const fg = Math.round(108 * scale);
  const mark = await sharp(source).resize(Math.round(66 * scale), Math.round(66 * scale), { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  const foreground = await sharp({ create: { width: fg, height: fg, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
  fs.writeFileSync(path.join(dir, 'ic_launcher_foreground.png'), foreground);
}

const colors = path.join(res, 'values', 'ic_launcher_background.xml');
fs.writeFileSync(colors, '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#101114</color>\n</resources>\n');

// Pre-Android 12 splash bitmaps (Android 12+ uses the theme's windowSplashScreen* items).
for (const entry of fs.readdirSync(res)) {
  if (!/^drawable(-(land|port)-\w+)?$/.test(entry)) continue;
  const file = path.join(res, entry, 'splash.png');
  if (!fs.existsSync(file)) continue;
  const meta = await sharp(file).metadata();
  const side = Math.round(Math.min(meta.width, meta.height) * 0.32);
  const mark = await sharp(source).resize(side, side, { fit: 'contain', background }).flatten({ background }).png().toBuffer();
  const out = await sharp({ create: { width: meta.width, height: meta.height, channels: 3, background } })
    .composite([{ input: mark, gravity: 'centre' }]).png().toBuffer();
  fs.writeFileSync(file, out);
}
console.log('Wrote Android icons and splash from dist/branding/icons/icon-512.png');

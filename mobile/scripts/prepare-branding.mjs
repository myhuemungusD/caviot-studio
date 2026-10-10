// Builds the iOS app icon and splash from dist/branding. App Store icons cannot have an alpha channel,
// so the mark is flattened onto the studio background.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..');
const source = path.join(repoRoot, 'dist', 'branding', 'icons', 'icon-512.png');
const assets = path.join(mobileRoot, 'ios', 'App', 'App', 'Assets.xcassets');
const background = { r: 16, g: 17, b: 20 };

const icon = await sharp(source).resize(1024, 1024, { fit: 'contain', background }).flatten({ background }).png().toBuffer();
const iconSet = path.join(assets, 'AppIcon.appiconset');
fs.mkdirSync(iconSet, { recursive: true });
for (const name of fs.readdirSync(iconSet)) {
  if (name !== 'Contents.json') fs.rmSync(path.join(iconSet, name));
}
fs.writeFileSync(path.join(iconSet, 'AppIcon.png'), icon);
fs.writeFileSync(path.join(iconSet, 'Contents.json'), JSON.stringify({
  images: [{ filename: 'AppIcon.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
  info: { author: 'xcode', version: 1 }
}, null, 2) + '\n');

const mark = await sharp(source).resize(720, 720, { fit: 'contain', background }).flatten({ background }).png().toBuffer();
const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 3, background }
}).composite([{ input: mark, gravity: 'centre' }]).flatten({ background }).removeAlpha().png().toBuffer();
const splashSet = path.join(assets, 'Splash.imageset');
fs.mkdirSync(splashSet, { recursive: true });
for (const name of fs.readdirSync(splashSet)) {
  if (name !== 'Contents.json') fs.rmSync(path.join(splashSet, name));
}
fs.writeFileSync(path.join(splashSet, 'splash-2732x2732.png'), splash);
fs.writeFileSync(path.join(splashSet, 'Contents.json'), JSON.stringify({
  images: [{ idiom: 'universal', filename: 'splash-2732x2732.png', scale: '1x' }, { idiom: 'universal', scale: '2x' }, { idiom: 'universal', scale: '3x' }],
  info: { author: 'xcode', version: 1 }
}, null, 2) + '\n');

console.log('Wrote app icon and splash from dist/branding/icons/icon-512.png');

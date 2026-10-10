import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(here, '..', '..', 'dist', 'branding', 'icons', 'icon-512.png');
const target = path.resolve(here, '..', 'build', 'icon.png');

if (!fs.existsSync(source)) {
  console.error('App icon is missing:', source);
  process.exit(1);
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
console.log('Icon:', target);

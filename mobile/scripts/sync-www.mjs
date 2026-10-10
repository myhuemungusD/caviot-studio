import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..');

export function injectNativeBridge(html) {
  if (html.includes('caviot-native.js')) return html;
  const withStyle = html.replace('</head>', '<link rel="stylesheet" href="native.css" />\n</head>');
  return withStyle.replace('</body>', '<script type="module" src="caviot-native.js"></script>\n</body>');
}

function copyWebApp() {
  const dist = path.join(repoRoot, 'dist');
  const www = path.join(mobileRoot, 'www');
  const original = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (original.includes('caviot-native.js') || original.includes('native.css')) {
    throw new Error('dist/index.html must stay free of the iOS bridge. The bridge is injected only into mobile/www.');
  }
  fs.rmSync(www, { recursive: true, force: true });
  fs.cpSync(dist, www, { recursive: true });
  for (const file of ['caviot-native.js', 'bridge-logic.js', 'native.css']) {
    fs.copyFileSync(path.join(mobileRoot, 'native', file), path.join(www, file));
  }
  fs.writeFileSync(path.join(www, 'index.html'), injectNativeBridge(original));
  const shipped = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (shipped !== original) throw new Error('sync changed dist/index.html');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) copyWebApp();

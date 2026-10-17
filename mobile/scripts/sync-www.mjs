import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(mobileRoot, '..');

export function injectNativeBridge(html) {
  if (html.includes('caviot-native.js')) return html;
  const flagged = html.replace('<script src="brand-labels.js"></script>', '<script src="native-flags.js"></script>\n<script src="brand-labels.js"></script>');
  if (flagged === html) throw new Error('dist/index.html must load brand-labels.js so the phone build can set neutral labels.');
  const withStyle = flagged.replace('</head>', '<link rel="stylesheet" href="native.css" />\n</head>');
  // Belt and braces for the store builds: drop the vape preset groups from the phone copy's markup too
  // (dist/brand-labels.js also hides them at runtime). Template ids and geometry are untouched.
  const neutral = withStyle.replace(/\s*<optgroup label="Vapes[^"]*">[\s\S]*?<\/optgroup>/g, '')
    .replace(/vapes vary by batch/g, 'sizes vary by batch').replace(/Foger Sleeve/g, 'Classic Sleeve');
  return neutral.replace(
    '</body>',
    '<script src="page-bridge.js"></script>\n<script type="module" src="caviot-native.js"></script>\n</body>'
  );
}

function copyWebApp() {
  const dist = path.join(repoRoot, 'dist');
  const www = path.join(mobileRoot, 'www');
  const original = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (original.includes('caviot-native.js') || original.includes('page-bridge.js') || original.includes('native.css') || original.includes('native-flags.js')) {
    throw new Error('dist/index.html must stay free of the iOS bridge. The bridge is injected only into mobile/www.');
  }
  fs.rmSync(www, { recursive: true, force: true });
  fs.cpSync(dist, www, { recursive: true });
  for (const file of ['caviot-native.js', 'bridge-logic.js', 'page-bridge.js', 'native.css', 'native-flags.js']) {
    fs.copyFileSync(path.join(mobileRoot, 'native', file), path.join(www, file));
  }
  fs.writeFileSync(path.join(www, 'index.html'), injectNativeBridge(original));
  const shipped = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
  if (shipped !== original) throw new Error('sync changed dist/index.html');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) copyWebApp();

// Included fonts: the catalog, files, licenses and offline worker agree, only open licenses ship, and a project or
// remembered choice that names a removed font is detected. Run: node builtin-fonts-tests.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
const dir = 'dist/fonts/',
  catalog = JSON.parse(fs.readFileSync(dir + 'catalog.json', 'utf8'));
const LICENSES = { 'OFL-1.1': /SIL OPEN FONT LICENSE Version 1\.1/i, 'Apache-2.0': /Apache License\s+Version 2\.0/ };
assert.equal(catalog.length, 14, '14 included fonts');
assert.equal(new Set(catalog.map((f) => f.name)).size, catalog.length, 'font names are unique');
assert.equal(new Set(catalog.map((f) => f.family)).size, catalog.length, 'font families are unique');
for (const f of catalog) {
  assert(LICENSES[f.license], f.name + ': license ' + f.license + ' is an allowed open license');
  assert(/^github\.com\/google\/fonts (ofl|apache)\/[a-z0-9]+$/.test(f.source), f.name + ': source is google/fonts');
  assert(fs.existsSync(dir + f.file), f.name + ': font file exists');
  assert(fs.existsSync(dir + f.notice), f.name + ': license file exists');
  assert(LICENSES[f.license].test(fs.readFileSync(dir + f.notice, 'utf8')), f.name + ': license file is the ' + f.license + ' text');
}
// Nothing else ships in dist/fonts: every font file and notice folder belongs to a catalog entry.
const files = fs.readdirSync(dir).filter((n) => /\.(ttf|otf|woff2?)$/i.test(n));
assert.deepEqual(files.sort(), catalog.map((f) => f.file).sort(), 'dist/fonts holds exactly the catalog fonts');
assert.deepEqual(fs.readdirSync(dir + 'notices').sort(), [...new Set(catalog.map((f) => f.notice.split('/')[1]))].sort(), 'one notice folder per font');
// catalog.js (what the page loads) matches catalog.json.
const ctx = {};
vm.runInNewContext(fs.readFileSync(dir + 'catalog.js', 'utf8') + ';this.BUILTIN_FONTS=BUILTIN_FONTS', ctx);
assert.deepEqual(
  JSON.parse(JSON.stringify(ctx.BUILTIN_FONTS.map((f) => [f.name, f.file, f.family]))),
  catalog.map((f) => [f.name, f.file, f.family]),
  'catalog.js matches catalog.json'
);
// The offline worker lists every included font and no other font file.
const sw = fs.readFileSync('dist/sw.js', 'utf8'),
  swFonts = [...new Set([...sw.matchAll(/"fonts\/([^"/]+\.(?:ttf|otf|woff2?))"/gi)].map((m) => m[1]))].sort();
assert.deepEqual(swFonts, catalog.map((f) => f.file).sort(), 'sw.js lists exactly the included fonts');
// No personal-use or brand-named fonts come back by name anywhere the apps load from.
const banned =
  /marlboro|waltograph|simpsonfont|harry ?p\b|nickelodeon|goldeneye|batfont|goonies|game of squids|sin city|findet nemo|breaking bad|blockletter|fat wandals|airstrike|barcade|mashle|krinkes|wanted m54|public enemy nf|most wasted/i;
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? (e.name === 'vendor' ? [] : walk(d + '/' + e.name)) : /\.(js|json|html|css)$/.test(e.name) ? [d + '/' + e.name] : []));
for (const f of walk('dist')) assert(!banned.test(fs.readFileSync(f, 'utf8')), f + ' names a removed font');
// Removed-font detection for opened projects (every project version stores fontChoice per side or layer).
const src = fs.readFileSync('dist/builtin-fonts.js', 'utf8');
const start = src.indexOf('function removedProjectFontNotice'),
  end = src.indexOf('\n', start);
const fn = { BUILTIN_FONTS: ctx.BUILTIN_FONTS };
vm.runInNewContext("const DEFAULT_BUILTIN_FONT='Bebas Neue';" + src.slice(start, end) + ';this.f=removedProjectFontNotice', fn);
const ok = 'builtin:' + catalog[0].file,
  gone = 'builtin:Blockletter-0123abcd.otf';
assert.equal(fn.f({ version: 1, fontChoice: ok }), '');
assert.equal(
  fn.f({ version: 4, layers: [[{ fontChoice: ok }], [{ fontChoice: 'system' }, { fontChoice: '0' }]] }),
  '',
  'included, system and uploaded fonts are fine'
);
assert.match(fn.f({ version: 4, layers: [[{ fontChoice: ok }], [{ fontChoice: gone }]] }), /no longer included\. Using Bebas Neue instead/);
assert.match(fn.f({ version: 2, sides: [{ fontChoice: gone }, null] }), /no longer included/);
assert.equal(fn.f(null), '');
console.log('Included fonts: 14 open-license fonts with matching files, licenses, catalog.js and offline worker; removed-font projects detected.');

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { CONTENT_SECURITY_POLICY, safeFileFromPathname } from '../src/safe-path.js';

export function testSafePath() {
  const root = path.join(os.tmpdir(), 'caviot-safe-path');
  const index = safeFileFromPathname(root, '/');
  assert.equal(index, path.join(root, 'index.html'));
  assert.equal(safeFileFromPathname(root, '/index.html'), path.join(root, 'index.html'));
  assert.equal(safeFileFromPathname(root, '/templates/ETSYFOLGER.stl'), path.join(root, 'templates', 'ETSYFOLGER.stl'));
  assert.equal(safeFileFromPathname(root, '/fonts/'), path.join(root, 'fonts', 'index.html'));
  assert.equal(safeFileFromPathname(root, '/../package.json'), null);
  assert.equal(safeFileFromPathname(root, '/foo/../../etc/passwd'), null);
  assert.equal(safeFileFromPathname(root, '/./index.html'), null);
  assert.equal(safeFileFromPathname(root, '/foo//bar.js'), null);
  assert.equal(safeFileFromPathname(root, '/bad\0file'), null);
  assert.equal(safeFileFromPathname(root, 'index.html'), null);

  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /\*/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /unsafe-eval/);
  assert.doesNotMatch(CONTENT_SECURITY_POLICY, /https?:/);
  assert.match(CONTENT_SECURITY_POLICY, /script-src 'self'/);
  assert.match(CONTENT_SECURITY_POLICY, /worker-src 'self'/);
}

if (process.argv[1] && process.argv[1].endsWith('safe-path.test.mjs')) {
  testSafePath();
  console.log('safe-path: ok');
}

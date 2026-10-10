import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Unpacked studio files when running from a checkout (`desktop/src` → repo `dist`). */
export function devDistRoot() {
  return path.resolve(HERE, '..', '..', 'dist');
}

/**
 * Map a URL pathname onto a file inside `root`.
 * Rejects traversal, empty segments, and NUL bytes. The pathname must already
 * be decoded the way `new URL().pathname` decodes it (once).
 * @param {string} root
 * @param {string} pathname
 * @returns {string | null}
 */
export function safeFileFromPathname(root, pathname) {
  if (typeof root !== 'string' || typeof pathname !== 'string') return null;
  if (pathname.includes('\0') || root.includes('\0')) return null;
  if (!pathname.startsWith('/')) return null;
  let rel = pathname.slice(1);
  if (rel.endsWith('/')) rel += 'index.html';
  if (rel === '') rel = 'index.html';
  const parts = rel.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return null;
  const full = path.resolve(root, ...parts);
  const relative = path.relative(root, full);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
  return full;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.stl': 'model/stl',
  '.mesh': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

export function mimeFor(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

/**
 * No looser than the hosted app, which sends no Content-Security-Policy.
 * The studio is same-origin scripts, inline style attributes, canvas data
 * URLs, blob image URLs, and classic same-origin workers. No eval.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "worker-src 'self'",
  "child-src 'self'",
  "media-src 'self'",
  "manifest-src 'self'",
].join('; ');

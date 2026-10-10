import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol } from 'electron';
import { CONTENT_SECURITY_POLICY, devDistRoot, mimeFor, safeFileFromPathname } from './safe-path.js';

export const SCHEME = 'caviot';
export const HOST = 'studio';
export const ORIGIN = `${SCHEME}://${HOST}`;
export const OPEN_PATH = '/__caviot_desktop_open';

const OPEN_TTL_MS = 60_000;
const MAX_OPEN_BYTES = 100 * 1024 * 1024;

/** @type {Map<string, { filePath: string, name: string, type: string, expires: number }>} */
const pendingOpens = new Map();

export function distRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'dist');
  return devDistRoot();
}

export function registerScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
        allowServiceWorkers: true,
      },
    },
  ]);
}

function securityHeaders(contentType, extra = {}) {
  return {
    'Content-Type': contentType,
    'Content-Security-Policy': CONTENT_SECURITY_POLICY,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    ...extra,
  };
}

function textResponse(status, message) {
  return new Response(message, {
    status,
    headers: securityHeaders('text/plain; charset=utf-8', { 'Cache-Control': 'no-store' }),
  });
}

function sweepOpens() {
  const now = Date.now();
  for (const [token, pending] of pendingOpens) {
    if (pending.expires <= now) pendingOpens.delete(token);
  }
}

/**
 * Hand a user-chosen file to the page through a one-shot same-origin fetch.
 * The bytes stay on disk until the page reads them.
 * @param {string} filePath
 * @param {{ name?: string, type?: string }} [meta]
 */
export function stageOpen(filePath, meta = {}) {
  sweepOpens();
  const token = cryptoRandom();
  pendingOpens.set(token, {
    filePath,
    name: meta.name || path.basename(filePath),
    type: meta.type || 'application/octet-stream',
    expires: Date.now() + OPEN_TTL_MS,
  });
  return token;
}

export function dropOpen(token) {
  if (token) pendingOpens.delete(token);
}

function cryptoRandom() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function serveOpen(url) {
  sweepOpens();
  const token = url.searchParams.get('token') || '';
  const pending = pendingOpens.get(token);
  if (!pending) return textResponse(404, 'Not found');
  pendingOpens.delete(token);
  let stat;
  try {
    stat = await fs.stat(pending.filePath);
  } catch {
    return textResponse(404, 'Not found');
  }
  if (!stat.isFile()) return textResponse(404, 'Not found');
  if (stat.size > MAX_OPEN_BYTES) return textResponse(413, 'File is too large');
  return serveFile(pending.filePath, {
    allowOutside: true,
    headers: {
      'Content-Type': pending.type,
      'Cache-Control': 'no-store',
      'X-Caviot-Name': encodeURIComponent(pending.name),
    },
  });
}

let realRootPromise = null;
function realDistRoot() {
  if (!realRootPromise) {
    realRootPromise = fs.realpath(distRoot()).catch((error) => {
      realRootPromise = null;
      throw error;
    });
  }
  return realRootPromise;
}

function isInside(root, file) {
  const relative = path.relative(root, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function serveFile(filePath, options = {}) {
  const realRoot = await realDistRoot();
  const realFile = await fs.realpath(filePath);
  if (!isInside(realRoot, realFile) && !options.allowOutside) return textResponse(403, 'Forbidden');
  const stat = await fs.stat(realFile);
  if (!stat.isFile()) return textResponse(404, 'Not found');
  if (options.allowOutside && stat.size > MAX_OPEN_BYTES) return textResponse(413, 'File is too large');
  const headers = securityHeaders(mimeFor(realFile), {
    'Content-Length': String(stat.size),
    'Cache-Control': options.headers?.['Cache-Control'] || cacheControl(realFile),
    ...options.headers,
  });
  try {
    const upstream = await net.fetch(pathToFileURL(realFile).href);
    if (!upstream.ok || !upstream.body) {
      const data = await fs.readFile(realFile);
      return new Response(data, { status: 200, headers });
    }
    const merged = new Headers(upstream.headers);
    for (const [key, value] of Object.entries(headers)) merged.set(key, value);
    return new Response(upstream.body, { status: 200, headers: merged });
  } catch (error) {
    console.error('Falling back to a buffered read:', error);
    const data = await fs.readFile(realFile);
    return new Response(data, { status: 200, headers });
  }
}

function cacheControl(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.html' || ext === '.webmanifest') return 'no-cache';
  if (ext === '.ttf' || ext === '.otf' || ext === '.woff' || ext === '.woff2') {
    return 'public, max-age=31536000, immutable';
  }
  return 'no-cache';
}

function resolveRequest(requestUrl) {
  let url;
  try {
    url = new URL(requestUrl);
  } catch {
    return { error: textResponse(400, 'Bad request') };
  }
  if (url.protocol !== `${SCHEME}:` || url.hostname !== HOST || url.port) {
    return { error: textResponse(403, 'Forbidden') };
  }
  if (url.pathname === OPEN_PATH) return { open: url };
  const file = safeFileFromPathname(distRoot(), url.pathname);
  if (!file) return { error: textResponse(403, 'Forbidden') };
  return { file };
}

export function registerProtocol() {
  protocol.handle(SCHEME, async (request) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return textResponse(405, 'Method not allowed');
    }
    try {
      const resolved = resolveRequest(request.url);
      if (resolved.error) return resolved.error;
      if (resolved.open) {
        if (request.method === 'HEAD') return textResponse(404, 'Not found');
        return serveOpen(resolved.open);
      }
      const stat = await fs.stat(resolved.file);
      if (!stat.isFile()) return textResponse(404, 'Not found');
      if (request.method === 'HEAD') {
        return new Response(null, {
          status: 200,
          headers: securityHeaders(mimeFor(resolved.file), {
            'Content-Length': String(stat.size),
            'Cache-Control': cacheControl(resolved.file),
          }),
        });
      }
      return serveFile(resolved.file);
    } catch (error) {
      if (error && error.code === 'ENOENT') return textResponse(404, 'Not found');
      console.error(error);
      return textResponse(500, 'Could not read this file');
    }
  });
}

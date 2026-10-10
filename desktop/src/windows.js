import path from 'node:path';
import { BrowserWindow, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import { distRoot, ORIGIN } from './protocol.js';

const SRC = path.dirname(fileURLToPath(import.meta.url));

export function iconPath() {
  return path.join(distRoot(), 'branding', 'icons', 'icon-512.png');
}

function preloadPath() {
  return path.join(SRC, 'preload.cjs');
}

export function webPreferences() {
  return {
    preload: preloadPath(),
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    experimentalFeatures: false,
    backgroundThrottling: false,
    spellcheck: true,
  };
}

function allowedUrl(url, purpose) {
  if (url.startsWith(`${ORIGIN}/`) && !url.includes('__caviot_desktop_open')) return true;
  if (purpose === 'web' && process.env.CAVIOT_SMOKE === '1') {
    try {
      const parsed = new URL(url);
      const local = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
      return local && (parsed.protocol === 'http:' || parsed.protocol === 'https:');
    } catch {
      return false;
    }
  }
  return false;
}

function attachGuards(win, purpose) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url).catch((error) => console.error(error));
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!allowedUrl(url, purpose)) event.preventDefault();
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    console.error('Renderer stopped:', details.reason);
  });
}

/**
 * @param {string} url
 * @param {{ purpose?: 'studio' | 'web', show?: boolean }} [options]
 */
export function createWindow(url, options = {}) {
  const purpose = options.purpose || 'studio';
  const smoke = process.env.CAVIOT_SMOKE === '1';
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: smoke || options.show === true,
    backgroundColor: '#101114',
    title: 'Caviot Studio',
    autoHideMenuBar: false,
    icon: iconPath(),
    webPreferences: webPreferences(),
  });
  win.caviotRole = purpose;
  attachGuards(win, purpose);
  if (!smoke) {
    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show();
    });
  }
  win.webContents.on('did-fail-load', (_event, code, description, failedUrl, isMainFrame) => {
    if (!isMainFrame || code === -3) return;
    console.error('Failed to load', failedUrl, code, description);
    if (process.env.CAVIOT_SMOKE === '1') return;
    dialog.showMessageBox(win, {
      type: 'error',
      message: 'Caviot Studio could not open the studio files.',
      detail: description,
    }).catch((error) => console.error(error));
  });
  win.loadURL(url).catch((error) => console.error(error));
  return win;
}

export function createStudioWindow() {
  return createWindow(`${ORIGIN}/index.html`, { purpose: 'studio' });
}

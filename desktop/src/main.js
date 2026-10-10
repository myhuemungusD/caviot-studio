import fs from 'node:fs';
import { app, BrowserWindow, dialog, session } from 'electron';
import { attachDownloads } from './downloads.js';
import { configureAbout, installMenu } from './menu.js';
import { deliverFile } from './open-file.js';
import { distRoot, registerProtocol, registerScheme } from './protocol.js';
import { createStudioWindow, createWindow, iconPath } from './windows.js';

registerScheme();

if (process.env.CAVIOT_SMOKE === '1') {
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
  app.commandLine.appendSwitch('disable-font-subpixel-positioning');
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('no-sandbox');
    app.commandLine.appendSwitch('disable-dev-shm-usage');
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    app.commandLine.appendSwitch('enable-unsafe-swiftshader');
  }
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = BrowserWindow.getAllWindows()[0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  if (process.env.CAVIOT_SMOKE === '1') {
    globalThis.__caviotDeliverFile = deliverFile;
  }
}

function localTestUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value);
    const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
    if (local && (url.protocol === 'http:' || url.protocol === 'https:')) return url.href;
  } catch {
    return '';
  }
  console.error('Ignoring CAVIOT_WEB_URL; only a local http(s) URL is allowed.');
  return '';
}

function assertDist() {
  const root = distRoot();
  const index = `${root}/index.html`;
  if (!fs.existsSync(index)) {
    dialog.showErrorBox(
      'Caviot Studio',
      `The studio files are missing (${index}). Reinstall the app.`,
    );
    app.quit();
    return false;
  }
  return true;
}

if (gotLock) app.whenReady().then(() => {
  if (!assertDist()) return;
  app.setName('Caviot Studio');
  configureAbout(iconPath());
  if (process.platform === 'darwin' && app.dock) {
    try {
      app.dock.setIcon(iconPath());
    } catch (error) {
      console.error(error);
    }
  }
  registerProtocol();
  const ses = session.defaultSession;
  const allowedPermission = (permission) => permission === 'clipboard-read' || permission === 'clipboard-sanitized-write';
  ses.setPermissionRequestHandler((_wc, permission, callback) => callback(allowedPermission(permission)));
  ses.setPermissionCheckHandler((_wc, permission) => allowedPermission(permission));
  attachDownloads(ses);
  installMenu();
  createStudioWindow();
  const webUrl = process.env.CAVIOT_SMOKE === '1' ? localTestUrl(process.env.CAVIOT_WEB_URL) : '';
  if (webUrl) createWindow(webUrl, { purpose: 'web' });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createStudioWindow();
  });
}).catch((error) => {
  console.error(error);
  dialog.showErrorBox('Caviot Studio', error instanceof Error ? error.message : String(error));
  app.quit();
});

if (gotLock) {
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin' || process.env.CAVIOT_SMOKE === '1') app.quit();
  });
}

process.on('uncaughtException', (error) => {
  console.error(error);
});

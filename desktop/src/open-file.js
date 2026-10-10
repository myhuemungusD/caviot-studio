import fs from 'node:fs/promises';
import path from 'node:path';
import { dialog } from 'electron';
import { dropOpen, ORIGIN, stageOpen } from './protocol.js';

const KINDS = {
  image: {
    title: 'Open image',
    inputId: 'fileInput',
    limit: 20 * 1024 * 1024,
    tooLarge: 'Images must be 20 MB or smaller.',
    filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif'] }],
  },
  stl: {
    title: 'Open STL template',
    inputId: 'templateStlInput',
    limit: 100 * 1024 * 1024,
    tooLarge: 'STL files must be 100 MB or smaller.',
    filters: [{ name: 'STL mesh', extensions: ['stl'] }],
  },
  project: {
    title: 'Open project',
    inputId: 'projectFile',
    limit: 36 * 1024 * 1024,
    tooLarge: 'Projects must be 36 MB or smaller.',
    filters: [{ name: 'Caviot project', extensions: ['icaviot', 'json'] }],
  },
};

const IMAGE_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
};

function tell(win, options) {
  if (process.env.CAVIOT_SMOKE === '1') {
    console.error(options.message, options.detail || '');
    return Promise.resolve();
  }
  return dialog.showMessageBox(win, options);
}

function kindSpec(kind) {
  const spec = KINDS[kind];
  if (!spec) throw new Error('Unknown open kind: ' + kind);
  return spec;
}

function contentType(kind, filePath) {
  if (kind === 'image') return IMAGE_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  if (kind === 'stl') return 'model/stl';
  if (kind === 'project') return 'application/json';
  throw new Error('Unknown open kind: ' + kind);
}

function injectionScript(token, inputId) {
  const url = JSON.stringify(`${ORIGIN}/__caviot_desktop_open?token=${token}`);
  const id = JSON.stringify(inputId);
  return `(() => fetch(${url}, { cache: 'no-store' }).then(async (res) => {
    if (!res.ok) throw new Error('Could not read the selected file (' + res.status + ')');
    const encoded = res.headers.get('x-caviot-name') || '';
    let name = 'file';
    try { name = decodeURIComponent(encoded) || name; } catch { name = encoded || name; }
    const type = (res.headers.get('content-type') || '').split(';')[0];
    const buf = await res.arrayBuffer();
    const file = new File([buf], name, { type });
    const input = document.getElementById(${id});
    if (!input) throw new Error('The studio is still loading. Try again in a moment.');
    const list = new DataTransfer();
    list.items.add(file);
    input.files = list.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }))()`;
}

/**
 * Show the native open panel and deliver the file to the matching studio input.
 * @param {Electron.BrowserWindow} win
 * @param {'image' | 'stl' | 'project'} kind
 */
export async function openKind(win, kind) {
  const spec = kindSpec(kind);
  const result = await dialog.showOpenDialog(win, {
    title: spec.title,
    properties: ['openFile'],
    filters: spec.filters,
  });
  if (result.canceled || !result.filePaths[0]) return;
  await deliverFile(win, result.filePaths[0], kind);
}

/**
 * Deliver a local file without showing a dialog. Used by the File menu and smoke tests.
 * @param {Electron.BrowserWindow} win
 * @param {string} filePath
 * @param {'image' | 'stl' | 'project'} kind
 */
export async function deliverFile(win, filePath, kind) {
  const spec = kindSpec(kind);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    await tell(win, {
      type: 'error',
      message: 'Could not open that file.',
      detail: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  if (!stat.isFile()) {
    await tell(win, { type: 'warning', message: 'Choose a file.' });
    return;
  }
  if (stat.size > spec.limit) {
    await tell(win, { type: 'warning', message: spec.tooLarge });
    return;
  }
  const token = stageOpen(filePath, {
    name: path.basename(filePath),
    type: contentType(kind, filePath),
  });
  try {
    await win.webContents.executeJavaScript(injectionScript(token, spec.inputId), true);
  } catch (error) {
    dropOpen(token);
    await tell(win, {
      type: 'error',
      message: 'Could not open that file in the studio.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

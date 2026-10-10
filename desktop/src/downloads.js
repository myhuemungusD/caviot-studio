import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog } from 'electron';

let lastDirectory = '';

function documentsDirectory() {
  try {
    return app.getPath('documents');
  } catch {
    return app.getPath('home');
  }
}

function safeFilename(name) {
  const base = path.basename(String(name || '')).replace(/[\u0000-\u001f]/g, '').trim();
  return base || 'caviot-export';
}

function filtersFor(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.stl') return [{ name: 'STL mesh', extensions: ['stl'] }];
  if (ext === '.obj') return [{ name: 'OBJ mesh', extensions: ['obj'] }];
  if (ext === '.icaviot') return [{ name: 'Caviot project', extensions: ['icaviot'] }];
  if (ext === '.json') return [{ name: 'JSON', extensions: ['json'] }];
  return [{ name: 'File', extensions: ['*'] }];
}

function reportSaveError(message, detail) {
  console.error(message, detail || '');
  if (process.env.CAVIOT_SMOKE === '1') return;
  dialog.showMessageBox({ type: 'error', message, detail: detail || '' });
}

function smokeDirectory(webContents) {
  const root = process.env.CAVIOT_EXPORT_DIR;
  if (!root || process.env.CAVIOT_SMOKE !== '1') return null;
  const win = BrowserWindow.fromWebContents(webContents);
  const bucket = win && win.caviotRole === 'web' ? 'web' : 'desktop';
  const dir = path.join(root, bucket);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * STL, OBJ, and project saves use `<a download>`. Electron surfaces those as
 * session downloads; this shows a native save panel and writes the file.
 * @param {Electron.Session} session
 */
export function attachDownloads(session) {
  session.on('will-download', (event, item, webContents) => {
    const filename = safeFilename(item.getFilename());
    const smokeDir = smokeDirectory(webContents);
    let savePath;
    if (smokeDir) {
      savePath = path.join(smokeDir, filename);
    } else {
      const win = BrowserWindow.fromWebContents(webContents) || BrowserWindow.getFocusedWindow() || undefined;
      const directory = lastDirectory || documentsDirectory();
      const chosen = dialog.showSaveDialogSync(win, {
        title: 'Save',
        defaultPath: path.join(directory, filename),
        filters: filtersFor(filename),
      });
      if (!chosen) {
        item.cancel();
        return;
      }
      savePath = chosen;
      const wanted = path.extname(filename).toLowerCase();
      if (wanted && path.extname(savePath).toLowerCase() !== wanted) savePath += wanted;
      lastDirectory = path.dirname(savePath);
    }
    try {
      item.setSavePath(savePath);
    } catch (error) {
      item.cancel();
      reportSaveError('Could not save the file.', error instanceof Error ? error.message : String(error));
      return;
    }
    item.once('done', (_doneEvent, state) => {
      if (process.env.CAVIOT_SMOKE === '1') {
        try {
          fs.writeFileSync(`${savePath}.status`, state);
        } catch (error) {
          console.error(error);
        }
      }
      if (state === 'interrupted') {
        reportSaveError('The export did not finish saving.', path.basename(savePath));
      }
    });
  });
}

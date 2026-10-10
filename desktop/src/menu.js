import { app, BrowserWindow, Menu } from 'electron';
import { openKind } from './open-file.js';

function studioWindow() {
  const windows = BrowserWindow.getAllWindows().filter((win) => {
    if (win.isDestroyed()) return false;
    try {
      return win.webContents.getURL().startsWith('caviot:');
    } catch {
      return false;
    }
  });
  const focused = BrowserWindow.getFocusedWindow();
  if (focused && windows.includes(focused)) return focused;
  return windows[0] || null;
}

async function runInStudio(script) {
  const win = studioWindow();
  if (!win) return;
  try {
    await win.webContents.executeJavaScript(script, true);
  } catch (error) {
    console.error(error);
  }
}

function editCommand(which) {
  const call = which === 'redo' ? 'redoEdit()' : 'undoEdit()';
  return runInStudio(`(() => {
    const target = document.activeElement;
    const typing = !!(target && (target.isContentEditable || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target.type === 'text' || target.type === 'search'))));
    if (typing) {
      document.execCommand(${JSON.stringify(which === 'redo' ? 'redo' : 'undo')});
      return;
    }
    if (typeof ${which === 'redo' ? 'redoEdit' : 'undoEdit'} === 'function') ${call};
  })()`);
}

async function chooseAndOpen(kind) {
  const win = studioWindow();
  if (!win) return;
  try {
    await openKind(win, kind);
  } catch (error) {
    console.error(error);
  }
}

function fileMenu() {
  /** @type {Electron.MenuItemConstructorOptions[]} */
  const items = [
    { label: 'Open Image…', accelerator: 'CmdOrCtrl+O', click: () => chooseAndOpen('image') },
    { label: 'Open STL Template…', accelerator: 'CmdOrCtrl+Shift+O', click: () => chooseAndOpen('stl') },
    { label: 'Open Project…', click: () => chooseAndOpen('project') },
    { type: 'separator' },
    { label: 'Save Project…', accelerator: 'CmdOrCtrl+S', click: () => runInStudio('saveProject()') },
    { label: 'Export STL…', accelerator: 'CmdOrCtrl+E', click: () => runInStudio("exportCurrent('stl')") },
    { label: 'Export OBJ…', click: () => runInStudio("exportCurrent('obj')") },
  ];
  if (process.platform !== 'darwin') {
    items.push({ type: 'separator' }, { role: 'quit' });
  }
  return { label: 'File', submenu: items };
}

function editMenu() {
  return {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => editCommand('undo') },
      { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => editCommand('redo') },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Y',
        visible: false,
        acceleratorWorksWhenHidden: true,
        click: () => editCommand('redo'),
      },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'selectAll' },
    ],
  };
}

function viewMenu() {
  return {
    label: 'View',
    submenu: [
        {
        label: 'Reset View',
        click: () => runInStudio("if (typeof resetView === 'function' && !(document.activeElement && /input|textarea|select/i.test(document.activeElement.tagName))) resetView()"),
      },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' },
      { type: 'separator' },
      { role: 'toggleDevTools' },
    ],
  };
}

function windowMenu() {
  return {
    label: 'Window',
    submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      ...(process.platform === 'darwin' ? [{ type: 'separator' }, { role: 'front' }] : []),
      { role: 'close' },
    ],
  };
}

export function installMenu() {
  const template = [];
  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    });
  }
  template.push(fileMenu(), editMenu(), viewMenu(), windowMenu());
  if (process.platform !== 'darwin') {
    template.push({ label: 'Help', submenu: [{ role: 'about' }] });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

export function configureAbout(iconPath) {
  app.setAboutPanelOptions({
    applicationName: 'Caviot Studio',
    applicationVersion: '2026.09.21',
    version: app.getVersion(),
    copyright: 'Design locally. Export STL or OBJ.',
    credits: 'ETSYFOLGER is the default sleeve. Files in this app are the same build served on the web.',
    iconPath,
  });
}

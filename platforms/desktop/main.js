'use strict';

const { app, BrowserWindow, Menu, shell, session } = require('electron');
const path = require('path');

// Keep the desktop shell deliberately thin: it loads the very same offline web
// app, so the solver, generator, constructor and UI are not reimplemented.
function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 920,
    minWidth: 380,
    minHeight: 620,
    backgroundColor: '#f2f5f7',
    title: 'Sudoku Academy',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  window.loadFile(path.join(__dirname, '..', '..', '.build', 'web', 'index.html'));
  window.once('ready-to-show', () => window.show());

  // No remote content is needed; block navigation and popups.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });

  return window;
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.sudokuacademy.app');
  Menu.setApplicationMenu(null);

  // Photo import can request the camera from the renderer. No other
  // permissions are needed because the app is fully offline.
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media' || permission === 'camera');
  });
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => (
    permission === 'media' || permission === 'camera'
  ));

  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

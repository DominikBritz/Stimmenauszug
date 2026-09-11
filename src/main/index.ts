import { app, BrowserWindow, net, protocol, shell } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { registerIpc } from './ipc';

// Eigenes Schema, damit fetch()/Worker im Produktionsbuild funktionieren (file:// erlaubt kein fetch).
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'Notenwart',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.once('ready-to-show', () => win.show());
  if (process.env.SE_AUTORUN) {
    win.webContents.on('console-message', (event) => {
      const { level, message } = event as unknown as { level: string; message: string };
      if (level === 'warning' || level === 'error') console.log(`[console:${level}]`, message.slice(0, 400));
    });
  }
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadURL('app://-/index.html');
  }
}

app.whenReady().then(() => {
  const rendererRoot = join(__dirname, '../renderer');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/' || pathname === '') pathname = '/index.html';
    const filePath = join(rendererRoot, pathname);
    if (!filePath.startsWith(rendererRoot)) return new Response('forbidden', { status: 403 });
    return net.fetch(pathToFileURL(filePath).toString());
  });

  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

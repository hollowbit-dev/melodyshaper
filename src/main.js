const { app, BrowserWindow, ipcMain, shell, dialog, Menu, nativeTheme, protocol, session, systemPreferences, net } = require('electron');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { pathToFileURL } = require('url');

const IS_MAC = process.platform === 'darwin';
const RENDERER = path.join(__dirname, 'renderer');
const TEST = process.env.MELODY_TEST === '1';
if (process.env.MELODY_USERDATA) app.setPath('userData', process.env.MELODY_USERDATA);
if (process.env.MELODY_FAKE_MIC) {
  app.commandLine.appendSwitch('use-fake-device-for-media-stream');
  app.commandLine.appendSwitch('use-file-for-fake-audio-capture', `${process.env.MELODY_FAKE_MIC}%noloop`);
}
if (TEST) app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// A private secure origin: the microphone, audio worklets and sample loading all need one.
protocol.registerSchemesAsPrivileged([{ scheme: 'melody', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

const TYPES = { '.html': 'text/html', '.css': 'text/css', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json', '.opus': 'audio/ogg', '.png': 'image/png' };
let win = null;
let songPath = null;
const offered = new Set();
let pendingOpen = process.argv.find((a) => a.toLowerCase().endsWith('.melody')) || null;
const autosaveFile = () => path.join(app.getPath('userData'), 'autosave.melody');

function serve() {
  protocol.handle('melody', async (req) => {
    const url = new URL(req.url);
    if (url.host !== 'app') return new Response('Not found', { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
    const file = path.resolve(RENDERER, rel);
    if (!file.startsWith(RENDERER + path.sep) || !fs.existsSync(file)) return new Response('Not found', { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    return new Response(res.body, { headers: { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' } });
  });
  // URL.origin is "null" for custom schemes, so compare the text. The trailing boundary stops look-alike hosts.
  const isApp = (origin) => /^melody:\/\/app(\/|$)/.test(String(origin || ''));
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb, details) => cb((perm === 'media' || perm === 'midi') && isApp(details.requestingUrl || wc.getURL())));
  session.defaultSession.setPermissionCheckHandler((wc, perm, origin) => (perm === 'media' || perm === 'midi') && isApp(origin));
}

function send(channel, data) { if (win && !win.isDestroyed()) win.webContents.send(channel, data); }

function menu() {
  const item = (label, accelerator, action) => ({ label, accelerator, click: () => send('menu', action) });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(IS_MAC ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      item('New Song', 'CmdOrCtrl+N', 'new'), item('Open…', 'CmdOrCtrl+O', 'open'), { type: 'separator' },
      item('Save', 'CmdOrCtrl+S', 'save'), item('Save As…', 'CmdOrCtrl+Shift+S', 'saveAs'), { type: 'separator' },
      item('Export Audio (WAV)…', 'CmdOrCtrl+E', 'wav'), item('Export MP3…', 'CmdOrCtrl+Alt+E', 'mp3'), item('Export Stems…', undefined, 'stems'), item('Export MIDI…', 'CmdOrCtrl+Shift+E', 'midi'),
      ...(IS_MAC ? [] : [{ type: 'separator' }, { role: 'quit' }]),
    ] },
    { label: 'Edit', submenu: [
      item('Undo', 'CmdOrCtrl+Z', 'undo'), item('Redo', 'CmdOrCtrl+Shift+Z', 'redo'), { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, item('Select All', 'CmdOrCtrl+A', 'selectAll'),
    ] },
    { role: 'windowMenu' },
  ]));
}

function create() {
  nativeTheme.themeSource = 'dark';
  win = new BrowserWindow({
    width: 1320, height: 840, minWidth: 1080, minHeight: 680,
    backgroundColor: '#111017',
    titleBarStyle: IS_MAC ? 'hiddenInset' : 'hidden',
    titleBarOverlay: IS_MAC ? undefined : { color: '#111017', symbolColor: '#a9a6b8', height: 52 },
    trafficLightPosition: { x: 16, y: 18 },
    show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  win.once('ready-to-show', () => { if (!process.env.MELODY_HIDDEN) win.show(); });
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('melody://app/')) e.preventDefault(); });
  win.on('closed', () => { win = null; });
  win.loadURL('melody://app/index.html');
}

async function readSong(file) {
  const stat = await fsp.stat(file);
  if (stat.size > 1024 * 1024 * 1024) throw new Error('That file is too large to be a song.');
  const text = await fsp.readFile(file, 'utf8');
  // Save only points here once the song has really opened, so a failed open can't be overwritten.
  offered.add(file);
  return { text, file, name: path.basename(file, path.extname(file)) };
}

async function writeAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  await fsp.writeFile(tmp, data);
  await fsp.rename(tmp, file);
}

const safeName = (n) => String(n || 'My song').replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ').trim().slice(0, 80) || 'My song';

ipcMain.handle('info', () => ({ platform: process.platform, version: app.getVersion(), test: TEST }));
ipcMain.handle('mic-access', async () => {
  if (!IS_MAC || TEST) return true;
  const status = systemPreferences.getMediaAccessStatus('microphone');
  if (status === 'granted') return true;
  if (status === 'not-determined') return systemPreferences.askForMediaAccess('microphone');
  return false;
});
ipcMain.handle('open-mic-settings', () => {
  if (IS_MAC) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone');
  else shell.openExternal('ms-settings:privacy-microphone');
});
ipcMain.handle('song-new', () => { songPath = null; });
ipcMain.handle('song-open', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile'], filters: [{ name: 'Melodyshaper Song', extensions: ['melody'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  return readSong(r.filePaths[0]);
});
ipcMain.handle('song-pending', async () => {
  if (!pendingOpen) return null;
  const f = pendingOpen; pendingOpen = null;
  try { return await readSong(f); } catch { return null; }
});
ipcMain.handle('song-adopt', (e, file) => {
  if (!offered.has(file)) return false;
  offered.clear();
  songPath = file;
  app.addRecentDocument(file);
  return true;
});
ipcMain.handle('confirm-unsaved', async (e, name) => {
  const r = await dialog.showMessageBox(win, {
    type: 'warning', buttons: ['Save', "Don't Save", 'Cancel'], defaultId: 0, cancelId: 2, noLink: true,
    message: `Save changes to "${safeName(name)}"?`, detail: "If you don't save, your changes will be lost.",
  });
  return ['save', 'discard', 'cancel'][r.response];
});
ipcMain.handle('song-save', async (e, { text, name, saveAs }) => {
  let file = songPath;
  if (!file || saveAs) {
    const r = await dialog.showSaveDialog(win, { defaultPath: `${safeName(name)}.melody`, filters: [{ name: 'Melodyshaper Song', extensions: ['melody'] }] });
    if (r.canceled || !r.filePath) return null;
    file = r.filePath;
  }
  await writeAtomic(file, String(text));
  songPath = file;
  app.addRecentDocument(file);
  return { name: path.basename(file, path.extname(file)) };
});
ipcMain.handle('autosave', (e, text) => writeAtomic(autosaveFile(), String(text)).catch(() => {}));
// Runs while the window is closing, so the last edit is on disk before the app goes away.
ipcMain.on('autosave-now', (e, text) => {
  try {
    const file = autosaveFile(), tmp = `${file}.${process.pid}.sync.tmp`;
    fs.writeFileSync(tmp, String(text));
    fs.renameSync(tmp, file);
    e.returnValue = true;
  } catch { e.returnValue = false; }
});
ipcMain.handle('autosave-load', () => fsp.readFile(autosaveFile(), 'utf8').catch(() => null));
ipcMain.handle('export', async (e, { kind, name, bytes }) => {
  const f = { midi: { name: 'MIDI', extensions: ['mid'] }, mp3: { name: 'MP3 Audio', extensions: ['mp3'] } }[kind] || { name: 'WAV Audio', extensions: ['wav'] };
  const r = await dialog.showSaveDialog(win, { defaultPath: `${safeName(name)}.${f.extensions[0]}`, filters: [f] });
  if (r.canceled || !r.filePath) return null;
  await writeAtomic(r.filePath, Buffer.from(bytes));
  return r.filePath;
});
const clipFile = (id) => {
  if (!/^c[a-z0-9]{8,24}$/.test(String(id))) throw new Error('bad clip');
  return path.join(app.getPath('userData'), 'clips', `${id}.pcm`);
};
ipcMain.handle('clip-save', async (e, { id, bytes }) => {
  const f = clipFile(id);
  await fsp.mkdir(path.dirname(f), { recursive: true });
  await writeAtomic(f, Buffer.from(bytes));
});
ipcMain.handle('clip-load', async (e, id) => { try { return new Uint8Array(await fsp.readFile(clipFile(id))); } catch { return null; } });
// Stems: the person picks one folder, and only that folder can be written to.
let stemDir = null;
ipcMain.handle('stem-folder', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose a folder for the stems', properties: ['openDirectory', 'createDirectory'] });
  stemDir = r.canceled ? null : r.filePaths[0] || null;
  return stemDir;
});
ipcMain.handle('stem-write', async (e, { name, bytes }) => {
  if (!stemDir) throw new Error('no folder');
  const file = path.join(stemDir, `${safeName(name)}.wav`);
  await writeAtomic(file, Buffer.from(bytes));
  return file;
});
ipcMain.handle('reveal', (e, file) => { if (typeof file === 'string' && path.isAbsolute(file)) shell.showItemInFolder(file); });

app.on('open-file', (e, file) => {
  e.preventDefault();
  if (win) readSong(file).then((song) => send('open-song', song)).catch(() => {});
  else pendingOpen = file;
});

if (!TEST && !app.requestSingleInstanceLock()) app.quit();
app.on('second-instance', (e, argv) => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
  const f = argv.find((a) => a.toLowerCase().endsWith('.melody'));
  if (f) readSong(f).then((song) => send('open-song', song)).catch(() => {});
});
app.whenReady().then(() => { serve(); menu(); require('./discord-menu').addDiscordMenu(); create(); });
app.on('activate', () => { if (!win) create(); });
app.on('window-all-closed', () => { if (!IS_MAC) app.quit(); });

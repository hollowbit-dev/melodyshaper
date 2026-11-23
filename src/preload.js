const { contextBridge, ipcRenderer } = require('electron');

const call = (ch) => (arg) => ipcRenderer.invoke(ch, arg);
contextBridge.exposeInMainWorld('melody', {
  info: call('info'),
  micAccess: call('mic-access'),
  openMicSettings: call('open-mic-settings'),
  songNew: call('song-new'),
  songOpen: call('song-open'),
  songPending: call('song-pending'),
  songSave: call('song-save'),
  songAdopt: call('song-adopt'),
  confirmUnsaved: call('confirm-unsaved'),
  autosave: call('autosave'),
  autosaveNow: (text) => ipcRenderer.sendSync('autosave-now', text),
  autosaveLoad: call('autosave-load'),
  exportFile: call('export'),
  reveal: call('reveal'),
  clipSave: call('clip-save'),
  clipLoad: call('clip-load'),
  stemFolder: call('stem-folder'),
  stemWrite: call('stem-write'),
  onMenu: (fn) => ipcRenderer.on('menu', (e, action) => fn(action)),
  onOpenSong: (fn) => ipcRenderer.on('open-song', (e, song) => fn(song)),
});

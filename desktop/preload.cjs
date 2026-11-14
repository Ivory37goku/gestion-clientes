const { contextBridge, ipcRenderer } = require('electron');

const DATA_KEY = 'gestion_clientes_data_v1';

try {
  const params = new URL(location.href).searchParams;
  const forceRestore = params.get('nativeRestore') === '1';
  const shadow = ipcRenderer.sendSync('gestionclientes:read-storage-shadow');
  if (shadow) {
    const saved = JSON.parse(shadow);
    if (saved && typeof saved === 'object' && !Array.isArray(saved)
      && (forceRestore || localStorage.getItem(DATA_KEY) === null)) {
      Object.keys(saved).forEach((key) => {
        if (typeof saved[key] === 'string' && key.length < 512
          && (forceRestore || localStorage.getItem(key) === null)) {
          localStorage.setItem(key, saved[key]);
        }
      });
    }
  }
} catch (_) {}

contextBridge.exposeInMainWorld('GestionClientesDesktopBridge', {
  saveLocalStorage: (snapshot) => {
    if (typeof snapshot === 'string' && snapshot.length <= 12 * 1024 * 1024) {
      ipcRenderer.send('gestionclientes:write-storage-shadow', snapshot);
    }
  },
  saveFile: (fileName, mimeType, encoded) => ipcRenderer.invoke('gestionclientes:save-file', fileName, mimeType, encoded)
});

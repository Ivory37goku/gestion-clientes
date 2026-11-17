const { contextBridge, ipcRenderer } = require('electron');

const DATA_KEY = 'gestion_clientes_data_v1';

try {
  const params = new URL(location.href).searchParams;
  const forceRestore = params.get('nativeRestore') === '1';
  const shadow = ipcRenderer.sendSync('gestionclientes:read-storage-shadow');
  if (shadow) {
    const saved = JSON.parse(shadow);
    if (saved && typeof saved === 'object' && !Array.isArray(saved)
      && (forceRestore || needsDataRecovery(saved))) {
      Object.keys(saved).forEach((key) => {
        const dataKeyCanRestore = key === DATA_KEY
          ? isValidDataState(saved[key]) && (forceRestore || needsDataRecovery(saved))
          : forceRestore || localStorage.getItem(key) === null;
        if (typeof saved[key] === 'string' && key.length < 512 && dataKeyCanRestore) {
          localStorage.setItem(key, saved[key]);
        }
      });
    }
  }
} catch (_) {}

function isValidDataState(raw) {
  try {
    const value = JSON.parse(raw);
    return !!value && typeof value === 'object' && !Array.isArray(value)
      && value.version === 1 && value.company && typeof value.company === 'object'
      && ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices'].every((name) => Array.isArray(value[name]))
      && ['leads', 'clients', 'works', 'tasks', 'quotes', 'invoices', 'payments', 'expenses', 'events', 'documents', 'team']
        .every((name) => !Array.isArray(value[name]) || value[name].every((row) => row && typeof row === 'object' && row.id != null));
  } catch (_) { return false; }
}

function needsDataRecovery(snapshot) {
  const raw = localStorage.getItem(DATA_KEY);
  return raw === null || !isValidDataState(raw) && !!(snapshot && isValidDataState(snapshot[DATA_KEY]));
}

contextBridge.exposeInMainWorld('GestionClientesDesktopBridge', {
  saveLocalStorage: (snapshot) => {
    if (typeof snapshot === 'string' && snapshot.length <= 12 * 1024 * 1024) {
      ipcRenderer.send('gestionclientes:write-storage-shadow', snapshot);
    }
  },
  saveFile: (fileName, mimeType, encoded) => ipcRenderer.invoke('gestionclientes:save-file', fileName, mimeType, encoded)
});

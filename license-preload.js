const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('licenseApi', {
    validate : (key) => ipcRenderer.invoke('validate-license', key),
    activate : ()    => ipcRenderer.send('license-activated'),
});

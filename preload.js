const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('aria', {
    expand      : ()         => ipcRenderer.send('expand'),
    collapse    : ()         => ipcRenderer.send('collapse'),
    quit        : ()         => ipcRenderer.send('quit'),
    getSettings : ()         => ipcRenderer.invoke('get-settings'),
    saveSettings: (data)     => ipcRenderer.invoke('save-settings', data),
    dragStart   : (sx, sy)   => ipcRenderer.send('drag-start', { sx, sy }),
    dragMove    : (sx, sy)   => ipcRenderer.send('drag-move',  { sx, sy }),
    dragEnd     : (data)     => ipcRenderer.send('drag-end', data),
    releaseMouse: ()         => ipcRenderer.send('release-mouse'),
    chatStream  : (data)     => ipcRenderer.send('chat-stream', data),
    onChunk     : (cb)       => ipcRenderer.on('chat-chunk',  (_, chunk) => cb(chunk)),
    onDone      : (cb)       => ipcRenderer.once('chat-done', () => cb()),
    onError     : (cb)       => ipcRenderer.once('chat-error', (_, err) => cb(err)),
    openExternal    : (url)  => ipcRenderer.send('open-external', url),
    listHistories   : ()          => ipcRenderer.invoke('list-histories'),
    saveHistory     : (data)      => ipcRenderer.invoke('save-history', data),
    loadHistory     : (title)     => ipcRenderer.invoke('load-history', title),
    deleteHistory   : (title)     => ipcRenderer.invoke('delete-history', title),
    summarizeChat   : (data)      => ipcRenderer.invoke('summarize-chat', data),
    uninstall       : ()     => ipcRenderer.send('uninstall'),
    transcribeAudio : (data) => ipcRenderer.invoke('transcribe-audio', data),
    mouseEnterRobot  : ()    => ipcRenderer.send('mouse-enter-robot'),
    mouseLeaveRobot  : ()    => ipcRenderer.send('mouse-leave-robot'),
    invalidateWindow : ()    => ipcRenderer.send('invalidate-window'),
    offListeners: ()         => {
        ipcRenderer.removeAllListeners('chat-chunk');
        ipcRenderer.removeAllListeners('chat-done');
        ipcRenderer.removeAllListeners('chat-error');
    },
});

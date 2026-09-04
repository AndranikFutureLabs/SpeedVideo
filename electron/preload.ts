import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('api', {
  openVideo: () => ipcRenderer.invoke('dialog:openVideo'),
  getVideoUrl: (filePath: string) => ipcRenderer.invoke('video:getUrl', filePath),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  saveVideo: (defaultName: string) => ipcRenderer.invoke('dialog:saveVideo', defaultName),
  probeVideo: (filePath: string) => ipcRenderer.invoke('video:probe', filePath),
  renderVideo: (inputPath: string, outputPath: string, speedPct: number) =>
    ipcRenderer.invoke('video:render', inputPath, outputPath, speedPct),
  getFfmpegPath: () => ipcRenderer.invoke('ffmpeg:path'),
  onRenderProgress: (callback: (sec: number) => void) => {
    ipcRenderer.on('render:progress', (_e, sec) => callback(sec))
  },
})

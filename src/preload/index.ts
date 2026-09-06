import { contextBridge, ipcRenderer, webUtils } from 'electron';

const api = {
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const wrapped = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, wrapped);
    return () => { ipcRenderer.removeListener(channel, wrapped); };
  },
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  log: (msg: string) => ipcRenderer.send('log', msg),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('api', api);
export type Api = typeof api;

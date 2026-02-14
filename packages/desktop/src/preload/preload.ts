/**
 * Electron preload script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';

// Define the API exposed to the renderer
export interface ElectronAPI {
  selectDirectory: () => Promise<string | null>;
  openExternal: (url: string) => Promise<void>;
  showItemInFolder: (path: string) => Promise<void>;
  getAppVersion: () => Promise<string>;
  getServerUrl: () => Promise<string>;
  getHostToken: () => Promise<string | null>;
}

// Expose the API
contextBridge.exposeInMainWorld('electronAPI', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  showItemInFolder: (path: string) => ipcRenderer.invoke('show-item-in-folder', path),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getServerUrl: () => ipcRenderer.invoke('get-server-url'),
  getHostToken: () => ipcRenderer.invoke('get-host-token'),
} as ElectronAPI);

// Type declaration for the global window object
declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

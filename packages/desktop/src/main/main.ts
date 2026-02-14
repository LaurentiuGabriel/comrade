/**
 * Electron main process
 */

import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn, ChildProcess } from 'child_process';
import { request } from 'http';
import { generateToken } from '@comrade/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let serverHostToken: string = generateToken(32);

const isDev = process.env.NODE_ENV === 'development';

// Check if server is already running
async function isServerRunning(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = request('http://127.0.0.1:8080/health', { method: 'GET', timeout: 2000 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

async function startServer(): Promise<{ success: boolean; error?: string }> {
  return new Promise(async (resolve) => {
    if (serverProcess) {
      console.log('[main] Server already running');
      resolve({ success: true });
      return;
    }

    // Check if server is already running externally
    console.log('[main] Checking if server is already running...');
    const alreadyRunning = await isServerRunning();
    if (alreadyRunning) {
      console.log('[main] ✓ Server is already running on port 8080');
      resolve({ success: true });
      return;
    }

    console.log('[main] Starting Comrade server...');
    console.log('[main] Host token:', serverHostToken.slice(0, 8) + '...');

    // Get the server package directory
    const serverPackageDir = join(__dirname, '../../../server');
    console.log('[main] Server package dir:', serverPackageDir);

    let command: string;
    let args: string[];

    if (isDev) {
      command = 'pnpm';
      args = ['dev'];
    } else {
      command = 'node';
      args = ['dist/cli.js'];
    }

    console.log(`[main] Spawning: ${command} ${args.join(' ')} in ${serverPackageDir}`);
    console.log('[main] COMRADE_HOST_TOKEN:', serverHostToken.slice(0, 8) + '...');

    const spawnEnv = {
      ...process.env,
      FORCE_COLOR: '1',
      COMRADE_HOST_TOKEN: serverHostToken,
    };
    console.log('[main] Spawn env COMRADE_HOST_TOKEN:', spawnEnv.COMRADE_HOST_TOKEN.slice(0, 8) + '...');

    try {
      serverProcess = spawn(command, args, {
        cwd: serverPackageDir,
        stdio: 'pipe',
        shell: true,
        env: spawnEnv,
      });
      console.log('[main] Server process spawned, PID:', serverProcess.pid);
    } catch (error) {
      console.error('[main] ✗ Failed to spawn server process:', error);
      resolve({ success: false, error: String(error) });
      return;
    }

    let serverStarted = false;

    serverProcess.stdout?.on('data', (data) => {
      const output = data.toString();
      console.log('[server]', output.trim());
      
      if (output.includes('running on http://')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log('[main] ✓ Server is ready');
          resolve({ success: true });
        }
      }
    });

    serverProcess.stderr?.on('data', (data) => {
      const output = data.toString();
      console.error('[server error]', output.trim());
      
      if (output.includes('running on http://')) {
        if (!serverStarted) {
          serverStarted = true;
          console.log('[main] ✓ Server is ready (from stderr)');
          resolve({ success: true });
        }
      }
    });

    serverProcess.on('error', (error) => {
      console.error('[main] ✗ Server process error:', error);
      if (!serverStarted) {
        resolve({ success: false, error: String(error) });
      }
    });

    serverProcess.on('exit', (code, signal) => {
      console.log(`[main] Server process exited with code ${code} and signal ${signal}`);
      serverProcess = null;
      if (!serverStarted) {
        resolve({ success: false, error: `Server exited with code ${code}` });
      }
    });

    // Timeout after 20 seconds
    setTimeout(() => {
      if (!serverStarted) {
        console.log('[main] ⚠ Server start timeout');
        resolve({ success: false, error: 'Server failed to start within 20 seconds' });
      }
    }, 20000);
  });
}

async function stopServer(): Promise<void> {
  if (serverProcess) {
    console.log('[main] Stopping server...');
    
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', serverProcess.pid!.toString(), '/T', '/F']);
    } else {
      serverProcess.kill('SIGTERM');
      
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          serverProcess.kill('SIGKILL');
        }
      }, 5000);
    }
    
    serverProcess = null;
  }
}

async function createWindow(): Promise<void> {
  const preloadPath = isDev
    ? join(__dirname, '../../dist/preload/index.mjs')
    : join(__dirname, '../preload/index.mjs');

  console.log('[main] Preload path:', preloadPath);

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    show: false,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  console.log('[main] Loading app...');

  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  console.log('[main] App loaded, showing window...');
  mainWindow.show();
  mainWindow.focus();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// App event handlers
app.whenReady().then(async () => {
  console.log('[main] Electron ready, starting initialization...');
  console.log('[main] Host token generated:', serverHostToken.slice(0, 8) + '...');
  
  try {
    const result = await startServer();
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start server');
    }
    
    console.log('[main] Server ready, creating window...');
    await createWindow();
    console.log('[main] ✓ App is ready');
    
  } catch (error) {
    console.error('[main] ✗ Failed to initialize:', error);
    
    dialog.showErrorBox(
      'Initialization Error',
      `Failed to start Comrade:\n${error}\n\nPlease check:\n1. Port 8080 is not in use\n2. Server package is built (pnpm build:server)\n3. No antivirus is blocking the server`
    );
    
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServer();
});

// IPC handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Workspace Folder',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('open-external', async (_event, url: string) => {
  await shell.openExternal(url);
});

ipcMain.handle('show-item-in-folder', async (_event, path: string) => {
  shell.showItemInFolder(path);
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-server-url', () => {
  return 'http://127.0.0.1:8080';
});

ipcMain.handle('get-host-token', () => {
  return serverHostToken;
});

import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { writeFileSync, existsSync, mkdirSync } from 'fs'
import { WatchdogManager } from './watchdog-manager'
import { LogReader } from './log-reader'
import { WATCHDOG_IPC_CHANNELS, WatchdogConfig } from '../shared/types'

// ============================================================================
// HekaBrain WatchDog v3 - Stable Debugger for Unstable Targets
// ============================================================================

let mainWindow: BrowserWindow | null = null
let watchdogManager: WatchdogManager
let logReader: LogReader

/**
 * Generate the preload script as a .cjs file at runtime.
 * This avoids the ESM/CJS conflict when package.json has "type": "module".
 */
function getPreloadPath(): string {
  const preloadDir = join(app.getPath('userData'), 'watchdog-preload')
  if (!existsSync(preloadDir)) {
    mkdirSync(preloadDir, { recursive: true })
  }

  const preloadPath = join(preloadDir, 'preload-watchdog.cjs')

  // Channel constants - must match WATCHDOG_IPC_CHANNELS in types.ts
  const preloadScript = `"use strict";
const { contextBridge, ipcRenderer } = require("electron");

const CHANNELS = {
  START: "watchdog:start",
  STOP: "watchdog:stop",
  RESTART: "watchdog:restart",
  BUILD_AND_RUN: "watchdog:build-and-run",
  GET_STATUS: "watchdog:get-status",
  GET_CRASH_LOG: "watchdog:get-crash-log",
  CLEAR_CRASH_LOG: "watchdog:clear-crash-log",
  GET_CONFIG: "watchdog:get-config",
  UPDATE_CONFIG: "watchdog:update-config",
  SELECT_EXE: "watchdog:select-exe",
  SELECT_DEV_PATH: "watchdog:select-dev-path",
  GET_LOGS: "watchdog:get-logs",
  CLEAR_LOGS: "watchdog:clear-logs",
  STATUS_CHANGED: "watchdog:status-changed",
  CRASH: "watchdog:crash",
  LOG: "watchdog:log",
  MAX_RESTARTS: "watchdog:max-restarts",
};

contextBridge.exposeInMainWorld("electron", {
  watchdog: {
    start: (mode) => ipcRenderer.invoke(CHANNELS.START, mode),
    stop: () => ipcRenderer.invoke(CHANNELS.STOP),
    restart: () => ipcRenderer.invoke(CHANNELS.RESTART),
    buildAndRun: () => ipcRenderer.invoke(CHANNELS.BUILD_AND_RUN),
    getStatus: () => ipcRenderer.invoke(CHANNELS.GET_STATUS),
    getCrashLog: () => ipcRenderer.invoke(CHANNELS.GET_CRASH_LOG),
    clearCrashLog: () => ipcRenderer.invoke(CHANNELS.CLEAR_CRASH_LOG),
    getConfig: () => ipcRenderer.invoke(CHANNELS.GET_CONFIG),
    updateConfig: (updates) => ipcRenderer.invoke(CHANNELS.UPDATE_CONFIG, updates),
    selectExe: () => ipcRenderer.invoke(CHANNELS.SELECT_EXE),
    selectDevPath: () => ipcRenderer.invoke(CHANNELS.SELECT_DEV_PATH),
    getLogs: (limit, category) => ipcRenderer.invoke(CHANNELS.GET_LOGS, limit, category),
    clearLogs: () => ipcRenderer.invoke(CHANNELS.CLEAR_LOGS),
    onStatusChanged: (callback) => {
      const handler = (_, status) => callback(status);
      ipcRenderer.on(CHANNELS.STATUS_CHANGED, handler);
      return () => ipcRenderer.removeListener(CHANNELS.STATUS_CHANGED, handler);
    },
    onCrash: (callback) => {
      const handler = (_, crash) => callback(crash);
      ipcRenderer.on(CHANNELS.CRASH, handler);
      return () => ipcRenderer.removeListener(CHANNELS.CRASH, handler);
    },
    onLog: (callback) => {
      const handler = (_, entry) => callback(entry);
      ipcRenderer.on(CHANNELS.LOG, handler);
      return () => ipcRenderer.removeListener(CHANNELS.LOG, handler);
    },
    onMaxRestarts: (callback) => {
      const handler = () => callback();
      ipcRenderer.on(CHANNELS.MAX_RESTARTS, handler);
      return () => ipcRenderer.removeListener(CHANNELS.MAX_RESTARTS, handler);
    },
  },
});
`

  writeFileSync(preloadPath, preloadScript, 'utf-8')
  return preloadPath
}

function createWindow(): void {
  const preloadPath = getPreloadPath()
  console.log('[Watchdog] Using preload:', preloadPath)

  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 600,
    minHeight: 400,
    title: 'HekaBrain WatchDog v3',
    icon: join(__dirname, '../../build/icon.ico'),
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
  })

  // Load watchdog renderer
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.webContents.openDevTools()
    mainWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}/watchdog.html`)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/watchdog.html'))
  }

  // Log any load errors
  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error(`[Watchdog] Failed to load: ${errorCode} - ${errorDescription}`)
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[Watchdog] Page loaded successfully')
  })

  mainWindow.webContents.on('console-message', (_event, level, message) => {
    console.log(`[Watchdog Renderer] [${level}] ${message}`)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

function setupManagers(): void {
  watchdogManager = new WatchdogManager()
  logReader = new LogReader()

  // Forward watchdog events to renderer
  watchdogManager.on('status-changed', (status) => {
    mainWindow?.webContents.send(WATCHDOG_IPC_CHANNELS.WATCHDOG_STATUS_CHANGED, status)
  })

  watchdogManager.on('crash', (crash) => {
    mainWindow?.webContents.send(WATCHDOG_IPC_CHANNELS.WATCHDOG_CRASH, crash)
  })

  watchdogManager.on('max_restarts', () => {
    mainWindow?.webContents.send(WATCHDOG_IPC_CHANNELS.WATCHDOG_MAX_RESTARTS)
  })

  // Forward process stdout/stderr to log reader and renderer
  watchdogManager.on('stdout', (text: string) => {
    logReader.addDirectLog(text, 'stdout')
  })

  watchdogManager.on('stderr', (text: string) => {
    logReader.addDirectLog(text, 'stderr')
  })

  // Forward log entries to renderer
  logReader.on('log', (entry) => {
    mainWindow?.webContents.send(WATCHDOG_IPC_CHANNELS.WATCHDOG_LOG, entry)
  })

  // Start file watching
  logReader.startWatching()
}

function registerIpcHandlers(): void {
  // Control
  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_START, async (_event, mode?: string) => {
    await watchdogManager.start(mode as any)
    return watchdogManager.getStatus()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_STOP, async () => {
    await watchdogManager.stop()
    return watchdogManager.getStatus()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_RESTART, async () => {
    await watchdogManager.restart()
    return watchdogManager.getStatus()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_BUILD_AND_RUN, async () => {
    await watchdogManager.buildAndRun()
    return watchdogManager.getStatus()
  })

  // Status
  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_STATUS, () => {
    return watchdogManager.getStatus()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_CRASH_LOG, () => {
    return watchdogManager.getCrashLog()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_CLEAR_CRASH_LOG, () => {
    watchdogManager.clearCrashLog()
    return true
  })

  // Config
  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_CONFIG, () => {
    return watchdogManager.getConfig()
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_UPDATE_CONFIG, async (_event, updates: Partial<WatchdogConfig>) => {
    return await watchdogManager.updateConfig(updates)
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_SELECT_EXE, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Target Executable',
      filters: [{ name: 'Executables', extensions: ['exe'] }],
      properties: ['openFile'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const exePath = result.filePaths[0]
      await watchdogManager.updateConfig({ targetExePath: exePath })
      return exePath
    }
    return null
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_SELECT_DEV_PATH, async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Select Dev Project Folder',
      properties: ['openDirectory'],
    })
    if (!result.canceled && result.filePaths.length > 0) {
      const devPath = result.filePaths[0]
      await watchdogManager.updateConfig({ targetDevPath: devPath })
      return devPath
    }
    return null
  })

  // Logs
  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_LOGS, (_event, limit?: number, category?: string) => {
    return logReader.getLogs(limit, category)
  })

  ipcMain.handle(WATCHDOG_IPC_CHANNELS.WATCHDOG_CLEAR_LOGS, () => {
    logReader.clearLogs()
    return true
  })
}

// ============================================================================
// App Lifecycle
// ============================================================================

app.whenReady().then(async () => {
  setupManagers()
  await watchdogManager.initialize()
  registerIpcHandlers()
  createWindow()
})

app.on('window-all-closed', async () => {
  await watchdogManager.cleanup()
  logReader.cleanup()
  app.quit()
})

app.on('before-quit', async () => {
  await watchdogManager.cleanup()
  logReader.cleanup()
})

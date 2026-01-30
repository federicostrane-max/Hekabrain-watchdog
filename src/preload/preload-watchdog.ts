import { contextBridge, ipcRenderer } from 'electron'
import {
  WATCHDOG_IPC_CHANNELS,
  WatchdogConfig,
  WatchdogStatusInfo,
  WatchdogCrashEntry,
  WatchdogLogEntry,
  WatchdogLaunchMode,
} from '../shared/types'

export interface WatchdogElectronAPI {
  watchdog: {
    // Control
    start: (mode?: WatchdogLaunchMode) => Promise<WatchdogStatusInfo>
    stop: () => Promise<WatchdogStatusInfo>
    restart: () => Promise<WatchdogStatusInfo>
    buildAndRun: () => Promise<WatchdogStatusInfo>

    // Status
    getStatus: () => Promise<WatchdogStatusInfo>
    getCrashLog: () => Promise<WatchdogCrashEntry[]>
    clearCrashLog: () => Promise<boolean>

    // Config
    getConfig: () => Promise<WatchdogConfig>
    updateConfig: (updates: Partial<WatchdogConfig>) => Promise<WatchdogConfig>
    selectExe: () => Promise<string | null>
    selectDevPath: () => Promise<string | null>

    // Logs
    getLogs: (limit?: number, category?: string) => Promise<WatchdogLogEntry[]>
    clearLogs: () => Promise<boolean>

    // Events
    onStatusChanged: (callback: (status: WatchdogStatusInfo) => void) => () => void
    onCrash: (callback: (crash: WatchdogCrashEntry) => void) => () => void
    onLog: (callback: (entry: WatchdogLogEntry) => void) => () => void
    onMaxRestarts: (callback: () => void) => () => void
  }
}

contextBridge.exposeInMainWorld('electron', {
  watchdog: {
    // Control
    start: (mode?: WatchdogLaunchMode) =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_START, mode),
    stop: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_STOP),
    restart: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_RESTART),
    buildAndRun: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_BUILD_AND_RUN),

    // Status
    getStatus: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_STATUS),
    getCrashLog: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_CRASH_LOG),
    clearCrashLog: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_CLEAR_CRASH_LOG),

    // Config
    getConfig: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_CONFIG),
    updateConfig: (updates: Partial<WatchdogConfig>) =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_UPDATE_CONFIG, updates),
    selectExe: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_SELECT_EXE),
    selectDevPath: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_SELECT_DEV_PATH),

    // Logs
    getLogs: (limit?: number, category?: string) =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_GET_LOGS, limit, category),
    clearLogs: () =>
      ipcRenderer.invoke(WATCHDOG_IPC_CHANNELS.WATCHDOG_CLEAR_LOGS),

    // Events
    onStatusChanged: (callback: (status: WatchdogStatusInfo) => void) => {
      const handler = (_: any, status: WatchdogStatusInfo) => callback(status)
      ipcRenderer.on(WATCHDOG_IPC_CHANNELS.WATCHDOG_STATUS_CHANGED, handler)
      return () => ipcRenderer.removeListener(WATCHDOG_IPC_CHANNELS.WATCHDOG_STATUS_CHANGED, handler)
    },
    onCrash: (callback: (crash: WatchdogCrashEntry) => void) => {
      const handler = (_: any, crash: WatchdogCrashEntry) => callback(crash)
      ipcRenderer.on(WATCHDOG_IPC_CHANNELS.WATCHDOG_CRASH, handler)
      return () => ipcRenderer.removeListener(WATCHDOG_IPC_CHANNELS.WATCHDOG_CRASH, handler)
    },
    onLog: (callback: (entry: WatchdogLogEntry) => void) => {
      const handler = (_: any, entry: WatchdogLogEntry) => callback(entry)
      ipcRenderer.on(WATCHDOG_IPC_CHANNELS.WATCHDOG_LOG, handler)
      return () => ipcRenderer.removeListener(WATCHDOG_IPC_CHANNELS.WATCHDOG_LOG, handler)
    },
    onMaxRestarts: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on(WATCHDOG_IPC_CHANNELS.WATCHDOG_MAX_RESTARTS, handler)
      return () => ipcRenderer.removeListener(WATCHDOG_IPC_CHANNELS.WATCHDOG_MAX_RESTARTS, handler)
    },
  },
} as WatchdogElectronAPI)

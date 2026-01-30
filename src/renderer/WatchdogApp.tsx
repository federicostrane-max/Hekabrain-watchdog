import React, { useState, useEffect, useRef, useCallback } from 'react'
import type { WatchdogElectronAPI } from '../preload/preload-watchdog'
import type {
  WatchdogStatusInfo,
  WatchdogConfig,
  WatchdogCrashEntry,
  WatchdogLogEntry,
  WatchdogLaunchMode,
} from '../shared/types'

declare global {
  interface Window {
    electron: { watchdog: WatchdogElectronAPI['watchdog'] }
  }
}

const api = () => {
  if (!window.electron?.watchdog) {
    throw new Error('Watchdog API not available - preload may have failed to load')
  }
  return window.electron.watchdog
}

// ============================================================================
// Status colors and labels
// ============================================================================

const STATUS_STYLES: Record<string, { color: string; bg: string; label: string }> = {
  idle: { color: '#888', bg: '#333', label: 'Idle' },
  running: { color: '#4caf50', bg: '#1b3a1b', label: 'Running' },
  crashed: { color: '#f44336', bg: '#3a1b1b', label: 'Crashed' },
  restarting: { color: '#ff9800', bg: '#3a2e1b', label: 'Restarting...' },
  stopped: { color: '#888', bg: '#333', label: 'Stopped' },
  max_restarts: { color: '#f44336', bg: '#3a1b1b', label: 'Max Restarts' },
}

const LOG_LEVEL_COLORS: Record<string, string> = {
  info: '#8ab4f8',
  warning: '#fdd663',
  error: '#f28b82',
  debug: '#888',
}

const CATEGORY_COLORS: Record<string, string> = {
  console: '#8ab4f8',
  network: '#81c995',
  renderer: '#c58af9',
  security: '#f28b82',
  system: '#fdd663',
  ipc: '#78d9ec',
  performance: '#fcad70',
}

// ============================================================================
// Helper: format bytes
// ============================================================================

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '--'
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function formatUptime(ms: number): string {
  if (ms === 0) return '--'
  const secs = Math.floor(ms / 1000)
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}h ${m}m ${s}s`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

// ============================================================================
// Main App Component
// ============================================================================

export default function WatchdogApp() {
  const [status, setStatus] = useState<WatchdogStatusInfo | null>(null)
  const [config, setConfig] = useState<WatchdogConfig | null>(null)
  const [logs, setLogs] = useState<WatchdogLogEntry[]>([])
  const [crashes, setCrashes] = useState<WatchdogCrashEntry[]>([])
  const [activeTab, setActiveTab] = useState<'logs' | 'crashes' | 'config'>('logs')
  const [logFilter, setLogFilter] = useState<string>('all')
  const [logSearch, setLogSearch] = useState('')
  const [autoScroll, setAutoScroll] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)
  const statusPollRef = useRef<NodeJS.Timeout | null>(null)

  // Initial load
  useEffect(() => {
    const load = async () => {
      try {
        const [s, c, l, cr] = await Promise.all([
          api().getStatus(),
          api().getConfig(),
          api().getLogs(500),
          api().getCrashLog(),
        ])
        setStatus(s)
        setConfig(c)
        setLogs(l)
        setCrashes(cr)
      } catch (err: any) {
        console.error('Failed to initialize WatchdogApp:', err)
        setInitError(err?.message || 'Failed to connect to watchdog backend')
      }
    }
    load()

    // Poll status every 2s
    statusPollRef.current = setInterval(async () => {
      try {
        const s = await api().getStatus()
        setStatus(s)
      } catch { /* ignore */ }
    }, 2000)

    return () => {
      if (statusPollRef.current) clearInterval(statusPollRef.current)
    }
  }, [])

  // Subscribe to events
  useEffect(() => {
    try {
      const unsubStatus = api().onStatusChanged((s) => setStatus(s))
      const unsubCrash = api().onCrash((crash) => {
        setCrashes(prev => [...prev, crash])
      })
      const unsubLog = api().onLog((entry) => {
        setLogs(prev => {
          const next = [...prev, entry]
          return next.length > 2000 ? next.slice(-2000) : next
        })
      })
      const unsubMax = api().onMaxRestarts(() => {
        // Already handled by status change
      })

      return () => {
        unsubStatus()
        unsubCrash()
        unsubLog()
        unsubMax()
      }
    } catch {
      // API not available yet
      return () => {}
    }
  }, [initError])

  // Auto-scroll logs
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  // Handlers
  const handleStart = useCallback(async () => {
    if (!config) return
    await api().start(config.mode)
  }, [config])

  const handleStop = useCallback(async () => {
    await api().stop()
  }, [])

  const handleRestart = useCallback(async () => {
    await api().restart()
  }, [])

  const handleBuildAndRun = useCallback(async () => {
    await api().buildAndRun()
  }, [])

  const handleModeToggle = useCallback(async (mode: WatchdogLaunchMode) => {
    const updated = await api().updateConfig({ mode })
    setConfig(updated)
  }, [])

  const handleSelectExe = useCallback(async () => {
    const path = await api().selectExe()
    if (path) {
      const c = await api().getConfig()
      setConfig(c)
    }
  }, [])

  const handleSelectDevPath = useCallback(async () => {
    const path = await api().selectDevPath()
    if (path) {
      const c = await api().getConfig()
      setConfig(c)
    }
  }, [])

  const handleClearLogs = useCallback(async () => {
    await api().clearLogs()
    setLogs([])
  }, [])

  const handleClearCrashes = useCallback(async () => {
    await api().clearCrashLog()
    setCrashes([])
  }, [])

  const handleUpdateConfig = useCallback(async (updates: Partial<WatchdogConfig>) => {
    const updated = await api().updateConfig(updates)
    setConfig(updated)
  }, [])

  // Filtered logs
  const filteredLogs = logs.filter(l => {
    if (logFilter !== 'all' && l.category !== logFilter) return false
    if (logSearch && !l.message.toLowerCase().includes(logSearch.toLowerCase())) return false
    return true
  })

  const statusStyle = STATUS_STYLES[status?.status || 'idle']

  // Show error if API is not available
  if (initError) {
    return (
      <div style={styles.container}>
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <h1 style={{ color: '#f44336', fontSize: '20px', marginBottom: '16px' }}>
            WatchDog Error
          </h1>
          <p style={{ color: '#ccc', fontSize: '14px', marginBottom: '8px' }}>{initError}</p>
          <p style={{ color: '#888', fontSize: '12px' }}>
            Check that the preload script loaded correctly and the main process is running.
          </p>
          <p style={{ color: '#555', fontSize: '11px', marginTop: '16px' }}>
            window.electron = {String(typeof (window as any).electron)}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleRow}>
          <h1 style={styles.title}>HekaBrain WatchDog</h1>
          <span style={styles.version}>v3</span>
        </div>
      </div>

      {/* Status Bar */}
      <div style={{ ...styles.statusBar, backgroundColor: statusStyle.bg }}>
        <div style={styles.statusLeft}>
          <div style={{ ...styles.statusDot, backgroundColor: statusStyle.color }} />
          <span style={{ ...styles.statusLabel, color: statusStyle.color }}>{statusStyle.label}</span>
          {status?.pid && <span style={styles.statusMeta}>PID: {status.pid}</span>}
          {status && status.uptimeMs > 0 && <span style={styles.statusMeta}>Uptime: {formatUptime(status.uptimeMs)}</span>}
          {status?.memory && <span style={styles.statusMeta}>Mem: {formatBytes(status.memory)}</span>}
        </div>
        <div style={styles.statusRight}>
          <span style={styles.statusMeta}>Crashes: {status?.totalCrashes || 0}</span>
          {status?.healthCheckOk !== undefined && (
            <span style={{ ...styles.statusMeta, color: status.healthCheckOk ? '#4caf50' : '#f44336' }}>
              Health: {status.healthCheckOk ? 'OK' : 'FAIL'}
            </span>
          )}
        </div>
      </div>

      {/* Mode Toggle + Controls */}
      <div style={styles.controlsBar}>
        <div style={styles.modeToggle}>
          <button
            style={{
              ...styles.modeBtn,
              ...(config?.mode === 'dev' ? styles.modeBtnActive : {}),
            }}
            onClick={() => handleModeToggle('dev')}
          >
            Dev Mode
          </button>
          <button
            style={{
              ...styles.modeBtn,
              ...(config?.mode === 'production' ? styles.modeBtnActive : {}),
            }}
            onClick={() => handleModeToggle('production')}
          >
            Production
          </button>
        </div>

        <div style={styles.controlButtons}>
          <button
            style={{ ...styles.btn, ...styles.btnGreen }}
            onClick={handleStart}
            disabled={status?.status === 'running'}
          >
            ▶ Start
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnRed }}
            onClick={handleStop}
            disabled={status?.status !== 'running' && status?.status !== 'restarting'}
          >
            ■ Stop
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnOrange }}
            onClick={handleRestart}
            disabled={status?.status !== 'running'}
          >
            ↻ Restart
          </button>
          <button
            style={{ ...styles.btn, ...styles.btnBlue }}
            onClick={handleBuildAndRun}
            disabled={status?.status === 'running'}
          >
            ⚒ Build+Run
          </button>
        </div>
      </div>

      {/* Target Path Display */}
      <div style={styles.targetPath}>
        <span style={styles.targetLabel}>Target: </span>
        <span style={styles.targetValue}>
          {config?.mode === 'dev'
            ? (config.targetDevPath || 'Not configured')
            : (config?.targetExePath || 'Not configured')
          }
        </span>
        <button
          style={styles.btnSmall}
          onClick={config?.mode === 'dev' ? handleSelectDevPath : handleSelectExe}
        >
          Browse
        </button>
      </div>

      {/* Tabs */}
      <div style={styles.tabs}>
        {(['logs', 'crashes', 'config'] as const).map(tab => (
          <button
            key={tab}
            style={{
              ...styles.tab,
              ...(activeTab === tab ? styles.tabActive : {}),
            }}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'logs' ? `Logs (${filteredLogs.length})` :
             tab === 'crashes' ? `Crashes (${crashes.length})` :
             'Config'}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {activeTab === 'logs' && (
          <LogsPanel
            logs={filteredLogs}
            logFilter={logFilter}
            logSearch={logSearch}
            autoScroll={autoScroll}
            onFilterChange={setLogFilter}
            onSearchChange={setLogSearch}
            onAutoScrollChange={setAutoScroll}
            onClear={handleClearLogs}
            logEndRef={logEndRef}
          />
        )}
        {activeTab === 'crashes' && (
          <CrashesPanel crashes={crashes} onClear={handleClearCrashes} />
        )}
        {activeTab === 'config' && config && (
          <ConfigPanel config={config} onUpdate={handleUpdateConfig} />
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Logs Panel
// ============================================================================

function LogsPanel({
  logs, logFilter, logSearch, autoScroll,
  onFilterChange, onSearchChange, onAutoScrollChange, onClear, logEndRef
}: {
  logs: WatchdogLogEntry[]
  logFilter: string
  logSearch: string
  autoScroll: boolean
  onFilterChange: (f: string) => void
  onSearchChange: (s: string) => void
  onAutoScrollChange: (a: boolean) => void
  onClear: () => void
  logEndRef: React.RefObject<HTMLDivElement>
}) {
  return (
    <div style={styles.panel}>
      <div style={styles.logToolbar}>
        <select
          style={styles.select}
          value={logFilter}
          onChange={e => onFilterChange(e.target.value)}
        >
          <option value="all">All Categories</option>
          <option value="console">Console</option>
          <option value="network">Network</option>
          <option value="renderer">Renderer</option>
          <option value="security">Security</option>
          <option value="system">System</option>
          <option value="ipc">IPC</option>
          <option value="performance">Performance</option>
        </select>
        <input
          style={styles.searchInput}
          placeholder="Search logs..."
          value={logSearch}
          onChange={e => onSearchChange(e.target.value)}
        />
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={e => onAutoScrollChange(e.target.checked)}
          />
          Auto-scroll
        </label>
        <button style={styles.btnSmall} onClick={onClear}>Clear</button>
      </div>
      <div style={styles.logContainer}>
        {logs.length === 0 ? (
          <div style={styles.emptyState}>No logs yet. Start the target to see output.</div>
        ) : (
          logs.map((entry, i) => (
            <div key={i} style={styles.logLine}>
              <span style={styles.logTime}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span style={{
                ...styles.logCategory,
                color: CATEGORY_COLORS[entry.category] || '#888',
              }}>
                [{entry.category}]
              </span>
              <span style={{
                ...styles.logMessage,
                color: LOG_LEVEL_COLORS[entry.level] || '#ccc',
              }}>
                {entry.message}
              </span>
            </div>
          ))
        )}
        <div ref={logEndRef as any} />
      </div>
    </div>
  )
}

// ============================================================================
// Crashes Panel
// ============================================================================

function CrashesPanel({ crashes, onClear }: { crashes: WatchdogCrashEntry[]; onClear: () => void }) {
  return (
    <div style={styles.panel}>
      <div style={styles.logToolbar}>
        <span style={styles.toolbarLabel}>Crash History</span>
        <button style={styles.btnSmall} onClick={onClear}>Clear</button>
      </div>
      <div style={styles.logContainer}>
        {crashes.length === 0 ? (
          <div style={styles.emptyState}>No crashes recorded.</div>
        ) : (
          [...crashes].reverse().map((crash, i) => (
            <div key={i} style={styles.crashCard}>
              <div style={styles.crashHeader}>
                <span style={styles.crashNum}>#{crashes.length - i}</span>
                <span style={styles.crashTime}>
                  {new Date(crash.timestamp).toLocaleString()}
                </span>
                <span style={styles.crashCode}>
                  Exit: {crash.exitCode ?? 'N/A'}
                  {crash.signal && ` | Signal: ${crash.signal}`}
                </span>
                <span style={styles.crashUptime}>
                  Uptime: {formatUptime(crash.uptimeMs)}
                </span>
              </div>
              {crash.stderr && (
                <pre style={styles.crashStderr}>{crash.stderr}</pre>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Config Panel
// ============================================================================

function ConfigPanel({ config, onUpdate }: { config: WatchdogConfig; onUpdate: (u: Partial<WatchdogConfig>) => void }) {
  return (
    <div style={styles.panel}>
      <div style={styles.configGrid}>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Auto Restart</label>
          <input
            type="checkbox"
            checked={config.autoRestart}
            onChange={e => onUpdate({ autoRestart: e.target.checked })}
          />
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Max Restarts</label>
          <input
            type="number"
            style={styles.configInput}
            value={config.maxRestarts}
            min={1}
            max={20}
            onChange={e => onUpdate({ maxRestarts: parseInt(e.target.value) || 5 })}
          />
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Restart Window (min)</label>
          <input
            type="number"
            style={styles.configInput}
            value={Math.round(config.restartWindowMs / 60000)}
            min={1}
            max={30}
            onChange={e => onUpdate({ restartWindowMs: (parseInt(e.target.value) || 5) * 60000 })}
          />
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Health Check Port</label>
          <input
            type="number"
            style={styles.configInput}
            value={config.healthCheckPort}
            min={1024}
            max={65535}
            onChange={e => onUpdate({ healthCheckPort: parseInt(e.target.value) || 3001 })}
          />
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Health Check Interval (s)</label>
          <input
            type="number"
            style={styles.configInput}
            value={Math.round(config.healthCheckIntervalMs / 1000)}
            min={5}
            max={120}
            onChange={e => onUpdate({ healthCheckIntervalMs: (parseInt(e.target.value) || 10) * 1000 })}
          />
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Target Exe Path</label>
          <span style={styles.configValue}>{config.targetExePath || 'Not set'}</span>
        </div>
        <div style={styles.configRow}>
          <label style={styles.configLabel}>Target Dev Path</label>
          <span style={styles.configValue}>{config.targetDevPath || 'Not set'}</span>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// Styles
// ============================================================================

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#0a0a0a',
    color: '#e0e0e0',
    fontFamily: "'Segoe UI', -apple-system, sans-serif",
    fontSize: '13px',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px 8px',
    borderBottom: '1px solid #222',
    WebkitAppRegion: 'drag' as any,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
    color: '#fff',
  },
  version: {
    fontSize: '12px',
    color: '#666',
    fontWeight: 400,
  },
  statusBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid #222',
    transition: 'background-color 0.3s',
  },
  statusLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  statusRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  statusDot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    transition: 'background-color 0.3s',
  },
  statusLabel: {
    fontWeight: 600,
    fontSize: '13px',
  },
  statusMeta: {
    fontSize: '12px',
    color: '#888',
  },
  controlsBar: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 16px',
    borderBottom: '1px solid #222',
    gap: '12px',
  },
  modeToggle: {
    display: 'flex',
    gap: '0',
    borderRadius: '6px',
    overflow: 'hidden',
    border: '1px solid #333',
  },
  modeBtn: {
    padding: '6px 14px',
    background: '#1a1a1a',
    border: 'none',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px',
    transition: 'all 0.2s',
  },
  modeBtnActive: {
    background: '#2196F3',
    color: '#fff',
  },
  controlButtons: {
    display: 'flex',
    gap: '6px',
  },
  btn: {
    padding: '6px 12px',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 500,
    transition: 'opacity 0.2s',
  },
  btnGreen: { background: '#2e7d32', color: '#fff' },
  btnRed: { background: '#c62828', color: '#fff' },
  btnOrange: { background: '#e65100', color: '#fff' },
  btnBlue: { background: '#1565c0', color: '#fff' },
  targetPath: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 16px',
    borderBottom: '1px solid #222',
    fontSize: '12px',
  },
  targetLabel: {
    color: '#888',
    flexShrink: 0,
  },
  targetValue: {
    color: '#aaa',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  btnSmall: {
    padding: '3px 10px',
    background: '#333',
    border: '1px solid #444',
    borderRadius: '3px',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: '11px',
    flexShrink: 0,
  },
  tabs: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid #222',
  },
  tab: {
    padding: '8px 20px',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    color: '#888',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'all 0.2s',
  },
  tabActive: {
    color: '#fff',
    borderBottomColor: '#2196F3',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  panel: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  logToolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: '1px solid #1a1a1a',
    flexShrink: 0,
  },
  toolbarLabel: {
    flex: 1,
    fontWeight: 500,
    color: '#aaa',
  },
  select: {
    padding: '4px 8px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '12px',
  },
  searchInput: {
    flex: 1,
    padding: '4px 8px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '12px',
    outline: 'none',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: '#888',
    cursor: 'pointer',
    flexShrink: 0,
  },
  logContainer: {
    flex: 1,
    overflow: 'auto',
    padding: '4px 0',
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
    fontSize: '12px',
  },
  logLine: {
    display: 'flex',
    gap: '8px',
    padding: '1px 12px',
    lineHeight: '18px',
  },
  logTime: {
    color: '#555',
    flexShrink: 0,
    fontSize: '11px',
  },
  logCategory: {
    flexShrink: 0,
    fontSize: '11px',
    minWidth: '90px',
  },
  logMessage: {
    flex: 1,
    wordBreak: 'break-all',
  },
  emptyState: {
    padding: '40px',
    textAlign: 'center',
    color: '#555',
    fontSize: '14px',
  },
  crashCard: {
    margin: '8px 12px',
    padding: '10px',
    background: '#1a1a1a',
    borderRadius: '6px',
    border: '1px solid #2a2a2a',
  },
  crashHeader: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    marginBottom: '6px',
  },
  crashNum: {
    fontWeight: 700,
    color: '#f44336',
  },
  crashTime: {
    color: '#888',
    fontSize: '12px',
  },
  crashCode: {
    color: '#fdd663',
    fontSize: '12px',
  },
  crashUptime: {
    color: '#888',
    fontSize: '12px',
  },
  crashStderr: {
    margin: '8px 0 0',
    padding: '8px',
    background: '#111',
    borderRadius: '4px',
    fontSize: '11px',
    color: '#f28b82',
    overflow: 'auto',
    maxHeight: '150px',
    whiteSpace: 'pre-wrap',
    fontFamily: "'Cascadia Code', 'Consolas', monospace",
  },
  configGrid: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflow: 'auto',
  },
  configRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  configLabel: {
    width: '180px',
    flexShrink: 0,
    color: '#aaa',
    fontSize: '13px',
  },
  configInput: {
    padding: '4px 8px',
    background: '#1a1a1a',
    border: '1px solid #333',
    borderRadius: '3px',
    color: '#ccc',
    fontSize: '13px',
    width: '100px',
    outline: 'none',
  },
  configValue: {
    color: '#888',
    fontSize: '12px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}

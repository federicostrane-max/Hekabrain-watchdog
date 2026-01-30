import { ChildProcess, spawn, exec } from 'child_process'
import { EventEmitter } from 'events'
import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import * as http from 'http'
import {
  WatchdogConfig,
  WatchdogStatusInfo,
  WatchdogStatusType,
  WatchdogCrashEntry,
  WatchdogLaunchMode
} from '../shared/types'

const CONFIG_DIR = join(homedir(), '.claude-launcher')
const CONFIG_FILE = join(CONFIG_DIR, 'watchdog-config.json')
const CRASH_LOG_FILE = join(CONFIG_DIR, 'watchdog-crashes.json')

const DEFAULT_CONFIG: WatchdogConfig = {
  targetExePath: '',
  targetDevPath: '',
  mode: 'dev',
  autoRestart: true,
  maxRestarts: 5,
  restartWindowMs: 5 * 60 * 1000, // 5 minutes
  healthCheckPort: 3001,
  healthCheckIntervalMs: 10000, // 10 seconds
}

export class WatchdogManager extends EventEmitter {
  private config: WatchdogConfig = { ...DEFAULT_CONFIG }
  private childProcess: ChildProcess | null = null
  private status: WatchdogStatusType = 'idle'
  private pid: number | null = null
  private startTime: number = 0
  private crashLog: WatchdogCrashEntry[] = []
  private recentCrashTimestamps: number[] = []
  private backoffMs: number = 1000
  private restartTimer: NodeJS.Timeout | null = null
  private healthCheckTimer: NodeJS.Timeout | null = null
  private lastHealthCheck: number | null = null
  private healthCheckOk: boolean = false
  private stderrBuffer: string = ''
  private memoryUsage: number | null = null
  private cpuUsage: number | null = null
  private resourceTimer: NodeJS.Timeout | null = null

  constructor() {
    super()
  }

  async initialize(): Promise<void> {
    await this.loadConfig()
    await this.loadCrashLog()
  }

  private async loadConfig(): Promise<void> {
    try {
      if (existsSync(CONFIG_FILE)) {
        const raw = await readFile(CONFIG_FILE, 'utf-8')
        const saved = JSON.parse(raw)
        this.config = { ...DEFAULT_CONFIG, ...saved }
      }
    } catch (err) {
      console.error('[Watchdog] Failed to load config:', err)
    }
  }

  private async saveConfig(): Promise<void> {
    try {
      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true })
      }
      await writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2))
    } catch (err) {
      console.error('[Watchdog] Failed to save config:', err)
    }
  }

  private async loadCrashLog(): Promise<void> {
    try {
      if (existsSync(CRASH_LOG_FILE)) {
        const raw = await readFile(CRASH_LOG_FILE, 'utf-8')
        this.crashLog = JSON.parse(raw)
      }
    } catch (err) {
      console.error('[Watchdog] Failed to load crash log:', err)
    }
  }

  private async saveCrashLog(): Promise<void> {
    try {
      if (!existsSync(CONFIG_DIR)) {
        await mkdir(CONFIG_DIR, { recursive: true })
      }
      await writeFile(CRASH_LOG_FILE, JSON.stringify(this.crashLog, null, 2))
    } catch (err) {
      console.error('[Watchdog] Failed to save crash log:', err)
    }
  }

  getConfig(): WatchdogConfig {
    return { ...this.config }
  }

  async updateConfig(updates: Partial<WatchdogConfig>): Promise<WatchdogConfig> {
    this.config = { ...this.config, ...updates }
    await this.saveConfig()
    return this.getConfig()
  }

  getStatus(): WatchdogStatusInfo {
    return {
      status: this.status,
      mode: this.config.mode,
      exePath: this.config.mode === 'production' ? this.config.targetExePath : this.config.targetDevPath,
      pid: this.pid,
      uptimeMs: this.startTime > 0 ? Date.now() - this.startTime : 0,
      totalCrashes: this.crashLog.length,
      recentCrashes: this.recentCrashTimestamps.length,
      backoffMs: this.backoffMs,
      lastHealthCheck: this.lastHealthCheck,
      healthCheckOk: this.healthCheckOk,
      memory: this.memoryUsage,
      cpu: this.cpuUsage,
    }
  }

  getCrashLog(): WatchdogCrashEntry[] {
    return [...this.crashLog]
  }

  clearCrashLog(): void {
    this.crashLog = []
    this.recentCrashTimestamps = []
    this.saveCrashLog()
  }

  async start(mode?: WatchdogLaunchMode): Promise<void> {
    if (this.status === 'running') {
      console.log('[Watchdog] Already running, ignoring start')
      return
    }

    if (mode) {
      this.config.mode = mode
      await this.saveConfig()
    }

    this.setStatus('running')
    this.startTime = Date.now()
    this.stderrBuffer = ''

    if (this.config.mode === 'dev') {
      await this.startDevMode()
    } else {
      await this.startProductionMode()
    }

    this.startHealthCheck()
    this.startResourceMonitor()
  }

  private async startDevMode(): Promise<void> {
    const devPath = this.config.targetDevPath
    if (!devPath) {
      this.emit('error', 'No dev path configured')
      this.setStatus('stopped')
      return
    }

    console.log('[Watchdog] Starting in dev mode:', devPath)

    // Use npx electron-vite dev
    this.childProcess = spawn('npx', ['electron-vite', 'dev'], {
      cwd: devPath,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HEKABRAIN_API_PORT: String(this.config.healthCheckPort),
        ELECTRON_NO_ATTACH_CONSOLE: '1',
      },
    })

    this.attachProcessListeners()
  }

  private async startProductionMode(): Promise<void> {
    const exePath = this.config.targetExePath
    if (!exePath) {
      this.emit('error', 'No exe path configured')
      this.setStatus('stopped')
      return
    }

    console.log('[Watchdog] Starting in production mode:', exePath)

    this.childProcess = spawn(exePath, [], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        HEKABRAIN_API_PORT: String(this.config.healthCheckPort),
      },
      detached: false,
    })

    this.attachProcessListeners()
  }

  private attachProcessListeners(): void {
    if (!this.childProcess) return

    this.pid = this.childProcess.pid ?? null

    this.childProcess.stdout?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.emit('stdout', text)
    })

    this.childProcess.stderr?.on('data', (data: Buffer) => {
      const text = data.toString()
      this.stderrBuffer += text
      // Keep only last 10KB of stderr
      if (this.stderrBuffer.length > 10240) {
        this.stderrBuffer = this.stderrBuffer.slice(-10240)
      }
      this.emit('stderr', text)
    })

    this.childProcess.on('exit', (code, signal) => {
      console.log(`[Watchdog] Process exited: code=${code}, signal=${signal}`)
      this.onProcessExit(code, signal)
    })

    this.childProcess.on('error', (err) => {
      console.error('[Watchdog] Process error:', err.message)
      this.emit('stderr', `Process error: ${err.message}`)
    })
  }

  private onProcessExit(code: number | null, signal: string | null): void {
    this.stopHealthCheck()
    this.stopResourceMonitor()
    this.pid = null

    const uptimeMs = this.startTime > 0 ? Date.now() - this.startTime : 0

    // Normal exit (code 0 or manual stop)
    if (code === 0 || this.status === 'stopped') {
      this.setStatus('stopped')
      return
    }

    // Crash
    const crash: WatchdogCrashEntry = {
      timestamp: Date.now(),
      exitCode: code,
      signal,
      uptimeMs,
      stderr: this.stderrBuffer.slice(-2048), // last 2KB
    }
    this.crashLog.push(crash)
    this.saveCrashLog()
    this.recentCrashTimestamps.push(Date.now())

    // Clean old crash timestamps outside the window
    const windowStart = Date.now() - this.config.restartWindowMs
    this.recentCrashTimestamps = this.recentCrashTimestamps.filter(t => t > windowStart)

    this.emit('crash', crash)
    this.setStatus('crashed')

    // Check if we should auto-restart
    if (!this.config.autoRestart) {
      return
    }

    if (this.recentCrashTimestamps.length >= this.config.maxRestarts) {
      console.log('[Watchdog] Max restarts reached')
      this.setStatus('max_restarts')
      this.emit('max_restarts')
      return
    }

    // Reset backoff if uptime was > 60s (stable run)
    if (uptimeMs > 60000) {
      this.backoffMs = 1000
    }

    // Schedule restart with backoff
    this.setStatus('restarting')
    console.log(`[Watchdog] Restarting in ${this.backoffMs}ms`)

    this.restartTimer = setTimeout(async () => {
      this.restartTimer = null
      await this.start()
    }, this.backoffMs)

    // Exponential backoff: 1s -> 2s -> 4s -> 8s -> 16s -> max 30s
    this.backoffMs = Math.min(this.backoffMs * 2, 30000)
  }

  async stop(): Promise<void> {
    this.setStatus('stopped')

    if (this.restartTimer) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }

    this.stopHealthCheck()
    this.stopResourceMonitor()

    if (this.childProcess) {
      await this.killProcess()
    }
  }

  async restart(): Promise<void> {
    await this.stop()
    // Reset backoff on manual restart
    this.backoffMs = 1000
    this.recentCrashTimestamps = []
    await this.start()
  }

  async buildAndRun(): Promise<void> {
    const devPath = this.config.targetDevPath
    if (!devPath) {
      this.emit('error', 'No dev path configured')
      return
    }

    await this.stop()
    this.emit('stdout', '=== Building project... ===\n')

    return new Promise((resolve) => {
      const buildProcess = spawn('npx', ['electron-vite', 'build'], {
        cwd: devPath,
        shell: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      })

      buildProcess.stdout?.on('data', (data: Buffer) => {
        this.emit('stdout', data.toString())
      })

      buildProcess.stderr?.on('data', (data: Buffer) => {
        this.emit('stderr', data.toString())
      })

      buildProcess.on('exit', async (code) => {
        if (code === 0) {
          this.emit('stdout', '=== Build complete! Starting... ===\n')
          await this.start('production')
        } else {
          this.emit('stderr', `Build failed with code ${code}\n`)
        }
        resolve()
      })
    })
  }

  private async killProcess(): Promise<void> {
    if (!this.childProcess) return

    return new Promise((resolve) => {
      const proc = this.childProcess!
      const killTimeout = setTimeout(() => {
        try {
          // Force kill if graceful shutdown didn't work
          if (proc.pid) {
            process.kill(proc.pid, 'SIGKILL')
          }
        } catch { /* ignore */ }
        resolve()
      }, 5000)

      proc.once('exit', () => {
        clearTimeout(killTimeout)
        resolve()
      })

      try {
        // Try graceful SIGTERM first
        proc.kill('SIGTERM')
      } catch {
        clearTimeout(killTimeout)
        resolve()
      }

      this.childProcess = null
    })
  }

  private startHealthCheck(): void {
    this.stopHealthCheck()

    this.healthCheckTimer = setInterval(async () => {
      try {
        const ok = await this.doHealthCheck()
        this.healthCheckOk = ok
        this.lastHealthCheck = Date.now()
      } catch {
        this.healthCheckOk = false
        this.lastHealthCheck = Date.now()
      }
    }, this.config.healthCheckIntervalMs)
  }

  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer)
      this.healthCheckTimer = null
    }
  }

  private doHealthCheck(): Promise<boolean> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(false), 5000)

      const req = http.get(
        `http://localhost:${this.config.healthCheckPort}/status`,
        (res) => {
          clearTimeout(timeout)
          resolve(res.statusCode === 200)
        }
      )

      req.on('error', () => {
        clearTimeout(timeout)
        resolve(false)
      })
    })
  }

  private startResourceMonitor(): void {
    this.stopResourceMonitor()

    this.resourceTimer = setInterval(() => {
      if (!this.pid) return

      // Windows: use tasklist to get memory
      exec(`tasklist /FI "PID eq ${this.pid}" /FO CSV /NH`, (err, stdout) => {
        if (err || !stdout.trim()) {
          this.memoryUsage = null
          return
        }
        try {
          // Format: "processname","PID","Session","SessionNum","MemUsage"
          const parts = stdout.trim().split(',')
          if (parts.length >= 5) {
            // Memory is like "123,456 K" - extract number
            const memStr = parts[4]?.replace(/"/g, '').replace(/[^0-9]/g, '') || '0'
            this.memoryUsage = parseInt(memStr) * 1024 // Convert KB to bytes
          }
        } catch {
          this.memoryUsage = null
        }
      })
    }, 5000) // Every 5 seconds
  }

  private stopResourceMonitor(): void {
    if (this.resourceTimer) {
      clearInterval(this.resourceTimer)
      this.resourceTimer = null
    }
    this.memoryUsage = null
    this.cpuUsage = null
  }

  private setStatus(status: WatchdogStatusType): void {
    this.status = status
    this.emit('status-changed', this.getStatus())
  }

  async cleanup(): Promise<void> {
    await this.stop()
  }
}

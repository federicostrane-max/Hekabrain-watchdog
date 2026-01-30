import { EventEmitter } from 'events'
import { stat, readFile } from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { WatchdogLogEntry } from '../shared/types'

const LOG_DIR = join(homedir(), '.hekabrain')

interface WatchedFile {
  path: string
  lastSize: number
  lastModified: number
  category: WatchdogLogEntry['category']
}

export class LogReader extends EventEmitter {
  private watchedFiles: WatchedFile[] = []
  private pollTimer: NodeJS.Timeout | null = null
  private logs: WatchdogLogEntry[] = []
  private maxLogs: number = 5000
  private pollIntervalMs: number = 500

  constructor() {
    super()
  }

  startWatching(): void {
    this.stopWatching()

    // Define files to watch
    this.watchedFiles = [
      {
        path: join(LOG_DIR, 'debug-summary.txt'),
        lastSize: 0,
        lastModified: 0,
        category: 'system' as const,
      },
      {
        path: join(LOG_DIR, 'debug-all.txt'),
        lastSize: 0,
        lastModified: 0,
        category: 'console' as const,
      },
      {
        path: join(LOG_DIR, 'browser-errors.txt'),
        lastSize: 0,
        lastModified: 0,
        category: 'renderer' as const,
      },
    ]

    // Initialize sizes so we only read new content
    this.initializeFileSizes().then(() => {
      this.pollTimer = setInterval(() => this.poll(), this.pollIntervalMs)
    })
  }

  stopWatching(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer)
      this.pollTimer = null
    }
  }

  private async initializeFileSizes(): Promise<void> {
    for (const file of this.watchedFiles) {
      try {
        if (existsSync(file.path)) {
          const s = await stat(file.path)
          file.lastSize = s.size
          file.lastModified = s.mtimeMs
        }
      } catch { /* ignore */ }
    }
  }

  private async poll(): Promise<void> {
    for (const file of this.watchedFiles) {
      try {
        if (!existsSync(file.path)) continue

        const s = await stat(file.path)

        // File was truncated or recreated
        if (s.size < file.lastSize) {
          file.lastSize = 0
        }

        // No new content
        if (s.size === file.lastSize && s.mtimeMs === file.lastModified) continue

        // Read only new bytes
        if (s.size > file.lastSize) {
          const newContent = await this.readFromOffset(file.path, file.lastSize, s.size)
          file.lastSize = s.size
          file.lastModified = s.mtimeMs

          if (newContent) {
            this.processNewContent(newContent, file.category)
          }
        }
      } catch { /* ignore read errors */ }
    }
  }

  private readFromOffset(filePath: string, start: number, end: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      const stream = createReadStream(filePath, { start, end: end - 1 })
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
      stream.on('error', reject)
    })
  }

  private processNewContent(content: string, category: WatchdogLogEntry['category']): void {
    const lines = content.split('\n').filter(line => line.trim())

    for (const line of lines) {
      const entry = this.parseLine(line, category)
      this.logs.push(entry)
      this.emit('log', entry)
    }

    // Trim log buffer
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  private parseLine(line: string, defaultCategory: WatchdogLogEntry['category']): WatchdogLogEntry {
    let level: WatchdogLogEntry['level'] = 'info'
    let category = defaultCategory

    const lower = line.toLowerCase()

    // Detect level
    if (lower.includes('[error]') || lower.includes('error:') || lower.includes('uncaught') || lower.includes('exception')) {
      level = 'error'
    } else if (lower.includes('[warn') || lower.includes('warning')) {
      level = 'warning'
    } else if (lower.includes('[debug]')) {
      level = 'debug'
    }

    // Detect category from content
    if (lower.includes('[network]') || lower.includes('fetch') || lower.includes('http')) {
      category = 'network'
    } else if (lower.includes('[renderer]') || lower.includes('[browser]')) {
      category = 'renderer'
    } else if (lower.includes('[security]') || lower.includes('cors') || lower.includes('csp')) {
      category = 'security'
    } else if (lower.includes('[ipc]')) {
      category = 'ipc'
    } else if (lower.includes('[performance]') || lower.includes('memory') || lower.includes('cpu')) {
      category = 'performance'
    }

    return {
      timestamp: Date.now(),
      level,
      category,
      message: line,
      source: 'file',
    }
  }

  // Add a log entry directly (from stdout/stderr of monitored process)
  addDirectLog(message: string, source: 'stdout' | 'stderr'): void {
    const lines = message.split('\n').filter(line => line.trim())

    for (const line of lines) {
      const entry: WatchdogLogEntry = {
        timestamp: Date.now(),
        level: source === 'stderr' ? 'error' : 'info',
        category: 'console',
        message: line,
        source,
      }

      // Try to detect level from content
      const lower = line.toLowerCase()
      if (source === 'stdout') {
        if (lower.includes('error')) entry.level = 'error'
        else if (lower.includes('warn')) entry.level = 'warning'
        else if (lower.includes('debug')) entry.level = 'debug'
      }

      this.logs.push(entry)
      this.emit('log', entry)
    }

    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs)
    }
  }

  getLogs(limit?: number, category?: string): WatchdogLogEntry[] {
    let filtered = this.logs
    if (category) {
      filtered = filtered.filter(l => l.category === category)
    }
    if (limit) {
      filtered = filtered.slice(-limit)
    }
    return filtered
  }

  clearLogs(): void {
    this.logs = []
  }

  cleanup(): void {
    this.stopWatching()
    this.logs = []
  }
}

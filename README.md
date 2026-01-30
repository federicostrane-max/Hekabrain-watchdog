# HekaBrain WatchDog v3

Process monitor for unstable target applications. Launches, monitors, and auto-restarts crashed processes with exponential backoff.

## Features

- **Process monitoring**: Track PID, uptime, memory usage, health checks
- **Auto-restart**: Exponential backoff (1s -> 2s -> 4s -> ... -> max 30s)
- **Crash persistence**: Crash history saved to `~/.claude-launcher/watchdog-crashes.json` (survives restarts)
- **Log aggregation**: Real-time logs from stdout/stderr and log files
- **Health checks**: HTTP GET to configurable endpoint
- **Dual mode**: Dev mode (electron-vite dev) or Production mode (exe)

## Quick Start

Download `Hekabrain_watchdog_v3.exe` from the `release/` folder and run it.

## Building from Source

```bash
npm install
npm run build
npm run package
```

## Configuration

Saved in `~/.claude-launcher/watchdog-config.json`:

| Setting | Default | Description |
|---------|---------|-------------|
| autoRestart | true | Auto-restart on crash |
| maxRestarts | 5 | Max restarts in time window |
| restartWindowMs | 5 min | Time window for restart limit |
| healthCheckPort | 3001 | Target's health check port |
| healthCheckIntervalMs | 10s | Health check frequency |

## Crash Log

Crashes are persisted to `~/.claude-launcher/watchdog-crashes.json` with:
- Timestamp
- Exit code
- Signal
- Uptime at crash
- Last 2KB of stderr

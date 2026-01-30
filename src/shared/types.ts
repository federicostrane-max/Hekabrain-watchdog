// Shared types between main and renderer

export interface TerminalSession {
  id: string
  projectPath: string
  projectName: string
  sessionName?: string  // Nome descrittivo della sessione (es. firstPrompt)
  folderName?: string   // Nome della cartella in ~/.claude/projects/ per caricare la cronologia
  color: string
  sessionType: 'new' | 'resume'
  claudeSessionId?: string
  status: 'idle' | 'thinking' | 'running'
  launchedAt: number
}

// Question option for AskUserQuestion tool
export interface QuestionOption {
  label: string
  description?: string
}

// Single question from AskUserQuestion
export interface QuestionItem {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

// Data for AskUserQuestion tool
export interface QuestionData {
  questions: QuestionItem[]
  toolUseId: string  // Needed to send response back
}

// Applied rule info (rules that were included in this message)
export interface AppliedRuleInfo {
  ruleId: string
  reason: string
  description: string
}

export interface ParsedMessage {
  type: 'assistant' | 'tool_use' | 'tool_result' | 'system' | 'error' | 'user' | 'text_delta' | 'question' | 'browser_action'
  content: string
  isDiscursive: boolean
  raw?: string
  timestamp: number
  toolName?: string
  toolInput?: any
  questionData?: QuestionData  // Present when type === 'question'
  // Message editing support
  uuid?: string           // Unique identifier from JSONL file
  lineIndex?: number      // Line position in JSONL file for editing
  isEdited?: boolean      // Was this message edited by user
  // Rules reinforcement tracking
  appliedRules?: AppliedRuleInfo[]  // Rules that were applied to this message
  // Browser action metadata (when type === 'browser_action')
  browserAction?: {
    actionType: 'info' | 'action' | 'error' | 'success' | 'warning'
    metadata?: {
      action?: string      // e.g., 'click', 'navigate', 'type'
      target?: string      // e.g., element name, URL
      coordinates?: { x: number; y: number }
      duration?: number    // for wait actions
      screenshot?: string  // base64 screenshot
    }
  }
}

export interface ProcessOutput {
  terminalId: string
  message: ParsedMessage
}

export const TERMINAL_COLORS = [
  '#2196F3', // Blue
  '#FF9800', // Orange
  '#9C27B0', // Purple
  '#009688', // Teal
  '#E91E63', // Pink
  '#FFEB3B', // Yellow
  '#00BCD4', // Cyan
  '#795548', // Brown
]

// Screenshot/File types
export interface ScreenshotFile {
  id: string
  path: string
  thumbnail?: string  // Base64 data URL
  name: string
  size: number
}

export interface UploadedFile {
  id: string
  path: string
  name: string
  size: number
}

// Claude session info (from sessions-index.json)
export interface ClaudeSession {
  id: string           // sessionId UUID
  filename: string     // full filename
  lastModified: number
  size: number
  firstPrompt?: string // Primo messaggio come nome della sessione
  messageCount?: number
  created?: string
  projectPath?: string // Path reale del progetto
  todos?: Todo[]       // Task list from TodoWrite tool
  currentTodoId?: string // Current active todo
}

export interface Todo {
  id: string
  content: string      // Imperative form (e.g., "Run tests")
  activeForm: string   // Present continuous form (e.g., "Running tests")
  status: 'pending' | 'in_progress' | 'completed'
}

// Rules reinforcement stats
export interface RulesStats {
  totalRules: number
  criticalRules: number
  contextRules: number
}

// Voice transcription result
export interface TranscriptionResult {
  text?: string
  language?: string
  error?: string
  success: boolean
}

// Browser log entry
export interface BrowserLog {
  timestamp: number
  type: 'log' | 'warning' | 'error' | 'info' | 'debug'
  source: 'console' | 'network' | 'exception'
  message: string
  url?: string
  lineNumber?: number
  columnNumber?: number
  stackTrace?: string
  sessionId?: string
}

// Browser log filter
export interface BrowserLogFilter {
  type?: BrowserLog['type'][]
  source?: BrowserLog['source'][]
  since?: number
  limit?: number
  search?: string
}

// Clawdbot message for popup (legacy, kept for compatibility)
export interface ClawdbotMessage {
  timestamp: number
  type: 'info' | 'action' | 'error' | 'success'
  text: string
  sessionId: string
}

// Generic Tool Message for multi-tool popup system
export type ToolType = 'clawdbot' | 'lux' | 'browser' | 'custom'

export interface ToolMessage {
  timestamp: number
  type: 'info' | 'action' | 'error' | 'success' | 'warning'
  text: string
  sessionId: string
  tool: ToolType
  // Optional metadata for tool-specific info
  metadata?: {
    action?: string      // e.g., 'click', 'navigate', 'type'
    target?: string      // e.g., element name, URL
    coordinates?: { x: number; y: number }
    duration?: number    // for wait actions
    screenshot?: string  // base64 screenshot
  }
}

// Tool configuration for popup display
export interface ToolConfig {
  id: ToolType
  name: string
  icon: string          // SVG path or emoji
  color: string         // Primary color for the popup
  description: string
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Main -> Renderer
  TERMINAL_OUTPUT: 'terminal:output',
  TERMINAL_STATUS: 'terminal:status',
  TERMINAL_LIST: 'terminal:list',
  TERMINAL_QUESTION: 'terminal:question',  // AskUserQuestion from Claude
  CLAWDBOT_MESSAGE: 'clawdbot:message',    // Clawdbot navigation messages for popup
  TOOL_MESSAGE: 'tool:message',            // Generic tool messages for multi-tool popup system

  // Renderer -> Main
  TERMINAL_SPAWN: 'terminal:spawn',
  TERMINAL_KILL: 'terminal:kill',
  TERMINAL_INPUT: 'terminal:input',
  TERMINAL_GET_LIST: 'terminal:get-list',
  TERMINAL_RENAME: 'terminal:rename',
  TERMINAL_ANSWER_QUESTION: 'terminal:answer-question',  // User answer to question
  TERMINAL_STOP: 'terminal:stop',  // Stop current execution (ESC key)

  // Projects
  PROJECTS_LIST: 'projects:list',
  PROJECTS_GET_SESSIONS: 'projects:get-sessions',

  // Todos
  GET_SESSION_TODOS: 'todos:get-session',
  TODOS_UPDATED: 'todos:updated',

  // Recovery
  RECOVERY_GET_CHECKPOINTS: 'recovery:get-checkpoints',
  RECOVERY_RESUME_SESSION: 'recovery:resume-session',
  RECOVERY_IGNORE_CHECKPOINT: 'recovery:ignore-checkpoint',
  RECOVERY_MARK_COMPLETED: 'recovery:mark-completed',
  RECOVERY_GET_SETTINGS: 'recovery:get-settings',
  RECOVERY_UPDATE_SETTINGS: 'recovery:update-settings',
  RECOVERY_SHOW_DIALOG: 'recovery:show-dialog',
  RECOVERY_RESUME_SESSION_EVENT: 'recovery:resume-session-event',

  // Utils
  SELECT_DIRECTORY: 'dialog:select-directory',
  SELECT_FILES: 'dialog:select-files',
  PATH_EXISTS: 'utils:path-exists',
  SAVE_PATH_MAPPING: 'utils:save-path-mapping',
  GET_PATH_MAPPINGS: 'utils:get-path-mappings',

  // Clipboard
  CLIPBOARD_READ_IMAGE: 'clipboard:read-image',
  CLIPBOARD_WRITE_TEXT: 'clipboard:write-text',

  // Voice transcription
  VOICE_TRANSCRIBE: 'voice:transcribe',
  VOICE_SAVE_AUDIO: 'voice:save-audio',

  // Browser logs
  BROWSER_LOGS_CONNECT: 'browser-logs:connect',
  BROWSER_LOGS_DISCONNECT: 'browser-logs:disconnect',
  BROWSER_LOGS_GET: 'browser-logs:get',
  BROWSER_LOGS_GET_ERRORS: 'browser-logs:get-errors',
  BROWSER_LOGS_EXPORT: 'browser-logs:export',
  BROWSER_LOGS_STATUS: 'browser-logs:status',
  BROWSER_LOGS_NEW: 'browser-logs:new',

  // Session history
  SESSION_GET_HISTORY: 'session:get-history',
  SESSION_SEARCH: 'session:search',

  // Rules reinforcement
  RULES_GET_STATS: 'rules:get-stats',

  // Message editing
  MESSAGE_EDIT: 'message:edit',
  MESSAGE_DELETE: 'message:delete',

  // Session titles persistence
  SESSION_TITLES_SAVE: 'session-titles:save',
  SESSION_TITLES_GET: 'session-titles:get',

  // Sessions watcher
  SESSIONS_CHANGED: 'sessions:changed',

  // Workspaces
  WORKSPACE_SAVE: 'workspace:save',
  WORKSPACE_LOAD: 'workspace:load',
  WORKSPACE_LIST: 'workspace:list',
  WORKSPACE_DELETE: 'workspace:delete',
  WORKSPACE_RENAME: 'workspace:rename',

  // Project rules (CLAUDE.md)
  RULES_READ: 'rules:read',
  RULES_WRITE: 'rules:write',

  // Global CLAUDE.md (~/.claude/CLAUDE.md)
  GLOBAL_CLAUDE_READ: 'global-claude:read',
  GLOBAL_CLAUDE_WRITE: 'global-claude:write',

  // Project plans (docs/plans/index.md)
  PLANS_READ: 'plans:read',
  PLANS_WRITE: 'plans:write',
  PLANS_LIST: 'plans:list',
  PLANS_READ_FILE: 'plans:read-file',
  PLANS_WRITE_FILE: 'plans:write-file',
  PLANS_DELETE: 'plans:delete',

  // Menu
  MENU_REFRESH: 'menu:refresh',

  // Native dialogs for workspace files
  WORKSPACE_SAVE_AS: 'workspace:save-as',
  WORKSPACE_OPEN_FILE: 'workspace:open-file',
  WORKSPACE_OPEN_FOLDER: 'workspace:open-folder',

  // API Server
  API_GET_CONFIG: 'api:get-config',
  API_SET_ENABLED: 'api:set-enabled',
  API_SET_NGROK_ENABLED: 'api:set-ngrok-enabled',
  API_UPDATE_PORT: 'api:update-port',
  API_REGENERATE_TOKEN: 'api:regenerate-token',
  API_GET_STATUS: 'api:get-status',
  API_CONNECT_NGROK: 'api:connect-ngrok',
  API_DISCONNECT_NGROK: 'api:disconnect-ngrok',

  // Utils - folder name resolution
  FIND_FOLDER_NAME: 'utils:find-folder-name',

  // App Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_SET: 'settings:set',
  SETTINGS_SELECT_FOLDER: 'settings:select-folder',

  // Window
  WINDOW_SET_TITLE: 'window:set-title',
  APP_GET_VERSION: 'app:get-version',

  // App close
  APP_REQUEST_CLOSE: 'app:request-close',  // Main -> Renderer: request to close (check unsaved)
  APP_CONFIRM_CLOSE: 'app:confirm-close',  // Renderer -> Main: confirm close (force quit)

  // Dev mode
  APP_IS_DEV_MODE: 'app:is-dev-mode',      // Check if running in development mode
  APP_RESTART_DEV: 'app:restart-dev',      // Restart app in dev mode (saves workspace first)
  APP_GET_LAST_DEV_SESSION: 'app:get-last-dev-session',  // Get last workspace name for auto-load

  // Thinking details (for detailed thinking display like Claude web)
  TERMINAL_THINKING_DETAIL: 'terminal:thinking-detail',

  // Auto-title generation for new chats
  TERMINAL_TITLE_GENERATED: 'terminal:title-generated',
} as const

// Session history message (from JSONL file)
export interface SessionHistoryMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: number
  toolUse?: string
  // Message editing support
  uuid?: string           // Unique identifier from JSONL file
  lineIndex?: number      // Line position in JSONL file
}

// Result type for message edit/delete operations
export interface MessageEditResult {
  success: boolean
  error?: string
}

// Session search result
export interface SessionSearchResult {
  sessionId: string
  folderName: string
  projectPath?: string
  title?: string
  firstPrompt?: string
  lastModified: number
  messageCount?: number
  matchedIn: 'title' | 'content' | 'both'
  matchSnippet?: string // Snippet del contenuto che contiene il match
}

// Session metadata for PM agent integration
export interface SessionMetadata {
  sessionId: string
  title?: string
  tags?: string[]
  topics?: string[]
  summary?: string
  lastAnalyzed?: number
  createdAt?: number
  updatedAt?: number
}

// Workspace types - for saving/restoring application state
export interface WorkspaceSession {
  projectPath: string
  projectName: string
  sessionType: 'new' | 'resume'
  claudeSessionId?: string
  sessionName?: string
  folderName?: string
}

export interface Workspace {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sessions: WorkspaceSession[]
}

export interface WorkspaceSummary {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  sessionCount: number
}

// API Server types
export interface ApiConfig {
  token: string
  port: number
  enabled: boolean
  ngrokEnabled: boolean
  createdAt: number
  lastUsedAt: number
}

// App Settings types
export interface AppSettings {
  // Voice transcription settings
  voiceModel: 'local' | 'openai'
  openaiApiKey?: string
  localWhisperModel: 'tiny' | 'base' | 'small' | 'medium' | 'large'
  // UI settings
  showTerminalView: boolean
  // Storage settings
  dataFolder: string
}

export interface ApiStatus {
  config: ApiConfig
  serverRunning: boolean
  ngrokConnected: boolean
  ngrokUrl: string | null
  ngrokError: string | null
}

// ============================================================================
// SECRETS MANAGEMENT - Unified API Keys storage
// ============================================================================

export interface AppSecrets {
  // AI Model API Keys
  openaiApiKey?: string       // OpenAI (Whisper, GPT)
  geminiApiKey?: string       // Google Gemini
  oagiApiKey?: string         // OAGI (Lux)
  anthropicApiKey?: string    // Anthropic (Claude) - for future use

  // Service API Keys
  ngrokAuthToken?: string     // ngrok for remote access

  // Custom keys (for user-defined integrations)
  customKeys?: Record<string, string>
}

// Secret key metadata for UI display
export interface SecretKeyInfo {
  id: keyof Omit<AppSecrets, 'customKeys'>
  label: string
  description: string
  placeholder: string
  link?: string              // Link to get the API key
  required?: boolean
}

// Predefined secret keys
export const SECRET_KEYS: SecretKeyInfo[] = [
  {
    id: 'geminiApiKey',
    label: 'Google Gemini',
    description: 'Per Nano Banana Pro e Gemini Computer Use',
    placeholder: 'AIzaSy...',
    link: 'https://aistudio.google.com/apikey'
  },
  {
    id: 'oagiApiKey',
    label: 'OAGI (Lux)',
    description: 'Per Lux AI computer use (actor/thinker/tasker)',
    placeholder: 'oagi-...',
    link: 'https://agiopen.org'
  },
  {
    id: 'openaiApiKey',
    label: 'OpenAI',
    description: 'Per Whisper API e altri servizi OpenAI',
    placeholder: 'sk-...',
    link: 'https://platform.openai.com/api-keys'
  },
  {
    id: 'anthropicApiKey',
    label: 'Anthropic',
    description: 'Per chiamate dirette a Claude API (uso futuro)',
    placeholder: 'sk-ant-...',
    link: 'https://console.anthropic.com/settings/keys'
  },
  {
    id: 'ngrokAuthToken',
    label: 'ngrok',
    description: 'Per accesso remoto tramite tunnel ngrok',
    placeholder: '2abc...',
    link: 'https://dashboard.ngrok.com/get-started/your-authtoken'
  }
]

// IPC Channels for Secrets
export const SECRETS_IPC_CHANNELS = {
  SECRETS_GET: 'secrets:get',
  SECRETS_SET: 'secrets:set',
  SECRETS_DELETE: 'secrets:delete',
  SECRETS_GET_ALL: 'secrets:get-all',
} as const

// ============================================================================
// GROUP PROJECT TYPES - Multi-agent orchestration for coding tasks
// ============================================================================

// Ruoli degli agenti nel sistema multi-agente
export type AgentRole = 'orchestrator' | 'architect' | 'coder' | 'reviewer' | 'debugger'

// Stato di una sessione nel gruppo
export type GroupSessionStatus = 'pending' | 'in_progress' | 'completed' | 'failed' | 'waiting'

// Configurazione orchestrazione
export interface OrchestrationConfig {
  autoReview: boolean         // Reviewer automatico dopo coder
  parallelCoders: number      // Max coder in parallelo (default 2)
  requireApproval: boolean    // Richiedi approvazione umana prima di merge
}

// Progetto di gruppo
export interface GroupProject {
  id: string
  name: string
  description?: string
  projectPath: string           // Path del progetto su disco
  createdAt: number
  updatedAt: number
  orchestration: OrchestrationConfig
  currentTaskId?: string        // Task in corso
}

// File nell'architettura
export interface ArchitectureFile {
  path: string
  action: 'create' | 'modify' | 'delete'
  purpose: string
  assignedTo?: string           // Session ID del coder assegnato
}

// Architettura definita dall'Architect
export interface Architecture {
  files: ArchitectureFile[]
  patterns: string[]
  dependencies: string[]
  interfaces?: string
}

// Issue trovata dal Reviewer
export interface ReviewIssue {
  file: string
  line?: number
  severity: 'error' | 'warning' | 'suggestion'
  message: string
}

// Review del codice
export interface CodeReview {
  approved: boolean
  issues: ReviewIssue[]
  suggestions: string[]
}

// Codice prodotto dai Coder
export interface CodeOutput {
  filesCreated: string[]
  filesModified: string[]
  commits: string[]
}

// Contesto condiviso tra sessioni
export interface SharedContext {
  architecture?: Architecture
  code?: CodeOutput
  review?: CodeReview
}

// Task di gruppo (richiesta di coding)
export interface GroupTask {
  id: string
  groupProjectId: string
  description: string           // "Aggiungi login con Google"
  status: 'planning' | 'architecting' | 'coding' | 'reviewing' | 'merging' | 'completed' | 'failed'
  createdAt: number
  completedAt?: number
  sessions: GroupTaskSession[]
  sharedContext: SharedContext
}

// Sessione all'interno di un task di gruppo
export interface GroupTaskSession {
  id: string
  taskId: string
  role: AgentRole
  terminalSessionId: string     // Riferimento a TerminalSession esistente
  status: GroupSessionStatus
  dependsOn: string[]           // ID delle sessioni da cui dipende
  assignedFiles?: string[]      // File su cui lavora (per coder)
  output?: string               // Risultato della sessione
  startedAt?: number
  completedAt?: number
}

// Summary di un GroupProject per liste
export interface GroupProjectSummary {
  id: string
  name: string
  projectPath: string
  createdAt: number
  updatedAt: number
  hasActiveTask: boolean
  activeTaskStatus?: GroupTask['status']
}

// Skills types
export interface SkillInfo {
  name: string
  description: string
  emoji?: string
  primaryEnv?: string
  source: 'bundled' | 'user' | 'project'
  eligible: boolean
  missingRequirements?: string[]
}

export interface SkillsConfigEntry {
  enabled?: boolean
  apiKey?: string
  env?: Record<string, string>
}

export interface SkillsStatus {
  available: SkillInfo[]
  eligibleCount: number
}

// IPC Channels for Skills
export const SKILLS_IPC_CHANNELS = {
  SKILLS_GET_STATUS: 'skills:get-status',
  SKILLS_GET_CONFIG: 'skills:get-config',
  SKILLS_SET_CONFIG: 'skills:set-config',
  SKILLS_REFRESH: 'skills:refresh',
} as const

// Thinking state for detailed thinking display (like Claude web)
export interface ThinkingStep {
  id: string
  tool: string              // "bash", "read", "grep", "write", etc.
  description: string       // "Executing: git status" or "Reading src/main.ts"
  timestamp: number
  status: 'running' | 'completed' | 'error'
}

export interface ThinkingState {
  isThinking: boolean
  currentTool?: string
  currentDescription?: string
  startTime: number
  steps: ThinkingStep[]
}

export interface ThinkingDetailEvent {
  terminalId: string
  step: ThinkingStep
}

// ============================================================================
// WEBHOOK TYPES - Event notification system for external integrations
// ============================================================================

// Webhook event types
export type WebhookEventType =
  | 'session_created'      // New session started
  | 'session_ended'        // Session terminated
  | 'session_ready'        // Session returned to idle (ready for input)
  | 'message_received'     // New message in session
  | 'message_count'        // Every N messages (configurable)
  | 'error'                // Error occurred
  | 'question_asked'       // Claude asked a question

// Webhook configuration
export interface WebhookConfig {
  id: string
  url: string                          // Target URL to POST to
  events: WebhookEventType[]           // Which events to listen for
  enabled: boolean
  secret?: string                      // HMAC secret for signature verification
  createdAt: number
  lastTriggered?: number
  failureCount: number                 // Consecutive failures
  metadata?: {
    name?: string                      // Friendly name
    description?: string
    messageCountThreshold?: number     // For message_count event
  }
}

// Webhook event payload
export interface WebhookPayload {
  event: WebhookEventType
  timestamp: number
  sessionId?: string
  data: {
    // Common fields
    projectPath?: string
    folderName?: string

    // For message events
    messageContent?: string
    messageRole?: 'user' | 'assistant'
    messageCount?: number

    // For error events
    errorMessage?: string
    errorCode?: string

    // For question events
    questionData?: QuestionData

    // For session events
    sessionStatus?: TerminalSession['status']
  }
}

// Webhook delivery result
export interface WebhookDeliveryResult {
  webhookId: string
  success: boolean
  statusCode?: number
  error?: string
  duration: number
  timestamp: number
}

// IPC Channels for Webhooks
export const WEBHOOK_IPC_CHANNELS = {
  WEBHOOK_CREATE: 'webhook:create',
  WEBHOOK_UPDATE: 'webhook:update',
  WEBHOOK_DELETE: 'webhook:delete',
  WEBHOOK_LIST: 'webhook:list',
  WEBHOOK_TEST: 'webhook:test',
  WEBHOOK_GET_LOGS: 'webhook:get-logs',
} as const

// ============================================================================
// ORCHESTRATION TYPES - For PM Agent integration
// ============================================================================

// Orchestration event for SSE streaming
export interface OrchestrationEvent {
  type: 'session_created' | 'session_ended' | 'session_output' | 'session_ready' | 'error' | 'heartbeat'
  timestamp: number
  sessionId?: string
  data?: any
}

// Aggregated orchestration status
export interface OrchestrationStatus {
  activeSessions: number
  idleSessions: number
  thinkingSessions: number
  totalMessageCount: number
  lastActivity: number
  sessions: Array<{
    id: string
    projectPath: string
    status: TerminalSession['status']
    lastOutput?: number
  }>
}

// Circuit breaker configuration for PM Agent
export interface PMCircuitBreakerConfig {
  maxFeatureRequestsPerHour: number
  maxRestartAttempts: number
  cooldownAfterRestartMs: number
  maxRecursionDepth: number
  healthCheckIntervalMs: number
  healthCheckTimeoutMs: number
}

// ============================================================================
// SUBAGENT TYPES - Clawdbot-style subagent management
// ============================================================================

// Outcome of a subagent run
export type SubagentRunOutcome = {
  status: 'ok' | 'error' | 'timeout' | 'unknown'
  error?: string
}

// Record of a subagent run (for UI display)
export interface SubagentRunInfo {
  runId: string
  childSessionKey: string
  task: string
  label?: string
  role?: string
  status: 'running' | 'completed' | 'failed' | 'timeout'
  createdAt: number
  startedAt?: number
  endedAt?: number
  outcome?: SubagentRunOutcome
}

// Task statistics
export interface GroupTaskStats {
  totalSessions: number
  completedSessions: number
  failedSessions: number
  inProgressSessions: number
  totalDurationMs: number
}

// Timeout configuration (exposed to UI)
export interface GroupTimeoutConfig {
  agentTimeoutSeconds: number
  archiveAfterMinutes: number
}

// IPC Channels per Group Projects (aggiunti a IPC_CHANNELS sopra)
export const GROUP_IPC_CHANNELS = {
  // Group Projects
  GROUP_PROJECT_CREATE: 'group-project:create',
  GROUP_PROJECT_LIST: 'group-project:list',
  GROUP_PROJECT_GET: 'group-project:get',
  GROUP_PROJECT_DELETE: 'group-project:delete',
  GROUP_PROJECT_UPDATE: 'group-project:update',

  // Group Tasks
  GROUP_TASK_CREATE: 'group-task:create',
  GROUP_TASK_GET: 'group-task:get',
  GROUP_TASK_CANCEL: 'group-task:cancel',
  GROUP_TASK_LIST: 'group-task:list',

  // Stats and Monitoring
  GROUP_TASK_STATS: 'group-task:stats',
  GROUP_ACTIVE_RUNS: 'group:active-runs',
  GROUP_PENDING_RUNS: 'group:pending-runs',
  GROUP_CONFIG_GET: 'group:config-get',
  GROUP_CONFIG_UPDATE: 'group:config-update',

  // Events (Main -> Renderer)
  GROUP_TASK_PROGRESS: 'group-task:progress',
  GROUP_SESSION_OUTPUT: 'group-session:output',
  SHARED_CONTEXT_UPDATE: 'shared-context:update',
  GROUP_SUBAGENT_COMPLETE: 'group:subagent-complete',
} as const

// ============================================================================
// SERVICE OUTPUT PANEL - Real-time Tool Server & Tasker Service logs
// ============================================================================

// Status of external services (Tool Server 8766, Tasker Service 8765)
export interface ServiceStatus {
  toolServer: {
    active: boolean
    browserSessions: number
    version: string
    lastAction?: string
  }
  tasker: {
    active: boolean
    mode: string | null  // 'actor' | 'thinker' | 'gemini_cua' | null
    status: 'idle' | 'busy'
    version: string
    currentTask?: string
  }
}

// Log entry for service output panel
export interface ServiceLogEntry {
  id: string
  timestamp: number
  level: 'info' | 'warning' | 'error' | 'success' | 'action' | 'reasoning'
  message: string
  source: 'tool-server' | 'tasker'
  metadata?: {
    action?: string      // 'click', 'type', 'navigate', 'scroll', etc.
    target?: string      // Element name, URL, etc.
    coordinates?: { x: number; y: number }
    duration?: number
    step?: number
  }
}

// IPC Channels for Service Output Panel
export const SERVICE_OUTPUT_IPC_CHANNELS = {
  SERVICE_STATUS_GET: 'service-output:status-get',
  SERVICE_LOGS_GET: 'service-output:logs-get',
  SERVICE_LOGS_SUBSCRIBE: 'service-output:logs-subscribe',
  SERVICE_LOGS_UNSUBSCRIBE: 'service-output:logs-unsubscribe',
  SERVICE_LOGS_NEW: 'service-output:logs-new',
} as const

// ============================================================================
// WATCHDOG TYPES - Stable app monitoring unstable dev builds
// ============================================================================

export type WatchdogStatusType = 'idle' | 'running' | 'crashed' | 'restarting' | 'stopped' | 'max_restarts'

export type WatchdogLaunchMode = 'dev' | 'production'

export interface WatchdogConfig {
  targetExePath: string       // Path to exe for production mode
  targetDevPath: string       // Path to repo for dev mode
  mode: WatchdogLaunchMode
  autoRestart: boolean
  maxRestarts: number         // Max restarts in time window (default 5)
  restartWindowMs: number     // Time window in ms (default 5 min)
  healthCheckPort: number     // Port of target's API server
  healthCheckIntervalMs: number // How often to health check (default 10s)
}

export interface WatchdogStatusInfo {
  status: WatchdogStatusType
  mode: WatchdogLaunchMode
  exePath: string
  pid: number | null
  uptimeMs: number
  totalCrashes: number
  recentCrashes: number
  backoffMs: number
  lastHealthCheck: number | null
  healthCheckOk: boolean
  memory: number | null       // RSS in bytes
  cpu: number | null          // CPU percentage
}

export interface WatchdogCrashEntry {
  timestamp: number
  exitCode: number | null
  signal: string | null
  uptimeMs: number
  stderr: string
}

export interface WatchdogLogEntry {
  timestamp: number
  level: 'info' | 'warning' | 'error' | 'debug'
  category: 'console' | 'network' | 'renderer' | 'security' | 'system' | 'ipc' | 'performance'
  message: string
  source: 'stdout' | 'stderr' | 'file'
}

export const WATCHDOG_IPC_CHANNELS = {
  // Control
  WATCHDOG_START: 'watchdog:start',
  WATCHDOG_STOP: 'watchdog:stop',
  WATCHDOG_RESTART: 'watchdog:restart',
  WATCHDOG_BUILD_AND_RUN: 'watchdog:build-and-run',

  // Status
  WATCHDOG_GET_STATUS: 'watchdog:get-status',
  WATCHDOG_GET_CRASH_LOG: 'watchdog:get-crash-log',
  WATCHDOG_CLEAR_CRASH_LOG: 'watchdog:clear-crash-log',

  // Config
  WATCHDOG_GET_CONFIG: 'watchdog:get-config',
  WATCHDOG_UPDATE_CONFIG: 'watchdog:update-config',
  WATCHDOG_SELECT_EXE: 'watchdog:select-exe',
  WATCHDOG_SELECT_DEV_PATH: 'watchdog:select-dev-path',

  // Logs
  WATCHDOG_GET_LOGS: 'watchdog:get-logs',
  WATCHDOG_CLEAR_LOGS: 'watchdog:clear-logs',

  // Events (Main -> Renderer)
  WATCHDOG_STATUS_CHANGED: 'watchdog:status-changed',
  WATCHDOG_CRASH: 'watchdog:crash',
  WATCHDOG_LOG: 'watchdog:log',
  WATCHDOG_MAX_RESTARTS: 'watchdog:max-restarts',
} as const

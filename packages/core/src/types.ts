/**
 * Core types and interfaces for Comrade
 * This is the foundation that all other packages depend on
 */

// Workspace Types
export interface Workspace {
  id: string;
  name: string;
  path: string;
  baseUrl?: string;
  createdAt: number;
  updatedAt?: number;
  llmConfig?: LLMConfig; // Workspace-specific LLM configuration
}

export interface WorkspaceConfig {
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  authorizedRoots: string[];
}

// Session Types
export interface Session {
  id: string;
  workspaceId: string;
  title: string;
  status: 'running' | 'paused' | 'completed' | 'error' | 'cancelled';
  createdAt: number;
  updatedAt: number;
  messages: Message[];
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

// Task Types
export interface Task {
  id: string;
  sessionId: string;
  goal: string;
  plan?: Plan;
  status: TaskStatus;
  createdAt: number;
  completedAt?: number;
}

export type TaskStatus = 
  | 'planning'
  | 'pending_approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'error'
  | 'cancelled';

export interface Plan {
  id: string;
  taskId: string;
  steps: Step[];
  editable: boolean;
}

export interface Step {
  id: string;
  planId: string;
  description: string;
  status: StepStatus;
  toolCall?: ToolCall;
  startTime?: number;
  endTime?: number;
}

export type StepStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'error'
  | 'skipped';

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
  output?: string;
  error?: string;
}

// Permission Types
export interface PermissionRequest {
  id: string;
  sessionId: string;
  type: PermissionType;
  scope: string;
  reason?: string;
  createdAt: number;
}

export type PermissionType = 
  | 'file_read'
  | 'file_write'
  | 'file_delete'
  | 'command_execute'
  | 'network_request'
  | 'env_access';

export type PermissionDecision = 'allow_once' | 'allow_session' | 'deny';

// Skill Types
export interface Skill {
  id: string;
  name: string;
  description: string;
  content: string;
  version: string;
  author?: string;
  tags: string[];
  installed: boolean;
  path?: string;
}

// Plugin Types
export interface Plugin {
  id: string;
  name: string;
  description: string;
  version: string;
  enabled: boolean;
  config?: Record<string, unknown>;
}

// Command Types
export interface Command {
  id: string;
  name: string;
  description: string;
  prompt: string;
  arguments?: CommandArgument[];
}

export interface CommandArgument {
  name: string;
  description: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean';
}

// Audit Types
export interface AuditEntry {
  id: string;
  workspaceId: string;
  sessionId?: string;
  actor: Actor;
  action: string;
  target: string;
  summary: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface Actor {
  type: 'host' | 'remote';
  clientId?: string;
  tokenHash?: string;
  scope?: TokenScope;
}

export type TokenScope = 'owner' | 'collaborator' | 'viewer';

// Token Types
export interface Token {
  id: string;
  token: string;
  scope: TokenScope;
  label?: string;
  createdAt: number;
  lastUsedAt?: number;
  expiresAt?: number;
}

// Server Types
export interface ServerConfig {
  host: string;
  port: number;
  readOnly: boolean;
  corsOrigins: string[];
  workspaces: Workspace[];
  activeWorkspaceId: string | null;
  authorizedRoots: string[];
  hostToken: string;
  approval: ApprovalConfig;
  startedAt: number;
  logRequests: boolean;
  logFormat: 'json' | 'text';
  configPath?: string;
  tokenSource: string;
  hostTokenSource: string;
  llm?: LLMConfig;
  telegram?: TelegramConfig;
}

export interface ApprovalConfig {
  mode: 'auto' | 'manual';
  timeoutMs: number;
}

// Capabilities
export interface Capabilities {
  schemaVersion: number;
  serverVersion: string;
  skills: CapabilityFlag;
  plugins: CapabilityFlag;
  mcp: CapabilityFlag;
  commands: CapabilityFlag;
  config: CapabilityFlag;
  approvals: ApprovalConfig;
  tokens: {
    scoped: boolean;
    scopes: TokenScope[];
  };
  proxy: {
    opencode: boolean;
    comrade: boolean;
  };
}

export interface CapabilityFlag {
  read: boolean;
  write: boolean;
}

// Artifact Types
export interface Artifact {
  id: string;
  path: string;
  size: number;
  updatedAt: number;
  contentType?: string;
}

// API Response Types
export interface ApiResponse<T> {
  data?: T;
  error?: ApiError;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

// Health Types
export interface HealthStatus {
  ok: boolean;
  version: string;
  uptimeMs: number;
}

// LLM Provider Types
export type LLMProvider = 'openai' | 'anthropic' | 'google' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  enabled: boolean;
}

export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
  error?: string;
}

export interface LLMProviderInfo {
  id: LLMProvider;
  name: string;
  description: string;
  requiresApiKey: boolean;
  supportsBaseUrl: boolean;
  defaultModels: string[];
}

// Telegram Bot Types
export interface TelegramConfig {
  botToken: string;
  enabled: boolean;
  authorizedUsers: number[]; // Telegram user IDs
  defaultWorkspaceId?: string;
  showTypingIndicator: boolean;
  parseMode: 'Markdown' | 'HTML' | 'None';
}

export interface TelegramChatSession {
  chatId: number;
  sessionId: string;
  workspaceId: string;
  lastActivity: number;
}

// Event Types
export interface ServerEvent {
  id: string;
  type: EventType;
  payload: unknown;
  timestamp: number;
}

export type EventType =
  | 'session.created'
  | 'session.updated'
  | 'message.received'
  | 'step.started'
  | 'step.completed'
  | 'permission.requested'
  | 'permission.resolved'
  | 'config.reloaded';

// Utility Types
export type Nullable<T> = T | null;
export type Optional<T> = T | undefined;
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

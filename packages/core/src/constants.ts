/**
 * Constants for Comrade
 */

// Server Defaults
export const DEFAULT_SERVER_HOST = '127.0.0.1';
export const DEFAULT_SERVER_PORT = 8080;

// Timeouts (in milliseconds)
export const DEFAULT_TIMEOUT = 30000;
export const LONG_TIMEOUT = 300000;
export const PERMISSION_TIMEOUT = 120000;

// File Size Limits
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_INBOX_SIZE_BYTES = 250 * 1024 * 1024; // 250MB

// Paths
export const COMRADE_DIR = '.comrade';
export const SKILLS_DIR = '.comrade/skills';
export const COMMANDS_DIR = '.comrade/commands';
export const PLUGINS_DIR = '.comrade/plugins';
export const INBOX_DIR = '.comrade/inbox';
export const OUTBOX_DIR = '.comrade/outbox';
export const CONFIG_FILE = '.comrade/config.json';

// Token Scopes
export const TOKEN_SCOPES = ['owner', 'collaborator', 'viewer'] as const;

// Event Types
export const EVENT_TYPES = [
  'session.created',
  'session.updated',
  'message.received',
  'step.started',
  'step.completed',
  'permission.requested',
  'permission.resolved',
  'config.reloaded',
] as const;

// Task Status Transitions
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  planning: ['pending_approval', 'cancelled'],
  pending_approval: ['running', 'cancelled'],
  running: ['paused', 'completed', 'error', 'cancelled'],
  paused: ['running', 'cancelled'],
  completed: [],
  error: [],
  cancelled: [],
};

// HTTP Status Codes
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
} as const;

// Error Codes
export const ERROR_CODES = {
  // General
  INTERNAL_ERROR: 'internal_error',
  NOT_FOUND: 'not_found',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  
  // Validation
  INVALID_PAYLOAD: 'invalid_payload',
  INVALID_PATH: 'invalid_path',
  INVALID_JSON: 'invalid_json',
  INVALID_SCOPE: 'invalid_scope',
  
  // Workspace
  WORKSPACE_NOT_FOUND: 'workspace_not_found',
  WORKSPACE_EXISTS: 'workspace_exists',
  
  // Session
  SESSION_NOT_FOUND: 'session_not_found',
  SESSION_CLOSED: 'session_closed',
  
  // Permission
  PERMISSION_DENIED: 'permission_denied',
  PERMISSION_TIMEOUT: 'permission_timeout',
  
  // Engine
  ENGINE_UNREACHABLE: 'engine_unreachable',
  ENGINE_UNCONFIGURED: 'engine_unconfigured',
  ENGINE_REQUEST_FAILED: 'engine_request_failed',
  
  // Approval
  APPROVAL_REQUIRED: 'approval_required',
  APPROVAL_TIMEOUT: 'approval_timeout',
} as const;

// Colors for UI
export const COLORS = {
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  info: '#3b82f6',
  neutral: '#6b7280',
} as const;

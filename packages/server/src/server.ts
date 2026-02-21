/**
 * Express server for Comrade
 * Provides filesystem-backed API for workspace management
 */

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { ServerConfig, ApiError, HealthStatus, Capabilities, generateToken } from '@comrade/core';
import { ConfigService } from './services/config.js';
import { WorkspaceService } from './services/workspace.js';
import { SessionService } from './services/session.js';
import { SkillService } from './services/skill.js';
import { AuditService } from './services/audit.js';
import { TokenService } from './services/token.js';
import { LLMService } from './services/llm.js';
import { TelegramBotService } from './services/telegram.js';
import { ToolsService } from './services/tools.js';
import { errorHandler } from './middleware/error.js';
import { authMiddleware } from './middleware/auth.js';
import { setupRoutes } from './routes/index.js';

const SERVER_VERSION = '0.1.0';

export interface ServerContext {
  config: ServerConfig;
  configService: ConfigService;
  workspaceService: WorkspaceService;
  sessionService: SessionService;
  skillService: SkillService;
  auditService: AuditService;
  tokenService: TokenService;
  llmService: LLMService;
  telegramBotService: TelegramBotService;
  toolsService: ToolsService;
}

export function startServer(initialConfig: Partial<ServerConfig> = {}) {
  const app = express();
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ server });

  // Default configuration
  const config: ServerConfig = {
    host: initialConfig.host || '127.0.0.1',
    port: initialConfig.port || 8080,
    readOnly: initialConfig.readOnly || false,
    corsOrigins: initialConfig.corsOrigins || ['http://localhost:5173', 'http://localhost:3000'],
    workspaces: initialConfig.workspaces || [],
    activeWorkspaceId: initialConfig.activeWorkspaceId || null,
    authorizedRoots: initialConfig.authorizedRoots || [],
    // Use environment variable for host token if provided (from Electron), otherwise generate one
    hostToken: (() => {
      const fromEnv = process.env.COMRADE_HOST_TOKEN;
      const token = initialConfig.hostToken || fromEnv || generateHostToken();
      console.log(`[server] Host token source: ${initialConfig.hostToken ? 'config' : fromEnv ? 'env' : 'generated'}`);
      console.log(`[server] Host token value: ${token.slice(0, 8)}...`);
      return token;
    })(),
    approval: initialConfig.approval || { mode: 'manual', timeoutMs: 120000 },
    startedAt: Date.now(),
    logRequests: initialConfig.logRequests ?? true,
    logFormat: initialConfig.logFormat || 'text',
    configPath: initialConfig.configPath,
    tokenSource: initialConfig.tokenSource || 'memory',
    hostTokenSource: initialConfig.hostTokenSource || 'env',
    llm: initialConfig.llm,
    telegram: initialConfig.telegram,
  };

  // Initialize services
  const llmService = new LLMService(config);
  const sessionService = new SessionService(config);
  const telegramBotService = new TelegramBotService(config, llmService, sessionService);
  const configService = new ConfigService(config);
  
  // Load saved configuration
  (async () => {
    try {
      const loadedConfig = await configService.load();
      configService.applyLoadedConfig(loadedConfig);
      
      // Re-initialize LLM service with loaded config (to auto-enable if configured)
      if (config.llm && config.llm.enabled && config.llm.apiKey) {
        llmService.updateConfig(config.llm);
        console.log('[server] Global LLM auto-enabled from saved configuration');
      }
      
      // Initialize workspace-specific LLM configs
      for (const workspace of config.workspaces) {
        if (workspace.llmConfig?.enabled && workspace.llmConfig.apiKey) {
          llmService.updateWorkspaceConfig(workspace.id, workspace.llmConfig);
          console.log(`[server] Workspace LLM auto-enabled for ${workspace.name || workspace.id}`);
        }
      }
      
      console.log('[server] Configuration loaded successfully');
    } catch (error) {
      console.error('[server] Failed to load configuration:', error);
    }
  })();
  
  const toolsService = new ToolsService(config);
  
  const context: ServerContext = {
    config,
    configService,
    workspaceService: new WorkspaceService(config),
    sessionService,
    skillService: new SkillService(config),
    auditService: new AuditService(config),
    tokenService: new TokenService(config),
    llmService,
    telegramBotService,
    toolsService,
  };

  // NOTE: Tool approval is handled at the LLM service level (in agenticChat),
  // NOT at the ToolsService level. When no approvalCallback is set on ToolsService,
  // executeTool() auto-allows. The agenticChat loop yields toolApproval SSE events
  // and pauses for user response before calling executeTool.

  // Middleware
  app.use(cors({
    origin: config.corsOrigins,
    credentials: true,
  }));
  
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Request logging
  if (config.logRequests) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const message = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;
        
        if (config.logFormat === 'json') {
          console.log(JSON.stringify({
            timestamp: new Date().toISOString(),
            level: res.statusCode >= 400 ? 'error' : 'info',
            message,
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: duration,
          }));
        } else {
          console.log(message);
        }
      });
      next();
    });
  }

  // Auth middleware for protected routes
  app.use(authMiddleware(context));

  // Setup routes
  setupRoutes(app, context);

  // Error handling
  app.use(errorHandler);

  // WebSocket handling
  wss.on('connection', (ws) => {
    console.log('[websocket] Client connected');
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        // Handle WebSocket events
        console.log('[websocket] Received:', data.type);
      } catch (error) {
        ws.send(JSON.stringify({ error: 'Invalid message format' }));
      }
    });

    ws.on('close', () => {
      console.log('[websocket] Client disconnected');
    });
  });

  // Start server
  server.listen(config.port, config.host, () => {
    console.log(`[comrade-server] v${SERVER_VERSION} running on http://${config.host}:${config.port}`);
    console.log(`[comrade-server] Host token: ${config.hostToken.slice(0, 8)}...`);
    console.log(`[comrade-server] Workspaces: ${config.workspaces.length}`);
  });

  return { server, wss, context };
}

function generateHostToken(): string {
  return generateToken(32);
}

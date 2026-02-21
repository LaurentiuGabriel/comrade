/**
 * API Routes
 */

import { Router, Request, Response } from 'express';
import { HealthStatus } from '@comrade/core';
import { ServerContext } from '../server.js';
import { AuthenticatedRequest } from '../middleware/auth.js';

export function setupRoutes(app: Router, context: ServerContext): void {
  // Health
  app.get('/health', (_req: Request, res: Response) => {
    const health: HealthStatus = {
      ok: true,
      version: '0.1.0',
      uptimeMs: Date.now() - context.config.startedAt,
    };
    res.json(health);
  });

  // Config
  app.get('/config', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const configPath = context.configService.getConfigPath();
      const exists = await context.configService.exists();
      
      res.json({
        configPath,
        exists,
        config: context.configService.getSanitizedConfig(),
      });
    } catch (error) {
      res.status(500).json({ 
        code: 'config_error', 
        message: error instanceof Error ? error.message : 'Failed to get config' 
      });
    }
  });

  app.post('/config/save', async (req: AuthenticatedRequest, res: Response) => {
    try {
      await context.configService.save();
      res.json({ success: true, message: 'Configuration saved' });
    } catch (error) {
      res.status(500).json({ 
        code: 'save_error', 
        message: error instanceof Error ? error.message : 'Failed to save config' 
      });
    }
  });

  // Status
  app.get('/status', (req: AuthenticatedRequest, res: Response) => {
    res.json({
      ok: true,
      version: '0.1.0',
      uptimeMs: Date.now() - context.config.startedAt,
      readOnly: context.config.readOnly,
      approval: context.config.approval,
      corsOrigins: context.config.corsOrigins,
      workspaceCount: context.config.workspaces.length,
      activeWorkspaceId: context.config.activeWorkspaceId,
      authorizedRoots: context.config.authorizedRoots,
      server: {
        host: context.config.host,
        port: context.config.port,
        configPath: context.config.configPath ?? null,
      },
    });
  });

  // Capabilities
  app.get('/capabilities', (_req: Request, res: Response) => {
    res.json({
      schemaVersion: 1,
      serverVersion: '0.1.0',
      skills: { read: true, write: !context.config.readOnly },
      plugins: { read: true, write: !context.config.readOnly },
      mcp: { read: true, write: !context.config.readOnly },
      commands: { read: true, write: !context.config.readOnly },
      config: { read: true, write: !context.config.readOnly },
      approvals: context.config.approval,
      tokens: {
        scoped: true,
        scopes: ['owner', 'collaborator', 'viewer'],
      },
      proxy: {
        opencode: false,
        comrade: true,
      },
    });
  });

  // Workspaces
  app.get('/workspaces', (req: AuthenticatedRequest, res: Response) => {
    const workspaces = context.workspaceService.getAll().map(w => ({
      id: w.id,
      name: w.name,
      path: w.path,
      createdAt: w.createdAt,
      updatedAt: w.updatedAt,
    }));
    
    res.json({
      items: workspaces,
      activeId: context.config.activeWorkspaceId,
    });
  });

  app.post('/workspaces', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const { name, path } = req.body;
    if (!name || !path) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Name and path are required' });
    }

    const workspace = await context.workspaceService.create(name, path);
    
    // Save configuration to file
    try {
      await context.configService.save();
      console.log('[routes] Workspace configuration saved');
    } catch (error) {
      console.error('[routes] Failed to save workspace configuration:', error);
    }
    
    res.status(201).json(workspace);
  });

  app.get('/workspaces/:id', (req: AuthenticatedRequest, res: Response) => {
    const workspace = context.workspaceService.getById(req.params.id);
    if (!workspace) {
      return res.status(404).json({ code: 'not_found', message: 'Workspace not found' });
    }
    res.json(workspace);
  });

  app.post('/workspaces/:id/activate', async (req: AuthenticatedRequest, res: Response) => {
    const success = context.workspaceService.setActive(req.params.id);
    if (!success) {
      return res.status(404).json({ code: 'not_found', message: 'Workspace not found' });
    }
    
    // Save configuration to file
    try {
      await context.configService.save();
      console.log('[routes] Active workspace saved');
    } catch (error) {
      console.error('[routes] Failed to save active workspace:', error);
    }
    
    res.json({ activeId: req.params.id });
  });

  app.delete('/workspaces/:id', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const success = context.workspaceService.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ code: 'not_found', message: 'Workspace not found' });
    }
    
    // Save configuration to file
    try {
      await context.configService.save();
      console.log('[routes] Workspace deletion saved');
    } catch (error) {
      console.error('[routes] Failed to save workspace configuration after deletion:', error);
    }
    
    res.json({ ok: true });
  });

  // Skills
  app.get('/workspaces/:id/skills', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const skills = await context.skillService.list(req.params.id);
      res.json({ items: skills });
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  app.post('/workspaces/:id/skills', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const { name, content } = req.body;
    if (!name || !content) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Name and content are required' });
    }

    try {
      const skill = await context.skillService.create(req.params.id, name, content);
      res.status(201).json(skill);
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  app.get('/workspaces/:id/skills/:name', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const skill = await context.skillService.get(req.params.id, req.params.name);
      if (!skill) {
        return res.status(404).json({ code: 'not_found', message: 'Skill not found' });
      }
      res.json(skill);
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  app.patch('/workspaces/:id/skills/:name', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const { content } = req.body;
    if (!content) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Content is required' });
    }

    try {
      const skill = await context.skillService.update(req.params.id, req.params.name, content);
      res.json(skill);
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  app.delete('/workspaces/:id/skills/:name', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    try {
      const success = await context.skillService.delete(req.params.id, req.params.name);
      if (!success) {
        return res.status(404).json({ code: 'not_found', message: 'Skill not found' });
      }
      res.json({ ok: true });
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  // Sessions
  app.get('/workspaces/:id/sessions', async (req: AuthenticatedRequest, res: Response) => {
    const sessions = await context.sessionService.list(req.params.id);
    res.json({ items: sessions });
  });

  app.post('/workspaces/:id/sessions', async (req: AuthenticatedRequest, res: Response) => {
    const { title } = req.body;
    const session = await context.sessionService.create(req.params.id, title || 'New Session');
    res.status(201).json(session);
  });

  app.get('/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
    const session = await context.sessionService.get(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ code: 'not_found', message: 'Session not found' });
    }
    res.json(session);
  });

  app.post('/sessions/:sessionId/messages', async (req: AuthenticatedRequest, res: Response) => {
    const { role, content } = req.body;
    if (!role || !content) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Role and content are required' });
    }

    try {
      const message = await context.sessionService.addMessage(req.params.sessionId, role, content);
      res.status(201).json(message);
    } catch (error: any) {
      res.status(400).json({ code: 'error', message: error.message });
    }
  });

  app.delete('/sessions/:sessionId', async (req: AuthenticatedRequest, res: Response) => {
    const success = await context.sessionService.delete(req.params.sessionId);
    if (!success) {
      return res.status(404).json({ code: 'not_found', message: 'Session not found' });
    }
    res.json({ ok: true });
  });

  // Tokens (host only)
  app.get('/tokens', async (req: AuthenticatedRequest, res: Response) => {
    if (req.actor?.scope !== 'owner') {
      return res.status(403).json({ code: 'forbidden', message: 'Owner access required' });
    }

    const tokens = await context.tokenService.list();
    res.json({ items: tokens });
  });

  app.post('/tokens', async (req: AuthenticatedRequest, res: Response) => {
    if (req.actor?.scope !== 'owner') {
      return res.status(403).json({ code: 'forbidden', message: 'Owner access required' });
    }

    const { scope, label, expiresInHours } = req.body;
    if (!scope) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Scope is required' });
    }

    const token = await context.tokenService.create(scope, { label, expiresInHours });
    res.status(201).json(token);
  });

  app.delete('/tokens/:id', async (req: AuthenticatedRequest, res: Response) => {
    if (req.actor?.scope !== 'owner') {
      return res.status(403).json({ code: 'forbidden', message: 'Owner access required' });
    }

    const success = await context.tokenService.revoke(req.params.id);
    if (!success) {
      return res.status(404).json({ code: 'not_found', message: 'Token not found' });
    }
    res.json({ ok: true });
  });

  // Audit
  app.get('/audit', async (req: AuthenticatedRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const entries = await context.auditService.list(undefined, limit);
    res.json({ items: entries });
  });

  app.get('/workspaces/:id/audit', async (req: AuthenticatedRequest, res: Response) => {
    const limit = parseInt(req.query.limit as string) || 100;
    const entries = await context.auditService.list(req.params.id, limit);
    res.json({ items: entries });
  });

  // LLM Configuration
  app.get('/llm/providers', (_req: Request, res: Response) => {
    const providers = context.llmService.getProviders();
    res.json({ items: providers });
  });

  app.get('/llm/config', (req: Request, res: Response) => {
    const workspaceId = req.query.workspaceId as string | undefined;
    const config = workspaceId 
      ? context.llmService.getWorkspaceConfig(workspaceId)
      : context.llmService.getConfig();
    res.json({ config });
  });

  app.post('/llm/config', async (req: Request, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const { workspaceId, ...config } = req.body;
    
    if (workspaceId) {
      // Save workspace-specific config
      context.llmService.updateWorkspaceConfig(workspaceId, config);
      console.log(`[routes] LLM configuration saved for workspace ${workspaceId}`);
    } else {
      // Save global config (fallback)
      context.llmService.updateConfig(config);
      console.log('[routes] Global LLM configuration saved');
    }
    
    // Save configuration to file
    try {
      await context.configService.save();
    } catch (error) {
      console.error('[routes] Failed to save LLM configuration:', error);
    }
    
    res.json({ success: true });
  });

  app.get('/llm/status', (req: Request, res: Response) => {
    const workspaceId = req.query.workspaceId as string | undefined;
    const config = workspaceId
      ? context.llmService.getWorkspaceConfig(workspaceId)
      : context.llmService.getConfig();
    
    const validation = context.llmService.validateConfig(config || undefined);
    res.json({
      enabled: config?.enabled || false,
      valid: validation.valid,
      error: validation.error,
    });
  });

  // Ollama Models - fetch available models from local Ollama instance
  app.get('/llm/ollama/models', async (req: Request, res: Response) => {
    const { baseUrl } = req.query;
    try {
      const models = await context.llmService.getOllamaModels(baseUrl as string | undefined);
      res.json({ items: models });
    } catch (error) {
      res.status(500).json({ 
        code: 'ollama_error', 
        message: error instanceof Error ? error.message : 'Failed to fetch Ollama models' 
      });
    }
  });

  // LLM Chat Stream
  app.post('/llm/chat', async (req: AuthenticatedRequest, res: Response) => {
    const { messages, workspaceId } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ code: 'invalid_payload', message: 'Messages array is required' });
    }

    // Get workspace-specific config and validate
    const llmConfig = workspaceId 
      ? context.llmService.getWorkspaceConfig(workspaceId)
      : context.llmService.getConfig();
    
    if (!llmConfig) {
      return res.status(400).json({ code: 'llm_not_configured', message: 'LLM configuration not found' });
    }
    
    const validation = context.llmService.validateConfig(llmConfig);
    if (!validation.valid) {
      return res.status(400).json({ code: 'llm_not_configured', message: validation.error });
    }

    // Set workspace for tool execution
    if (workspaceId) {
      const workspace = context.workspaceService.getById(workspaceId);
      if (workspace) {
        context.llmService.setWorkspace(workspace.path);
      }
    }

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    try {
      const stream = context.llmService.streamChat(messages, workspaceId);
      let fullContent = '';
      
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        if (chunk.content) {
          fullContent += chunk.content;
        }
        
        if (chunk.done) {
          break;
        }
      }
      
      // Check for and execute tool calls
      const { text, executed } = await context.llmService.executeToolCalls(fullContent);
      
      if (executed) {
        // Send tool execution results
        res.write(`data: ${JSON.stringify({ 
          toolResults: true, 
          updatedContent: text,
          done: false 
        })}\n\n`);
      }
      
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Streaming error';
      res.write(`data: ${JSON.stringify({ error: errorMessage, done: true })}\n\n`);
      res.end();
    }
  });

  // Telegram Bot Configuration
  app.get('/telegram/config', (req: AuthenticatedRequest, res: Response) => {
    const config = context.telegramBotService.getConfig();
    res.json({ config });
  });

  app.post('/telegram/config', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const config = req.body;
    context.telegramBotService.updateConfig(config);
    
    // Save configuration to file
    try {
      await context.configService.save();
      console.log('[routes] Telegram configuration saved');
    } catch (error) {
      console.error('[routes] Failed to save Telegram configuration:', error);
    }
    
    res.json({ success: true });
  });

  app.get('/telegram/status', (req: AuthenticatedRequest, res: Response) => {
    const status = context.telegramBotService.getStatus();
    res.json(status);
  });

  app.post('/telegram/start', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    const result = await context.telegramBotService.start();
    if (result.success) {
      res.json({ success: true, botInfo: result.botInfo });
    } else {
      res.status(400).json({ code: 'telegram_error', message: result.error });
    }
  });

  app.post('/telegram/stop', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }

    await context.telegramBotService.stop();
    res.json({ success: true });
  });

  app.post('/telegram/validate', (req: AuthenticatedRequest, res: Response) => {
    const validation = context.telegramBotService.validateConfig();
    res.json(validation);
  });

  // Tool Approval
  app.get('/tools/approval-status', (req: AuthenticatedRequest, res: Response) => {
    const workspaceId = req.query.workspaceId as string | undefined;
    if (workspaceId) {
      const workspace = context.config.workspaces.find(w => w.id === workspaceId);
      res.json({ allowAll: workspace?.allowAllTools === true });
    } else {
      const status = context.toolsService.getApprovalStatus();
      res.json(status);
    }
  });

  app.post('/tools/clear-approvals', async (req: AuthenticatedRequest, res: Response) => {
    if (context.config.readOnly) {
      return res.status(403).json({ code: 'read_only', message: 'Server is in read-only mode' });
    }
    
    const { workspaceId } = req.body || {};
    
    if (workspaceId) {
      // Clear for specific workspace
      const workspace = context.config.workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        workspace.allowAllTools = false;
        try {
          await context.configService.save();
        } catch (error) {
          console.error('[routes] Failed to persist clear-approvals:', error);
        }
      }
    } else {
      // Clear global approvals
      context.toolsService.clearApprovals();
      // Also clear all workspace allowAllTools
      for (const ws of context.config.workspaces) {
        ws.allowAllTools = false;
      }
      try {
        await context.configService.save();
      } catch (error) {
        console.error('[routes] Failed to persist clear-approvals:', error);
      }
    }
    
    res.json({ success: true, message: 'Tool approvals cleared' });
  });

  // NOTE: /tools/request-approval is no longer needed.
  // Tool approval is handled inline via SSE events from agenticChat.

  // Tool approval response - called by the desktop app with user's decision
  app.post('/tools/approve', async (req: AuthenticatedRequest, res: Response) => {
    const { allowed, allowAll, workspaceId } = req.body;
    
    // Resolve the pending approval in the LLM service (unblocks the agenticChat generator)
    context.llmService.resolveToolApproval({ allowed, allowAll });
    
    // If "Allow All" was selected, persist it to the workspace config
    if (allowAll && allowed && workspaceId) {
      const workspace = context.config.workspaces.find(w => w.id === workspaceId);
      if (workspace) {
        workspace.allowAllTools = true;
        // Persist to disk
        try {
          await context.configService.save();
          console.log(`[routes] Persisted allowAllTools for workspace: ${workspace.name || workspace.id}`);
        } catch (error) {
          console.error('[routes] Failed to persist allowAllTools:', error);
        }
      }
    }
    
    res.json({ success: true, message: 'Approval response recorded' });
  });

  // NOTE: /tools/pending-approval is no longer needed.
  // Tool approval is handled inline via SSE events from agenticChat.
  // Keeping the endpoint for backward compat but it always returns null.
  app.get('/tools/pending-approval', (req: AuthenticatedRequest, res: Response) => {
    res.json(null);
  });
}

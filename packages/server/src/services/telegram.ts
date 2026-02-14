/**
 * Telegram Bot Service for Comrade
 * Allows users to interact with Comrade via Telegram
 */

import TelegramBot from 'node-telegram-bot-api';
import { ServerConfig, TelegramConfig, TelegramChatSession, LLMMessage } from '@comrade/core';
import { LLMService } from './llm.js';
import { SessionService } from './session.js';

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private config: TelegramConfig | null = null;
  private llmService: LLMService;
  private sessionService: SessionService;
  private chatSessions: Map<number, TelegramChatSession> = new Map();
  private isRunning = false;

  constructor(
    private serverConfig: ServerConfig,
    llmService: LLMService,
    sessionService: SessionService
  ) {
    this.config = serverConfig.telegram || null;
    this.llmService = llmService;
    this.sessionService = sessionService;
  }

  /**
   * Start the Telegram bot
   */
  async start(): Promise<{ success: boolean; error?: string; botInfo?: { username: string; id: number } }> {
    if (this.isRunning) {
      return { success: true, botInfo: await this.getBotInfo() };
    }

    if (!this.config?.enabled || !this.config?.botToken) {
      return { success: false, error: 'Telegram bot is not configured' };
    }

    try {
      // Create bot with polling
      this.bot = new TelegramBot(this.config.botToken, { polling: true });

      // Setup message handler
      this.setupMessageHandler();

      // Setup command handlers
      this.setupCommandHandlers();

      this.isRunning = true;
      console.log('[telegram] Bot started successfully');

      const botInfo = await this.getBotInfo();
      return { success: true, botInfo };
    } catch (error) {
      console.error('[telegram] Failed to start bot:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error starting bot' 
      };
    }
  }

  /**
   * Stop the Telegram bot
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.bot) {
      return;
    }

    try {
      await this.bot.stopPolling();
      this.bot = null;
      this.isRunning = false;
      console.log('[telegram] Bot stopped');
    } catch (error) {
      console.error('[telegram] Error stopping bot:', error);
    }
  }

  /**
   * Update bot configuration
   */
  updateConfig(config: TelegramConfig): void {
    this.config = config;
    
    // Restart bot if configuration changed
    if (this.isRunning) {
      this.stop().then(() => {
        if (config.enabled) {
          this.start();
        }
      });
    } else if (config.enabled) {
      this.start();
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): TelegramConfig | null {
    return this.config;
  }

  /**
   * Get bot status
   */
  getStatus(): { 
    isRunning: boolean; 
    isConfigured: boolean; 
    botInfo?: { username: string; id: number };
    activeChats: number;
  } {
    return {
      isRunning: this.isRunning,
      isConfigured: !!this.config?.botToken && this.config?.enabled === true,
      botInfo: this.bot ? { username: 'unknown', id: 0 } : undefined,
      activeChats: this.chatSessions.size,
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; error?: string } {
    if (!this.config) {
      return { valid: false, error: 'Configuration not found' };
    }

    if (!this.config.enabled) {
      return { valid: false, error: 'Telegram bot is not enabled' };
    }

    if (!this.config.botToken) {
      return { valid: false, error: 'Bot token is required' };
    }

    if (!this.config.botToken.match(/^\d+:[A-Za-z0-9_-]+$/)) {
      return { valid: false, error: 'Invalid bot token format' };
    }

    return { valid: true };
  }

  /**
   * Get bot info
   */
  private async getBotInfo(): Promise<{ username: string; id: number }> {
    if (!this.bot) {
      throw new Error('Bot not initialized');
    }
    const me = await this.bot.getMe();
    return { username: me.username || 'unknown', id: me.id };
  }

  /**
   * Check if user is authorized
   */
  private isAuthorized(userId: number): boolean {
    if (!this.config?.authorizedUsers || this.config.authorizedUsers.length === 0) {
      // If no authorized users configured, allow all (for development)
      return true;
    }
    return this.config.authorizedUsers.includes(userId);
  }

  /**
   * Get or create chat session
   */
  private async getOrCreateSession(chatId: number, userId: number, username?: string): Promise<TelegramChatSession> {
    // Check if we have an existing session
    const existing = this.chatSessions.get(chatId);
    if (existing) {
      existing.lastActivity = Date.now();
      return existing;
    }

    // Get default workspace
    const workspaceId = this.config?.defaultWorkspaceId || this.serverConfig.activeWorkspaceId || '';
    
    if (!workspaceId) {
      throw new Error('No workspace configured');
    }

    // Create new session
    const session = await this.sessionService.create(
      workspaceId,
      `Telegram chat with ${username || userId}`
    );

    const chatSession: TelegramChatSession = {
      chatId,
      sessionId: session.id,
      workspaceId,
      lastActivity: Date.now(),
    };

    this.chatSessions.set(chatId, chatSession);
    return chatSession;
  }

  /**
   * Setup message handler
   */
  private setupMessageHandler(): void {
    if (!this.bot) return;

    this.bot.on('message', async (msg) => {
      // Ignore non-text messages
      if (!msg.text || msg.text.startsWith('/')) return;

      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;
      const username = msg.from?.username;

      try {
        // Check authorization
        if (!this.isAuthorized(userId)) {
          await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
          return;
        }

        // Check if LLM is configured
        const llmValidation = this.llmService.validateConfig();
        if (!llmValidation.valid) {
          await this.bot!.sendMessage(
            chatId, 
            `⚠️ **LLM Not Configured**\n\n${llmValidation.error}\n\nPlease configure an LLM provider in Comrade Settings first.`
          );
          return;
        }

        // Show typing indicator
        if (this.config?.showTypingIndicator) {
          this.bot!.sendChatAction(chatId, 'typing');
        }

        // Get or create session
        const chatSession = await this.getOrCreateSession(chatId, userId, username);

        // Add user message to session
        await this.sessionService.addMessage(chatSession.sessionId, 'user', msg.text);

        // Get session messages for LLM context
        const session = await this.sessionService.get(chatSession.sessionId);
        const messages: LLMMessage[] = session?.messages.map(m => ({
          role: m.role,
          content: m.content,
        })) || [{ role: 'user', content: msg.text }];

        // Stream response from LLM
        let fullResponse = '';
        const stream = this.llmService.streamChat(messages);

        // Send initial message
        const responseMsg = await this.bot!.sendMessage(chatId, '🤔 Thinking...');
        const messageId = responseMsg.message_id;

        // Collect response
        for await (const chunk of stream) {
          if (chunk.error) {
            await this.bot!.editMessageText(`❌ Error: ${chunk.error}`, {
              chat_id: chatId,
              message_id: messageId,
            });
            return;
          }

          if (chunk.content) {
            fullResponse += chunk.content;
            
            // Update message every 100 chars to avoid rate limits
            if (fullResponse.length % 100 < 10) {
              try {
                await this.bot!.editMessageText(this.formatResponse(fullResponse), {
                  chat_id: chatId,
                  message_id: messageId,
                  parse_mode: this.config?.parseMode === 'None' ? undefined : this.config?.parseMode,
                });
              } catch (e) {
                // Ignore edit errors (message might be the same)
              }
            }
          }
        }

        // Final update with complete response
        if (fullResponse) {
          await this.sessionService.addMessage(chatSession.sessionId, 'assistant', fullResponse);
          
          await this.bot!.editMessageText(this.formatResponse(fullResponse), {
            chat_id: chatId,
            message_id: messageId,
            parse_mode: this.config?.parseMode === 'None' ? undefined : this.config?.parseMode,
          });
        }

      } catch (error) {
        console.error('[telegram] Error handling message:', error);
        await this.bot!.sendMessage(
          chatId, 
          `❌ Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    });
  }

  /**
   * Setup command handlers
   */
  private setupCommandHandlers(): void {
    if (!this.bot) return;

    // Start command
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;

      if (!this.isAuthorized(userId)) {
        await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      await this.bot!.sendMessage(
        chatId,
        `👋 **Welcome to Comrade!**\n\n` +
        `I am your AI assistant connected to Comrade on your PC.\n\n` +
        `**Available Commands:**\n` +
        `/start - Show this welcome message\n` +
        `/status - Check bot and LLM status\n` +
        `/new - Start a new conversation\n` +
        `/workspace - Show current workspace\n` +
        `/help - Show help information\n\n` +
        `Just send me a message and I'll help you!`
      );
    });

    // Status command
    this.bot.onText(/\/status/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;

      if (!this.isAuthorized(userId)) {
        await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      const llmValidation = this.llmService.validateConfig();
      const status = this.getStatus();

      await this.bot!.sendMessage(
        chatId,
        `📊 **Bot Status**\n\n` +
        `Bot: ${status.isRunning ? '✅ Running' : '❌ Stopped'}\n` +
        `LLM: ${llmValidation.valid ? '✅ Configured' : '❌ ' + llmValidation.error}\n` +
        `Active Chats: ${status.activeChats}`
      );
    });

    // New session command
    this.bot.onText(/\/new/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;

      if (!this.isAuthorized(userId)) {
        await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      // Remove existing session for this chat
      this.chatSessions.delete(chatId);

      await this.bot!.sendMessage(
        chatId,
        '🆕 **New conversation started!**\n\nHow can I help you today?'
      );
    });

    // Workspace command
    this.bot.onText(/\/workspace/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;

      if (!this.isAuthorized(userId)) {
        await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      const chatSession = this.chatSessions.get(chatId);
      const workspace = chatSession 
        ? this.serverConfig.workspaces.find(w => w.id === chatSession.workspaceId)
        : null;

      if (workspace) {
        await this.bot!.sendMessage(
          chatId,
          `📁 **Current Workspace**\n\nName: ${workspace.name}\nPath: ${workspace.path}`
        );
      } else {
        await this.bot!.sendMessage(
          chatId,
          '⚠️ No workspace configured. Please set a default workspace in Comrade settings.'
        );
      }
    });

    // Help command
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const userId = msg.from?.id || 0;

      if (!this.isAuthorized(userId)) {
        await this.bot!.sendMessage(chatId, '⛔ You are not authorized to use this bot.');
        return;
      }

      await this.bot!.sendMessage(
        chatId,
        `ℹ️ **Help**\n\n` +
        `This bot connects to Comrade running on your PC and uses AI to help you.\n\n` +
        `**Tips:**\n` +
        `• Just type naturally - I'm powered by AI!\n` +
        `• Use /new to start fresh conversations\n` +
        `• Use /status to check if everything is working\n\n` +
        `**Limitations:**\n` +
        `• I can only access files in the configured workspace\n` +
        `• Large files may take time to process\n\n` +
        `For more help, visit the Comrade documentation.`
      );
    });
  }

  /**
   * Format response for Telegram
   */
  private formatResponse(text: string): string {
    // Escape special characters for Markdown
    if (this.config?.parseMode === 'Markdown') {
      return text
        .replace(/\\/g, '\\\\')
        .replace(/_/g, '\\_')
        .replace(/\*/g, '\\*')
        .replace(/\[/g, '\\[')
        .replace(/\]/g, '\\]')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/~/g, '\\~')
        .replace(/`/g, '\\`')
        .replace(/>/g, '\\>')
        .replace(/#/g, '\\#')
        .replace(/\+/g, '\\+')
        .replace(/-/g, '\\-')
        .replace(/=/g, '\\=')
        .replace(/\|/g, '\\|')
        .replace(/{/g, '\\{')
        .replace(/}/g, '\\}')
        .replace(/!/g, '\\!');
    }
    return text;
  }
}

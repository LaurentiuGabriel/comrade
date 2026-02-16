/**
 * Config service for managing server configuration
 * Saves to JSON file for persistence across restarts
 */

import { ServerConfig, LLMConfig, TelegramConfig, Skill } from '@comrade/core';
import { writeFile, readFile, mkdir, access } from 'fs/promises';
import { dirname, join } from 'path';

export interface SavedConfig {
  version: number;
  workspaces: ServerConfig['workspaces'];
  activeWorkspaceId: ServerConfig['activeWorkspaceId'];
  authorizedRoots: ServerConfig['authorizedRoots'];
  corsOrigins: ServerConfig['corsOrigins'];
  approval: ServerConfig['approval'];
  llm?: LLMConfig;
  telegram?: TelegramConfig;
  skills?: Skill[];
  createdAt: number;
  updatedAt: number;
}

export class ConfigService {
  private configPath: string;
  private dataDir: string;
  
  constructor(
    private config: ServerConfig,
    dataDir: string = '.comrade'
  ) {
    this.dataDir = dataDir;
    this.configPath = join(dataDir, 'config.json');
  }

  /**
   * Get the path where config is stored
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Save current configuration to file
   */
  async save(): Promise<void> {
    try {
      // Ensure data directory exists
      await mkdir(this.dataDir, { recursive: true });

      // Prepare config data (exclude sensitive fields like API keys)
      const savedConfig: SavedConfig = {
        version: 1,
        workspaces: this.config.workspaces,
        activeWorkspaceId: this.config.activeWorkspaceId,
        authorizedRoots: this.config.authorizedRoots,
        corsOrigins: this.config.corsOrigins,
        approval: this.config.approval,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // Save LLM config (without API key for security)
      if (this.config.llm) {
        savedConfig.llm = {
          ...this.config.llm,
          apiKey: '[REDACTED]', // Don't save API keys in plain text
        };
      }

      // Save Telegram config (without bot token for security)
      if (this.config.telegram) {
        savedConfig.telegram = {
          ...this.config.telegram,
          botToken: '[REDACTED]', // Don't save tokens in plain text
        };
      }

      // Write to file
      await writeFile(
        this.configPath,
        JSON.stringify(savedConfig, null, 2),
        'utf8'
      );

      console.log(`[config] Configuration saved to ${this.configPath}`);
    } catch (error) {
      console.error('[config] Failed to save configuration:', error);
      throw error;
    }
  }

  /**
   * Load configuration from file
   * This should be called during server startup
   */
  async load(): Promise<Partial<SavedConfig>> {
    try {
      // Check if config file exists
      await access(this.configPath);
      
      const data = await readFile(this.configPath, 'utf8');
      const parsed: SavedConfig = JSON.parse(data);

      console.log(`[config] Configuration loaded from ${this.configPath}`);
      
      return parsed;
    } catch (error) {
      // File doesn't exist or is invalid
      console.log('[config] No existing configuration found, using defaults');
      return {};
    }
  }

  /**
   * Apply loaded configuration to current config
   * Called after load() to merge saved settings
   */
  applyLoadedConfig(loaded: Partial<SavedConfig>): void {
    if (loaded.workspaces) {
      this.config.workspaces = loaded.workspaces;
    }
    if (loaded.activeWorkspaceId) {
      this.config.activeWorkspaceId = loaded.activeWorkspaceId;
    }
    if (loaded.authorizedRoots) {
      this.config.authorizedRoots = loaded.authorizedRoots;
    }
    if (loaded.corsOrigins) {
      this.config.corsOrigins = loaded.corsOrigins;
    }
    if (loaded.approval) {
      this.config.approval = loaded.approval;
    }
    if (loaded.llm) {
      // Don't overwrite API key if it's redacted
      if (loaded.llm.apiKey === '[REDACTED]' && this.config.llm?.apiKey) {
        loaded.llm.apiKey = this.config.llm.apiKey;
      }
      this.config.llm = loaded.llm;
    }
    if (loaded.telegram) {
      // Don't overwrite bot token if it's redacted
      if (loaded.telegram.botToken === '[REDACTED]' && this.config.telegram?.botToken) {
        loaded.telegram.botToken = this.config.telegram.botToken;
      }
      this.config.telegram = loaded.telegram;
    }
  }

  /**
   * Get current configuration
   */
  get(): ServerConfig {
    return this.config;
  }

  /**
   * Update configuration and save to file
   */
  async update(updates: Partial<ServerConfig>): Promise<void> {
    Object.assign(this.config, updates);
    await this.save();
  }

  /**
   * Update LLM configuration
   */
  async updateLLMConfig(llmConfig: LLMConfig): Promise<void> {
    this.config.llm = llmConfig;
    await this.save();
  }

  /**
   * Update Telegram configuration
   */
  async updateTelegramConfig(telegramConfig: TelegramConfig): Promise<void> {
    this.config.telegram = telegramConfig;
    await this.save();
  }

  /**
   * Update skills list
   */
  async updateSkills(skills: Skill[]): Promise<void> {
    // Skills are saved separately in the skills service
    // This method exists for coordination if needed
    await this.save();
  }

  /**
   * Check if config file exists
   */
  async exists(): Promise<boolean> {
    try {
      await access(this.configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get configuration as a plain object (for API responses)
   * Excludes sensitive data
   */
  getSanitizedConfig(): object {
    return {
      workspaces: this.config.workspaces,
      activeWorkspaceId: this.config.activeWorkspaceId,
      authorizedRoots: this.config.authorizedRoots,
      corsOrigins: this.config.corsOrigins,
      approval: this.config.approval,
      llm: this.config.llm ? {
        provider: this.config.llm.provider,
        model: this.config.llm.model,
        enabled: this.config.llm.enabled,
        temperature: this.config.llm.temperature,
        maxTokens: this.config.llm.maxTokens,
        topP: this.config.llm.topP,
        // API key is excluded
      } : null,
      telegram: this.config.telegram ? {
        enabled: this.config.telegram.enabled,
        authorizedUsers: this.config.telegram.authorizedUsers,
        defaultWorkspaceId: this.config.telegram.defaultWorkspaceId,
        showTypingIndicator: this.config.telegram.showTypingIndicator,
        parseMode: this.config.telegram.parseMode,
        // Bot token is excluded
      } : null,
    };
  }
}

/**
 * Config service for managing server configuration
 */

import { ServerConfig } from '@comrade/core';
import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

export class ConfigService {
  constructor(private config: ServerConfig) {}

  async save(): Promise<void> {
    if (!this.config.configPath) return;

    const configData = {
      workspaces: this.config.workspaces,
      activeWorkspaceId: this.config.activeWorkspaceId,
      authorizedRoots: this.config.authorizedRoots,
      corsOrigins: this.config.corsOrigins,
      approval: this.config.approval,
    };

    await mkdir(dirname(this.config.configPath), { recursive: true });
    await writeFile(
      this.config.configPath,
      JSON.stringify(configData, null, 2),
      'utf8'
    );
  }

  async load(): Promise<void> {
    if (!this.config.configPath) return;

    try {
      const data = await readFile(this.config.configPath, 'utf8');
      const parsed = JSON.parse(data);

      if (parsed.workspaces) {
        this.config.workspaces = parsed.workspaces;
      }
      if (parsed.activeWorkspaceId) {
        this.config.activeWorkspaceId = parsed.activeWorkspaceId;
      }
      if (parsed.authorizedRoots) {
        this.config.authorizedRoots = parsed.authorizedRoots;
      }
      if (parsed.corsOrigins) {
        this.config.corsOrigins = parsed.corsOrigins;
      }
      if (parsed.approval) {
        this.config.approval = parsed.approval;
      }
    } catch (error) {
      // File doesn't exist or is invalid, use defaults
    }
  }

  get(): ServerConfig {
    return this.config;
  }

  update(updates: Partial<ServerConfig>): void {
    Object.assign(this.config, updates);
  }
}

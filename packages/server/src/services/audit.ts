/**
 * Audit service for tracking actions
 */

import { ServerConfig, AuditEntry, Actor, generateId } from '@comrade/core';
import { writeFile, readFile, mkdir, appendFile } from 'fs/promises';
import { join } from 'path';

export class AuditService {
  private entries: AuditEntry[] = [];

  constructor(private config: ServerConfig) {}

  async record(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry> {
    const fullEntry: AuditEntry = {
      ...entry,
      id: generateId(),
    };

    this.entries.push(fullEntry);

    // Also save to file if workspace is available
    if (entry.workspaceId) {
      const workspace = this.config.workspaces.find(w => w.id === entry.workspaceId);
      if (workspace) {
        await this.saveToFile(workspace.path, fullEntry);
      }
    }

    return fullEntry;
  }

  async list(workspaceId?: string, limit = 100): Promise<AuditEntry[]> {
    let entries = this.entries;
    
    if (workspaceId) {
      entries = entries.filter(e => e.workspaceId === workspaceId);
    }

    // Sort by timestamp desc
    entries.sort((a, b) => b.timestamp - a.timestamp);

    return entries.slice(0, limit);
  }

  async get(entryId: string): Promise<AuditEntry | null> {
    return this.entries.find(e => e.id === entryId) || null;
  }

  private async saveToFile(workspacePath: string, entry: AuditEntry): Promise<void> {
    try {
      const auditDir = join(workspacePath, '.comrade');
      await mkdir(auditDir, { recursive: true });
      
      const auditFile = join(auditDir, 'audit.log');
      const line = JSON.stringify(entry) + '\n';
      
      await appendFile(auditFile, line, 'utf8');
    } catch (error) {
      console.error('Failed to write audit log:', error);
    }
  }
}

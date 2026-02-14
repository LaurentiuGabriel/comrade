/**
 * Workspace service for managing workspaces
 */

import { ServerConfig, Workspace, generateId } from '@comrade/core';
import { mkdir, writeFile, readFile, access } from 'fs/promises';
import { join, resolve } from 'path';

export class WorkspaceService {
  constructor(private config: ServerConfig) {}

  async create(name: string, path: string): Promise<Workspace> {
    const resolvedPath = resolve(path);
    
    // Ensure directory exists
    try {
      await access(resolvedPath);
    } catch {
      await mkdir(resolvedPath, { recursive: true });
    }

    const workspace: Workspace = {
      id: generateId(),
      name,
      path: resolvedPath,
      createdAt: Date.now(),
    };

    // Create .comrade directory
    await mkdir(join(resolvedPath, '.comrade'), { recursive: true });
    await mkdir(join(resolvedPath, '.comrade/skills'), { recursive: true });
    await mkdir(join(resolvedPath, '.comrade/commands'), { recursive: true });

    // Save workspace config
    await writeFile(
      join(resolvedPath, '.comrade/config.json'),
      JSON.stringify({ id: workspace.id, name, createdAt: workspace.createdAt }, null, 2)
    );

    this.config.workspaces.push(workspace);
    
    return workspace;
  }

  getById(id: string): Workspace | undefined {
    return this.config.workspaces.find(w => w.id === id);
  }

  getByPath(path: string): Workspace | undefined {
    return this.config.workspaces.find(w => w.path === resolve(path));
  }

  getAll(): Workspace[] {
    return [...this.config.workspaces];
  }

  getActive(): Workspace | null {
    if (!this.config.activeWorkspaceId) return null;
    return this.getById(this.config.activeWorkspaceId) || null;
  }

  setActive(id: string): boolean {
    const workspace = this.getById(id);
    if (!workspace) return false;
    
    this.config.activeWorkspaceId = id;
    
    // Move to front of list
    this.config.workspaces = [
      workspace,
      ...this.config.workspaces.filter(w => w.id !== id)
    ];
    
    return true;
  }

  delete(id: string): boolean {
    const initialLength = this.config.workspaces.length;
    this.config.workspaces = this.config.workspaces.filter(w => w.id !== id);
    
    if (this.config.activeWorkspaceId === id) {
      this.config.activeWorkspaceId = this.config.workspaces[0]?.id || null;
    }
    
    return this.config.workspaces.length < initialLength;
  }
}

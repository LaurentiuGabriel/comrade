/**
 * Skill service for managing skills
 */

import { ServerConfig, Skill, generateId } from '@comrade/core';
import { readdir, readFile, writeFile, mkdir, access, stat, unlink } from 'fs/promises';
import { join } from 'path';

export class SkillService {
  constructor(private config: ServerConfig) {}

  async list(workspaceId: string): Promise<Skill[]> {
    const workspace = this.config.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const skillsDir = join(workspace.path, '.comrade/skills');
    const skills: Skill[] = [];

    try {
      const entries = await readdir(skillsDir);
      
      for (const entry of entries) {
        if (entry.endsWith('.md')) {
          const skillPath = join(skillsDir, entry);
          try {
            const content = await readFile(skillPath, 'utf8');
            const name = entry.replace('.md', '');
            
            skills.push({
              id: generateId(),
              name,
              description: this.extractDescription(content),
              content,
              version: '1.0.0',
              tags: [],
              installed: true,
              path: skillPath,
            });
          } catch (error) {
            console.error(`Failed to load skill ${entry}:`, error);
          }
        }
      }
    } catch (error) {
      // Directory doesn't exist or is empty
    }

    return skills;
  }

  async get(workspaceId: string, name: string): Promise<Skill | null> {
    const workspace = this.config.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const skillPath = join(workspace.path, '.comrade/skills', `${name}.md`);
    
    try {
      const content = await readFile(skillPath, 'utf8');
      return {
        id: generateId(),
        name,
        description: this.extractDescription(content),
        content,
        version: '1.0.0',
        tags: [],
        installed: true,
        path: skillPath,
      };
    } catch (error) {
      return null;
    }
  }

  async create(workspaceId: string, name: string, content: string): Promise<Skill> {
    if (this.config.readOnly) {
      throw new Error('Server is in read-only mode');
    }

    const workspace = this.config.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const skillsDir = join(workspace.path, '.comrade/skills');
    await mkdir(skillsDir, { recursive: true });

    const skillPath = join(skillsDir, `${name}.md`);
    
    // Check if already exists
    try {
      await access(skillPath);
      throw new Error(`Skill ${name} already exists`);
    } catch (error: any) {
      if (error.code !== 'ENOENT') throw error;
    }

    await writeFile(skillPath, content, 'utf8');

    return {
      id: generateId(),
      name,
      description: this.extractDescription(content),
      content,
      version: '1.0.0',
      tags: [],
      installed: true,
      path: skillPath,
    };
  }

  async update(workspaceId: string, name: string, content: string): Promise<Skill> {
    if (this.config.readOnly) {
      throw new Error('Server is in read-only mode');
    }

    const workspace = this.config.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const skillPath = join(workspace.path, '.comrade/skills', `${name}.md`);
    await writeFile(skillPath, content, 'utf8');

    return {
      id: generateId(),
      name,
      description: this.extractDescription(content),
      content,
      version: '1.0.0',
      tags: [],
      installed: true,
      path: skillPath,
    };
  }

  async delete(workspaceId: string, name: string): Promise<boolean> {
    if (this.config.readOnly) {
      throw new Error('Server is in read-only mode');
    }

    const workspace = this.config.workspaces.find(w => w.id === workspaceId);
    if (!workspace) throw new Error('Workspace not found');

    const skillPath = join(workspace.path, '.comrade/skills', `${name}.md`);
    
    try {
      await unlink(skillPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  private extractDescription(content: string): string {
    const lines = content.split('\n');
    
    // Look for first non-header line
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return trimmed.slice(0, 200);
      }
    }
    
    return 'No description available';
  }
}

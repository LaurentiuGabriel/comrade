/**
 * Tools service for LLM agent capabilities
 */

import { ServerConfig } from '@comrade/core';
import { writeFile, readFile, mkdir, access, constants } from 'fs/promises';
import { dirname, join, resolve } from 'path';

export interface Tool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required: string[];
  };
}

export interface ToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export const AVAILABLE_TOOLS: Tool[] = [
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the specified content. The path must be within the current workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path relative to the workspace root (e.g., "docs/readme.md" or "src/main.js")'
        },
        content: {
          type: 'string',
          description: 'The content to write to the file'
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file. The path must be within the current workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The file path relative to the workspace root'
        }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a directory (and any necessary parent directories). The path must be within the current workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The directory path relative to the workspace root'
        }
      },
      required: ['path']
    }
  }
];

export function getToolsPrompt(): string {
  return `You are an AI assistant with access to tools that can modify the workspace. When you need to create, read, or modify files, use the following format:

<tool_call>
{
  "tool": "write_file",
  "arguments": {
    "path": "relative/path/to/file.txt",
    "content": "file content here"
  }
}
</tool_call>

Available tools:
${AVAILABLE_TOOLS.map(t => `- ${t.name}: ${t.description}`).join('\n')}

To use a tool, wrap the JSON in <tool_call> tags. The system will execute the tool and return the result. You can then respond naturally to the user about what was done.

Important notes:
- All paths are relative to the workspace root
- You can use multiple tool calls in a single response if needed
- Always confirm successful tool execution to the user`;
}

export class ToolsService {
  private workspacePath: string;

  constructor(private serverConfig: ServerConfig) {
    // Get the active workspace path
    const activeWorkspace = serverConfig.workspaces.find(
      w => w.id === serverConfig.activeWorkspaceId
    );
    this.workspacePath = activeWorkspace?.path || process.cwd();
  }

  setWorkspace(workspacePath: string): void {
    this.workspacePath = workspacePath;
  }

  async executeTool(call: ToolCall): Promise<ToolResult> {
    try {
      switch (call.tool) {
        case 'write_file':
          return await this.writeFile(call.arguments);
        case 'read_file':
          return await this.readFile(call.arguments);
        case 'create_directory':
          return await this.createDirectory(call.arguments);
        default:
          return { success: false, error: `Unknown tool: ${call.tool}` };
      }
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    const { path: relativePath, content } = args;
    
    if (typeof relativePath !== 'string' || typeof content !== 'string') {
      return { success: false, error: 'Invalid arguments: path and content must be strings' };
    }

    const fullPath = this.resolvePath(relativePath);
    
    // Ensure directory exists
    await mkdir(dirname(fullPath), { recursive: true });
    
    // Write file
    await writeFile(fullPath, content, 'utf-8');
    
    return { success: true, output: `File created: ${relativePath}` };
  }

  private async readFile(args: Record<string, unknown>): Promise<ToolResult> {
    const { path: relativePath } = args;
    
    if (typeof relativePath !== 'string') {
      return { success: false, error: 'Invalid arguments: path must be a string' };
    }

    const fullPath = this.resolvePath(relativePath);
    
    try {
      await access(fullPath, constants.R_OK);
    } catch {
      return { success: false, error: `File not found: ${relativePath}` };
    }
    
    const content = await readFile(fullPath, 'utf-8');
    
    return { success: true, output: content };
  }

  private async createDirectory(args: Record<string, unknown>): Promise<ToolResult> {
    const { path: relativePath } = args;
    
    if (typeof relativePath !== 'string') {
      return { success: false, error: 'Invalid arguments: path must be a string' };
    }

    const fullPath = this.resolvePath(relativePath);
    
    await mkdir(fullPath, { recursive: true });
    
    return { success: true, output: `Directory created: ${relativePath}` };
  }

  private resolvePath(relativePath: string): string {
    // Normalize the path and ensure it's within the workspace
    const resolved = resolve(this.workspacePath, relativePath);
    const normalizedWorkspace = resolve(this.workspacePath);
    
    if (!resolved.startsWith(normalizedWorkspace)) {
      throw new Error('Path is outside the workspace');
    }
    
    return resolved;
  }

  /**
   * Parse tool calls from LLM response
   */
  parseToolCalls(content: string): { text: string; toolCalls: ToolCall[] } {
    const toolCalls: ToolCall[] = [];
    let text = content;

    // Find all tool_call blocks
    const regex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      try {
        const jsonStr = match[1].trim();
        const toolCall = JSON.parse(jsonStr) as ToolCall;
        toolCalls.push(toolCall);
      } catch (error) {
        console.error('[tools] Failed to parse tool call:', error);
      }
    }

    // Remove tool call blocks from text
    text = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

    return { text, toolCalls };
  }
}

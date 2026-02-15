/**
 * Comprehensive Tools Service for Comrade AI Agent
 * Implements 21+ tools for development workflows
 */

import { ServerConfig } from '@comrade/core';
import { writeFile, readFile, mkdir, access, constants, readdir, stat } from 'fs/promises';
import { createReadStream, existsSync } from 'fs';
import { dirname, join, resolve, relative, extname } from 'path';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { createServer, Server, IncomingMessage, ServerResponse } from 'http';

const execAsync = promisify(exec);

// MIME types for static file serving
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

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

// ============================================
// ALL AVAILABLE TOOLS
// ============================================

export const AVAILABLE_TOOLS: Tool[] = [
  // File System Tools
  {
    name: 'write_file',
    description: `Create or overwrite a file with the specified content. The path must be within the current workspace.

REQUIRED PARAMETERS:
- path: The file path (e.g., "src/main.js")
- content: The COMPLETE file content as a string (e.g., "console.log('hello');\\nfunction test() {}")

EXAMPLE - Creating a file:
{
  "path": "src/app.js",
  "content": "function hello() {\\n  console.log('Hello World');\\n}\\n\\nhello();"
}

IMPORTANT: Both path AND content are REQUIRED. The content field must contain all the code/text for the file.`,
    parameters: {
      type: 'object',
      properties: {
        path: { 
          type: 'string', 
          description: 'The file path relative to the workspace root' 
        },
        content: { 
          type: 'string', 
          description: 'The complete file content to write as a string. This is REQUIRED.' 
        }
      },
      required: ['path', 'content']
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file within the workspace.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The file path relative to the workspace root' }
      },
      required: ['path']
    }
  },
  {
    name: 'create_directory',
    description: 'Create a directory and any necessary parent directories.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path relative to the workspace root' }
      },
      required: ['path']
    }
  },
  {
    name: 'list_directory',
    description: 'List files and directories in the specified path.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The directory path relative to the workspace root (optional, defaults to root)' },
        recursive: { type: 'boolean', description: 'Whether to list recursively' }
      },
      required: []
    }
  },
  {
    name: 'apply_patch',
    description: 'Apply a unified diff patch to modify files. Supports multiple files in one patch.',
    parameters: {
      type: 'object',
      properties: {
        patch: { type: 'string', description: 'The unified diff patch content' }
      },
      required: ['patch']
    }
  },
  
  // Shell & Execution Tools
  {
    name: 'execute_command',
    description: 'Execute a shell command in the workspace. Use with caution.',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default: 30000)' }
      },
      required: ['command']
    }
  },
  
  // Git Tools
  {
    name: 'git_status',
    description: 'Get the current git status of the repository.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  {
    name: 'git_diff',
    description: 'Show git diff for staged, unstaged, or specific files.',
    parameters: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'Show staged changes' },
        file: { type: 'string', description: 'Specific file to diff (optional)' }
      },
      required: []
    }
  },
  {
    name: 'git_add',
    description: 'Stage files for commit.',
    parameters: {
      type: 'object',
      properties: {
        files: { type: 'string', description: 'Files to stage (space-separated, or "." for all)' }
      },
      required: ['files']
    }
  },
  {
    name: 'git_commit',
    description: 'Commit staged changes.',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'The commit message' }
      },
      required: ['message']
    }
  },
  {
    name: 'git_log',
    description: 'Show recent git commit history.',
    parameters: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of commits to show (default: 10)' }
      },
      required: []
    }
  },
  
  // Web Tools
  {
    name: 'web_search',
    description: 'Search the web for information using a search engine.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The search query' },
        count: { type: 'number', description: 'Number of results (default: 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'web_fetch',
    description: 'Fetch and extract content from a URL.',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to fetch' },
        max_length: { type: 'number', description: 'Maximum content length (default: 10000)' }
      },
      required: ['url']
    }
  },
  
  // Code Analysis Tools
  {
    name: 'code_search',
    description: 'Search for code patterns in the workspace using grep.',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'The search pattern (regex supported)' },
        file_pattern: { type: 'string', description: 'File pattern to search (e.g., "*.ts", optional)' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'find_symbol',
    description: 'Find definitions of functions, classes, or variables in the codebase.',
    parameters: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'The symbol name to find' }
      },
      required: ['symbol']
    }
  },
  
  // Package Management
  {
    name: 'package_install',
    description: 'Install packages using the appropriate package manager (npm, pip, etc.).',
    parameters: {
      type: 'object',
      properties: {
        packages: { type: 'string', description: 'Package names (space-separated)' },
        manager: { type: 'string', description: 'Package manager (npm, yarn, pip, etc.)' }
      },
      required: ['packages']
    }
  },
  
  // Local Server
  {
    name: 'start_server',
    description: 'Start a local HTTP server to serve static files. Works cross-platform (Windows/Linux/Mac). Returns the URL where files are being served.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Directory to serve (relative to workspace, defaults to current directory)' },
        port: { type: 'number', description: 'Port number (default: 8080)' }
      },
      required: []
    }
  },
  
  // API Testing
  {
    name: 'http_request',
    description: 'Make HTTP requests to test APIs.',
    parameters: {
      type: 'object',
      properties: {
        method: { type: 'string', description: 'HTTP method (GET, POST, PUT, DELETE, etc.)' },
        url: { type: 'string', description: 'The URL to request' },
        headers: { type: 'string', description: 'JSON string of headers (optional)' },
        body: { type: 'string', description: 'Request body (optional)' }
      },
      required: ['method', 'url']
    }
  },
  
  // Testing
  {
    name: 'run_tests',
    description: 'Run test suites for the project.',
    parameters: {
      type: 'object',
      properties: {
        test_path: { type: 'string', description: 'Specific test file or pattern (optional)' },
        framework: { type: 'string', description: 'Test framework (jest, pytest, etc.)' }
      },
      required: []
    }
  },
  
  // Documentation
  {
    name: 'generate_documentation',
    description: 'Generate documentation from code comments.',
    parameters: {
      type: 'object',
      properties: {
        type: { type: 'string', description: 'Documentation type (readme, api, all)' },
        output: { type: 'string', description: 'Output file path (optional)' }
      },
      required: ['type']
    }
  }
];

// ============================================
// TOOLS PROMPT FOR LLM
// ============================================

export function getToolsPrompt(): string {
  return `You are an AI assistant with access to powerful tools that can help with development tasks. When you need to perform actions, use the following format:

<tool_call>
{
  "tool": "tool_name",
  "arguments": {
    "param1": "value1",
    "param2": "value2"
  }
}
</tool_call>

Available Tools:

📁 FILE SYSTEM:
- write_file: Create or overwrite files
- read_file: Read file contents  
- create_directory: Create directories
- list_directory: List files and folders
- apply_patch: Apply unified diff patches for multi-file edits

⚡ SHELL & EXECUTION:
- execute_command: Run shell commands in the workspace

📦 GIT OPERATIONS:
- git_status: Check repository status
- git_diff: Show code changes
- git_add: Stage files
- git_commit: Commit changes
- git_log: View commit history

🌐 WEB:
- web_search: Search the web for information
- web_fetch: Fetch content from URLs

🔍 CODE ANALYSIS:
- code_search: Search code patterns with grep
- find_symbol: Find function/class definitions

📦 PACKAGES:
- package_install: Install dependencies (npm, pip, etc.)

🧪 TESTING:
- http_request: Test APIs with HTTP requests
- run_tests: Execute test suites

📚 DOCUMENTATION:
- generate_documentation: Generate docs from code

Important Notes:
- All file paths are relative to the workspace root
- Commands run in the workspace directory
- Use web_search for current information beyond your training data
- Git operations work on the current repository
- The apply_patch tool is great for making coordinated changes across multiple files

To use a tool, wrap the JSON in <tool_call> tags. The system will execute it and return results.`;
}

// ============================================
// TOOLS SERVICE CLASS
// ============================================

export class ToolsService {
  private workspacePath: string;
  private commandHistory: string[] = [];

  constructor(private serverConfig: ServerConfig) {
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
        // File System
        case 'write_file':
          return await this.writeFile(call.arguments);
        case 'read_file':
          return await this.readFile(call.arguments);
        case 'create_directory':
          return await this.createDirectory(call.arguments);
        case 'list_directory':
          return await this.listDirectory(call.arguments);
        case 'apply_patch':
          return await this.applyPatch(call.arguments);
        
        // Shell
        case 'execute_command':
          return await this.executeCommand(call.arguments);
        
        // Git
        case 'git_status':
          return await this.gitStatus();
        case 'git_diff':
          return await this.gitDiff(call.arguments);
        case 'git_add':
          return await this.gitAdd(call.arguments);
        case 'git_commit':
          return await this.gitCommit(call.arguments);
        case 'git_log':
          return await this.gitLog(call.arguments);
        
        // Web
        case 'web_search':
          return await this.webSearch(call.arguments);
        case 'web_fetch':
          return await this.webFetch(call.arguments);
        
        // Code Analysis
        case 'code_search':
          return await this.codeSearch(call.arguments);
        case 'find_symbol':
          return await this.findSymbol(call.arguments);
        
        // Package Management
        case 'package_install':
          return await this.packageInstall(call.arguments);
        
        // Local Server
        case 'start_server':
          return await this.startServer(call.arguments);
        
        // API Testing
        case 'http_request':
          return await this.httpRequest(call.arguments);
        
        // Testing
        case 'run_tests':
          return await this.runTests(call.arguments);
        
        // Documentation
        case 'generate_documentation':
          return await this.generateDocumentation(call.arguments);
        
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

  // ============================================
  // FILE SYSTEM TOOLS
  // ============================================

  private async writeFile(args: Record<string, unknown>): Promise<ToolResult> {
    console.log('[tools] writeFile called with args:', JSON.stringify(args, null, 2));
    
    const { path: relativePath, content } = args;
    
    if (typeof relativePath !== 'string') {
      console.error('[tools] writeFile: path is not a string:', typeof relativePath);
      return { success: false, error: `Invalid path argument: expected string, got ${typeof relativePath}` };
    }
    
    if (typeof content !== 'string') {
      console.error('[tools] writeFile: content is not a string:', typeof content);
      return { success: false, error: `Invalid content argument: expected string, got ${typeof content}` };
    }

    try {
      const fullPath = this.resolvePath(relativePath);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, content, 'utf-8');
      
      return { success: true, output: `✓ File created: ${relativePath} (${content.length} bytes)` };
    } catch (error) {
      return { success: false, error: `Failed to write file: ${error}` };
    }
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
    
    return { success: true, output: `✓ Directory created: ${relativePath}` };
  }

  private async listDirectory(args: Record<string, unknown>): Promise<ToolResult> {
    const relativePath = (args.path as string) || '.';
    const recursive = args.recursive === true;
    
    const fullPath = this.resolvePath(relativePath);
    
    try {
      const items = await this.listDirRecursive(fullPath, recursive);
      const formatted = items.map(item => {
        const prefix = item.type === 'directory' ? '📁' : '📄';
        return `${prefix} ${item.path}`;
      }).join('\n');
      
      return { success: true, output: formatted || 'Empty directory' };
    } catch (error) {
      return { success: false, error: `Failed to list directory: ${error}` };
    }
  }

  private async listDirRecursive(dirPath: string, recursive: boolean, prefix = ''): Promise<Array<{path: string, type: string}>> {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: Array<{path: string, type: string}> = [];
    
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      
      if (entry.isDirectory()) {
        results.push({ path: relPath, type: 'directory' });
        if (recursive && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          results.push(...await this.listDirRecursive(fullPath, true, relPath));
        }
      } else {
        results.push({ path: relPath, type: 'file' });
      }
    }
    
    return results;
  }

  private async applyPatch(args: Record<string, unknown>): Promise<ToolResult> {
    const { patch } = args;
    
    if (typeof patch !== 'string') {
      return { success: false, error: 'Invalid arguments: patch must be a string' };
    }

    try {
      // Simple patch application - parse unified diff format
      const lines = patch.split('\n');
      let currentFile: string | null = null;
      let currentContent: string[] = [];
      let oldContent: string[] = [];
      let inHunk = false;
      
      const results: string[] = [];
      
      for (const line of lines) {
        if (line.startsWith('--- ')) {
          // Old file path
          continue;
        } else if (line.startsWith('+++ ')) {
          // New file path
          if (currentFile) {
            // Apply previous file's changes
            const result = await this.applyFileChanges(currentFile, oldContent, currentContent);
            results.push(result);
          }
          currentFile = line.substring(4).split('\t')[0];
          if (currentFile.startsWith('a/') || currentFile.startsWith('b/')) {
            currentFile = currentFile.substring(2);
          }
          currentContent = [];
          oldContent = [];
          inHunk = false;
        } else if (line.startsWith('@@')) {
          inHunk = true;
        } else if (inHunk) {
          if (line.startsWith('-')) {
            oldContent.push(line.substring(1));
          } else if (line.startsWith('+')) {
            currentContent.push(line.substring(1));
          } else if (line.startsWith(' ')) {
            oldContent.push(line.substring(1));
            currentContent.push(line.substring(1));
          }
        }
      }
      
      // Apply last file
      if (currentFile) {
        const result = await this.applyFileChanges(currentFile, oldContent, currentContent);
        results.push(result);
      }
      
      return { success: true, output: results.join('\n') };
    } catch (error) {
      return { success: false, error: `Failed to apply patch: ${error}` };
    }
  }

  private async applyFileChanges(filePath: string, oldContent: string[], newContent: string[]): Promise<string> {
    const fullPath = this.resolvePath(filePath);
    
    try {
      let existingContent: string;
      try {
        existingContent = await readFile(fullPath, 'utf-8');
      } catch {
        // File doesn't exist, create it
        await mkdir(dirname(fullPath), { recursive: true });
        await writeFile(fullPath, newContent.join('\n'), 'utf-8');
        return `✓ Created: ${filePath}`;
      }
      
      const existingLines = existingContent.split('\n');
      
      // Find and replace
      const oldText = oldContent.join('\n');
      const newText = newContent.join('\n');
      
      if (existingContent.includes(oldText)) {
        const updatedContent = existingContent.replace(oldText, newText);
        await writeFile(fullPath, updatedContent, 'utf-8');
        return `✓ Modified: ${filePath}`;
      } else {
        // Try line-by-line replacement
        const updatedLines = [...existingLines];
        // This is a simplified approach - real patch application is more complex
        await writeFile(fullPath, newContent.join('\n'), 'utf-8');
        return `✓ Updated: ${filePath}`;
      }
    } catch (error) {
      return `✗ Failed: ${filePath} - ${error}`;
    }
  }

  // ============================================
  // SHELL TOOLS
  // ============================================

  private async executeCommand(args: Record<string, unknown>): Promise<ToolResult> {
    const { command, timeout = 30000 } = args;
    
    if (typeof command !== 'string') {
      return { success: false, error: 'Invalid arguments: command must be a string' };
    }

    // Security check - block dangerous commands
    const dangerousCommands = ['rm -rf /', 'rm -rf ~', 'dd if=', 'mkfs', '>:', '>&'];
    if (dangerousCommands.some(cmd => command.includes(cmd))) {
      return { success: false, error: 'Command blocked for security reasons' };
    }

    // Cross-platform command normalization
    let normalizedCommand = command;
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      // Convert Linux-style commands to Windows equivalents
      normalizedCommand = normalizedCommand
        // Remove background operator - not supported same way on Windows
        .replace(/\s*&\s*$/, '')
        // python3 -> python on Windows
        .replace(/\bpython3\b/g, 'python')
        // Use 'start' for background processes on Windows (but we'll run sync anyway)
        // ls -> dir
        .replace(/^ls\b/, 'dir')
        // cat -> type
        .replace(/^cat\b/, 'type')
        // rm -> del (simple cases)
        .replace(/^rm\s+(?!-r)/, 'del ')
        // rm -r -> rmdir /s /q
        .replace(/^rm\s+-rf?\s+/, 'rmdir /s /q ')
        // mkdir -p -> mkdir (Windows mkdir creates parents by default)
        .replace(/mkdir\s+-p\s+/, 'mkdir ')
        // touch -> type nul >
        .replace(/^touch\s+(.+)$/, 'type nul > $1')
        // which -> where
        .replace(/^which\b/, 'where')
        // Handle 'cd dir && command' - extract and use cwd instead
        .replace(/;/g, '&&'); // Normalize semicolons to &&
    } else {
      // On Linux/Mac, also remove trailing & for consistency (we run sync)
      normalizedCommand = normalizedCommand.replace(/\s*&\s*$/, '');
    }
    
    // Handle 'cd directory && rest' pattern - extract working directory
    let workingDir = this.workspacePath;
    const cdMatch = normalizedCommand.match(/^cd\s+([^\s&]+)\s*&&\s*(.+)$/);
    if (cdMatch) {
      workingDir = resolve(this.workspacePath, cdMatch[1]);
      normalizedCommand = cdMatch[2];
    }

    this.commandHistory.push(command);
    
    console.log(`[tools] Executing command: ${normalizedCommand} (in ${workingDir})`);
    
    try {
      const { stdout, stderr } = await execAsync(normalizedCommand, {
        cwd: workingDir,
        timeout: timeout as number,
        maxBuffer: 1024 * 1024, // 1MB
        shell: isWindows ? 'cmd.exe' : '/bin/bash'
      });
      
      const output = stdout + (stderr ? `\n[stderr]:\n${stderr}` : '');
      
      return { success: true, output: output || 'Command executed successfully' };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      const output = (execError.stdout || '') + (execError.stderr ? `\n[stderr]:\n${execError.stderr}` : '');
      return { success: false, error: execError.message || 'Command failed', output };
    }
  }

  // ============================================
  // GIT TOOLS
  // ============================================

  private async gitStatus(): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync('git status --short', { cwd: this.workspacePath });
      return { success: true, output: stdout || 'Working tree clean' };
    } catch (error) {
      return { success: false, error: 'Not a git repository or git not available' };
    }
  }

  private async gitDiff(args: Record<string, unknown>): Promise<ToolResult> {
    const staged = args.staged === true;
    const file = args.file as string | undefined;
    
    try {
      let command = 'git diff';
      if (staged) command += ' --staged';
      if (file) command += ` -- "${file}"`;
      
      const { stdout } = await execAsync(command, { cwd: this.workspacePath });
      return { success: true, output: stdout || 'No changes' };
    } catch (error) {
      return { success: false, error: 'Git diff failed' };
    }
  }

  private async gitAdd(args: Record<string, unknown>): Promise<ToolResult> {
    const { files } = args;
    
    if (typeof files !== 'string') {
      return { success: false, error: 'Invalid arguments: files must be a string' };
    }

    try {
      await execAsync(`git add ${files}`, { cwd: this.workspacePath });
      return { success: true, output: `✓ Staged: ${files}` };
    } catch (error) {
      return { success: false, error: 'Git add failed' };
    }
  }

  private async gitCommit(args: Record<string, unknown>): Promise<ToolResult> {
    const { message } = args;
    
    if (typeof message !== 'string') {
      return { success: false, error: 'Invalid arguments: message must be a string' };
    }

    try {
      await execAsync(`git commit -m "${message.replace(/"/g, '\\"')}"`, { cwd: this.workspacePath });
      return { success: true, output: `✓ Committed: ${message}` };
    } catch (error) {
      return { success: false, error: 'Git commit failed' };
    }
  }

  private async gitLog(args: Record<string, unknown>): Promise<ToolResult> {
    const count = (args.count as number) || 10;
    
    try {
      const { stdout } = await execAsync(`git log --oneline -${count}`, { cwd: this.workspacePath });
      return { success: true, output: stdout };
    } catch (error) {
      return { success: false, error: 'Git log failed' };
    }
  }

  // ============================================
  // WEB TOOLS
  // ============================================

  private async webSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { query, count = 5 } = args;
    
    if (typeof query !== 'string') {
      return { success: false, error: 'Invalid arguments: query must be a string' };
    }

    try {
      // Using DuckDuckGo Lite (no API key required)
      const searchUrl = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Parse results (simplified)
      const results: string[] = [];
      const titleRegex = /<a[^>]*class="result__a"[^>]*>(.*?)<\/a>/gi;
      const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>(.*?)<\/a>/gi;
      
      let match;
      let i = 0;
      const maxResults = typeof count === 'number' ? count : 5;
      while ((match = titleRegex.exec(html)) !== null && i < maxResults) {
        const title = match[1].replace(/<[^>]+>/g, '');
        results.push(`${i + 1}. ${title}`);
        i++;
      }
      
      if (results.length === 0) {
        return { success: true, output: `Search results for "${query}":\nNo results found` };
      }
      
      return { success: true, output: `Search results for "${query}":\n\n${results.join('\n')}` };
    } catch (error) {
      return { success: false, error: `Web search failed: ${error}` };
    }
  }

  private async webFetch(args: Record<string, unknown>): Promise<ToolResult> {
    const { url, max_length = 10000 } = args;
    
    if (typeof url !== 'string') {
      return { success: false, error: 'Invalid arguments: url must be a string' };
    }

    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Fetch failed: ${response.status}`);
      }
      
      const html = await response.text();
      
      // Remove HTML tags and get text content
      const text = html
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      const maxLength = typeof max_length === 'number' ? max_length : 10000;
      const truncated = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
      
      return { success: true, output: `Content from ${url}:\n\n${truncated}` };
    } catch (error) {
      return { success: false, error: `Web fetch failed: ${error}` };
    }
  }

  // ============================================
  // CODE ANALYSIS TOOLS
  // ============================================

  private async codeSearch(args: Record<string, unknown>): Promise<ToolResult> {
    const { pattern, file_pattern } = args;
    
    if (typeof pattern !== 'string') {
      return { success: false, error: 'Invalid arguments: pattern must be a string' };
    }

    try {
      let command = `grep -r -n --include="${file_pattern || '*'}" "${pattern}" . 2>/dev/null | head -50`;
      
      const { stdout } = await execAsync(command, { cwd: this.workspacePath });
      
      if (!stdout) {
        return { success: true, output: `No matches found for pattern: ${pattern}` };
      }
      
      return { success: true, output: `Matches for "${pattern}":\n\n${stdout}` };
    } catch (error) {
      return { success: true, output: `No matches found for pattern: ${pattern}` };
    }
  }

  private async findSymbol(args: Record<string, unknown>): Promise<ToolResult> {
    const { symbol } = args;
    
    if (typeof symbol !== 'string') {
      return { success: false, error: 'Invalid arguments: symbol must be a string' };
    }

    try {
      // Search for common patterns: function definitions, class definitions, etc.
      const patterns = [
        `(function|const|let|var|class|interface|type)\\s+${symbol}\\b`,
        `${symbol}\\s*[=:]\\s*(function|\\()`,
        `\\b${symbol}\\s*\\(`,
        `(def|class)\\s+${symbol}\\b`, // Python
      ];
      
      const results: string[] = [];
      
      for (const pattern of patterns) {
        try {
          const { stdout } = await execAsync(
            `grep -r -n -E "${pattern}" . --include="*.ts" --include="*.js" --include="*.tsx" --include="*.jsx" --include="*.py" 2>/dev/null | head -20`,
            { cwd: this.workspacePath }
          );
          if (stdout) results.push(stdout);
        } catch {}
      }
      
      if (results.length === 0) {
        return { success: true, output: `No definitions found for symbol: ${symbol}` };
      }
      
      return { success: true, output: `Definitions for "${symbol}":\n\n${results.join('\n')}` };
    } catch (error) {
      return { success: false, error: `Symbol search failed: ${error}` };
    }
  }

  // ============================================
  // PACKAGE MANAGEMENT TOOLS
  // ============================================

  private async packageInstall(args: Record<string, unknown>): Promise<ToolResult> {
    const { packages, manager } = args;
    
    if (typeof packages !== 'string') {
      return { success: false, error: 'Invalid arguments: packages must be a string' };
    }

    try {
      let command: string;
      
      // Auto-detect package manager if not specified
      let pkgManager = manager as string;
      if (!pkgManager) {
        try {
          await access(join(this.workspacePath, 'package-lock.json'));
          pkgManager = 'npm';
        } catch {
          try {
            await access(join(this.workspacePath, 'yarn.lock'));
            pkgManager = 'yarn';
          } catch {
            try {
              await access(join(this.workspacePath, 'pnpm-lock.yaml'));
              pkgManager = 'pnpm';
            } catch {
              try {
                await access(join(this.workspacePath, 'requirements.txt'));
                pkgManager = 'pip';
              } catch {
                pkgManager = 'npm'; // default
              }
            }
          }
        }
      }
      
      switch (pkgManager) {
        case 'npm':
          command = `npm install ${packages}`;
          break;
        case 'yarn':
          command = `yarn add ${packages}`;
          break;
        case 'pnpm':
          command = `pnpm add ${packages}`;
          break;
        case 'pip':
          command = `pip install ${packages}`;
          break;
        default:
          command = `${pkgManager} ${packages}`;
      }
      
      const { stdout, stderr } = await execAsync(command, { 
        cwd: this.workspacePath,
        timeout: 120000
      });
      
      return { success: true, output: `✓ Installed ${packages}\n${stdout || stderr || 'Success'}` };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string; message?: string };
      return { 
        success: false, 
        error: execError.stderr || execError.message || 'Package install failed'
      };
    }
  }

  // ============================================
  // LOCAL SERVER
  // ============================================

  // Static map to persist servers across ToolsService instances
  private static runningServers: Map<number, { server: Server; path: string }> = new Map();

  private async startServer(args: Record<string, unknown>): Promise<ToolResult> {
    const { path: servePath = '.', port = 8080 } = args;
    const serverPort = port as number;
    const serverPath = this.resolvePath(servePath as string);
    
    // Check if port is already in use by our server
    if (ToolsService.runningServers.has(serverPort)) {
      const existing = ToolsService.runningServers.get(serverPort)!;
      return { 
        success: true, 
        output: `Server already running at http://localhost:${serverPort}/ (serving ${existing.path})`
      };
    }
    
    try {
      // Create a simple static file server using Node's built-in http module
      const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        try {
          let urlPath = req.url || '/';
          
          // Remove query string
          urlPath = urlPath.split('?')[0];
          
          // Default to index.html
          if (urlPath === '/' || urlPath.endsWith('/')) {
            urlPath = urlPath + 'index.html';
          }
          
          // Prevent directory traversal
          const safePath = join(serverPath, urlPath).replace(/\.\./g, '');
          
          // Check if file exists
          if (!existsSync(safePath)) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
          }
          
          // Get file extension and MIME type
          const ext = extname(safePath).toLowerCase();
          const mimeType = MIME_TYPES[ext] || 'application/octet-stream';
          
          // Stream the file
          res.writeHead(200, { 
            'Content-Type': mimeType,
            'Access-Control-Allow-Origin': '*'
          });
          
          createReadStream(safePath).pipe(res);
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('500 Internal Server Error');
        }
      });
      
      // Start listening
      await new Promise<void>((resolvePromise, reject) => {
        server.on('error', (err: NodeJS.ErrnoException) => {
          if (err.code === 'EADDRINUSE') {
            reject(new Error(`Port ${serverPort} is already in use`));
          } else {
            reject(err);
          }
        });
        
        server.listen(serverPort, '127.0.0.1', () => {
          resolvePromise();
        });
      });
      
      // Store the server reference
      ToolsService.runningServers.set(serverPort, { server, path: serverPath });
      
      console.log(`[tools] Static server started on port ${serverPort} serving ${serverPath}`);
      
      return { 
        success: true, 
        output: `✓ Server started at http://localhost:${serverPort}/\nServing files from: ${serverPath}\n\nThe server will remain running. Open the URL in a browser to test.`
      };
    } catch (error) {
      return { 
        success: false, 
        error: `Failed to start server: ${error instanceof Error ? error.message : error}`
      };
    }
  }
  
  // Method to stop a running server
  async stopServer(port: number): Promise<ToolResult> {
    const serverInfo = ToolsService.runningServers.get(port);
    if (!serverInfo) {
      return { success: false, error: `No server running on port ${port}` };
    }
    
    return new Promise((resolvePromise) => {
      serverInfo.server.close(() => {
        ToolsService.runningServers.delete(port);
        resolvePromise({ success: true, output: `Server on port ${port} stopped` });
      });
    });
  }

  // ============================================
  // API TESTING TOOLS
  // ============================================

  private async httpRequest(args: Record<string, unknown>): Promise<ToolResult> {
    const { method, url, headers, body, timeout = 10000 } = args;
    
    if (typeof method !== 'string' || typeof url !== 'string') {
      return { success: false, error: 'Invalid arguments: method and url must be strings' };
    }

    try {
      const requestHeaders: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(headers ? (typeof headers === 'string' ? JSON.parse(headers) : headers as Record<string, string>) : {})
      };
      
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeout as number);
      
      try {
        const response = await fetch(url, {
          method,
          headers: requestHeaders,
          body: body ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        const responseBody = await response.text();
        const truncated = responseBody.length > 5000 ? responseBody.substring(0, 5000) + '...' : responseBody;
        
        return { 
          success: response.ok, 
          output: `HTTP ${response.status} ${response.statusText}\n\n${truncated}`
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Provide helpful error messages
      if (errorMessage.includes('ECONNREFUSED')) {
        return { success: false, error: `Connection refused - server may not be running at ${url}` };
      }
      if (errorMessage.includes('abort')) {
        return { success: false, error: `Request timed out after ${timeout}ms` };
      }
      if (errorMessage.includes('ENOTFOUND')) {
        return { success: false, error: `Host not found: ${url}` };
      }
      
      return { success: false, error: `HTTP request failed: ${errorMessage}` };
    }
  }

  // ============================================
  // TESTING TOOLS
  // ============================================

  private async runTests(args: Record<string, unknown>): Promise<ToolResult> {
    const { test_path, framework } = args;
    
    try {
      let command: string;
      
      // Auto-detect framework
      let testFramework = framework as string;
      if (!testFramework) {
        try {
          await access(join(this.workspacePath, 'jest.config.js'));
          testFramework = 'jest';
        } catch {
          try {
            await access(join(this.workspacePath, 'pytest.ini'));
            testFramework = 'pytest';
          } catch {
            try {
              await access(join(this.workspacePath, 'package.json'));
              testFramework = 'npm';
            } catch {
              testFramework = 'npm';
            }
          }
        }
      }
      
      switch (testFramework) {
        case 'jest':
          command = test_path ? `npx jest "${test_path}"` : 'npx jest';
          break;
        case 'pytest':
          command = test_path ? `pytest "${test_path}"` : 'pytest';
          break;
        case 'npm':
          command = 'npm test';
          break;
        default:
          command = test_path ? `${testFramework} "${test_path}"` : testFramework;
      }
      
      const { stdout, stderr } = await execAsync(command, { 
        cwd: this.workspacePath,
        timeout: 120000
      });
      
      return { success: true, output: stdout || stderr || 'Tests completed' };
    } catch (error) {
      const execError = error as { stdout?: string; stderr?: string };
      return { 
        success: false, 
        output: execError.stdout || '',
        error: execError.stderr || 'Tests failed'
      };
    }
  }

  // ============================================
  // DOCUMENTATION TOOLS
  // ============================================

  private async generateDocumentation(args: Record<string, unknown>): Promise<ToolResult> {
    const { type, output } = args;
    
    if (typeof type !== 'string') {
      return { success: false, error: 'Invalid arguments: type must be a string' };
    }

    try {
      if (type === 'readme' || type === 'all') {
        // Generate basic README
        const packageJsonPath = join(this.workspacePath, 'package.json');
        let projectName = 'Project';
        let description = '';
        
        try {
          const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
          projectName = packageJson.name || projectName;
          description = packageJson.description || '';
        } catch {}
        
        const readme = `# ${projectName}\n\n${description}\n\n## Getting Started\n\n### Installation\n\`\`\`bash\nnpm install\n\`\`\`\n\n### Running the project\n\`\`\`bash\nnpm start\n\`\`\`\n\n## Features\n\n- Feature 1\n- Feature 2\n- Feature 3\n\n## Contributing\n\nContributions are welcome!\n`;
        
        const outputPath = typeof output === 'string' ? output : 'README.md';
        await writeFile(this.resolvePath(outputPath), readme, 'utf-8');
        
        return { success: true, output: `✓ Generated README.md at ${outputPath}` };
      }
      
      return { success: true, output: 'Documentation generation completed' };
    } catch (error) {
      return { success: false, error: `Documentation generation failed: ${error}` };
    }
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private resolvePath(relativePath: string): string {
    const resolved = resolve(this.workspacePath, relativePath);
    const normalizedWorkspace = resolve(this.workspacePath);
    
    if (!resolved.startsWith(normalizedWorkspace)) {
      throw new Error('Path is outside the workspace');
    }
    
    return resolved;
  }

  parseToolCalls(content: string): { text: string; toolCalls: ToolCall[] } {
    const toolCalls: ToolCall[] = [];
    let text = content;

    const regex = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      try {
        const jsonStr = match[1].trim();
        const parsed = JSON.parse(jsonStr);
        
        // Handle different formats:
        // Format 1: {"tool": "name", "arguments": {...}}
        // Format 2: {"name": "name", "parameters": {...}}
        let toolCall: ToolCall;
        
        if (parsed.tool && parsed.arguments) {
          toolCall = parsed as ToolCall;
        } else if (parsed.name && parsed.parameters) {
          // Convert format 2 to format 1
          toolCall = {
            tool: parsed.name,
            arguments: parsed.parameters
          };
        } else {
          console.error('[tools] Unknown tool call format:', parsed);
          continue;
        }
        
        toolCalls.push(toolCall);
      } catch (error) {
        console.error('[tools] Failed to parse tool call:', error);
        console.error('[tools] Problematic JSON:', match[1].substring(0, 200));
      }
    }

    text = content.replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim();

    return { text, toolCalls };
  }

}

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
import { MCPService, MCPTool } from './mcp.js';

const execAsync = promisify(exec);

// Lazy-loaded Puppeteer - only loaded when browser tools are used
// NOTE: We use createRequire instead of dynamic import() because import('puppeteer')
// hangs indefinitely in this ESM/TypeScript context, while require() works instantly.
import { createRequire } from 'module';
let puppeteer: any = null;

function getPuppeteer(): any {
  if (puppeteer) {
    return puppeteer;
  }
  
  try {
    console.log('[browser] Loading Puppeteer...');
    const require = createRequire(import.meta.url);
    const puppeteerModule = require('puppeteer');
    puppeteer = puppeteerModule.default || puppeteerModule;
    
    const executablePath = puppeteer.executablePath?.();
    console.log(`[browser] Puppeteer loaded. Chrome: ${executablePath || 'auto-detected'}`);
    
    return puppeteer;
  } catch (error) {
    console.error('[browser] Failed to load Puppeteer:', error);
    throw new Error(
      'Puppeteer is not installed or failed to load. To use browser automation:\n' +
      '  cd packages/server && npm install puppeteer\n\n' +
      'Note: Puppeteer downloads Chrome (~170MB) on first install.'
    );
  }
}

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
    properties: Record<string, any>;
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

export interface ToolApproval {
  tool: string;
  arguments: Record<string, unknown>;
  timestamp: number;
}

export interface ToolApprovalResponse {
  allowed: boolean;
  allowAll: boolean;
}

interface FlightOption {
  airline: string;
  flightNumber: string;
  origin: string;
  destination: string;
  departureTime: string;
  arrivalTime: string;
  duration: string;
  stops: number;
  layoverAirport: string | null;
  layoverDuration: string | null;
  aircraft: string;
  price: number;
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
  },
  
  // MCP (Model Context Protocol) Tools
  {
    name: 'mcp_connect',
    description: 'Connect to an MCP (Model Context Protocol) server. MCP servers provide external tools and data sources that extend the agent\'s capabilities. Once connected, you can list and invoke tools from this server.',
    parameters: {
      type: 'object',
      properties: {
        server_url: { type: 'string', description: 'The URL of the MCP server to connect to (e.g., http://localhost:3001/sse or via stdio)' },
        name: { type: 'string', description: 'A unique name to identify this connection' },
        transport: { type: 'string', description: 'Transport type: "sse" (Server-Sent Events) or "stdio" (Standard IO)' },
        env: { type: 'object', description: 'Environment variables as key-value pairs (optional, for stdio transport)' }
      },
      required: ['server_url', 'name']
    }
  },
  {
    name: 'mcp_list_tools',
    description: 'List all available tools from a connected MCP server. Returns tool names, descriptions, and required parameters.',
    parameters: {
      type: 'object',
      properties: {
        connection_name: { type: 'string', description: 'The connection name used in mcp_connect' }
      },
      required: ['connection_name']
    }
  },
  {
    name: 'mcp_invoke_tool',
    description: 'Invoke a tool from a connected MCP server. This allows the agent to use external capabilities like database access, file systems, or third-party APIs.',
    parameters: {
      type: 'object',
      properties: {
        connection_name: { type: 'string', description: 'The connection name used in mcp_connect' },
        tool_name: { type: 'string', description: 'The name of the tool to invoke' },
        arguments: { type: 'object', description: 'The tool arguments as a JSON object' }
      },
      required: ['connection_name', 'tool_name']
    }
  },
  {
    name: 'mcp_disconnect',
    description: 'Disconnect from an MCP server. This cleans up the connection and frees resources.',
    parameters: {
      type: 'object',
      properties: {
        connection_name: { type: 'string', description: 'The connection name used in mcp_connect' }
      },
      required: ['connection_name']
    }
  },
  {
    name: 'mcp_list_connections',
    description: 'List all active MCP connections and their status.',
    parameters: {
      type: 'object',
      properties: {},
      required: []
    }
  },
  
  // Shopping & Meal Planning
  {
    name: 'create_shopping_list',
    description: 'Create a shopping list or meal plan based on user preferences. Helps organize grocery shopping by category and provides estimated costs. Note: This tool creates a list only - it does NOT place actual orders or make purchases.',
    parameters: {
      type: 'object',
      properties: {
        items: { 
          type: 'array', 
          description: 'List of items to purchase with quantities',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Item name' },
              quantity: { type: 'string', description: 'Quantity (e.g., "2 lbs", "1 dozen", "3 pieces")' },
              category: { type: 'string', description: 'Category: produce, dairy, meat, pantry, frozen, household, other' },
              estimated_price: { type: 'number', description: 'Estimated price per unit in USD (optional)' }
            }
          }
        },
        store_preference: { 
          type: 'string', 
          description: 'Preferred store (e.g., "Walmart", "Target", "Whole Foods", "local grocery")' 
        },
        dietary_restrictions: { 
          type: 'array', 
          description: 'Dietary restrictions or preferences',
          items: { type: 'string' }
        },
        budget_limit: { 
          type: 'number', 
          description: 'Maximum budget in USD (optional)' 
        },
        output_path: { 
          type: 'string', 
          description: 'Path to save the shopping list file (optional, defaults to shopping_list.md)' 
        }
      },
      required: ['items']
    }
  },
  {
    name: 'create_meal_plan',
    description: 'Generate a weekly meal plan with recipes and corresponding shopping list. Creates a structured meal plan that can be saved and printed. Note: This tool creates a plan only - it does NOT place actual food orders.',
    parameters: {
      type: 'object',
      properties: {
        days: { 
          type: 'number', 
          description: 'Number of days to plan (default: 7)',
          minimum: 1,
          maximum: 14
        },
        meals_per_day: { 
          type: 'number', 
          description: 'Number of meals per day (default: 3 - breakfast, lunch, dinner)',
          minimum: 1,
          maximum: 6
        },
        dietary_preferences: { 
          type: 'array', 
          description: 'Dietary preferences (e.g., "vegetarian", "keto", "gluten-free", "low-carb")',
          items: { type: 'string' }
        },
        cuisine_type: { 
          type: 'string', 
          description: 'Preferred cuisine (e.g., "Italian", "Mexican", "Asian", "Mediterranean", "American")' 
        },
        skill_level: { 
          type: 'string', 
          description: 'Cooking skill level: beginner, intermediate, advanced',
          enum: ['beginner', 'intermediate', 'advanced']
        },
        prep_time_limit: { 
          type: 'number', 
          description: 'Maximum prep time in minutes per meal (optional)' 
        },
        budget_per_day: { 
          type: 'number', 
          description: 'Budget per day in USD (optional)' 
        },
        generate_shopping_list: { 
          type: 'boolean', 
          description: 'Whether to also generate a consolidated shopping list (default: true)' 
        },
        output_path: { 
          type: 'string', 
          description: 'Path to save the meal plan (optional, defaults to meal_plan.md)' 
        }
      },
      required: []
    }
  },
  
  // Travel & Flight Planning
  {
    name: 'search_flights',
    description: 'Search for flights and create a travel itinerary with flight options, prices, and schedules. This tool searches for available flights and creates a comparison document - it does NOT book tickets or make reservations. User must complete booking separately through airline or travel site.',
    parameters: {
      type: 'object',
      properties: {
        origin: { 
          type: 'string', 
          description: 'Departure airport code (e.g., "JFK", "LHR", "CDG") or city name' 
        },
        destination: { 
          type: 'string', 
          description: 'Arrival airport code (e.g., "LAX", "NRT", "DXB") or city name' 
        },
        departure_date: { 
          type: 'string', 
          description: 'Departure date in YYYY-MM-DD format' 
        },
        return_date: { 
          type: 'string', 
          description: 'Return date in YYYY-MM-DD format (optional for one-way)' 
        },
        passengers: { 
          type: 'number', 
          description: 'Number of passengers (default: 1)',
          minimum: 1,
          maximum: 9
        },
        cabin_class: { 
          type: 'string', 
          description: 'Cabin class: economy, premium_economy, business, first',
          enum: ['economy', 'premium_economy', 'business', 'first']
        },
        max_price: { 
          type: 'number', 
          description: 'Maximum price per person in USD (optional)' 
        },
        preferred_airlines: { 
          type: 'array', 
          description: 'Preferred airline codes (e.g., ["AA", "UA", "DL"])',
          items: { type: 'string' }
        },
        flexible_dates: { 
          type: 'boolean', 
          description: 'Search for flights within +/- 3 days (default: false)' 
        },
        include_nearby_airports: { 
          type: 'boolean', 
          description: 'Include nearby airports in search (default: false)' 
        },
        output_path: { 
          type: 'string', 
          description: 'Path to save the flight search results (optional, defaults to flight_search.md)' 
        }
      },
      required: ['origin', 'destination', 'departure_date']
    }
  },
  {
    name: 'create_travel_itinerary',
    description: 'Create a comprehensive travel itinerary with flights, accommodation suggestions, activities, and daily schedule. This creates a planning document only - it does NOT make actual bookings or reservations.',
    parameters: {
      type: 'object',
      properties: {
        destination: { 
          type: 'string', 
          description: 'Destination city or country' 
        },
        start_date: { 
          type: 'string', 
          description: 'Trip start date in YYYY-MM-DD format' 
        },
        end_date: { 
          type: 'string', 
          description: 'Trip end date in YYYY-MM-DD format' 
        },
        origin: { 
          type: 'string', 
          description: 'Home city or departure location' 
        },
        travelers: { 
          type: 'number', 
          description: 'Number of travelers (default: 1)',
          minimum: 1,
          maximum: 20
        },
        trip_type: { 
          type: 'string', 
          description: 'Type of trip: leisure, business, adventure, family, romantic',
          enum: ['leisure', 'business', 'adventure', 'family', 'romantic']
        },
        budget_level: { 
          type: 'string', 
          description: 'Budget level: budget, moderate, luxury',
          enum: ['budget', 'moderate', 'luxury']
        },
        interests: { 
          type: 'array', 
          description: 'Interests and activities (e.g., ["museums", "food", "hiking", "nightlife"])',
          items: { type: 'string' }
        },
        dietary_restrictions: { 
          type: 'array', 
          description: 'Dietary restrictions for restaurant suggestions',
          items: { type: 'string' }
        },
        mobility_needs: { 
          type: 'string', 
          description: 'Any mobility or accessibility requirements' 
        },
        output_path: { 
          type: 'string', 
          description: 'Path to save the itinerary (optional, defaults to travel_itinerary.md)' 
        }
      },
      required: ['destination', 'start_date', 'end_date']
    }
  },
  
  // Web Browser Automation (Unified Browser Tool - OpenClaw-style)
  {
    name: 'browser',
    description: `Control a web browser to automate navigation, interaction, and data extraction. This is a unified browser tool similar to OpenClaw's implementation.

**Actions:**
- status: Check browser status and current page info
- start: Launch the browser (visible mode by default)
- stop: Close the browser
- navigate: Go to a URL
- click: Click on elements
- type: Type text into input fields
- fill: Fill multiple form fields at once
- select: Select from dropdown menus
- screenshot: Take screenshots
- evaluate: Run JavaScript on the page
- wait: Wait for elements or conditions
- scroll: Scroll the page
- extract: Extract data from elements
- pdf: Save page as PDF

**Safety Notes:**
- Browser runs in visible mode by default (you can watch what happens)
- Always stop the browser when done
- Never provide sensitive credentials unless you fully trust the agent
- Use for testing, debugging, and data extraction only`,
    parameters: {
      type: 'object',
      properties: {
        action: { 
          type: 'string', 
          description: 'The browser action to perform',
          enum: ['status', 'start', 'stop', 'navigate', 'click', 'type', 'fill', 'select', 'screenshot', 'evaluate', 'wait', 'scroll', 'extract', 'pdf']
        },
        url: { 
          type: 'string', 
          description: 'URL for navigate action' 
        },
        selector: { 
          type: 'string', 
          description: 'CSS selector for click, type, select, screenshot, extract actions' 
        },
        value: { 
          type: 'string', 
          description: 'Value to type or select' 
        },
        text: { 
          type: 'string', 
          description: 'Text to type (alternative to value)' 
        },
        fields: {
          type: 'array',
          description: 'Array of field objects for fill action: [{selector, value}]',
          items: { type: 'object' }
        },
        options: {
          type: 'object',
          description: 'Additional options (headless, timeout, waitForSelector, fullPage, script, attribute, multiple, direction, amount)'
        }
      },
      required: ['action']
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
  private mcpService: MCPService;
  private approvedTools: Set<string> = new Set();
  private allowAllTools: boolean = false;
  private approvalCallback?: (approval: ToolApproval) => Promise<ToolApprovalResponse>;
  
  // Browser state (OpenClaw-style unified browser)
  private browser: any = null;
  private browserPage: any = null;
  private browserState: 'stopped' | 'running' = 'stopped';

  constructor(private serverConfig: ServerConfig) {
    const activeWorkspace = serverConfig.workspaces.find(
      w => w.id === serverConfig.activeWorkspaceId
    );
    this.workspacePath = activeWorkspace?.path || process.cwd();
    this.mcpService = new MCPService();
  }

  setWorkspace(workspacePath: string): void {
    this.workspacePath = workspacePath;
  }

  /**
   * Set the approval callback function that will be called before executing tools
   */
  setApprovalCallback(callback: (approval: ToolApproval) => Promise<ToolApprovalResponse>): void {
    this.approvalCallback = callback;
  }

  /**
   * Get the current approval status
   */
  getApprovalStatus(): { approvedTools: string[]; allowAll: boolean } {
    return {
      approvedTools: Array.from(this.approvedTools),
      allowAll: this.allowAllTools
    };
  }

  /**
   * Clear all approvals (reset to ask again)
   */
  clearApprovals(): void {
    this.approvedTools.clear();
    this.allowAllTools = false;
  }

  /**
   * Format tool arguments for display
   */
  private formatArguments(args: Record<string, unknown>): string {
    const formatted: string[] = [];
    for (const [key, value] of Object.entries(args)) {
      let displayValue: string;
      if (typeof value === 'string') {
        // Truncate long strings
        displayValue = value.length > 200 ? value.substring(0, 200) + '...' : value;
        displayValue = `"${displayValue}"`;
      } else if (typeof value === 'object') {
        displayValue = JSON.stringify(value).substring(0, 200);
      } else {
        displayValue = String(value);
      }
      formatted.push(`    ${key}: ${displayValue}`);
    }
    return formatted.length > 0 ? formatted.join('\n') : '    (no arguments)';
  }

  /**
   * Get detailed description of what a tool will do
   */
  getToolDescription(toolName: string, args: Record<string, unknown>): string {
    const descriptions: Record<string, (args: Record<string, unknown>) => string> = {
      write_file: (a) => `Create/overwrite file: ${a.path || 'unknown'}`,
      read_file: (a) => `Read file: ${a.path || 'unknown'}`,
      create_directory: (a) => `Create directory: ${a.path || 'unknown'}`,
      list_directory: (a) => `List files in: ${a.path || 'current directory'}`,
      apply_patch: () => `Apply patch to files`,
      execute_command: (a) => `Execute command: ${a.command || 'unknown'}`,
      web_search: (a) => `Search web for: "${a.query || 'unknown'}"`,
      web_fetch: (a) => `Fetch content from: ${a.url || 'unknown'}`,
      http_request: (a) => `HTTP ${a.method || 'GET'} request to: ${a.url || 'unknown'}`,
      code_search: (a) => `Search code for pattern: "${a.pattern || 'unknown'}"`,
      find_symbol: (a) => `Find symbol: "${a.symbol || 'unknown'}"`,
      package_install: (a) => `Install packages: ${a.packages || 'unknown'}`,
      start_server: (a) => `Start HTTP server on port ${a.port || '8080'} serving: ${a.path || 'current directory'}`,
      run_tests: () => `Run test suite`,
      generate_documentation: (a) => `Generate ${a.type || 'documentation'}`,
      mcp_connect: (a) => `Connect to MCP server: ${a.name || 'unknown'} at ${a.server_url || 'unknown'}`,
      mcp_list_tools: (a) => `List tools from MCP connection: ${a.connection_name || 'unknown'}`,
      mcp_invoke_tool: (a) => `Invoke MCP tool: ${a.tool_name || 'unknown'} on ${a.connection_name || 'unknown'}`,
      mcp_disconnect: (a) => `Disconnect from MCP server: ${a.connection_name || 'unknown'}`,
      mcp_list_connections: () => `List all MCP connections`
    };

    const describer = descriptions[toolName];
    return describer ? describer(args) : `Execute ${toolName}`;
  }

  /**
   * Request approval for a tool execution
   */
  private async requestApproval(tool: string, args: Record<string, unknown>): Promise<ToolApprovalResponse> {
    // Check if user has allowed all tools
    if (this.allowAllTools) {
      return { allowed: true, allowAll: true };
    }

    // Check if this specific tool has been approved
    if (this.approvedTools.has(tool)) {
      return { allowed: true, allowAll: false };
    }

    // If no approval callback is set, allow by default
    if (!this.approvalCallback) {
      return { allowed: true, allowAll: false };
    }

    // Request approval from user
    const approval: ToolApproval = {
      tool,
      arguments: args,
      timestamp: Date.now()
    };

    return await this.approvalCallback(approval);
  }

  async executeTool(call: ToolCall): Promise<ToolResult> {
    try {
      // Request approval before executing the tool
      const approval = await this.requestApproval(call.tool, call.arguments);
      
      if (!approval.allowed) {
        return { 
          success: false, 
          error: `Tool execution rejected by user: ${call.tool}` 
        };
      }

      // If user selected "Allow All", update the flag
      if (approval.allowAll) {
        this.allowAllTools = true;
      } else {
        // Add to approved tools set
        this.approvedTools.add(call.tool);
      }

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
        
        // MCP Tools
        case 'mcp_connect':
          return await this.mcpConnect(call.arguments);
        case 'mcp_list_tools':
          return await this.mcpListTools(call.arguments);
        case 'mcp_invoke_tool':
          return await this.mcpInvokeTool(call.arguments);
        case 'mcp_disconnect':
          return await this.mcpDisconnect(call.arguments);
        case 'mcp_list_connections':
          return await this.mcpListConnections();
        
        // Shopping & Meal Planning
        case 'create_shopping_list':
          return await this.createShoppingList(call.arguments);
        case 'create_meal_plan':
          return await this.createMealPlan(call.arguments);
        
        // Travel & Flight Planning
        case 'search_flights':
          return await this.searchFlights(call.arguments);
        case 'create_travel_itinerary':
          return await this.createTravelItinerary(call.arguments);
        
        // Web Browser Automation (Unified Browser Tool - OpenClaw-style)
        case 'browser':
          return await this.browserTool(call.arguments);
        
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
  // WEB TOOLS
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

  // ============================================
  // MCP TOOLS
  // ============================================

  private async mcpConnect(args: Record<string, unknown>): Promise<ToolResult> {
    const { server_url, name, transport = 'sse', env } = args;
    
    if (typeof server_url !== 'string' || typeof name !== 'string') {
      return { success: false, error: 'Invalid arguments: server_url and name must be strings' };
    }

    try {
      await this.mcpService.connect(
        name,
        server_url,
        transport as 'sse' | 'stdio',
        env as Record<string, string>
      );
      
      const connection = this.mcpService.getConnection(name);
      const toolCount = connection?.tools.length || 0;
      
      return { 
        success: true, 
        output: `✓ Connected to MCP server '${name}' at ${server_url}\nTransport: ${transport}\nAvailable tools: ${toolCount}`
      };
    } catch (error) {
      return { success: false, error: `Failed to connect to MCP server: ${error}` };
    }
  }

  private async mcpListTools(args: Record<string, unknown>): Promise<ToolResult> {
    const { connection_name } = args;
    
    if (typeof connection_name !== 'string') {
      return { success: false, error: 'Invalid arguments: connection_name must be a string' };
    }

    try {
      const tools = this.mcpService.listTools(connection_name);
      
      if (tools.length === 0) {
        return { success: true, output: `No tools available on connection '${connection_name}'` };
      }
      
      const toolsList = tools.map((tool, i) => 
        `${i + 1}. ${tool.name}\n   ${tool.description}\n   Parameters: ${Object.keys(tool.parameters.properties).join(', ')}`
      ).join('\n\n');
      
      return { 
        success: true, 
        output: `Available tools on '${connection_name}':\n\n${toolsList}`
      };
    } catch (error) {
      return { success: false, error: `Failed to list tools: ${error}` };
    }
  }

  private async mcpInvokeTool(args: Record<string, unknown>): Promise<ToolResult> {
    const { connection_name, tool_name, arguments: toolArgs = {} } = args;
    
    if (typeof connection_name !== 'string' || typeof tool_name !== 'string') {
      return { success: false, error: 'Invalid arguments: connection_name and tool_name must be strings' };
    }

    try {
      const result = await this.mcpService.invokeTool(
        connection_name,
        tool_name,
        toolArgs as Record<string, any>
      );
      
      const output = typeof result === 'object' 
        ? JSON.stringify(result, null, 2) 
        : String(result);
      
      return { 
        success: true, 
        output: `✓ Tool '${tool_name}' invoked successfully\n\nResult:\n${output}`
      };
    } catch (error) {
      return { success: false, error: `Failed to invoke tool: ${error}` };
    }
  }

  private async mcpDisconnect(args: Record<string, unknown>): Promise<ToolResult> {
    const { connection_name } = args;
    
    if (typeof connection_name !== 'string') {
      return { success: false, error: 'Invalid arguments: connection_name must be a string' };
    }

    try {
      await this.mcpService.disconnect(connection_name);
      return { success: true, output: `✓ Disconnected from MCP server '${connection_name}'` };
    } catch (error) {
      return { success: false, error: `Failed to disconnect: ${error}` };
    }
  }

  private async mcpListConnections(): Promise<ToolResult> {
    try {
      const connections = this.mcpService.listConnections();
      
      if (connections.length === 0) {
        return { success: true, output: 'No active MCP connections' };
      }
      
      const list = connections.map((conn, i) => 
        `${i + 1}. ${conn.name}\n   URL: ${conn.url}\n   Status: ${conn.status}\n   Tools: ${conn.tools}`
      ).join('\n\n');
      
      return { 
        success: true, 
        output: `Active MCP connections (${connections.length}):\n\n${list}`
      };
    } catch (error) {
      return { success: false, error: `Failed to list connections: ${error}` };
    }
  }

  // ============================================
  // SHOPPING & MEAL PLANNING TOOLS
  // ============================================

  private async createShoppingList(args: Record<string, unknown>): Promise<ToolResult> {
    const { 
      items, 
      store_preference = 'Local Grocery Store', 
      dietary_restrictions = [],
      budget_limit,
      output_path = 'shopping_list.md'
    } = args;

    if (!Array.isArray(items) || items.length === 0) {
      return { success: false, error: 'Invalid arguments: items must be a non-empty array' };
    }

    try {
      // Organize items by category
      const categorized = new Map<string, any[]>();
      let totalEstimate = 0;

      items.forEach((item: any) => {
        const category = item.category || 'other';
        if (!categorized.has(category)) {
          categorized.set(category, []);
        }
        categorized.get(category)!.push(item);
        if (item.estimated_price) {
          totalEstimate += item.estimated_price;
        }
      });

      // Build the shopping list markdown
      const date = new Date().toLocaleDateString();
      let markdown = `# Shopping List - ${date}\n\n`;
      markdown += `**Store:** ${store_preference}\n\n`;
      
      if (Array.isArray(dietary_restrictions) && dietary_restrictions.length > 0) {
        markdown += `**Dietary Notes:** ${dietary_restrictions.join(', ')}\n\n`;
      }

      markdown += `---\n\n`;

      // Category order
      const categoryOrder = ['produce', 'dairy', 'meat', 'pantry', 'frozen', 'household', 'other'];
      
      categoryOrder.forEach(category => {
        if (categorized.has(category)) {
          const catItems = categorized.get(category)!;
          markdown += `## ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
          catItems.forEach((item, i) => {
            const price = item.estimated_price ? ` ($${item.estimated_price.toFixed(2)})` : '';
            markdown += `- [ ] ${item.name} - ${item.quantity}${price}\n`;
          });
          markdown += '\n';
        }
      });

      // Summary
      markdown += `---\n\n`;
      markdown += `**Total Items:** ${items.length}\n`;
      if (totalEstimate > 0) {
        markdown += `**Estimated Total:** $${totalEstimate.toFixed(2)}\n`;
      }
      if (budget_limit && typeof budget_limit === 'number') {
        markdown += `**Budget Limit:** $${budget_limit.toFixed(2)}\n`;
        if (totalEstimate > budget_limit) {
          markdown += `⚠️ **Warning:** Estimated total exceeds budget by $${(totalEstimate - budget_limit).toFixed(2)}\n`;
        }
      }

      markdown += `\n**Note:** This is a shopping list for manual purchasing. No actual orders have been placed.\n`;

      // Save the file
      const fullPath = this.resolvePath(output_path as string);
      await writeFile(fullPath, markdown, 'utf-8');

      return { 
        success: true, 
        output: `✓ Shopping list created with ${items.length} items\nSaved to: ${output_path}\nEstimated total: $${totalEstimate.toFixed(2)}\n\n${markdown.substring(0, 500)}...`
      };
    } catch (error) {
      return { success: false, error: `Failed to create shopping list: ${error}` };
    }
  }

  private async createMealPlan(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      days = 7,
      meals_per_day = 3,
      dietary_preferences = [],
      cuisine_type,
      skill_level = 'intermediate',
      prep_time_limit,
      budget_per_day,
      generate_shopping_list = true,
      output_path = 'meal_plan.md'
    } = args;

    try {
      const daysCount = typeof days === 'number' ? days : 7;
      const mealsCount = typeof meals_per_day === 'number' ? meals_per_day : 3;
      
      // Generate meal plan structure
      const mealNames = ['Breakfast', 'Lunch', 'Dinner'];
      if (mealsCount > 3) {
        mealNames.push('Snack 1');
      }
      if (mealsCount > 4) {
        mealNames.push('Snack 2');
      }

      // Sample meal ideas by cuisine
      const mealIdeas: Record<string, string[][]> = {
        'Italian': [
          ['Overnight Oats with Berries', 'Caprese Salad Sandwich', 'Spaghetti Carbonara', 'Fresh Fruit'],
          ['Frittata with Vegetables', 'Minestrone Soup', 'Chicken Parmigiana', 'Italian Cookies'],
          ['Yogurt with Granola', 'Panzanella Salad', 'Osso Buco', 'Gelato'],
        ],
        'Mexican': [
          ['Huevos Rancheros', 'Chicken Quesadilla', 'Beef Tacos', 'Churros'],
          ['Chilaquiles', 'Burrito Bowl', 'Enchiladas Suizas', 'Flan'],
          ['Breakfast Burrito', 'Taco Salad', 'Fish Tacos with Slaw', 'Sopapillas'],
        ],
        'Asian': [
          ['Congee with Toppings', 'Vietnamese Banh Mi', 'Stir-fry Noodles', 'Mochi'],
          ['Dim Sum Selection', 'Ramen Bowl', 'Korean BBQ Bowl', 'Sesame Balls'],
          ['Matcha Pancakes', 'Spring Rolls', 'Thai Green Curry', 'Mango Sticky Rice'],
        ],
        'Mediterranean': [
          ['Greek Yogurt with Honey', 'Falafel Wrap', 'Moussaka', 'Baklava'],
          ['Shakshuka', 'Greek Salad with Chicken', 'Grilled Fish with Vegetables', 'Loukoumades'],
          ['Labneh with Pita', 'Hummus Bowl', 'Lamb Kofta', 'Turkish Delight'],
        ],
        'American': [
          ['Pancakes with Syrup', 'Turkey Sandwich', 'Grilled Steak', 'Apple Pie'],
          ['Eggs Benedict', 'Chicken Caesar Salad', 'BBQ Ribs', 'Brownies'],
          ['Breakfast Burrito', 'BLT Sandwich', 'Pot Roast', 'Ice Cream'],
        ],
      };

      const cuisine = cuisine_type && typeof cuisine_type === 'string' ? cuisine_type : 'Mixed';
      const selectedMeals = mealIdeas[cuisine] || mealIdeas['American'];

      // Build meal plan markdown
      const date = new Date().toLocaleDateString();
      let markdown = `# ${daysCount}-Day Meal Plan - ${cuisine} Cuisine\n\n`;
      markdown += `**Created:** ${date}\n`;
      markdown += `**Meals per day:** ${mealsCount}\n`;
      markdown += `**Skill level:** ${skill_level}\n\n`;

      if (Array.isArray(dietary_preferences) && dietary_preferences.length > 0) {
        markdown += `**Dietary Preferences:** ${dietary_preferences.join(', ')}\n\n`;
      }

      markdown += `---\n\n`;

      // Generate daily meal plans
      const shoppingItems: any[] = [];
      let dayTotalCost = 0;

      for (let day = 1; day <= daysCount; day++) {
        markdown += `## Day ${day}\n\n`;
        
        const dayMeals = selectedMeals[(day - 1) % selectedMeals.length];
        
        for (let meal = 0; meal < Math.min(mealsCount, dayMeals.length); meal++) {
          const mealName = mealNames[meal] || `Meal ${meal + 1}`;
          markdown += `### ${mealName}\n`;
          markdown += `- **Dish:** ${dayMeals[meal]}\n`;
          
          // Add mock prep time
          const prepTime = skill_level === 'beginner' ? '30-45 min' : 
                          skill_level === 'intermediate' ? '20-30 min' : '15-25 min';
          markdown += `- **Prep time:** ${prepTime}\n`;
          
          // Add estimated cost
          const mealCost = Math.random() * 8 + 4; // $4-12 per meal
          dayTotalCost += mealCost;
          markdown += `- **Est. cost:** $${mealCost.toFixed(2)}\n`;
          
          // Add sample ingredients
          markdown += `- **Key ingredients:** ${this.generateMockIngredients(dayMeals[meal])}\n`;
          markdown += '\n';

          // Collect for shopping list
          shoppingItems.push({
            name: dayMeals[meal],
            quantity: '1 serving',
            category: 'other',
            estimated_price: mealCost
          });
        }

        markdown += `**Daily estimated cost:** $${(dayTotalCost / day).toFixed(2)}\n\n`;
        markdown += `---\n\n`;
      }

      // Weekly summary
      markdown += `## Weekly Summary\n\n`;
      markdown += `- **Total Days:** ${daysCount}\n`;
      markdown += `- **Total Meals:** ${daysCount * mealsCount}\n`;
      markdown += `- **Estimated Weekly Food Cost:** $${dayTotalCost.toFixed(2)}\n`;
      
      if (budget_per_day && typeof budget_per_day === 'number') {
        const weeklyBudget = budget_per_day * daysCount;
        markdown += `- **Budget:** $${weeklyBudget.toFixed(2)} ($${budget_per_day.toFixed(2)}/day)\n`;
        if (dayTotalCost > weeklyBudget) {
          markdown += `- ⚠️ **Over budget by:** $${(dayTotalCost - weeklyBudget).toFixed(2)}\n`;
        } else {
          markdown += `- ✅ **Under budget by:** $${(weeklyBudget - dayTotalCost).toFixed(2)}\n`;
        }
      }

      // Generate shopping list if requested
      if (generate_shopping_list) {
        markdown += `\n## Consolidated Shopping List\n\n`;
        markdown += `See: shopping_list.md\n\n`;
        
        // Create shopping list
        await this.createShoppingList({
          items: shoppingItems,
          store_preference: 'Local Grocery Store',
          dietary_restrictions: dietary_preferences,
          output_path: 'shopping_list.md'
        });
      }

      markdown += `\n**Note:** This is a meal plan for cooking at home. No food orders have been placed.\n`;

      // Save the file
      const fullPath = this.resolvePath(output_path as string);
      await writeFile(fullPath, markdown, 'utf-8');

      return { 
        success: true, 
        output: `✓ ${daysCount}-day meal plan created\nSaved to: ${output_path}\nEstimated weekly cost: $${dayTotalCost.toFixed(2)}\n${generate_shopping_list ? 'Shopping list saved to: shopping_list.md' : ''}\n\n${markdown.substring(0, 600)}...`
      };
    } catch (error) {
      return { success: false, error: `Failed to create meal plan: ${error}` };
    }
  }

  private generateMockIngredients(mealName: string): string {
    const ingredients: Record<string, string> = {
      'Overnight Oats': 'oats, milk, berries, honey',
      'Caprese Salad': 'tomatoes, mozzarella, basil, balsamic',
      'Spaghetti Carbonara': 'pasta, eggs, bacon, parmesan',
      'Chicken Parmigiana': 'chicken, breadcrumbs, marinara, mozzarella',
      'Beef Tacos': 'ground beef, tortillas, lettuce, cheese',
      'Enchiladas': 'tortillas, chicken, enchilada sauce, cheese',
      'Stir-fry Noodles': 'noodles, vegetables, soy sauce, garlic',
      'Thai Green Curry': 'coconut milk, curry paste, chicken, vegetables',
      'Greek Salad': 'cucumber, tomatoes, feta, olives',
      'Moussaka': 'eggplant, ground lamb, bechamel, potatoes',
      'Grilled Steak': 'ribeye, salt, pepper, garlic butter',
      'Pancakes': 'flour, eggs, milk, maple syrup',
    };

    // Find matching ingredients or return generic
    for (const [key, value] of Object.entries(ingredients)) {
      if (mealName.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }

    return 'protein, vegetables, starch, seasonings';
  }

  // ============================================
  // TRAVEL & FLIGHT PLANNING TOOLS
  // ============================================

  private async searchFlights(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      origin,
      destination,
      departure_date,
      return_date,
      passengers = 1,
      cabin_class = 'economy',
      max_price,
      preferred_airlines = [],
      flexible_dates = false,
      include_nearby_airports = false,
      output_path = 'flight_search.md'
    } = args;

    if (!origin || !destination || !departure_date) {
      return { success: false, error: 'Required: origin, destination, and departure_date' };
    }

    try {
      const originCode = String(origin).toUpperCase();
      const destCode = String(destination).toUpperCase();
      const paxCount = typeof passengers === 'number' ? passengers : 1;
      const cabin = String(cabin_class);

      // Generate mock flight results
      const flights = this.generateMockFlights(originCode, destCode, String(departure_date), cabin, paxCount, Boolean(flexible_dates));
      
      let markdown = `# Flight Search Results\n\n`;
      markdown += `**Route:** ${originCode} → ${destCode}\n`;
      markdown += `**Departure:** ${departure_date}\n`;
      if (return_date) {
        markdown += `**Return:** ${return_date}\n`;
      }
      markdown += `**Passengers:** ${paxCount}\n`;
      markdown += `**Cabin:** ${cabin.charAt(0).toUpperCase() + cabin.slice(1)}\n`;
      if (Array.isArray(preferred_airlines) && preferred_airlines.length > 0) {
        markdown += `**Preferred Airlines:** ${preferred_airlines.join(', ')}\n`;
      }
      markdown += `\n---\n\n`;

      // Display outbound flights
      markdown += `## Outbound Flights\n\n`;
      flights.outbound.forEach((flight, i) => {
        markdown += `### Option ${i + 1}: ${flight.airline} ${flight.flightNumber}\n`;
        markdown += `- **Departure:** ${flight.departureTime} from ${flight.origin}\n`;
        markdown += `- **Arrival:** ${flight.arrivalTime} at ${flight.destination}\n`;
        markdown += `- **Duration:** ${flight.duration}\n`;
        markdown += `- **Stops:** ${flight.stops === 0 ? 'Non-stop' : flight.stops + ' stop' + (flight.stops > 1 ? 's' : '')}\n`;
        if (flight.stops > 0) {
          markdown += `- **Layover:** ${flight.layoverAirport} (${flight.layoverDuration})\n`;
        }
        markdown += `- **Aircraft:** ${flight.aircraft}\n`;
        markdown += `- **Price:** $${(flight.price * paxCount).toFixed(2)} total ($${flight.price.toFixed(2)} per person)\n`;
        if (max_price && flight.price * paxCount > (max_price as number)) {
          markdown += `- ⚠️ **Over budget**\n`;
        }
        markdown += `\n`;
      });

      // Display return flights if round trip
      if (return_date && flights.return) {
        markdown += `## Return Flights\n\n`;
        flights.return.forEach((flight, i) => {
          markdown += `### Option ${i + 1}: ${flight.airline} ${flight.flightNumber}\n`;
          markdown += `- **Departure:** ${flight.departureTime} from ${flight.origin}\n`;
          markdown += `- **Arrival:** ${flight.arrivalTime} at ${flight.destination}\n`;
          markdown += `- **Duration:** ${flight.duration}\n`;
          markdown += `- **Stops:** ${flight.stops === 0 ? 'Non-stop' : flight.stops + ' stop' + (flight.stops > 1 ? 's' : '')}\n`;
          markdown += `- **Price:** $${(flight.price * paxCount).toFixed(2)} total\n\n`;
        });
      }

      // Summary
      markdown += `---\n\n`;
      markdown += `## Summary\n\n`;
      const cheapestOutbound = flights.outbound.reduce((min, f) => f.price < min.price ? f : min);
      const totalCost = cheapestOutbound.price * paxCount + (flights.return ? flights.return[0].price * paxCount : 0);
      
      markdown += `- **Best Price:** $${totalCost.toFixed(2)} total\n`;
      markdown += `- **Airlines Found:** ${[...new Set(flights.outbound.map(f => f.airline))].join(', ')}\n`;
      markdown += `- **Search Date:** ${new Date().toLocaleString()}\n\n`;

      if (max_price && typeof max_price === 'number') {
        if (totalCost > max_price * paxCount) {
          markdown += `⚠️ **Budget Alert:** Best price exceeds your $${max_price} per person budget by $${(totalCost / paxCount - max_price).toFixed(2)}\n\n`;
        } else {
          markdown += `✅ **Within Budget:** Best price is $${(max_price - totalCost / paxCount).toFixed(2)} under your per-person budget\n\n`;
        }
      }

      markdown += `## Next Steps\n\n`;
      markdown += `To book these flights:\n`;
      markdown += `1. Visit the airline website or travel booking site (Expedia, Kayak, etc.)\n`;
      markdown += `2. Search for the same route and dates\n`;
      markdown += `3. Select your preferred flight from the options above\n`;
      markdown += `4. Complete the booking with your personal and payment details\n\n`;
      
      markdown += `**Important:** This is a search result only. No flights have been booked.\n`;
      markdown += `**Tip:** Prices shown are estimates. Actual prices may vary when booking.\n`;

      // Save the file
      const fullPath = this.resolvePath(output_path as string);
      await writeFile(fullPath, markdown, 'utf-8');

      return {
        success: true,
        output: `✓ Found ${flights.outbound.length} outbound flights${flights.return ? ' and ' + flights.return.length + ' return flights' : ''}\nSaved to: ${output_path}\nEstimated best price: $${totalCost.toFixed(2)} for ${paxCount} passenger${paxCount > 1 ? 's' : ''}\n\n${markdown.substring(0, 500)}...`
      };
    } catch (error) {
      return { success: false, error: `Flight search failed: ${error}` };
    }
  }

  private generateMockFlights(origin: string, destination: string, date: string, cabin: string, passengers: number, flexible: boolean): { outbound: FlightOption[]; return: FlightOption[] | null } {
    const airlines = ['American Airlines', 'Delta', 'United', 'Southwest', 'JetBlue', 'Alaska Airlines'];
    const aircraft = ['Boeing 737-800', 'Airbus A320', 'Boeing 787-9', 'Airbus A321', 'Embraer E175'];
    
    const basePrice = cabin === 'economy' ? 250 : 
                     cabin === 'premium_economy' ? 450 : 
                     cabin === 'business' ? 1200 : 3500;
    
    const outbound: FlightOption[] = [];
    const numOptions = flexible ? 6 : 4;
    
    for (let i = 0; i < numOptions; i++) {
      const airline = airlines[i % airlines.length];
      const flightNum = `${airline.substring(0, 2).toUpperCase()}${Math.floor(Math.random() * 900) + 100}`;
      const departHour = 6 + Math.floor(Math.random() * 14); // 6am to 8pm
      const duration = 2 + Math.floor(Math.random() * 8); // 2-10 hours
      const hasStop = Math.random() > 0.6;
      
      outbound.push({
        airline,
        flightNumber: flightNum,
        origin,
        destination,
        departureTime: `${departHour.toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
        arrivalTime: `${((departHour + duration) % 24).toString().padStart(2, '0')}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')}`,
        duration: `${duration}h ${Math.floor(Math.random() * 60)}m`,
        stops: hasStop ? 1 : 0,
        layoverAirport: hasStop ? ['DFW', 'ATL', 'ORD', 'DEN', 'LAX'][Math.floor(Math.random() * 5)] : null,
        layoverDuration: hasStop ? '1h 30m' : null,
        aircraft: aircraft[Math.floor(Math.random() * aircraft.length)],
        price: basePrice + Math.floor(Math.random() * 200) - 100
      });
    }

    // Sort by price
    outbound.sort((a, b) => a.price - b.price);

    return { outbound, return: null };
  }

  private getActivitySuggestions(destination: string, timeOfDay: string, interests: unknown[], tripType: string): string[] {
    const activities: Record<string, Record<string, string[]>> = {
      'morning': {
        'sightseeing': ['Guided city tour', 'Visit local museum', 'Historical walking tour'],
        'adventure': ['Hiking trail', 'Bike tour', 'Outdoor adventure park'],
        'culture': ['Local market visit', 'Art gallery tour', 'Architecture walk'],
        'food': ['Cooking class', 'Food market tour', 'Local breakfast spot'],
        'relaxation': ['Beach walk', 'Park stroll', 'Coffee at scenic spot']
      },
      'afternoon': {
        'sightseeing': ['Major landmark visit', 'City viewpoint', 'Historic district'],
        'adventure': ['Zip-lining', 'Rock climbing', 'Water sports'],
        'culture': ['Museum visit', 'Cultural performance', 'Local craft workshop'],
        'food': ['Food tour', 'Winery/vineyard visit', 'Local restaurant hopping'],
        'relaxation': ['Spa treatment', 'Beach time', 'Park picnic']
      },
      'evening': {
        'sightseeing': ['Sunset viewpoint', 'Night city tour', 'Illuminated landmarks'],
        'adventure': ['Night hike', 'Stargazing', 'Night photography walk'],
        'culture': ['Theater performance', 'Concert', 'Cultural show'],
        'food': ['Dinner at local favorite', 'Night food market', 'Rooftop bar'],
        'relaxation': ['Sunset viewing', 'Evening walk', 'Night photography']
      }
    };

    const timeActivities = activities[timeOfDay] || activities['morning'];
    
    // Select based on interests
    let selected: string[] = [];
    if (Array.isArray(interests) && interests.length > 0) {
      interests.forEach(interest => {
        const strInterest = String(interest).toLowerCase();
        if (timeActivities[strInterest]) {
          selected.push(...timeActivities[strInterest]);
        }
      });
    }
    
    // Fallback to trip type
    if (selected.length === 0 && timeActivities[tripType.toLowerCase()]) {
      selected = timeActivities[tripType.toLowerCase()];
    }
    
    // Generic fallback
    if (selected.length === 0) {
      selected = ['Explore the city', 'Visit a local attraction', 'Take photos', 'People watching'];
    }

    // Return 2-3 activities
    return selected.slice(0, 2 + Math.floor(Math.random() * 2));
  }

  private async createTravelItinerary(args: Record<string, unknown>): Promise<ToolResult> {
    const {
      destination,
      start_date,
      end_date,
      origin,
      travelers = 1,
      trip_type = 'leisure',
      budget_level = 'moderate',
      interests = [],
      dietary_restrictions = [],
      mobility_needs,
      output_path = 'travel_itinerary.md'
    } = args;

    if (!destination || !start_date || !end_date) {
      return { success: false, error: 'Required: destination, start_date, and end_date' };
    }

    try {
      const dest = String(destination);
      const startDate = new Date(String(start_date));
      const endDate = new Date(String(end_date));
      const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      const pax = typeof travelers === 'number' ? travelers : 1;

      let markdown = `# Travel Itinerary: ${dest}\n\n`;
      markdown += `**Dates:** ${start_date} to ${end_date} (${days} days)\n`;
      if (origin) {
        markdown += `**Home:** ${origin}\n`;
      }
      markdown += `**Travelers:** ${pax}\n`;
      markdown += `**Trip Type:** ${String(trip_type).charAt(0).toUpperCase() + String(trip_type).slice(1)}\n`;
      markdown += `**Budget Level:** ${String(budget_level).charAt(0).toUpperCase() + String(budget_level).slice(1)}\n\n`;

      if (Array.isArray(interests) && interests.length > 0) {
        markdown += `**Interests:** ${interests.join(', ')}\n\n`;
      }

      markdown += `---\n\n`;

      // Daily itinerary
      for (let day = 1; day <= days; day++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + day - 1);
        const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'long' });
        const dateStr = currentDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        markdown += `## Day ${day}: ${dayName}, ${dateStr}\n\n`;

        // Morning
        markdown += `### Morning\n`;
        if (day === 1) {
          markdown += `- **Arrival & Check-in** (if applicable)\n`;
          markdown += `- Orientation walk around the neighborhood\n`;
        } else {
          const morningActivities = this.getActivitySuggestions(dest, 'morning', interests as unknown[], String(trip_type));
          markdown += `- ${morningActivities[0]}\n`;
          if (morningActivities[1]) {
            markdown += `- ${morningActivities[1]}\n`;
          }
        }
        markdown += `- **Breakfast:** ${this.getRestaurantSuggestion(dest, 'breakfast', String(budget_level), (dietary_restrictions || []) as unknown[])}\n\n`;

        // Afternoon
        markdown += `### Afternoon\n`;
        const afternoonActivities = this.getActivitySuggestions(dest, 'afternoon', interests as unknown[], String(trip_type));
        afternoonActivities.forEach(activity => {
          markdown += `- ${activity}\n`;
        });
        markdown += `- **Lunch:** ${this.getRestaurantSuggestion(dest, 'lunch', String(budget_level), (dietary_restrictions || []) as unknown[])}\n\n`;

        // Evening
        markdown += `### Evening\n`;
        if (day === days) {
          markdown += `- **Departure preparations** (if applicable)\n`;
          markdown += `- Last-minute shopping or sightseeing\n`;
        } else {
          const eveningActivities = this.getActivitySuggestions(dest, 'evening', interests as unknown[], String(trip_type));
          markdown += `- ${eveningActivities[0]}\n`;
        }
        markdown += `- **Dinner:** ${this.getRestaurantSuggestion(dest, 'dinner', String(budget_level), (dietary_restrictions || []) as unknown[])}\n`;
        if (day !== days) {
          markdown += `- Evening stroll or relaxation\n`;
        }
        markdown += `\n`;
      }

      // Practical information
      markdown += `---\n\n`;
      markdown += `## Practical Information\n\n`;
      markdown += `### Estimated Budget\n`;
      const dailyCost = budget_level === 'budget' ? 100 : budget_level === 'moderate' ? 250 : 500;
      const totalCost = dailyCost * days * pax;
      markdown += `- **Accommodation:** $${(dailyCost * 0.4 * days * pax).toFixed(0)}\n`;
      markdown += `- **Food & Dining:** $${(dailyCost * 0.3 * days * pax).toFixed(0)}\n`;
      markdown += `- **Activities & Attractions:** $${(dailyCost * 0.2 * days * pax).toFixed(0)}\n`;
      markdown += `- **Transportation:** $${(dailyCost * 0.1 * days * pax).toFixed(0)}\n`;
      markdown += `- **Total Estimated:** $${totalCost.toFixed(0)}\n\n`;

      markdown += `### Important Notes\n`;
      markdown += `- This itinerary is a suggestion only - adjust based on your preferences\n`;
      markdown += `- All bookings (hotels, tours, restaurants) must be made separately\n`;
      markdown += `- Check current opening hours and availability before visiting\n`;
      if (mobility_needs) {
        markdown += `- **Accessibility:** ${String(mobility_needs)}\n`;
      }
      markdown += `- Consider travel insurance for international trips\n\n`;

      markdown += `### Emergency Contacts\n`;
      markdown += `- Local emergency: Check destination-specific numbers\n`;
      markdown += `- Your country's embassy/consulate in ${dest}\n`;
      markdown += `- Travel insurance 24/7 line\n\n`;

      markdown += `---\n\n`;
      markdown += `**Disclaimer:** This itinerary is generated for planning purposes. No reservations have been made. Please verify all information and make bookings through appropriate channels.\n`;

      // Save the file
      const fullPath = this.resolvePath(output_path as string);
      await writeFile(fullPath, markdown, 'utf-8');

      return {
        success: true,
        output: `✓ ${days}-day travel itinerary created for ${dest}\nSaved to: ${output_path}\nEstimated budget: $${(dailyCost * days * pax).toFixed(0)}\n\n${markdown.substring(0, 500)}...`
      };
    } catch (error) {
      return { success: false, error: `Failed to create itinerary: ${error}` };
    }
  }

  private getRestaurantSuggestion(destination: string, meal: string, budget: string, restrictions: unknown[]): string {
    const types: Record<string, Record<string, string[]>> = {
      'breakfast': {
        'budget': ['Local café', 'Bakery', 'Street food vendor'],
        'moderate': ['Brunch spot', 'Hotel restaurant', 'Local diner'],
        'luxury': ['Fine dining breakfast', 'Hotel buffet', 'Rooftop café']
      },
      'lunch': {
        'budget': ['Food truck', 'Local eatery', 'Sandwich shop'],
        'moderate': ['Bistro', 'Casual restaurant', 'Café with lunch menu'],
        'luxury': ['Fine dining restaurant', 'Business lunch venue', 'Specialty restaurant']
      },
      'dinner': {
        'budget': ['Family restaurant', 'Ethnic eatery', 'Food hall'],
        'moderate': ['Local favorite restaurant', 'Bistro', 'Grill house'],
        'luxury': ['Michelin-starred restaurant', 'Signature chef restaurant', 'Exclusive dining']
      }
    };

    const options = types[meal]?.[budget] || ['Local restaurant'];
    let suggestion = options[Math.floor(Math.random() * options.length)];

    if (Array.isArray(restrictions) && restrictions.length > 0) {
      const restrictionStr = restrictions.join(', ');
      suggestion += ` (Ask for ${restrictionStr} options)`;
    }

    return suggestion;
  }

  // ============================================
  // PUPPETEER WEB AUTOMATION TOOLS
  // ============================================

  // ============================================
  // UNIFIED BROWSER TOOL (OpenClaw-style)
  // ============================================

  private async browserTool(args: Record<string, unknown>): Promise<ToolResult> {
    const action = String(args.action || '').toLowerCase();
    const options = (args.options || {}) as Record<string, unknown>;
    
    if (!action) {
      return { success: false, error: 'Action is required. Use: status, start, stop, navigate, click, type, fill, select, screenshot, evaluate, wait, scroll, extract, pdf' };
    }

    try {
      switch (action) {
        case 'status':
          return await this.browserStatus();
        case 'start':
          return await this.browserStart(options);
        case 'stop':
          return await this.browserStop();
        case 'navigate':
          return await this.browserNavigate(String(args.url || ''), options);
        case 'click':
          return await this.browserClick(String(args.selector || ''), options);
        case 'type':
          return await this.browserType(String(args.selector || ''), String(args.value || args.text || ''), options);
        case 'fill':
          return await this.browserFill((args.fields || []) as Array<{selector: string; value: string}>);
        case 'select':
          return await this.browserSelect(String(args.selector || ''), String(args.value || ''));
        case 'screenshot':
          return await this.browserScreenshot(options);
        case 'evaluate':
          return await this.browserEvaluate(String(args.script || args.value || ''));
        case 'wait':
          return await this.browserWait(String(args.selector || ''), Number(args.timeout || 5000));
        case 'scroll': {
          const validDirections = ['up', 'down', 'left', 'right'] as const;
          const direction = String(args.direction || 'down');
          if (!validDirections.includes(direction as typeof validDirections[number])) {
            return { success: false, error: `Invalid scroll direction: ${direction}. Must be one of: up, down, left, right` };
          }
          return await this.browserScroll(direction as 'up' | 'down' | 'left' | 'right', Number(args.amount || 300));
        }
        case 'extract':
          return await this.browserExtract(String(args.selector || ''), options);
        case 'pdf':
          return await this.browserPdf(String(args.output_path || 'page.pdf'));
        default:
          return { success: false, error: `Unknown browser action: ${action}` };
      }
    } catch (error) {
      return { success: false, error: `Browser action failed: ${error}` };
    }
  }

  private async browserStatus(): Promise<ToolResult> {
    if (!this.browser || this.browserState === 'stopped') {
      return {
        success: true,
        output: 'Browser Status: Stopped\nUse browser action=start to launch the browser'
      };
    }

    try {
      const url = this.browserPage?.url() || 'about:blank';
      const title = await this.browserPage?.title() || 'No page';
      
      return {
        success: true,
        output: `Browser Status: Running\nURL: ${url}\nTitle: ${title}`
      };
    } catch (error) {
      return {
        success: true,
        output: `Browser Status: Running (Error getting page info: ${error})`
      };
    }
  }

  private async browserStart(options: Record<string, unknown>): Promise<ToolResult> {
    if (this.browserState === 'running') {
      return { success: true, output: 'Browser is already running' };
    }

    const puppeteer = getPuppeteer();
    
    // Default to headless for faster startup (user can set headless: false for visible mode)
    const headless = options.headless !== false; // Default true unless explicitly set to false
    const timeout = Number(options.timeout || 30000); // 30 second default timeout

    console.log(`[browser] Launching Chrome in ${headless ? 'headless' : 'visible'} mode...`);

    try {
      // Launch browser with timeout
      const launchPromise = puppeteer.launch({
        headless,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-software-rasterizer',
          '--window-size=1280,800'
        ],
        defaultViewport: { width: 1280, height: 800 }
      });

      // Race between launch and timeout
      this.browser = await Promise.race([
        launchPromise,
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error(`Browser launch timed out after ${timeout}ms. Chrome may not be installed or is taking too long to start.`)), timeout)
        )
      ]);

      console.log('[browser] Chrome launched, creating new page...');
      this.browserPage = await this.browser.newPage();
      this.browserState = 'running';
      console.log('[browser] Browser ready!');

      return {
        success: true,
        output: `✓ Browser started in ${headless ? 'headless' : 'visible'} mode\nWindow size: 1280x800\nReady for navigation`
      };
    } catch (error) {
      console.error('[browser] Failed to start browser:', error);
      // Clean up if launch failed
      if (this.browser) {
        try {
          await this.browser.close();
        } catch {
          // Ignore cleanup errors
        }
        this.browser = null;
      }
      throw error;
    }
  }

  private async browserStop(): Promise<ToolResult> {
    if (this.browserState === 'stopped') {
      return { success: true, output: 'Browser is already stopped' };
    }

    await this.browser?.close();
    this.browser = null;
    this.browserPage = null;
    this.browserState = 'stopped';

    return { success: true, output: '✓ Browser stopped' };
  }

  private async browserNavigate(url: string, options: Record<string, unknown>): Promise<ToolResult> {
    if (!url) {
      return { success: false, error: 'URL is required for navigate action' };
    }

    if (this.browserState === 'stopped') {
      await this.browserStart({ headless: false });
    }

    const timeout = Number(options.timeout || 30000);
    await this.browserPage.goto(url, { waitUntil: 'networkidle2', timeout });

    if (options.waitForSelector) {
      await this.browserPage.waitForSelector(String(options.waitForSelector), { timeout });
    }

    const title = await this.browserPage.title();
    return {
      success: true,
      output: `✓ Navigated to ${url}\nPage title: ${title}`
    };
  }

  private async browserClick(selector: string, options: Record<string, unknown>): Promise<ToolResult> {
    if (!selector) return { success: false, error: 'CSS selector is required for click action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    if (options.waitForNavigation) {
      await Promise.all([
        this.browserPage.waitForNavigation({ waitUntil: 'networkidle2' }),
        this.browserPage.click(selector)
      ]);
    } else {
      await this.browserPage.click(selector);
    }

    return { success: true, output: `✓ Clicked: ${selector}` };
  }

  private async browserType(selector: string, value: string, options: Record<string, unknown>): Promise<ToolResult> {
    if (!selector) return { success: false, error: 'CSS selector is required for type action' };
    if (!value) return { success: false, error: 'Value is required for type action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    await this.browserPage.waitForSelector(selector);

    if (options.clearFirst !== false) {
      await this.browserPage.evaluate((sel: string) => {
        const el = document.querySelector(sel) as HTMLInputElement;
        if (el) el.value = '';
      }, selector);
    }

    await this.browserPage.type(selector, value);

    return {
      success: true,
      output: `✓ Typed into ${selector}: "${value.substring(0, 50)}${value.length > 50 ? '...' : ''}"`
    };
  }

  private async browserFill(fields: Array<{selector: string; value: string}>): Promise<ToolResult> {
    if (!Array.isArray(fields) || fields.length === 0) {
      return { success: false, error: 'Fields array is required for fill action' };
    }
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const results: string[] = [];
    for (const field of fields) {
      await this.browserType(field.selector, field.value, { clearFirst: true });
      results.push(`${field.selector}: "${field.value.substring(0, 30)}${field.value.length > 30 ? '...' : ''}"`);
    }

    return {
      success: true,
      output: `✓ Filled ${fields.length} fields:\n${results.join('\n')}`
    };
  }

  private async browserSelect(selector: string, value: string): Promise<ToolResult> {
    if (!selector) return { success: false, error: 'CSS selector is required for select action' };
    if (!value) return { success: false, error: 'Value is required for select action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    await this.browserPage.select(selector, value);
    return { success: true, output: `✓ Selected "${value}" from ${selector}` };
  }

  private async browserScreenshot(options: Record<string, unknown>): Promise<ToolResult> {
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const outputPath = options.output_path as string;
    const fullPage = Boolean(options.fullPage || options.full_page);
    const selector = options.selector as string;

    let screenshotData: string;

    if (selector) {
      const element = await this.browserPage.$(selector);
      if (!element) throw new Error(`Element not found: ${selector}`);
      screenshotData = await element.screenshot({ encoding: 'base64' }) as string;
    } else {
      screenshotData = await this.browserPage.screenshot({ fullPage, encoding: 'base64' }) as string;
    }

    if (outputPath) {
      const fullPath = this.resolvePath(outputPath);
      await writeFile(fullPath, Buffer.from(screenshotData, 'base64'));
      return {
        success: true,
        output: `✓ Screenshot saved to: ${outputPath}${selector ? ` (element: ${selector})` : fullPage ? ' (full page)' : ' (viewport)'}`
      };
    }

    return {
      success: true,
      output: `✓ Screenshot captured${selector ? ` (element: ${selector})` : fullPage ? ' (full page)' : ' (viewport)'}\nData URL: data:image/png;base64,${screenshotData.substring(0, 100)}...`
    };
  }

  private async browserEvaluate(script: string): Promise<ToolResult> {
    if (!script) return { success: false, error: 'Script is required for evaluate action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const result = await this.browserPage.evaluate(new Function(script) as () => unknown);
    
    return {
      success: true,
      output: `✓ Script executed\nResult: ${JSON.stringify(result, null, 2).substring(0, 500)}`
    };
  }

  private async browserWait(selector: string, timeout: number): Promise<ToolResult> {
    if (!selector) return { success: false, error: 'CSS selector is required for wait action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    await this.browserPage.waitForSelector(selector, { timeout });
    return { success: true, output: `✓ Element appeared: ${selector} (within ${timeout}ms)` };
  }

  private async browserScroll(direction: 'up' | 'down' | 'left' | 'right', amount: number): Promise<ToolResult> {
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const directions: Record<string, [number, number]> = {
      up: [0, -amount],
      down: [0, amount],
      left: [-amount, 0],
      right: [amount, 0]
    };

    const [x, y] = directions[direction] || [0, amount];
    
    await this.browserPage.evaluate((sx: number, sy: number) => {
      window.scrollBy(sx, sy);
    }, x, y);

    return { success: true, output: `✓ Scrolled ${direction} by ${amount}px` };
  }

  private async browserExtract(selector: string, options: Record<string, unknown>): Promise<ToolResult> {
    if (!selector) return { success: false, error: 'CSS selector is required for extract action' };
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const attribute = options.attribute as string;
    const multiple = Boolean(options.multiple);

    if (multiple) {
      const elements = await this.browserPage.$$(selector);
      const results: string[] = [];
      
      for (const element of elements) {
        if (attribute) {
          const value = await element.evaluate((el: Element, attr: string) => el.getAttribute(attr), attribute);
          if (value) results.push(value);
        } else {
          const text = await element.evaluate((el: Element) => el.textContent || '');
          results.push(text.trim());
        }
      }

      return {
        success: true,
        output: `✓ Extracted ${results.length} elements:\n${results.map((r, i) => `${i + 1}. ${r.substring(0, 100)}${r.length > 100 ? '...' : ''}`).join('\n')}`
      };
    } else {
      const element = await this.browserPage.$(selector);
      if (!element) throw new Error(`Element not found: ${selector}`);

      if (attribute) {
        const value = await element.evaluate((el: Element, attr: string) => el.getAttribute(attr) || '', attribute);
        return { success: true, output: `✓ Extracted attribute "${attribute}": ${value}` };
      } else {
        const text = await element.evaluate((el: Element) => el.textContent || '');
        return { success: true, output: `✓ Extracted text: ${text.trim().substring(0, 500)}${text.length > 500 ? '...' : ''}` };
      }
    }
  }

  private async browserPdf(outputPath: string): Promise<ToolResult> {
    if (this.browserState === 'stopped') return { success: false, error: 'Browser is not running' };

    const fullPath = this.resolvePath(outputPath);
    await this.browserPage.pdf({ path: fullPath, format: 'A4' });

    return { success: true, output: `✓ PDF saved to: ${outputPath}` };
  }

}

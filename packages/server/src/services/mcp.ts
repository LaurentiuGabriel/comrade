/**
 * MCP (Model Context Protocol) Service
 * Handles connections to MCP servers and tool invocations
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface MCPTool {
  name: string;
  description: string;
  parameters: {
    type: string;
    properties: Record<string, {
      type: string;
      description: string;
    }>;
    required?: string[];
  };
}

export interface MCPConnection {
  name: string;
  url: string;
  transport: 'sse' | 'stdio';
  process?: ChildProcess;
  eventSource?: EventSource;
  tools: MCPTool[];
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  error?: string;
  env?: Record<string, string>;
}

export class MCPService extends EventEmitter {
  private connections: Map<string, MCPConnection> = new Map();
  private requestId = 0;

  /**
   * Connect to an MCP server
   */
  async connect(name: string, url: string, transport: 'sse' | 'stdio' = 'sse', env?: Record<string, string>): Promise<MCPConnection> {
    if (this.connections.has(name)) {
      throw new Error(`Connection '${name}' already exists. Disconnect first.`);
    }

    const connection: MCPConnection = {
      name,
      url,
      transport,
      tools: [],
      status: 'connecting',
      env
    };

    try {
      if (transport === 'sse') {
        await this.connectSSE(connection);
      } else if (transport === 'stdio') {
        await this.connectStdio(connection);
      }

      this.connections.set(name, connection);
      this.emit('connected', connection);
      
      // Fetch tools list after connection
      await this.fetchTools(connection);
      
      return connection;
    } catch (error) {
      connection.status = 'error';
      connection.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  /**
   * Connect via Server-Sent Events (HTTP transport)
   */
  private async connectSSE(connection: MCPConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Check if EventSource is available (it is in Node.js 18+)
        const EventSource = require('eventsource');
        
        const es = new EventSource(connection.url);
        
        es.onopen = () => {
          console.log(`[mcp] SSE connection opened: ${connection.name}`);
          connection.status = 'connected';
          connection.eventSource = es;
          resolve();
        };

        es.onerror = (error: any) => {
          console.error(`[mcp] SSE connection error: ${connection.name}`, error);
          if (connection.status === 'connecting') {
            reject(new Error(`Failed to connect to MCP server: ${error.message || error}`));
          } else {
            connection.status = 'error';
            connection.error = String(error);
          }
        };

        es.onmessage = (event: any) => {
          this.handleSSEMessage(connection, event.data);
        };

      } catch (error) {
        reject(new Error(`EventSource not available. Please install 'eventsource' package: npm install eventsource`));
      }
    });
  }

  /**
   * Connect via Standard IO (stdio transport)
   */
  private async connectStdio(connection: MCPConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      // Parse the command from the URL
      // URL format: "stdio:/path/to/server" or just "/path/to/server"
      let command = connection.url;
      if (command.startsWith('stdio:')) {
        command = command.slice(6);
      }

      const args = command.split(' ');
      const cmd = args.shift() || '';

      const env = {
        ...process.env,
        ...connection.env
      };

      const child = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env,
        shell: process.platform === 'win32'
      });

      connection.process = child;

      child.on('error', (error) => {
        console.error(`[mcp] Stdio process error: ${connection.name}`, error);
        if (connection.status === 'connecting') {
          reject(error);
        } else {
          connection.status = 'error';
          connection.error = error.message;
        }
      });

      child.on('exit', (code) => {
        console.log(`[mcp] Stdio process exited: ${connection.name} (code: ${code})`);
        connection.status = code === 0 ? 'disconnected' : 'error';
        if (code !== 0) {
          connection.error = `Process exited with code ${code}`;
        }
        this.connections.delete(connection.name);
        this.emit('disconnected', connection);
      });

      // Wait a moment for the process to start
      setTimeout(() => {
        if (child.pid) {
          connection.status = 'connected';
          resolve();
        } else {
          reject(new Error('Failed to start MCP server process'));
        }
      }, 1000);

      // Handle stdout messages
      if (child.stdout) {
        child.stdout.on('data', (data: Buffer) => {
          const lines = data.toString().trim().split('\n');
          lines.forEach(line => {
            if (line.trim()) {
              this.handleStdioMessage(connection, line);
            }
          });
        });
      }

      // Log stderr
      if (child.stderr) {
        child.stderr.on('data', (data: Buffer) => {
          console.error(`[mcp][${connection.name}] stderr:`, data.toString());
        });
      }
    });
  }

  /**
   * Handle SSE message from MCP server
   */
  private handleSSEMessage(connection: MCPConnection, data: string): void {
    try {
      const message = JSON.parse(data);
      this.emit('message', { connection, message });
      
      // Handle different message types
      if (message.id && this.listeners(`response:${message.id}`).length > 0) {
        this.emit(`response:${message.id}`, message);
      }
    } catch (error) {
      console.error('[mcp] Failed to parse SSE message:', error);
    }
  }

  /**
   * Handle stdio message from MCP server
   */
  private handleStdioMessage(connection: MCPConnection, data: string): void {
    try {
      const message = JSON.parse(data);
      this.emit('message', { connection, message });
      
      if (message.id && this.listeners(`response:${message.id}`).length > 0) {
        this.emit(`response:${message.id}`, message);
      }
    } catch (error) {
      // Not JSON, might be log output
      console.log(`[mcp][${connection.name}]`, data);
    }
  }

  /**
   * Fetch available tools from MCP server
   */
  private async fetchTools(connection: MCPConnection): Promise<void> {
    try {
      const response = await this.sendRequest(connection, {
        jsonrpc: '2.0',
        id: this.getNextRequestId(),
        method: 'tools/list',
        params: {}
      });

      if (response.result && response.result.tools) {
        connection.tools = response.result.tools;
        console.log(`[mcp] Found ${connection.tools.length} tools from ${connection.name}`);
      }
    } catch (error) {
      console.error(`[mcp] Failed to fetch tools from ${connection.name}:`, error);
    }
  }

  /**
   * Send a JSON-RPC request to the MCP server
   */
  private async sendRequest(connection: MCPConnection, request: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('MCP request timeout'));
      }, 30000);

      this.once(`response:${request.id}`, (response: any) => {
        clearTimeout(timeout);
        resolve(response);
      });

      if (connection.transport === 'sse' && connection.eventSource) {
        // For SSE, we'd typically use a POST request to send data
        // This is a simplified implementation
        console.log('[mcp] SSE POST requests not fully implemented in this simplified version');
        reject(new Error('SSE transport requires full HTTP client implementation'));
      } else if (connection.transport === 'stdio' && connection.process) {
        const message = JSON.stringify(request) + '\n';
        connection.process.stdin?.write(message);
      } else {
        clearTimeout(timeout);
        reject(new Error('Connection not available'));
      }
    });
  }

  /**
   * Invoke a tool on the MCP server
   */
  async invokeTool(connectionName: string, toolName: string, args: Record<string, any>): Promise<any> {
    const connection = this.connections.get(connectionName);
    if (!connection) {
      throw new Error(`Connection '${connectionName}' not found`);
    }

    if (connection.status !== 'connected') {
      throw new Error(`Connection '${connectionName}' is not connected (status: ${connection.status})`);
    }

    const tool = connection.tools.find(t => t.name === toolName);
    if (!tool) {
      throw new Error(`Tool '${toolName}' not found on connection '${connectionName}'. Available tools: ${connection.tools.map(t => t.name).join(', ')}`);
    }

    const request = {
      jsonrpc: '2.0',
      id: this.getNextRequestId(),
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    return this.sendRequest(connection, request);
  }

  /**
   * List all available tools from a connection
   */
  listTools(connectionName: string): MCPTool[] {
    const connection = this.connections.get(connectionName);
    if (!connection) {
      throw new Error(`Connection '${connectionName}' not found`);
    }
    return connection.tools;
  }

  /**
   * List all active connections
   */
  listConnections(): Array<{ name: string; url: string; status: string; tools: number }> {
    return Array.from(this.connections.values()).map(conn => ({
      name: conn.name,
      url: conn.url,
      status: conn.status,
      tools: conn.tools.length
    }));
  }

  /**
   * Disconnect from an MCP server
   */
  async disconnect(name: string): Promise<void> {
    const connection = this.connections.get(name);
    if (!connection) {
      throw new Error(`Connection '${name}' not found`);
    }

    if (connection.transport === 'sse' && connection.eventSource) {
      connection.eventSource.close();
    } else if (connection.transport === 'stdio' && connection.process) {
      connection.process.kill();
    }

    connection.status = 'disconnected';
    this.connections.delete(name);
    this.emit('disconnected', connection);
  }

  /**
   * Get a specific connection
   */
  getConnection(name: string): MCPConnection | undefined {
    return this.connections.get(name);
  }

  private getNextRequestId(): number {
    return ++this.requestId;
  }
}

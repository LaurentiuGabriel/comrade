# Comrade

![Comrade](logo.png)

**Comrade** is an open-source AI workspace for teams focused on security. It provides a premium interface for AI-powered workflows, built with transparency, extensibility, and local-first principles.

![Telegram Screenshot](screenshot.png)

## How it works
1. You configure an LLM by supplying your API key and submit your prompt
![Prompt](1.png)
2. The agent starts planning and executing its plan, creating files, verifying output, testing and correcting.
![Testing](2.png)
3. If you're creating a web application, the agent will also deploy your solution to a permanent PROD url.
![Deployment](3.png)
4. Check your end result.
![Result](4.png) 

## Features

- **Zero-friction Setup**: Works with your existing configuration
- **Multi-Modal**: Desktop, mobile, and web interfaces
- **Chat Integration**: WhatsApp and Telegram ready
- **Skills System**: Extensible workflows and automations
- **Local-First**: Your data stays on your machine by default
- **Audit Logging**: Full transparency into every action

## Available Tools

Comrade provides a comprehensive suite of **25+ agentic tools** that the AI can execute directly:

### 📁 File System Tools
- **`write_file`** - Create or overwrite files with content (path + content required)
- **`read_file`** - Read file contents from the workspace
- **`create_directory`** - Create directories and parent directories
- **`list_directory`** - List files and folders (optional recursive)
- **`apply_patch`** - Apply unified diff patches for multi-file edits

### ⚡ Shell & Execution
- **`execute_command`** - Execute shell commands (cross-platform, supports Windows/Linux/Mac)
  - Automatically normalizes commands: `python3` → `python`, `ls` → `dir`, etc.
  - Handles `cd dir && command` patterns
  - Supports cross-platform background processes

### 📦 Git Tools
- **`git_status`** - Check repository status
- **`git_diff`** - Show staged/unstaged changes
- **`git_add`** - Stage files for commit
- **`git_commit`** - Commit changes with message
- **`git_log`** - View commit history

### 🌐 Web Tools
- **`web_search`** - Search the web for information (DuckDuckGo)
- **`web_fetch`** - Fetch and extract content from URLs
- **`http_request`** - Make HTTP requests (GET, POST, PUT, DELETE, etc.)

### 🔍 Code Analysis
- **`code_search`** - Search code patterns using grep
- **`find_symbol`** - Find function/class/variable definitions

### 📦 Package Management
- **`package_install`** - Install packages (auto-detects npm, yarn, pnpm, pip)

### 🖥️ Local Server
- **`start_server`** - Start a built-in HTTP server (cross-platform)
  - Embeds directly in Node.js process (won't be killed between commands)
  - Serves static files with proper MIME types
  - Supports HTML, CSS, JS, images, fonts, and more
  - Returns URL like `http://localhost:8080/`

### 🧪 Testing
- **`run_tests`** - Run test suites (auto-detects Jest, pytest, etc.)

### 📚 Documentation
- **`generate_documentation`** - Generate docs from code comments

### 🔌 MCP (Model Context Protocol) Tools
Connect to external MCP servers to extend the agent's capabilities:

- **`mcp_connect`** - Connect to an MCP server
  - Supports SSE (Server-Sent Events) and stdio transports
  - Example: `{"server_url": "http://localhost:3001/sse", "name": "my-server", "transport": "sse"}`
  - Example (stdio): `{"server_url": "/path/to/server", "name": "local-server", "transport": "stdio"}`
  
- **`mcp_list_tools`** - List all available tools from a connected MCP server
  - Shows tool names, descriptions, and required parameters
  
- **`mcp_invoke_tool`** - Invoke a tool from an MCP server
  - Execute external tools like database queries, file system access, or third-party APIs
  - Example: `{"connection_name": "my-server", "tool_name": "query_database", "arguments": {"table": "users"}}`
  
- **`mcp_disconnect`** - Disconnect from an MCP server
  - Clean up connections and free resources
  
- **`mcp_list_connections`** - List all active MCP connections
  - Shows connection status and available tool counts

**What is MCP?** MCP (Model Context Protocol) is an open protocol that enables AI systems to connect to external data sources and tools. By connecting to MCP servers, Comrade can access:
- Databases (PostgreSQL, MySQL, MongoDB, etc.)
- Cloud services (AWS, GCP, Azure)
- Development tools (GitHub, Jira, Slack)
- File systems and document stores
- Custom business logic and APIs

**Example MCP Workflow:**
```
1. mcp_connect: {"server_url": "http://localhost:3001/sse", "name": "postgres-db"}
2. mcp_list_tools: {"connection_name": "postgres-db"}
3. mcp_invoke_tool: {"connection_name": "postgres-db", "tool_name": "execute_query", "arguments": {"sql": "SELECT * FROM users"}}
4. mcp_disconnect: {"connection_name": "postgres-db"}
```

### Tool Usage

Tools are invoked automatically by the AI agent when needed. For example:

```
User: "Create a React app"
Agent: 
  1. execute_command: "npx create-react-app my-app"
  2. read_file: "my-app/src/App.js"  
  3. write_file: {"path": "my-app/src/App.js", "content": "..."}
  4. start_server: {"path": "my-app/build", "port": 3000}
```

**Note:** For reliable tool execution, it's recommended to use **Claude (Anthropic)** or **GPT-4 (OpenAI)** as they have native tool-calling support. Local models via Ollama may have inconsistent results.

## Architecture

Comrade consists of:

- **Desktop App** (`packages/desktop`): Electron-based desktop shell
- **Server** (`packages/server`): Filesystem-backed API server
- **Core** (`packages/core`): Shared types and utilities
- **CLI** (`packages/cli`): Command-line interface
- **UI** (`packages/ui`): React component library

## Quick Start

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Documentation

- [VISION.md](./VISION.md) - Product vision and positioning
- [PRINCIPLES.md](./PRINCIPLES.md) - Development principles
- [PRODUCT.md](./PRODUCT.md) - Product requirements and UX
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Technical architecture
- [INFRASTRUCTURE.md](./INFRASTRUCTURE.md) - Infrastructure principles

## License

MIT - See [LICENSE](./LICENSE) for details.

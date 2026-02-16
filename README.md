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

Comrade provides a comprehensive suite of **34+ agentic tools** that the AI can execute directly:

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

### 🛒 Shopping & Meal Planning
**Note:** These tools create organized lists and plans only - they do NOT place actual orders or make purchases.

- **`create_shopping_list`** - Create an organized shopping list with categories and cost estimates
  - Organizes items by category: produce, dairy, meat, pantry, frozen, household
  - Calculates estimated totals and compares to budget
  - Generates a markdown file with checkboxes for manual shopping
  - Example: `{"items": [{"name": "Apples", "quantity": "2 lbs", "category": "produce", "estimated_price": 4.99}], "store_preference": "Whole Foods", "budget_limit": 100}`
  
- **`create_meal_plan`** - Generate a weekly meal plan with recipes and shopping list
  - Supports multiple cuisines: Italian, Mexican, Asian, Mediterranean, American
  - Considers dietary preferences and skill level
  - Includes prep time estimates and cost calculations
  - Automatically generates consolidated shopping list
  - Example: `{"days": 7, "cuisine_type": "Mediterranean", "dietary_preferences": ["vegetarian"], "skill_level": "intermediate", "budget_per_day": 25}`

**Safety Note:** These are planning tools only. No food is actually ordered or purchased. You'll need to take the generated shopping list and purchase items yourself from your preferred grocery store.

### ✈️ Travel & Flight Planning
**Note:** These tools create planning documents only - they do NOT book flights, make reservations, or process payments.

- **`search_flights`** - Search for flights and create comparison documents with prices and schedules
  - Supports one-way and round-trip searches
  - Multiple cabin classes: economy, premium_economy, business, first
  - Budget tracking and airline preferences
  - Generates markdown file with flight options and booking instructions
  - Example: `{"origin": "JFK", "destination": "LAX", "departure_date": "2024-12-25", "cabin_class": "economy", "max_price": 500}`
  
- **`create_travel_itinerary`** - Generate comprehensive day-by-day travel itineraries
  - Daily schedules with morning, afternoon, and evening activities
  - Restaurant suggestions for each meal based on budget and dietary needs
  - Estimated budget breakdown (accommodation, food, activities, transport)
  - Supports multiple trip types: leisure, business, adventure, family, romantic
  - Example: `{"destination": "Paris", "start_date": "2024-12-20", "end_date": "2024-12-27", "trip_type": "romantic", "budget_level": "luxury", "interests": ["museums", "food", "nightlife"]}`

**Example Workflow:**
```
1. search_flights: {"origin": "NYC", "destination": "London", "departure_date": "2024-12-20", "return_date": "2024-12-27"}
2. create_travel_itinerary: {"destination": "London", "start_date": "2024-12-20", "end_date": "2024-12-27", "trip_type": "leisure"}
3. User reviews documents and books separately through airline website
```

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

### 🌐 Web Automation (Browser)

The `browser` tool controls a real web browser for automated interaction with websites. This is powerful but requires safety controls.

**Unified tool with action parameter:**
- `action` (required) - The browser action to perform

**Available Actions:**
- **`start`** - Launch the browser
  - `headless` (boolean, default: false) - Run in background mode
  - `executablePath` (string, optional) - Path to Chrome/Chromium executable

- **`stop`** - Close the browser and cleanup
  - Always call when done!

- **`navigate`** - Go to a URL
  - `url` (string, required) - Website URL
  - `waitUntil` (string, optional) - Wait condition: "load", "domcontentloaded", "networkidle0", "networkidle2"

- **`click`** - Click an element
  - `selector` (string, required) - CSS selector
  - `waitForNavigation` (boolean, optional) - Wait for page navigation after click

- **`type`** - Type text into an input
  - `selector` (string, required) - CSS selector
  - `text` (string, required) - Text to type
  - `clearFirst` (boolean, optional) - Clear field before typing

- **`fill`** - Fill multiple form fields at once
  - `fields` (array, required) - Array of {selector, value, clearFirst}

- **`select`** - Select dropdown option
  - `selector` (string, required) - CSS selector
  - `value` (string, required) - Option value to select

- **`screenshot`** - Capture screenshot
  - `outputPath` (string, required) - Where to save the image
  - `fullPage` (boolean, optional) - Capture entire page
  - `selector` (string, optional) - Capture specific element

- **`evaluate`** - Run JavaScript on the page
  - `script` (string, required) - JavaScript code to execute

- **`wait`** - Wait for element or time
  - `selector` (string, optional) - Wait for element to appear
  - `timeout` (number, optional) - Maximum wait time (ms)

- **`scroll`** - Scroll the page
  - `direction` (string, required) - "up", "down", "left", "right"
  - `amount` (number, optional) - Pixels to scroll (default: 300)

- **`extract`** - Extract data from elements
  - `selector` (string, required) - CSS selector
  - `attribute` (string, optional) - Attribute to extract (omit for text content)
  - `multiple` (boolean, optional) - Extract from all matching elements

- **`pdf`** - Save page as PDF
  - `outputPath` (string, required) - Where to save the PDF
  - `format` (string, optional) - Paper format: "A4", "Letter", etc.

- **`status`** - Check browser state and current page

**⚠️ SAFETY WARNINGS:**
- Browser runs in visible mode by default (you can watch)
- Never leave browser running unattended
- Don't provide login credentials unless you fully trust the agent
- Always call `stop` when done
- These actions trigger approval dialog due to high risk

**Example Workflow:**
```
1. browser: {"action": "start", "headless": false}
2. browser: {"action": "navigate", "url": "https://example.com"}
3. browser: {"action": "type", "selector": "#search", "text": "query"}
4. browser: {"action": "click", "selector": "#submit"}
5. browser: {"action": "wait", "selector": ".results"}
6. browser: {"action": "screenshot", "outputPath": "results.png", "fullPage": true}
7. browser: {"action": "extract", "selector": ".result-item", "multiple": true}
8. browser: {"action": "stop"}
```

**Puppeteer Dependency:**
Browser automation requires Puppeteer (not included by default, ~300MB). Install with:
```bash
npm install puppeteer
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

### 🔒 Tool Approval System

Comrade includes a built-in approval system that asks for your permission before executing tools. This ensures you maintain control over what the AI agent does on your machine.

**How it works:**
- Before any tool executes, a dialog appears showing:
  - The tool name and risk level (Low/Medium/High)
  - A description of what the tool will do
  - All arguments being passed to the tool
  - Three action buttons

**Options:**
- **Allow Once** - Approve this single execution only
- **Allow All** - Approve all tools permanently (won't ask again)
- **Reject** - Cancel the tool execution

**Risk Levels:**
- 🟢 **Low Risk** - Safe operations like reading files, searching, listing directories
- 🟡 **Medium Risk** - Operations that modify files or install packages
- 🔴 **High Risk** - Commands that execute shell commands or invoke external tools

**API Endpoints:**
- `GET /tools/approval-status` - Check current approval status
- `POST /tools/clear-approvals` - Reset all approvals (requires authentication)
- `POST /tools/request-approval` - Request approval for a tool
- `POST /tools/approve` - Respond to an approval request
- `GET /tools/pending-approval` - Get current pending approval

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

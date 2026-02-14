# Getting Started with Comrade

Welcome! This guide will help you set up and start using Comrade.

## Installation

### Prerequisites

- Node.js 18 or higher
- npm 10 or higher
- Git

### Clone and Setup

```bash
# Clone the repository
git clone https://github.com/your-org/comrade.git
cd comrade

# Install dependencies
npm install

# Build all packages
npm run build
```

## Quick Start

### 1. Start the Server

```bash
# In one terminal
npm run dev:server
```

This starts the Comrade API server on http://127.0.0.1:8080

### 2. Start the Desktop App

```bash
# In another terminal
npm run dev:desktop
```

This launches the Electron desktop application.

## Using the CLI

Comrade includes a command-line interface for quick operations:

```bash
# Check server status
npm run cli -- status

# List workspaces
npm run cli -- workspace --list

# Create a workspace
npm run cli -- workspace --create my-project --path ./my-project

# List skills
npm run cli -- skill --list

# Create a skill
npm run cli -- skill --create my-skill
```

## Your First Workspace

1. **Open Comrade Desktop** - You'll see the welcome screen
2. **Click "Create Workspace"** - Choose a folder for your project
3. **Start Chatting** - Click the Chat tab and type your first message
4. **Create a Skill** - Go to Skills tab and create your first skill

## Creating Skills

Skills are Markdown files that help customize Comrade's behavior:

```markdown
# My Custom Skill

This skill helps Comrade understand my coding preferences.

## Preferences

- Use TypeScript
- Prefer functional components
- Follow ESLint rules
```

Save this in your workspace's `.comrade/skills/` directory.

## Configuration

Comrade stores configuration in `~/.comrade/server.json`:

```json
{
  "workspaces": [],
  "activeWorkspaceId": null,
  "authorizedRoots": []
}
```

## Next Steps

- Read the [Architecture Guide](./ARCHITECTURE.md)
- Check out [Development Tips](./.comrade/skills/development.md)
- Explore the [Product Features](./PRODUCT.md)

## Getting Help

- Check the logs: `~/.comrade/logs/`
- Run with debug mode: `DEBUG=comrade npm run dev`
- File an issue on GitHub

## Troubleshooting

### Server won't start
- Check if port 8080 is available
- Try a different port: `npm run dev:server -- --port 8081`

### Desktop app is blank
- Make sure the server is running
- Check the DevTools console (Cmd/Ctrl+Shift+I)

### Workspace not showing
- Verify the folder exists
- Check server logs for errors

Happy collaborating!

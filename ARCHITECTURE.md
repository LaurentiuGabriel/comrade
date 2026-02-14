# Comrade Architecture

## Core Concepts

Comrade uses a modular architecture with clear separation of concerns:

### Extension Abstractions

- **MCP (Model Context Protocol)**: Use for authenticated third-party flows (OAuth). Good fit when "auth + capability surface" is the product boundary.

- **Plugins**: Use when you need real tools in code and want to scope permissions around them. Safer than raw CLI, more flexible than MCP.

- **Skills**: Use when you want reliable plain-english patterns that shape behavior. Best for repeatability and making workflows legible.

- **Agents**: Use when you need tasks executed by different models with extra context.

- **Commands**: Trigger tools via `/` commands.

## Runtime Modes

Comrade has two runtime modes:

### Mode A - Host (Desktop/Server)
- Comrade runs on desktop/laptop and **starts** the AI engine locally.
- The engine server runs on loopback (default `127.0.0.1:8080`).
- Comrade UI connects via SDK and listens to events.

### Mode B - Client (Desktop/Mobile)
- Comrade runs as a **remote controller**.
- Connects to an already-running server hosted by a trusted device.
- Pairing uses QR code / one-time token and secure transport.

This split makes mobile "first-class" without requiring the full engine on-device.

## Web Parity + Filesystem Actions

Any feature that:
- Reads skills/commands/plugins from `.comrade/`
- Edits config files
- Opens folders / reveals paths

must be routed through a host-side service.

The Comrade server (`packages/server`) is the single API surface for filesystem-backed operations.

## Engine Lifecycle

### Start Server + Client (Host mode)
```typescript
import { createEngine } from "@comrade/sdk";

const engine = await createEngine({
  hostname: "127.0.0.1",
  port: 8080,
  config: {
    model: "claude-3-5-sonnet",
  },
});

const { client } = engine;
```

### Connect to Existing Server (Client mode)
```typescript
import { createClient } from "@comrade/sdk/client";

const client = createClient({
  baseUrl: "http://localhost:8080",
  directory: "/path/to/project",
});
```

## Sessions (Primary Primitive)

Comrade maps a "Task Run" to a **Session**.

Core methods:
- `client.session.create()`
- `client.session.list()`
- `client.session.get()`
- `client.session.messages()`
- `client.session.prompt()`
- `client.session.abort()`
- `client.session.summarize()`

## Folder Authorization Model

Two layers of protection:

1. **Comrade UI authorization**: User explicitly selects allowed folders via native picker.
2. **Engine permissions**: Engine requests permissions as needed; Comrade intercepts and displays them.

Rules:
- Default deny for anything outside allowed roots.
- "Allow once" never expands persistent scope.
- "Allow for session" applies only to the session ID.

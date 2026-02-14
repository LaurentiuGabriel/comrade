# Comrade

![Comrade](logo.png)

**Comrade** is an open-source AI workspace for teams. It provides a premium interface for AI-powered workflows, built with transparency, extensibility, and local-first principles.

## Features

- **Zero-friction Setup**: Works with your existing configuration
- **Multi-Modal**: Desktop, mobile, and web interfaces
- **Chat Integration**: WhatsApp and Telegram ready
- **Skills System**: Extensible workflows and automations
- **Local-First**: Your data stays on your machine by default
- **Audit Logging**: Full transparency into every action

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

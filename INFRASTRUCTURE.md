# Comrade Infrastructure

Comrade is an experience layer. The AI engine is the brain. This document defines how infrastructure is built so every component is usable on its own, composable as a sidecar, and easy to automate.

## Core Principles

1. **CLI-first, always**
   - Every infrastructure component must be runnable via a single CLI command.
   - The Comrade UI may wrap these, but never replace or lock them out.

2. **Unix-like interfaces**
   - Prefer simple, composable boundaries: JSON over stdout, flags, and env vars.
   - Favor readable logs and predictable exit codes.

3. **Sidecar-composable**
   - Any component must run as a sidecar without special casing.
   - The UI should connect to the same surface area the CLI exposes.

4. **Clear boundaries**
   - The engine remains the brain; Comrade adds a thin config + UX layer.
   - When the engine exposes a stable API, use it instead of re-implementing.

5. **Local-first, graceful degradation**
   - Default to local execution.
   - If a sidecar is missing or offline, the UI falls back to read-only or explicit user guidance.

6. **Portable configuration**
   - Use config files + env vars; avoid hidden state.
   - Keep credentials outside git and outside the repo.

7. **Observability by default**
   - Provide health endpoints and structured logs.
   - Record audit events for every config mutation.

8. **Security + scoping**
   - All filesystem access is scoped to explicit workspace roots.
   - Writes require explicit host approval when requested remotely.

9. **Debuggable by agents**
   - Design architecture so agents can call components easily.
   - Run underlying CLIs, test endpoints, verify flows.

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Desktop/Mobile shell | Electron 28+ |
| Frontend | React 18 + TypeScript |
| State | Redux Toolkit + RTK Query |
| Styling | CSS Modules + CSS Variables |
| IPC | Electron IPC + REST API |
| Backend | Node.js + Express |
| Database | SQLite (local) |
| Package Manager | npm |

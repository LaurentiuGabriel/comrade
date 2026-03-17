# Docker Setup for Comrade

This guide explains how to run Comrade using Docker.

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/) installed on your system
- [Docker Compose](https://docs.docker.com/compose/install/) (usually included with Docker Desktop)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/your-org/comrade.git
cd comrade
```

### 2. Configure Environment Variables (Optional)

Create a `.env` file in the root directory to set API keys:

```bash
# LLM Provider API Keys
ANTHROPIC_API_KEY=your_anthropic_key_here
OPENAI_API_KEY=your_openai_key_here
GEMINI_API_KEY=your_gemini_key_here

# Optional: Ollama for local models
OLLAMA_HOST=http://localhost:11434

# Optional: Telegram Bot Token
TELEGRAM_BOT_TOKEN=your_telegram_bot_token
```

### 3. Build and Start the Container

```bash
docker-compose up -d
```

This will:
- Build the Docker image
- Start the Comrade server on port 8080
- Create persistent volumes for configuration and data

### 4. Access the Server

Once running, access the server at:
- API: http://localhost:8080
- WebSocket: ws://localhost:8080

### 5. Check Logs

```bash
docker-compose logs -f comrade-server
```

### 6. Stop the Server

```bash
docker-compose down
```

To remove all data (including volumes):
```bash
docker-compose down -v
```

## Using Docker Directly (Without Compose)

### Build the Image

```bash
docker build -t comrade-server .
```

### Run the Container

```bash
docker run -d \
  --name comrade-server \
  -p 8080:8080 \
  -v $(pwd)/workspace:/workspace \
  -v comrade-config:/root/.comrade \
  -e ANTHROPIC_API_KEY=your_key_here \
  -e OPENAI_API_KEY=your_key_here \
  comrade-server
```

## Configuration

### Mounting Your Workspace

The Docker container mounts a `workspace` directory for all file operations. You can change this in `docker-compose.yml`:

```yaml
volumes:
  - /path/to/your/workspace:/workspace
```

### API Keys

You can pass API keys in several ways:

**Option 1: Environment file (.env)**
```bash
docker-compose --env-file .env up -d
```

**Option 2: Command line**
```bash
ANTHROPIC_API_KEY=xxx OPENAI_API_KEY=yyy docker-compose up -d
```

**Option 3: Config file inside container**
Mount a config file at `/root/.comrade/server.json`:
```json
{
  "llm": {
    "provider": "anthropic",
    "apiKey": "your-key-here"
  }
}
```

## Development Mode

For development with hot-reload:

```bash
# Mount source code as volumes
docker run -it --rm \
  -p 8080:8080 \
  -v $(pwd):/app \
  -v /app/node_modules \
  -w /app \
  node:20-alpine \
  sh -c "npm install -g pnpm && pnpm install && pnpm dev:server"
```

## Troubleshooting

### Port Already in Use

If port 8080 is already in use, change the port mapping in `docker-compose.yml`:
```yaml
ports:
  - "3000:8080"  # Maps host port 3000 to container port 8080
```

### Permission Issues

If you encounter permission issues with the workspace directory:
```bash
# On Linux/Mac
sudo chown -R $USER:$USER workspace/
```

### Browser/Puppeteer Issues

The Docker image includes Chromium for browser automation. If you encounter issues:
```bash
# Check if Chromium is installed correctly
docker exec comrade-server chromium-browser --version
```

### Checking Container Status

```bash
# Check if container is running
docker ps

# Inspect container details
docker inspect comrade-server

# Access container shell
docker exec -it comrade-server /bin/sh
```

## Security Considerations

- **API Keys**: Never commit API keys to version control. Use environment variables or mounted config files.
- **Network**: By default, the container binds to `0.0.0.0`. In production, consider using a reverse proxy (nginx) with HTTPS.
- **Workspace Access**: The container has full access to the mounted workspace directory. Be careful about what you mount.

## Advanced Usage

### Running with Custom Config

```bash
docker run -d \
  --name comrade-server \
  -p 8080:8080 \
  -v $(pwd)/workspace:/workspace \
  -v $(pwd)/my-config.json:/root/.comrade/server.json:ro \
  comrade-server
```

### Health Checks

The container includes a health check. You can view health status:
```bash
docker inspect --format='{{.State.Health.Status}}' comrade-server
```

### Scaling (Multiple Instances)

For high availability, you can run multiple instances behind a load balancer:
```bash
docker-compose up -d --scale comrade-server=3
```

**Note:** Multiple instances require shared storage and proper session management (not included in basic setup).

## Updating

To update to the latest version:

```bash
# Pull latest code
git pull

# Rebuild and restart
docker-compose down
docker-compose up -d --build
```

## Support

For issues or questions:
- Check the [main README](../README.md)
- Review [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) (if available)
- Open an issue on GitHub

# Multi-stage build for Comrade server
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/core/ packages/core/
COPY packages/server/ packages/server/
COPY packages/ui/ packages/ui/

# Build packages
RUN pnpm --filter @comrade/core build
RUN pnpm --filter @comrade/server build

# Production stage
FROM node:20-alpine AS production

# Install pnpm and chromium dependencies for Puppeteer
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    bash

# Tell Puppeteer to skip installing Chrome. We'll be using the installed package.
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Install pnpm globally
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy workspace files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/core/package.json packages/core/
COPY packages/server/package.json packages/server/
COPY packages/ui/package.json packages/ui/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built packages from builder stage
COPY --from=builder /app/packages/core/dist packages/core/dist
COPY --from=builder /app/packages/server/dist packages/server/dist

# Create workspace directory for Comrade operations
RUN mkdir -p /workspace

# Expose port
EXPOSE 8080

# Environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Volume for persistent data
VOLUME ["/workspace", "/root/.comrade"]

# Start the server
WORKDIR /workspace
CMD ["node", "/app/packages/server/dist/cli.js", "--host", "0.0.0.0", "--port", "8080"]

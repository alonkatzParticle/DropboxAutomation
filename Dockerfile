# =============================================================================
# Dockerfile — Dropbox Automation App
#
# Builds a production image that contains both Node.js (for the Next.js web UI)
# and Python 3 (for the Monday.com/Dropbox automation scripts).
#
# Build:  docker build -t dropbox-automation .
# Run:    docker run --rm -p 3030:3030 --env-file .env dropbox-automation
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: base — slim Node image with Python 3 added
# ---------------------------------------------------------------------------
FROM node:20-slim AS base

# Install Python 3, pip, and minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# Stage 2: deps — install npm dependencies
# ---------------------------------------------------------------------------
FROM base AS deps

WORKDIR /app/web

# Copy only package files first so npm install is cached when code changes
COPY web/package.json web/package-lock.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# Stage 3: builder — build the Next.js production bundle
# ---------------------------------------------------------------------------
FROM base AS builder

WORKDIR /app

# Copy npm dependencies from the deps stage
COPY --from=deps /app/web/node_modules ./web/node_modules

# Copy all project files (Python backend + Next.js frontend)
COPY . .

# Build the Next.js app (standalone mode produces a self-contained server.js)
WORKDIR /app/web
RUN npm run build

# ---------------------------------------------------------------------------
# Stage 4: runner — minimal production image
# ---------------------------------------------------------------------------
FROM base AS runner

WORKDIR /app

# Don't run as root in production
RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nextjs

# --- Python setup ---
# Copy Python project files (the automation scripts)
COPY --from=builder /app/main.py /app/core.py /app/state.py /app/web.py \
     /app/monday_client.py /app/monday_api.py \
     /app/dropbox_client.py /app/folder_builder.py \
     /app/web_auto_creator.py /app/web_folder_mover.py \
     /app/get_dropbox_token.py \
     /app/requirements.txt /app/config.json ./

# Copy state and history files if they exist (they are auto-generated)
COPY --from=builder /app/state.json* /app/history.json* ./

# Install Python dependencies (use --break-system-packages since we're in a container)
RUN pip3 install --no-cache-dir --break-system-packages -r requirements.txt

# --- Next.js setup ---
# Copy the standalone Next.js build output
COPY --from=builder /app/web/.next/standalone ./web/.next/standalone

# Copy static assets that standalone mode doesn't include automatically
COPY --from=builder /app/web/.next/static ./web/.next/standalone/.next/static
COPY --from=builder /app/web/public ./web/.next/standalone/public

# The standalone server uses process.cwd() as the base.
# Next.js API routes resolve PROJECT_ROOT as path.resolve(cwd, "..").
# We must start from web/.next/standalone/web so that ".." resolves to
# web/.next/standalone — which is where we'll symlink the Python files.
#
# Symlink all Python project files into the standalone parent directory
# so that PROJECT_ROOT (../ from cwd) resolves to a directory with Python scripts.
RUN ln -s /app/main.py          /app/web/.next/standalone/main.py          && \
    ln -s /app/core.py          /app/web/.next/standalone/core.py          && \
    ln -s /app/state.py         /app/web/.next/standalone/state.py         && \
    ln -s /app/web.py           /app/web/.next/standalone/web.py           && \
    ln -s /app/monday_client.py /app/web/.next/standalone/monday_client.py && \
    ln -s /app/monday_api.py    /app/web/.next/standalone/monday_api.py    && \
    ln -s /app/dropbox_client.py /app/web/.next/standalone/dropbox_client.py && \
    ln -s /app/folder_builder.py /app/web/.next/standalone/folder_builder.py && \
    ln -s /app/web_auto_creator.py /app/web/.next/standalone/web_auto_creator.py && \
    ln -s /app/web_folder_mover.py /app/web/.next/standalone/web_folder_mover.py && \
    ln -s /app/get_dropbox_token.py /app/web/.next/standalone/get_dropbox_token.py && \
    ln -s /app/config.json      /app/web/.next/standalone/config.json      && \
    ln -s /app/state.json       /app/web/.next/standalone/state.json       && \
    ln -s /app/history.json     /app/web/.next/standalone/history.json

# Set ownership so the non-root user can write state.json, history.json, etc.
RUN chown -R nextjs:nodejs /app

USER nextjs

# The port the app listens on
ENV PORT=3030
ENV HOSTNAME="0.0.0.0"
EXPOSE 3030

# Start from web/.next/standalone/web so cwd = .../web and
# path.resolve(cwd, "..") = .../standalone (where Python symlinks live)
WORKDIR /app/web/.next/standalone/web
CMD ["node", "../server.js"]

FROM ubuntu:24.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install base dependencies
RUN apt-get update && apt-get install -y \
    curl \
    git \
    sudo \
    build-essential \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g npm@latest

# Create worker user matching host UID/GID
ARG HOST_UID=1000
ARG HOST_GID=1000

RUN groupadd -g $HOST_GID worker || true \
    && useradd -u $HOST_UID -g $HOST_GID -m -s /bin/bash worker \
    && usermod -aG sudo worker \
    && echo "worker ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Set up working directory
WORKDIR /app
RUN chown worker:worker /app

# Switch to worker user
USER worker

# Copy package files first for caching
COPY --chown=worker:worker package.json package-lock.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY --chown=worker:worker . .

# Build the project
RUN npm run build

# Make scripts executable
RUN chmod +x scripts/*.sh

# Default command matches worker entry point
CMD ["node", "dist/src/worker.js"]

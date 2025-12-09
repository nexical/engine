#!/bin/bash
set -e

usage() {
    echo "Usage: $0 {start|login|build}"
    exit 1
}

COMMAND=$1

case "$COMMAND" in
    start)
        echo "Starting Nexical Factory Worker..."
        docker-compose up -d --build
        ;;
    login)
        echo "Initiating Device Flow Login..."
        # If running inside container:
        # node dist/src/cli.js login
        # If running mostly for setting up token env var for docker-compose:
        # We need to run the CLI locally or inside a temporary container to get the token.
        
        # Check if we have .env or valid token
        # For simplicity, let's assume we run the CLI from the build
        docker-compose run --rm worker node dist/src/cli.js login
        ;;
    build)
        echo "Building Docker image..."
        HOST_UID=$(id -u)
        HOST_GID=$(id -g)
        docker build \
          --build-arg HOST_UID=$HOST_UID \
          --build-arg HOST_GID=$HOST_GID \
          -t nexical-factory-worker .
        ;;
    *)
        usage
        ;;
esac

# @nexical/engine

The Core AI orchestration engine for Astrical.

## Overview

The `@astrical/engine` library constitutes the core autonomy loop for the agentic system. It implements a state-driven orchestrator that manages the lifecycle of a task from high-level architecture to granular execution using a cycle of **Architecting**, **Planning**, and **Executing**.

## Key Concepts

- **Orchestrator**: The central controller that manages the state machine and workflow.
- **RuntimeHost**: The interface for the engine to interact with the embedding application (logging, inputs).
- **States**:
  - **ARCHITECTING**: Generates `architecture.md` (Technical approach).
  - **PLANNING**: Generates `plan.yml` (Task list).
  - **EXECUTING**: Runs tasks using Drivers.
- **Drivers**: Adapters that execute skills (e.g., `cli` for running commands, `fs` for file operations).
- **Signals**: Mechanism for agents to interrupt the flow (e.g., `REPLAN`, `REARCHITECT`).

## Usage

### Installation

```bash
npm install @astrical/engine
```

### Basic Example

```typescript
import { Orchestrator, RuntimeHost } from '@astrical/engine';

// 1. Implement RuntimeHost
const myHost: RuntimeHost = {
  log: (level, msg) => console.log(`[${level}] ${msg}`),
  status: (state) => console.log(`Status changed to: ${state}`),
  ask: async (q) => {
    // Implement user input logic
    return 'User Answer';
  },
};

// 2. Initialize Engine
const engine = new Orchestrator(
  process.cwd(), // Root directory
  myHost,
);

// 3. Initialize (loads drivers, state, etc.)
await engine.init();

// 4. Start Execution
await engine.start('Build a login page');
```

## Documentation

- [Architecture](./architecture.md): Detailed system design and component breakdown.
- [Execution Model](./execution.md): Deep dive into the state machine, signals, and agent execution.

## Running Tests

- Unit Tests: `npm run test:unit`
- Integration Tests: `npm run test:integration`

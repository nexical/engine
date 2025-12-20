# @nexical/engine

Core AI orchestration engine for Nexical.

## Overview

The `@nexical/engine` library provides the intelligence layer for building AI agents. It implements a Hexagonal Architecture, decoupling the core logic (`Orchestrator`, `Planner`, `Executor`) from the runtime environment (`RuntimeHost`).

## Key Concepts

- **RuntimeHost**: The interface for the engine to interact with the outside world (logging, asking questions, reporting status).
- **Profile**: Configuration for the agent, defining constraints, allowed drivers, and system prompts.
- **Orchestrator**: The central controller that manages the agent lifecycle (Architecting -> Planning -> Executing).
- **AgentSession**: Persists state across execution steps.

## Usage

### Installation

```bash
npm install @nexical/engine
```

### Basic Example

```typescript
import { Orchestrator, RuntimeHost, DocsProfile } from '@nexical/engine';

// 1. Implement RuntimeHost
const myHost: RuntimeHost = {
    log: (level, msg) => console.log(`[${level}] ${msg}`),
    status: (state) => console.log(`Status: ${state}`),
    ask: async (q) => {
        // Implement interaction (e.g. CLI prompt)
        return 'User Answer';
    }
};

// 2. Initialize Engine
const engine = new Orchestrator(
    myHost, 
    DocsProfile, // Or custom profile
    process.cwd()
);

await engine.init();

// 3. Start Execution
await engine.start("Create a new project");

// 4. Step through lifecycle (if controlling manually)
// await engine.step("User feedback");
```

## Running Tests

- Unit Tests: `npm run test:unit`
- Integration Tests: `npm run test:integration`

## Architecture

The engine operates as a state machine:
1. **ARCHITECTING**: Generates a high-level `architecture.md` based on user request.
2. **PLANNING**: Generates a detailed `plan.yml` based on the architecture.
3. **EXECUTING**: Executes the tasks in `plan.yml` using registered Drivers.
4. **COMPLETED**: Workflow finished.

## Drivers

Drivers are skills the agent use. Core drivers include:
- `cli`: Execute shell commands (constrained by profile).
- `provision_resources`: Create GitHub repos, Cloudflare projects.
- `deploy_site`: Merge and push code.

To implement a new driver, implement the `Driver` interface and register it via `engine.driverRegistry`.

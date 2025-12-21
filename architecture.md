# Engine Architecture

The `src/engine` project constitutes the core autonomy loop for the agentic system. It is designed as a state-driven orchestrator that manages the lifecycle of a task from high-level architecture to granular execution.

## System Overview

The engine operates on a cycle of **Architecting**, **Planning**, and **Executing**. This separation of concerns allows the system to:
1.  **Architect**: Define the high-level technical approach and constraints.
2.  **Plan**: Break down the approach into discrete, executable tasks with dependencies.
3.  **Execute**: Run the tasks using registered drivers (e.g., CLI, FileSystem).

## Core Components

### 1. Orchestrator
The `Orchestrator` (`src/orchestrator.ts`) is the central controller. It is responsible for:
-   **Initialization**: Loading configuration (`Application`, `ProjectProfile`), services, and drivers.
-   **State Management**: Maintaining the `EngineState` (persisted to `state.yml`).
-   **Workflow Loop**: executing the `step()` method which transitions the system through its states.

### 2. State Machine
The system is modeled as a finite state machine with the following states:
-   **ARCHITECTING**: Generates the `architecture.md` file defining the technical solution.
-   **PLANNING**: Generates the `plan.yml` file containing a list of tasks based on the architecture.
-   **EXECUTING**: Iterates through the tasks in `plan.yml` and executes them.
-   **COMPLETED**: Terminal state when all tasks are successful.
-   **INTERRUPTED**: State entered when a human signal or error interrupts the flow.
-   **FAILED**: Terminal state when the loop requires too many retries or encounters an unrecoverable error.

### 3. Workflow Components

#### Architect (`src/workflow/architect.ts`)
*   **Input**: User prompt, global constraints, evolution log.
*   **Output**: `architecture.md`
*   **Role**: Uses a Large Language Model (LLM) (via `CLIDriver`) to analyze the request and create a technical design document.

#### Planner (`src/workflow/planner.ts`)
*   **Input**: User prompt, Architecture, Agent Skills, completed tasks.
*   **Output**: `plan.yml` (Array of `Task` objects).
*   **Role**: Converts the architecture into a DAG (Directed Acyclic Graph) of tasks. It manages dependencies and ensures tasks align with available agent skills.

#### Executor (`src/workflow/executor.ts`)
*   **Input**: `plan.yml`
*   **Output**: Side effects (file changes, command executions).
*   **Role**: Iterates through the plan. It skips completed tasks, checks dependencies, and acts as the dispatch layer, sending tasks to the appropriate `Driver` for execution.

## Data Models

*   **Application**: Represents the static configuration of the application (paths, directories).
*   **ProjectProfile**: Represents the dynamic user configuration loaded from `config.yml`.
*   **EngineState**: The runtime state (current status, loop count, active plan) that is persisted to disk.
*   **Plan / Task**: Strictly typed definitions of the work to be done.
*   **Signal**: Detailed information about interruptions or feedback loops (e.g., `REPLAN`, `REARCHITECT`).

## Extensibility

### Drivers
`Drivers` are the execution engines for tasks. The system uses a `DriverRegistry` to manage them.
-   **CLIDriver**: Executes tasks by running external CLI commands. This is the primary driver for invoking LLM agents (like `gemini`).
-   **ImageGenDriver**: An example specialized driver for image generation tasks.

### Services
Shared utilities that provide specific capabilities:
-   **GitService**: Standardized interface for Git operations.
-   **FileSystemService**: Atomic file I/O operations.
-   **PromptEngine**: Jinja2-like template rendering for dynamic prompt construction.

## Integration

To integrate the engine into an application:

```typescript
import { Orchestrator } from './orchestrator.js';
import { RuntimeHost } from './interfaces/RuntimeHost.js';

// 1. Implement a RuntimeHost for logging/status updates
const host: RuntimeHost = {
    log: (level, msg) => console.log(`[${level}] ${msg}`),
    status: (status) => console.log(`Status changed to: ${status}`)
};

// 2. Initialize the Orchestrator with the project root
const engine = new Orchestrator('/path/to/project/root', host);

// 3. Initialize (loads drivers, state, etc.)
await engine.init();

// 4. Start the loop with a user prompt
await engine.start("Build a login page");
```

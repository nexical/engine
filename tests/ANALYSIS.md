# Project Analysis & Interaction Map

**Last Updated:** 2025-12-23
**Status:** In Progress

## 1. Purpose & Structure
This document provides a comprehensive analysis of the `astrical/engine` project. It maps every interaction, workflow path, and state transition within the application to guide integration and end-to-end testing strategies.

### Structure
1.  **Source File Deep Dive**: Detailed analysis of each source file, including responsibilities, state mutations, and interactions.
2.  **Domain & Architecture**: Overview of how domain models and architectural components fit together.
3.  **Prompt Classification**: Categorization of user prompts and their expected execution flows.
4.  **Workflow & State Transitions**: Detailed map of the `WorkflowGraph` and `Orchestrator` logic.
5.  **Interaction Maps**: Tracing execution paths for happy paths, multi-turn scenarios, and error recovery.
6.  **Error Handling**: Analysis of error types and recovery mechanisms.

---

## 2. Deep Dive: Source File Analysis

### 2.1 Agents (`src/agents`)

#### `ArchitectAgent`
*   **Responsibility**: Generates the high-level architecture of the application based on the user request.
*   **Key Interactions**:
    *   `Project`: Retrieves constraints and configuration.
    *   `PromptEngine`: Renders the architecture prompt.
    *   `DriverRegistry`: Executes the LLM call (default: Gemini).
    *   `Workspace`: Saves the generated `Architecture` object.
*   **State Mutations**: Creates/Updates the `architecture` artifact in the workspace.
*   **Error Scenarios**: Driver execution failure, Markdown parsing errors.

#### `PlannerAgent`
*   **Responsibility**: Translates the architecture into a detailed `Plan` with executable tasks.
*   **Key Interactions**:
    *   Requires `Architecture` input.
    *   `DriverRegistry`: Executes the LLM call.
    *   `Workspace`: Saves the generated `Plan` object.
*   **State Mutations**: Creates/Updates the `plan` artifact in the workspace.
*   **Error Scenarios**: Driver failure, YAML parsing errors (critical, throws exception).

#### `DeveloperAgent`
*   **Responsibility**: Executes the implementation plan by coordinating skills.
*   **Key Interactions**:
    *   `Workspace`: Loads the `Plan`.
    *   `SkillRunner`: Executes individual tasks.
    *   `GitService`: Commits changes after successful tasks.
    *   `EngineState`: Tracks task progress (pending, completed, failed).
*   **State Mutations**: Updates `EngineState`, modifies file system (via skills), creates git commits.
*   **Multi-turn Logic**: Iterates through tasks, checks dependencies, and halts on failure or signal detection.
*   **Signal Handling**: Checks for user/system signals after every task.

#### `Brain`
*   **Responsibility**: Central DI container and agent factory.
*   **Key Interactions**: Aggregates core services (`PromptEngine`, `DriverRegistry`, `SkillRunner`, `EvolutionService`).
*   **Lifecycle**: `init()` loads drivers and validates skills. Instantiates agents on demand with workspace context.

### 2.2 Domain Models (`src/domain`)

#### `EngineState`
*   **Responsibility**: The single source of truth for the execution state.
*   **Key Properties**:
    *   `status`: Orchestrator status (IDLE, ARCHITECTING, EXECUTING, etc.).
    *   `tasks`: Tracks `pending`, `completed`, and `failed` task IDs.
    *   `loop_count`: Monitors multi-turn iterations (useful for preventing infinite loops).
    *   `last_signal`: Stores the most recent external signal (e.g., user interruption).
*   **Serialization**: YAML-based persistence allows for session resumption.

#### `Workspace`
*   **Responsibility**: High-level abstraction for project file I/O and artifact management.
*   **Key Capabilities**:
    *   **Artifacts**: Loads/Saves `Architecture`, `Plan`, and `EngineState`.
    *   **Signals**: Detects external signals (file-based) from `.ai/signals`.
    *   **Concurrency**: Implements atomic writes with locking (`scheduleWrite`) to prevent corruption.
    *   **Caching**: Caches artifacts in memory to reduce disk I/O.

#### `Session`
*   **Responsibility**: Lifecycle manager for a specific interaction session.
*   **Flow**:
    *   `start()`: Initializes a new state and triggers the workflow.
    *   `resume()`: Hydrates state from disk and continues execution.
*   **Composition**: Holds the `EngineState` and instantiates the `Workflow` on demand.

#### `Project`
*   **Responsibility**: Configuration and structure of the target codebase.
*   **Key Capabilities**:
    *   **Paths**: Defines the standard `.ai` directory layout (`ProjectPaths`).
    *   **Config**: Parses `config.yml` for agent settings.
    *   **Constraints**: Loads global constraints from `AGENTS.md`.

#### `Architecture` & `Plan`
*   **Responsibility**: Structured representations of AI-generated artifacts.
*   **Architecture**: Parses Markdown sections (Overview, File Structure, etc.).
*   **Plan**: Wraps a list of `Task` objects; supports YAML serialization.

### 2.3 Workflow (`src/workflow`)

#### `Orchestrator`
*   **Responsibility**: Facade and entry point for the system.
*   **Role**: Initializes the DI container (via `ServiceFactory`) and delegates execution to `Session`. Acts as an event emitter bridge.

#### `Workflow`
*   **Responsibility**: The runtime engine that executes the state machine.
*   **Core Logic**:
    *   **Loop Management**: Runs the `while(true)` loop for state execution.
    *   **Resumption**: Checks `EngineState` on start to resume from the last known state.
    *   **Signal Handling**: Captures `Signal` returned by states to determine the next step.
    *   **Safety**: Enforces `maxLoops` to prevent infinite recursion.
    *   **Recovery**: Looks up `errorTarget` in the graph for unhandled exceptions.

#### `WorkflowGraph`
*   **Responsibility**: Defines the valid transitions and structure of the state machine.
*   **Configuration**:
    *   **Transitions**: Maps `(CurrentState, Signal) -> NextState`.
    *   **Default Flow**:
        *   `ARCHITECTING` -> `PLANNING` (on NEXT)
        *   `PLANNING` -> `EXECUTING` (on NEXT)
        *   `EXECUTING` -> `COMPLETED` (on COMPLETE)
    *   **Recursive Flows**:
        *   `REPLAN` -> Back to `PLANNING`
        *   `REARCHITECT` -> Back to `ARCHITECTING`

#### `Signal`
*   **Responsibility**: strict typed events that drive the state machine.
*   **Key Types**:
    *   `NEXT`: Proceed to standard next state.
    *   `FAIL`: Critical failure, stop workflow.
    *   `REPLAN`: Trigger interaction loop to update plan.
    *   `REARCHITECT`: Trigger interaction loop to update architecture.

#### State Implementations (`src/workflow/states`)

*   **`ArchitectingState`**:
    *   **Action**: Invokes `ArchitectAgent.design`.
    *   **Interaction**: Asks for user approval (if interactive).
    *   **Transitions**:
        *   Approved: `NEXT` (-> PLANNING)
        *   Feedback: `REARCHITECT` (-> ARCHITECTING)
        *   Rejected: `FAIL`

*   **`PlanningState`**:
    *   **Action**: Loads architecture, invokes `PlannerAgent.plan`.
    *   **Interaction**: Asks for user approval.
    *   **Transitions**:
        *   Approved: `NEXT` (-> EXECUTING)
        *   Feedback (contains "rearchitect"): `REARCHITECT` (-> ARCHITECTING)
        *   Feedback (other): `REPLAN` (-> PLANNING)
        *   Rejected: `FAIL`

*   **`ExecutingState`**:
    *   **Action**: Invokes `DeveloperAgent.execute`.
    *   **Signal Handling**: Catches `SignalDetectedError` (e.g., from user interruption or file triggers) and bubbles up the signal.
    *   **Transitions**:
        *   Success: `COMPLETE`
        *   Signal: Varies (e.g., `REPLAN`, `FAIL`, `WAIT`)

*   **`CompletedState`**:
    *   **Action**: No-op / Final state.
    *   **Transitions**: Returns `COMPLETE` to exit the workflow loop.

#### `DriverRegistry`
*   **Responsibility**: Plugin manager for AI drivers.
*   **Logic**: Scans the compiled `drivers` directory, expects `IDriver` implementations, and registers them. Default driver is configurable (usually 'gemini').

#### `SkillRunner`
*   **Responsibility**: Abstraction for executing defined "skills" (granular tools).
*   **Logic**:
    *   Loads skill definitions from YAML files in `.ai/skills`.
    *   Validates that required drivers for skills are present.
    *   Delegates execution to the appropriate driver with context (Persona, User Prompt, Params).

#### `EvolutionService`
*   **Responsibility**: Provides "memory" of past failures to improve future performance.
*   **Action**: Records `FAIL`, `REPLAN`, and `REARCHITECT` signals into `log.yml`. Provides a textual summary for injection into agent prompts.

#### `PromptEngine`
*   **Responsibility**: Template renderer.
*   **Engine**: specific Nunjucks configuration for rendering prompts with data context.

#### `ServiceFactory`
*   **Responsibility**: Composition Root.
*   **Logic**: Wires up the dependency injection container, instantiates all singletons (`Project`, `Brain`, `Workspace`), and registers Agent factories.

---

## 3. Prompt Classification & Interaction Maps

### 3.1 Prompt Classifications

*   **New Feature / Project (Start from Scratch)**
    *   **Entry**: `ARCHITECTING`
    *   **Flow**: Architect -> Plan -> Execute
    *   **Likely Signals**: `NEXT`, `COMPLETE`

*   **Refactor / Major Change (Re-architecture)**
    *   **Entry**: `ARCHITECTING` (via explicit state setting or natural flow if architecture file is missing, otherwise starts at PLANNING/EXECUTING but signals REARCHITECT)
    *   **Flow**: Architect (Update) -> Plan (Update) -> Execute
    *   **Likely Signals**: `REARCHITECT`

*   **Bug Fix / Small Task (Implementation Only)**
    *   **Entry**: `PLANNING` (If resuming) or `EXECUTING` (if strictly defined). Standard flow usually forces Architecture check -> Planning check.
    *   **Flow**: Plan (Update tasks) -> Execute
    *   **Likely Signals**: `REPLAN`

### 3.2 Workflow Paths & State Transitions

#### Happy Path (Single Turn)
1.  **Start**: User sends prompt "Create a Hello World file".
2.  **State `ARCHITECTING`**:
    *   `ArchitectAgent` runs. check constraints.
    *   Generates `Architecture` (e.g. "Single file approach").
    *   Returns `NEXT`.
3.  **State `PLANNING`**:
    *   `PlannerAgent` runs. Reads Architecture.
    *   Generates `Plan` (Task 1: "Create hello.ts").
    *   Returns `NEXT`.
4.  **State `EXECUTING`**:
    *   `DeveloperAgent` runs. Reads Plan.
    *   Executes Task 1 via `SkillRunner`.
    *   Commits to Git.
    *   Returns `COMPLETE`.
5.  **State `COMPLETED`**:
    *   Workflow Ends.

#### Multi-Turn Path (Replanning)
1.  **State `EXECUTING`**:
    *   Task 1 fails (e.g., file not found).
    *   `DeveloperAgent` throws error.
2.  **Workflow Recovery**:
    *   Catches error. Checks Graph.
    *   Graph says: `EXECUTING` + `FAIL` -> (No auto transition defined for generic fail, but `SignalDetectedError` might carry `REPLAN`).
    *   *Self-Correction*: `DeveloperAgent` logic could be enhanced to return `REPLAN` signal instead of throwing raw error for recoverable failures.
    *   *Current Logic*: `EvolutionService` records failure. State updates to `FAILED`.
    *   *Implicit Re-run*: User sees failure, updates prompt "Fix the file path", re-runs.
    *   **Resumption**: Orchestrator loads state. Status is `FAILED`. Resets to `PLANNING` (or `ARCHITECTING` based on config).
3.  **State `PLANNING`**:
    *   `PlannerAgent` sees previous tasks and failure in `EvolutionLog`.
    *   Generates corrected plan.
    *   Returns `NEXT`.

#### Error Scenarios
*   **Driver Missing**: `DriverRegistry` throws. System halts.
*   **Parsing Error**: YAML/Markdown parsing fails in Agent. Agent throws. Workflow catches -> `FAILED` state.
*   **Max Loops**: If `REPLAN/REARCHITECT` loop > `maxLoops`, Workflow forces `FAILED`.

## 4. Conclusion
The engine is a robust state machine driven by specific typed signals. It relies heavily on the `Brain` component to instantiate simple, purpose-built agents that adhere to a strict document-driven interface (`Architecture` -> `Plan`). The `EvolutionService` provides a critical feedback loop for multi-turn reliability.

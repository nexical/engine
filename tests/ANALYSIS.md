# Project Analysis & Interaction Map

**Last Updated:** 2025-12-25
**Status:** Audit Complete
**Scope:** `src/engine` Deep Analysis

## 1. Purpose & Structure
This document serves as the authoritative guide to the internal workings of the Nexical Engine. It maps every interaction, workflow path, and state transition within the application to guide integration and end-to-end testing strategies.

### Structure
1.  **Source File Deep Dive**: Detailed analysis of each source file, including responsibilities, state mutations, and interactions.
2.  **Domain & Architecture**: Overview of how domain models and architectural components fit together.
3.  **Process Workflows**: Detailed map of the `WorkflowGraph` and `Orchestrator` logic.
4.  **Interaction Maps**: Tracing execution paths for happy paths, multi-turn scenarios, and error recovery.
5.  **Gap Analysis & Requirements**: Specific constraints for Integration Testing.

---

## 2. Deep Dive: Source File Analysis

### 2.1 Agents (`src/agents`)

#### `ArchitectAgent`
*   **Responsibility**: High-level system design. Operating in two modes: "Oracle" (watching inbox in infinite loop) and "Interactive" (generating architecture).
*   **Key Interactions**:
    *   `FileSystemBus`: Watches `.ai/comms/inbox` for clarification requests (`req_*.json`).
    *   `PromptEngine`: Renders the `architect` skill prompts.
    *   `RuntimeHost`: Asks the user for approval or clarification.
*   **Legacy Note**: `runOracleMode` is a blocking call. Integration tests must not call this directly in the main thread or it will hang the test runner.

#### `PlannerAgent`
*   **Responsibility**: Converts `Architecture` into a DAG of executable `Task`s.
*   **Key Interactions**:
    *   `FileSystemBus`: Sends `CLARIFICATION_NEEDED` requests to `ArchitectAgent` (Oracle).
    *   `PlanGraphValidator`: Validates the generated plan (cycles, dependencies).
*   **Logic Quirk**: Only explicit `Signal.CLARIFICATION_NEEDED` triggers the bus. The prompt must encourage the model to output this specific signal logic or the valid JSON structure.

#### `Executor`
*   **Responsibility**: Orchestrates the execution of the `Plan`.
*   **Key Interactions**:
    *   `GitService`: Creates **isolated worktrees** in `.worktrees/<task_id>`.
    *   `DriverRegistry`: Resolves drivers.
    *   `Workspace`: Checks for `Signal` files/locks.
*   **Execution Logic**:
    *   Calculates "Execution Layers" (parallel execution groups).
    *   **Isolation**: Tasks run in a clean Git Worktree. If the task fails, the worktree is abandoned (or pruned).
    *   **Merge**: Only successful tasks are merged back to the root execution context.

#### `Brain`
*   **Responsibility**: DI Container (Service Locator style) and Agent Factory.
*   **Key Interactions**: `createAgent<T>()` lazy-loads dependencies.

### 2.2 Domain Models (`src/domain`)

#### `EngineState`
*   **Responsibility**: Serializable snapshot (`.ai/state.yml`).
*   **Key Properties**: `status` (IDLE, ARCHITECTING, etc.), `loop_count` (Circuit Breaker), `tasks.pending/completed`.

#### `Workspace`
*   **Responsibility**: I/O abstraction.
*   **Key Capabilities**: Atomic writes (`writeFileAtomic`) to prevent corruption during parallel task execution.

#### `Skill`
*   **Responsibility**: The unit of execution.
*   **Pipeline** (Verified in `Skill.ts`):
    1.  **Pre-Analysis**: Shell commands.
    2.  **Analysis**: LLM Driver. **Loop**: Captures `Signal.CLARIFICATION_NEEDED`.
        *   *Critical Note*: It injects `context['previous_clarification']` but standard drivers do NOT automatically use this. Mocks/Prompts must be explicit.
    3.  **Execution**: LLM/Tool Driver. **Loop**: Retries `maxrc` times on failure.
    4.  **Post-Execution**: Shell commands.
    5.  **Verification**: Injectable Validators + optional Logic Driver.

#### `Result`
*   **Responsibility**: Monadic error handling (Ok/Fail).

### 2.3 Workflow (`src/workflow`)

#### `Workflow`
*   **Responsibility**: The Runtime FSM.
*   **Logic**: Infinite loop checking `state.status`.
*   **Error Handling**:
    *   Catches `Error`: Emits `FAIL` signal.
    *   Catches `SignalDetectedError`: Bubbles internal Task signal (e.g. `CLARIFICATION_NEEDED` or `signal file` detected).
*   **Safety**: Enforces `maxLoops` check *before* entering state.

#### `WorkflowGraph`
*   **Responsibility**: Maps `State` + `Signal` -> `NextState`.
*   **Default**:
    *   `ARCHITECTING` -> (NEXT) -> `PLANNING`
    *   `PLANNING` -> (NEXT) -> `EXECUTING`
    *   `EXECUTING` -> (COMPLETE) -> `COMPLETED`
    *   `*` -> (REPLAN) -> `PLANNING`
    *   `*` -> (REARCHITECT) -> `ARCHITECTING`

### 2.4 Services (`src/services`)

#### `FileSystemBus`
*   **Responsibility**: IPC (Inter-Process Communication).
*   **Mechanism**: `chokidar` watches `.ai/comms`.
*   **Concurrency**: Relies on file system locks. Integration tests must ensure unique correlation IDs and cleanups.

#### `GitService`
*   **Responsibility**: Wrapper for `git` binary.
*   **Constraint**: Requires a valid git repo with a `HEAD` commit to create worktrees.

#### `EvolutionService`
*   **Responsibility**: "System 2" Memory. Appends to `log.yml`.

### 2.5 Drivers (`src/drivers`)
*   **Responsibility**: External Integrations.
*   **Base**: `AICLIDriver` implements rendering.
*   **Gap**: `GeminiDriver` arguments generation in `getArguments` is simple string array. Does not complex JSON construction unless template handles it.

---

## 3. Interaction Maps & Workflows

### 3.1 The "Happy Path" (Verified)
1.  **Start**: `Orchestrator.start()`.
2.  **Architecting**:
    *   Agent runs. Driver returns Markdown.
    *   `Architecture.fromMarkdown` stores the raw markdown string.
    *   `Signal.NEXT` -> **Planning**.
3.  **Planning**:
    *   Agent runs. Driver returns YAML.
    *   `Plan.fromYaml` validates Zod schema.
    *   `Signal.NEXT` -> **Executing**.
4.  **Executing**:
    *   Executor loop.
    *   For each layer:
        *   `GitService.worktreeAdd`.
        *   `Skill.execute`.
        *   `GitService.merge`.
    *   No failures -> `Signal.COMPLETE`.
5.  **Completion**: Workflow loop exits.

### 3.2 The "Clarification" Loop (IPC)
1.  **Task/Planner** runs -> `analysis` phase.
2.  Driver returns `Signal.CLARIFICATION_NEEDED("Query")`.
3.  `Skill` catches Signal -> calls `context.clarificationHandler`.
4.  **Bus**: Writes `req_ID.json` (Inbox).
5.  **Oracle (Architect)**:
    *   Reads `req`.
    *   Asks User.
    *   Writes `res_ID.json` (Outbox).
6.  **Task**:
    *   Reads `res`.
    *   Enters `previous_clarification` into Context.
    *   **Re-runs Analysis Driver**. (Driver must accept new context).

---

## 4. Integration Test Requirements (Gap Analysis)

To ensure coverage and stability, the following constraints MUST be met by `ProjectFixture` and tests:

### 4.1 State Seeding (Fixtures)
*   **Git Init**: Tests involving `Executor` must have `git init` AND `git commit --allow-empty -m "init"` to create a valid HEAD.
*   **Valid Artifacts**:
    *   `ValidArchitectureMd`: Can be any valid markdown text depending on generated structure.
    *   `ValidPlanYaml`: Must match Zod schema `tasks: [{id, skill, ...}]`.

### 4.2 Concurrency & Threads
*   **Oracle Simulation**: Since we cannot run `Architect.runOracleMode()` (blocking) in Jest, we must **Mock the Oracle Response** by manually writing response files to `.ai/comms/outbox` when a request file appears in `inbox`.
*   **Signal Injection**: To test interruption, mock a Driver to write a `signal` file to `.ai/signals` during execution.

### 4.3 Data Binding
*   **Clarification Context**: Integration tests must verify that when `previous_clarification` is set, the prompt is actually updated. This effectively tests the Nunjucks template logic + Driver variable passing.

# Signal-Based Execution Model

## Introduction

This document details the execution model of the `@nexical/engine`. The system uses a **Signal-Based State Machine** to orchestrate autonomous agents. Unlike linear script execution, this system is dynamic—it reacts to "signals" from agents (requests to change the plan or architecture) allowing for adaptive problem-solving.

## Core Concepts

### 1. Signal-Based Orchestration
Agents can "talk back" to the Orchestrator via **Signals**. A signal is a structured event (often a file) indicating a need to deviate.
-   **REPLAN**: "I cannot complete the current task as described. Update the plan."
-   **REARCHITECT**: "The technical approach is flawed. We need to rethink the architecture."

### 2. State Machine
The `Orchestrator` operates as a Finite State Machine (FSM):
-   **ARCHITECTING**: Designing the high-level solution (`architecture.md`).
-   **PLANNING**: Breaking the solution into a DAG of tasks (`plan.yml`).
-   **EXECUTING**: Running tasks via Drivers.
-   **INTERRUPTED**: Paused due to a signal.
-   **COMPLETED** / **FAILED**: Terminal states.

### 3. Skills & Drivers
-   **Skills**: Capabilities defined in YAML files (e.g., `skills/coder.skill.yml`) that describe *what* an agent can do (command, args, prompt template).
-   **Drivers**: The execution engines (e.g., `CLIDriver`) that run these Skills. The `Executor` loads the appropriate Driver for each skill.

## Workflow Lifecycle

### Phase 1: Initialization
The Orchestrator loads the Project Profile and State. It ensures all necessary directories (`.ai/`) exist.

### Phase 2: Architecting
**State: ARCHITECTING**
The `Architect` component uses an LLM to analyze the User Prompt and Evolution Log (history of failures) to generate `architecture.md`.

### Phase 3: Planning
**State: PLANNING**
The `Planner` component converts the `architecture.md` into a detailed `plan.yml`. It considers:
-   **Global Constraints**: Rules defined in the project AGENTS.md.
-   **Agent Skills**: What tools are available.
-   **Previous Signals**: Why the previous plan failed (if applicable).

### Phase 4: Execution
**State: EXECUTING**
The `Executor` iterates through the `plan.yml`:
1.  **Resolve Dependencies**: Ensures previous tasks are done.
2.  **Dispatch**: Sends the task to the appropriate **Driver** (defaulting to `cli`).
3.  **Check for Signals**: After every task, it checks if the agent raised a Signal.
    -   **Signal Detected**: Execution stops. State transitions to `INTERRUPTED`. A log entry is added to `log.yml`.
    -   **No Signal**: Task is marked complete.

### Phase 5: Completion
**State: COMPLETED**
When all tasks are successfully executed without signals.

## Data Models

The system relies on file-based state for transparency and resumability:

1.  **`state.yml`**: Current FSM state, loop count, and task progress.
2.  **`architecture.md`**: The current outcome of the Architecting phase.
3.  **`plan.yml`**: The current outcome of the Planning phase.
4.  **`log.yml`**: The specific history of *why* the agent had to retry (Evolution Log).
5.  **`signals/`**: Directory where agents write signal files to interrupt the Orchestrator.

## Extension

### Adding New Skills
Create a `.skill.yml` file in the configured skills directory:
```yaml
name: rust-analyzer
description: Analyzes Rust code for safety issues.
provider: cli
command: cargo
args: ["audit"]
```

### Adding New Drivers
Implement the `Driver` interface and register it with the `Orchestrator`:
```typescript
class MyDriver implements Driver {
    name = "custom";
    async execute(skill: Skill, task: string, context: any) {
        // Custom execution logic
    }
}
engine.driverRegistry.register(new MyDriver());
```

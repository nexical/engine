# Agent Orchestration Engine Architecture

> [!IMPORTANT]
> **Coding Standards & Compliance**
> Before contributing to this project, you MUST read **`CODE.md`**. It acts as the authoritative source of truth for all coding standards, linting rules, and formatting guidelines. All code—source and tests—must strictly adhere to the patterns defined therein.

## 1. Introduction & Philosophy

The Agent Orchestration Engine is a robust, event-driven platform designed to execute complex, multi-turn AI workflows. Its primary purpose is to act as the runtime environment that coordinates **Agents**, **Skills**, and **Drivers** to transform a user's intent into concrete digital artifacts.

The architecture follows a **Core-Periphery** philosophy:
*   **The Core (Engine)**: Responsible for state management, workflow orchestration, and robust error handling. It is stable, strongly typed, and changes infrequently.
*   **The Periphery (Content & Config)**: Defined in YAML and Markdown. This is where the specific behavior, personalities (Agents), and capabilities (Skills) are defined. This layer is highly volatile and designed for rapid iteration.

## 2. Core Concepts & Taxonomy

Understanding the system requires familiarity with its four foundational entities:

### 2.1. Agents
**Agents** are the high-level cognitive workers (e.g., `Architect`, `Planner`, `Developer`).
*   **Role**: They encapsulate domain-specific logic, prompt engineering, and context management.
*   **Implementation**: Agents are TypeScript classes that orchestrate *one or more* skills to achieve a goal.
*   **Interaction**: They do not execute external tools directly; they delegate execution to **Drivers** via **Skills**.

### 2.2. Skills (`ISkill`)
**Skills** are atomic capabilities or "tools" that an Agent can wield.
*   **Definition**: Skills are defined declaratively in YAML (e.g., `research.skill.yaml`).
*   **Structure**: They contain properties specific to the driver `provider` with which they depend on, which may include properties like a `prompt_template` and configuration `params`.
*   **Purpose**: Decouples the *intent* (what needs to be done) from the *mechanism* (how it is done).

### 2.3. Drivers (`IDriver`)
**Drivers** are the execution layer for Skills.
*   **Role**: They form the bridge between the Engine and the external world (e.g., an LLM API, a Shell, a Git implementation).
*   **Abstraction**: All Drivers implement the `IDriver` interface, ensuring the Engine remains agnostic to the underlying provider (e.g., executing a prompt via Gemini vs. OpenAI vs. Local Model).

### 2.4. Workflow (`Workflow`)
**Workflow** is the state machine that governs the lifecycle of a task.
*   **Role**: It manages transitions between different execution phases (e.g., `PLANNING` -> `EXECUTING` -> `VERIFYING`).
*   **Mechanism**: It operates on a graph-based state model (`WorkflowGraph`) and transitions based on **Signals** returned by States.

## 3. System Architecture

The system is layered to promote separation of concerns and testability.

```mermaid
graph TD
    User[User / CLI] --> Orch[Orchestrator]
    Orch --> Session[Session]
    Session --> Workflow[Workflow Engine]
    
    subgraph "Core Domain"
        Workflow --> |Manage| State[EngineState]
        Workflow --> |Delegate| Brain[Brain (Agent Hub)]
    end
    
    subgraph "Agent Layer"
        Brain --> Architect[Architect Agent]
        Brain --> Planner[Planner Agent]
        Brain --> Developer[Developer Agent]
    end
    
    subgraph "Execution Layer"
        Architect --> |Invoke| SkillRunner
        Planner --> |Invoke| SkillRunner
        SkillRunner --> |Resolve| DriverReg[Driver Registry]
        DriverReg --> |Execute| Driver[Driver (Gemini/Shell)]
    end
    
    subgraph "Infrastructure"
        Project[Project Config]
        FS[FileSystem Service]
        Prompt[Prompt Engine]
    end
    
    Brain -.-> Project
    Brain -.-> Prompt
```

### 3.1. The Orchestrator
The `Orchestrator` is the main entry point. It is responsible for:
1.  **Bootstrapping**: deeply initializing the application.
2.  **Context Creation**: creating the `Session` and `RuntimeHost`.
3.  **Lifecycle Management**: bridging the CLI/UI events with the internal `Workflow`.

### 3.2. Dependency Injection (DI)
The system uses a strict **Inversion of Control (IoC)** pattern managed by `ServiceFactory` and `DIContainer`.
*   **ServiceFactory**: Acts as the composition root. It wires together all core services (`Project`, `FileSystem`, `Brain`).
*   **Injection**: Dependencies are injected via constructor injection. This makes every component unit-testable by allowing mocks to be passed during instantiation.
*   **Rule**: Never instantiate complex dependencies (like `new FileSystemService()`) inside a class. Always request them in the constructor.

### 3.3. The Brain (Agent Hub)
The `Brain` class serves as the central hub and factory for Agents.
*   **Purpose**: It holds references to all shared infrastructure (`PromptEngine`, `DriverRegistry`) and injects them into specific Agents when created.
*   **Pattern**: It implements the **Factory Pattern** for Agents, ensuring that transient Agent instances are always created with fresh state but shared stateless services.

## 4. Workflows & State Management

The execution engine is a **Finite State Machine (FSM)**.

*   **States**: Defined in `src/workflow/states/`. Each state (e.g., `PlanningState`) represents a distinct phase of operation.
*   **Signals**: Transitions are driven by `Signal` objects (e.g., `Signal.NEXT`, `Signal.FAIL`, `Signal.REPLAN`). Determining the next state is the responsibility of the `WorkflowGraph`, not the State itself.
*   **Persistence**: The `EngineState` is persisted to disk (`.ai/state.yml`) after every transition. This allows for crash recovery and session resumption.

## 5. Extensibility Guide

### 5.1. Adding a New Driver
To add support for a new tool or LLM:
1.  Create a class implementing `IDriver` in `src/drivers/`.
2.  Extend `BaseDriver` for common utility access (Shell, FileSystem).
3.  Implement `isSupported()` to check for prerequisites (e.g., binary existence).
4.  Implement `execute()` to handle the logic.
5.  Register the driver in `ServiceFactory` or ensure it's loaded via `DriverRegistry`.

### 5.2. Adding a New Agent
To create a specialized cognitive worker:
1.  Create a class in `src/agents/`.
2.  Accept `IProject`, `IWorkspace`, and `IPromptEngine` in the constructor.
3.  Implement a public method (e.g., `design()`, `review()`) that performs the work.
4.  Register the agent factory in `Brain.registerAgent()`.

### 5.3. Adding a New Skill
To give an Agent a new capability:
1.  Create a YAML definition in the `skills/` directory (e.g., `my-job.skill.yaml`).
2.  Define the `provider` (which driver acts on it).
3.  Define `prompt_template`, `args` or any properties the driver requires.
4.  The `SkillRunner` will automatically discover and validate this skill on startup.

## 6. Error Handling & Resilience

*   **Result Pattern**: All Driver executions return a `Result<T, Error>` object. Never throw exceptions from Drivers; return `Result.fail()`.
*   **Global Catch**: The `Workflow` loop contains a global try/catch block to prevent the process from crashing.
*   **Signal Bubble-Up**: Unhandled errors in a State are converted into `Signal.FAIL`. The `WorkflowGraph` can be configured to route failure signals to recovery states (e.g., `PlanningState` -> `ErrorRecovery_Planning`).

## 7. Naming Conventions

*   **Interfaces**: Preset with `I` (e.g., `IProject`, `IDriver`).
*   **Service Classes**: Suffix with `Service` (e.g., `FileSystemService`), unless it's a core domain entity (e.g., `Project`).
*   **Agents**: Suffix with `Agent` (e.g., `PlannerAgent`).
*   **Drivers**: Suffix with `Driver` (e.g., `GeminiDriver`).
*   **Files**: PascalCase for classes (`Project.ts`), camelCase for instances or utilities.

## 8. Testing Strategy

*   **Unit Tests**: Because of DI, every class can be tested in isolation. Mock all `I*` interfaces.
*   **Integration Tests**: Use `ProjectFixture` to create a temporary, scaffolded file system context.
*   **Mocking**: Use `jest.mock` for external modules, but prefer dependency injection of mocks for internal services.

---
*This document is the sole source of architectural truth for the `src/engine` project. Review it before making structural changes.*

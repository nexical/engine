# Nexical CLI (TypeScript)

Nexical is a sophisticated, TypeScript-based CLI application designed to orchestrate AI agents for complex software development tasks, specifically focusing on website modification and deployment. It leverages a modular architecture to manage workflows, execute deterministic commands, and coordinate AI-driven planning and execution.

## Architecture

The application follows a modular architecture centered around an **Orchestrator** that manages the workflow, initializes services, and routes commands.

### Core Components

- **Orchestrator** (`src/orchestrator.ts`): The central controller. It implements a **State Machine Loop** (`ARCHITECTING` -> `PLANNING` -> `EXECUTING`) to manage the lifecycle of a request. It handles state persistence using **Atomic Writes**, signal processing, and error recovery.
- **Architect** (`src/workflow/architect.ts`): The high-level designer. It analyzes the user request and global constraints to generate a technical architecture (`.nexical/architecture.md`) and defines the required team personas (`.nexical/personas/*.md`).
- **Planner** (`src/workflow/planner.ts`): Responsible for generating execution plans. It uses the architecture, personas, and an **Evolution Log** (history of failures/signals) to create a detailed task list (`.nexical/plan.yml`), assigning specific personas to each task. It supports **Delta Planning**, allowing it to update plans based on new signals or completed tasks.
- **Executor** (`src/workflow/executor.ts`): The engine that executes generated plans. It builds a dependency graph of tasks and schedules them for execution. It actively monitors for **Signals** (interrupts) from agents and supports **Resumption** by skipping completed tasks (enforced by strict Task IDs).
- **AgentRunner** (`src/services/AgentRunner.ts`): A service responsible for executing agents. It injects the specific **Persona** context into the agent's prompt during execution, ensuring the agent adopts the correct role, tone, and standards.
- **PromptEngine** (`src/services/PromptEngine.ts`): A centralized template engine using **Nunjucks**. It manages all system prompts, allowing for project-level overrides and dynamic context injection.

### Services

Shared services provide core functionality across the application:

- **FileSystemService** (`src/services/FileSystemService.ts`): Provides safe, consistent file I/O operations.
- **GitService** (`src/services/GitService.ts`): Manages local git operations (status, commit, branch management).
- **GitHubService** (`src/services/GitHubService.ts`): Handles interactions with the GitHub API (PR creation, repository management).
- **CloudflareService** (`src/services/CloudflareService.ts`): Manages deployments to Cloudflare Pages.

### Plugins

The application is highly extensible through a plugin system:

#### Command Plugins (`src/plugins/commands/`)
These plugins extend the CLI with deterministic commands (prefixed with `/`).
- **StartCommandPlugin** (`/start`): Starts the development server.
- **OpenRouterCommandPlugin** (`/openrouter`): Configures OpenRouter settings.

#### Agent Plugins (`src/plugins/agents/`)
These plugins define how different types of agents are executed.
- **CLIAgentPlugin**: The default plugin. It executes agents that are defined as CLI tools (wrapping external binaries or scripts).
- **ImageGenAgentPlugin**: A specialized plugin for generating images using AI APIs.

### Workflow & Persona System

The system uses a multi-stage workflow to ensure high-quality output:

1.  **Architect Phase**: The **Architect** analyzes the request and generates a solution architecture. Crucially, it also defines **Personas** (e.g., `frontend`, `backend`, `qa`).
    -   Personas are stored as markdown files in `.nexical/personas/`.
    -   They define the **Role**, **Tone**, and **Standards** (e.g., "Use React functional components", "Write unit tests").
2.  **Planning Phase**: The **Planner** reads the architecture and available personas. It creates a plan where each task is explicitly assigned a `persona`.
3.  **Execution Phase**: The **Executor** runs the tasks. When the **AgentRunner** executes a task, it reads the assigned persona file and injects it into the agent's context. This ensures that a generic "Coder" agent acts as a "Senior Frontend Engineer" when working on UI tasks, adhering to the specific standards defined for that role.

### Signal System

The Orchestrator implements a robust **Signal System** to handle dynamic changes and interruptions during execution. Agents can emit signals to request changes to the plan or architecture.

- **REPLAN**: Indicates that the current plan is insufficient or blocked. The Orchestrator pauses execution and triggers the **Planner** to generate a delta plan.
- **REARCHITECT**: Indicates a fundamental flaw in the design. The Orchestrator pauses execution and triggers the **Architect** to revise the architecture. If the `invalidates_previous_work` flag is set, completed tasks are discarded.

Signals are detected by the **Executor** and bubbled up to the **Orchestrator** loop. The system prioritizes `REARCHITECT` signals over `REPLAN` signals, and processes them in chronological order to ensure the most critical issues are addressed first.

### State Management

The Orchestrator maintains a persistent state in `.nexical/state.yml`. This allows the workflow to be paused, resumed, or recovered after a crash.

- **Session ID**: Unique identifier for the current run.
- **Status**: Current state (`ARCHITECTING`, `PLANNING`, `EXECUTING`, `INTERRUPTED`, `COMPLETED`, `FAILED`).
- **Loop Count**: Tracks the number of iterations to prevent infinite loops.
- **Tasks**: Tracks `completed`, `failed`, and `pending` tasks.

## Template Engine

Nexical uses **Nunjucks** for prompt templating, managed by the `PromptEngine`.

- **Templates**: Stored in `src/prompts/` (default) or `.nexical/prompts/` (project overrides).
- **Context Injection**: Templates have access to dynamic context variables (e.g., `user_request`, `architecture`, `plan`, `personas`).
- **Extensibility**: Users can override default system prompts by placing files with the same name in their project's `.nexical/prompts/` directory.

## Usage

### Prerequisites

- Node.js (v18+)
- `gemini` CLI tool (required for the default Planner and CLI agents).
- Cloudflare account (for deployment).
- GitHub account (for repository management).

### Installation

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Build the project:
    ```bash
    npm run build
    ```

### Running the CLI

Use the `cli` script defined in `package.json`:

```bash
npm run cli -- [options] [command/prompt]
```

#### Options

- `--prompt <text>`: Run an AI-driven workflow with the specified prompt.
- `--help`: Show help information.

#### Interactive Mode

If no arguments are provided, the CLI enters an interactive chat mode:

```bash
npm run cli
```

#### Commands

You can run deterministic commands directly:

```bash
npm run cli -- start master
```

## Agent Definition Patterns

Agents are defined as YAML files located in `.nexical/agents/` (or `dev_project/.nexical/agents/` during development). This data-driven approach allows for easy creation and modification of agents without changing code.

### Agent Profile Format (`.agent.yml`)

```yaml
name: "ResearcherAgent"
description: "Performs research and answers questions."
provider: "cli" # Uses the CLIAgentPlugin
command: "gemini" # The underlying CLI tool to call
args: # Arguments passed to the command
  - "prompt"
  - "{prompt}"
  - "--yolo"

prompt_template: |
  You are an expert researcher.
  The user's request is: "{user_request}"
  The specific task is: "{task_prompt}"
```

### Variable Interpolation

The `AgentRunner` supports dynamic variable interpolation in `prompt_template` and `args`:
- `{user_request}`: The original user prompt.
- `{task_prompt}`: The specific prompt for the current task.
- `{file_path}`: Path to a file (if specified in task params).
- `{prompt}`: The fully processed prompt (after `prompt_template` interpolation).

## Development Strategy

### Directory Structure

- `src/`: Source code.
    - `models/`: Core data models (Application, Agent, Plan, Task).
    - `plugins/`: Plugin implementations.
        - `agents/`: Agent execution logic.
        - `commands/`: CLI command implementations.
    - `services/`: Shared infrastructure services.
    - `utils/`: Helper utilities (Shell execution, Interpolation).
- `dist/`: Compiled JavaScript output.
- `tests/`: Unit and integration tests.

### Adding a New Command

1.  Create a new class in `src/plugins/commands/` implementing `CommandPlugin`.
2.  The `Orchestrator` will automatically discover and register it if it exports a class implementing the interface.

### Adding a New Agent

1.  Create a new `.agent.yml` file in `.nexical/agents/`.
2.  Specify the `provider` (usually `cli`) and the `command` to run.
3.  No TypeScript code changes are needed for standard CLI-based agents.

## Configuration

Project configuration is managed in `.nexical/config.yml`.

### Environment Variables

Secrets are stored in `.nexical/.env` or `.env`:

```env
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
GITHUB_ORG=your_github_org
GITHUB_TOKEN=your_github_token
OPENROUTER_API_KEY=your_openrouter_key
```

# Nexical Factory Worker

The **Nexical Factory Worker** is the execution engine of the Nexical Cloud ecosystem. Unlike a traditional CLI tool that you run manually for each task, the Worker is a long-running service that polls the Nexical Cloud for jobs, executes them in isolated workspaces, and pushes the results back to the repository.

This service is designed to be run **autonomously**, either on your local machine for development/debugging or on a fleet of servers for production scale.

## Architecture

The Factory Worker follows a "pull" model:

1.  **Acquisition**: The Worker polls the Nexical API (or listens to a queue) for pending `Jobs`.
2.  **Isolation**: For each job, it creates a temporary, isolated workspace on the file system.
3.  **Initialization**:
    - It uses the `NEXICAL_ENROLLMENT_TOKEN` to authenticate itself.
    - It fetches a **Git Token** (either managed by Nexical or your self-hosted token) to clone the target repository.
4.  **Execution**:
    - It initializes the **Orchestrator** in the workspace.
    - Depending on the job type, it triggers the **AI Workflow** (Architect -> Planner -> Executor) or a deterministic **Command**.
5.  **Publishing**:
    - Upon completion, the Worker commits changes to a new branch (e.g., `job-123`).
    - It pushes the branch to the remote repository.
    - (Optional) It triggers downstream effects like Cloudflare deployments.

### Core Components

-   **Worker Service** (`src/worker.ts`): The entry point. Handles the lifecycle of the application, continuous polling, and graceful shutdown.
-   **Orchestrator** (`src/orchestrator.ts`): The "brain" inside the executing workspace. It manages the state machine (Architecting, Planning, Executing) and handles "Signals" (like `REPLAN` or `REARCHITECT`) from the AI.
-   **Skills** (formerly Agents): Distinct capabilities (like `Coding`, `Researching`) that the Worker can execute. These are defined as "Skills" to better reflect their modular nature.

### CLI Commands & Orchestration

The Factory Worker exposes a set of deterministic **CLI Commands** that bridge the gap between abstract resource management and concrete infrastructure operations. These commands are typically invoked by the Orchestrator or manually for maintenance.

| Command | Usage | Description | Orchestration Role |
| :--- | :--- | :--- | :--- |
| **`/create`** | `/create <projectId>` | Provisions a **GitHub repository** (if missing) and a **Cloudflare Pages project**. Links the production domain if specified in the Project entity. | **Initialization**: Called when a new Project is first spun up to ensure all infrastructure exists before work begins. |
| **`/destroy`** | `/destroy <projectId>` | Deletes the **Cloudflare Pages project** and the **Project entity** in the Orchestrator. **CRITICAL: The GitHub repository is preserved.** | **Teardown**: Called when a project is archived or deleted from the Cloud dashboard, ensuring clean resource release without losing code. |
| **`/publish`** | `/publish <projectId> <branch>` | Merges the specified job branch into `main`, pushes the changes, and triggers a production deployment via Cloudflare. | **Completion**: step in the workflow where a job's output is promoted to production. |
| **`/close`** | `/close <projectId> <branch>` | Deletes the local and remote job branch. | **Cleanup**: Called after a successful `/publish` or when a job is cancelled, keeping the repository clean. |
| **`/help`** | `/help` | Lists all available commands. | **Discovery**: Useful for manual debugging. |

#### Service Integration
These commands rely on tight integration with core services:
- **`GitHubService`**: Handles repository creation, idempotent checks, and merging.
- **`CloudflareService`**: Manages the lifecycle of Pages projects and domain mapping.


## Setup & Usage

### Prerequisites

-   **Node.js**: v18 or higher.
-   **Nexical Enrollment Token**: A token obtained from the Nexical Cloud dashboard to authenticate this worker.

### Environment Variables

Configure the worker using the following environment variables (in `.env` or system env):

```bash
# === Core Configuration ===
# Required: The URL of the Nexical Cloud API
NEXICAL_API_URL=https://api.nexical.cloud

# Required: Your unique worker enrollment token
NEXICAL_ENROLLMENT_TOKEN=nk_worker_...

# Optional: Number of concurrent jobs this worker should handle (Default: 1)
WORKER_CONCURRENCY=1

# === Skill Configuration ===
# Required for 'image-gen' skill
OPENROUTER_API_KEY=sk-or-...

# === Deployment Configuration ===
# Required for Cloudflare Pages auto-deployment
CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...

# === Debugging ===
# Enable verbose logs for specific components
DEBUG=worker*,orchestrator*,skill*
```

### Running Locally (Development)

To run the worker on your local machine for development or debugging:

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Build the Project**:
    ```bash
    npm run build
    ```

3.  **Start the Worker**:
    ```bash
    npm start
    ```
    *or for development with hot-reload:*
    ```bash
    npm run dev
    ```

The worker will start polling for jobs assigned to the teams/projects your token has access to.

### Running in Production

For production, we recommend running the worker as a Docker container.

```bash
docker run -d \
  -e NEXICAL_API_URL=https://api.nexical.cloud \
  -e NEXICAL_ENROLLMENT_TOKEN=your_token \
  -e OPENROUTER_API_KEY=your_key \
  nexical/factory-worker:latest
```

## Authentication & Security

Security is handled through a tiered token system:

1.  **Worker Authentication**: The `NEXICAL_ENROLLMENT_TOKEN` identifies the machine. It allows the worker to ask for assignments but **not** to access your code directly.
2.  **Job-Scoped Access**: When a job is assigned, the worker requests short-lived, scoped tokens for that specific job:
    -   **Git Token**: Unlocks access to the specific GitHub repository for the duration of the job.
    -   **Skill Token** (formerly Agent Token): Allows the AI agents running within the job to access specific cloud resources (like Knowledge Bases or LLM APIs).

This ensures that even if a worker is compromised, the blast radius is limited.

## Testing

The project maintains a comprehensive test suite:

-   **Unit Tests**: Test individual components in isolation. We maintain **100% test coverage** for the Factory project.
    ```bash
    npm run test:unit
    ```
    To verify coverage:
    ```bash
    NODE_OPTIONS=--experimental-vm-modules npx jest tests/unit --collectCoverage=true
    ```
-   **Integration Tests**: Test the interaction between components (e.g., Worker <-> Orchestrator).
    ```bash
    npm run test:integration
    ```
-   **Live Tests**: Run end-to-end tests against the real Nexical Cloud API. **Requires valid credentials.**
    ```bash
    npm run test:live
    ```

## Developer Guide

### Directory Structure

-   **`src/`**
    -   `worker.ts`: Main entry point. Initializes services and starts the polling loop.
    -   `orchestrator.ts`: Manages the execution of a single job within a workspace.
        -   **`commands/`**: Built-in CLI commands.
            -   `CloseCommand.ts`: Closes a job branch (local & remote).
            -   `CreateCommand.ts`: Provisions GitHub repo and Cloudflare project.
            -   `DestroyCommand.ts`: Deletes Cloudflare project and Orchestrator entity (preserves GitHub).
            -   `HelpCommand.ts`: Lists available commands.
            -   `PublishCommand.ts`: Merges job branch to main and triggers deployment.
    -   **`errors/`**: Custom error classes.
        -   `SignalDetectedError.ts`: Thrown when a REPLAN or REARCHITECT signal is detected.
    -   **`models/`**: TypeScript interfaces and types.
        -   `Agent.ts`, `Application.ts`, `Command.ts`, `Plan.ts`, `Registry.ts`, `Skill.ts`, `State.ts`, `Task.ts`
    -   **`plugins/`**: Directory for plugin implementations (currently unused/legacy).
    -   **`prompts/`**: System prompts for AI agents.
        -   `agent.md`, `architect.md`, `planner.md`
    -   **`services/`**: Shared infrastructure components.
        -   `AgentRunner.ts`: Executes agents/skills with the correct context.
        -   `CapabilityService.ts`: Manages detected capabilities.
        -   `CloudflareService.ts`: Cloudflare API integration.
        -   `CommandRegistry.ts`: Registry for CLI commands.
        -   `FileSystemService.ts`: Safe file system operations.
        -   `GitHubService.ts`: GitHub API integration.
        -   `GitService.ts`: Local Git operations.
        -   `IdentityManager.ts`: Manages auth tokens (enrollment, git, agent).
        -   `JobService.ts`: Updates job status and logs.
        -   `PromptEngine.ts`: Handles prompt templating (Nunjucks).
        -   `SkillRegistry.ts`: Loads and manages available skills.
        -   `WorkspaceManager.ts`: Creates and cleans up temporary workspaces.
    -   **`skills/`**: Capability implementations.
        -   `CLISkill.ts`: Executes shell commands.
        -   `ImageGenSkill.ts`: Generates images via AI.
    -   **`utils/`**: Helper functions.
        -   `interpolation.ts`: String variable interpolation.
        -   `shell.ts`: Wrapper for child_process execution.
        -   `validation.ts`: Input validation helpers.
    -   **`workflow/`**: Core logic for the AI Orchestration loop.
        -   `architect.ts`: Logic for the Architect phase.
        -   `planner.ts`: Logic for the Planner phase.
        -   `executor.ts`: Logic for the Executor phase.

### Extensibility: Skills

The Factory Worker is extensible through **Skills**. A Skill defines a specific capability that the AI Planner can utilize.

#### Available Skills

| Skill Name | Description | Configuration Required |
| :--- | :--- | :--- |
| **`cli`** | Executes external CLI commands (e.g., `gemini`, `npm`). | None (relies on system PATH) |
| **`image-gen`** | Generates images via OpenRouter API. | `OPENROUTER_API_KEY` |

#### Creating a New Skill

1.  Create a new file in `src/skills/` (e.g., `MySkill.ts`).
2.  Implement the `Skill` interface.
3.  Ensure it has a unique `name` and implements `execute()` and `isSupported()`.
4.  The `SkillRegistry` will automatically discover and load it on startup.

## Troubleshooting

### Common Issues

-   **Worker fails to start**:
    -   Check `NEXICAL_ENROLLMENT_TOKEN`. It might be invalid or expired.
    -   Ensure `NEXICAL_API_URL` is reachable from your network.

-   **Job fails with "Git Authentication Failed"**:
    -   The managed Git Token might have expired or lacks permissions.
    -   If using Self-Hosted mode, check your `GITHUB_TOKEN` environment variable.

-   **Image Generation fails**:
    -   Ensure `OPENROUTER_API_KEY` is set.
    -   Check quota/credits on your OpenRouter account.

-   **"Signal Detected" Error**:
    -   This is **normal behavior**. It means the AI requested a change in plan (REPLAN) or architecture (REARCHITECT). The Orchestrator catches this error to pivot its strategy. It is not a system crash.

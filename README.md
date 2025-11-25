# Website Editor CLI (TypeScript)

This project is a TypeScript-based CLI application designed to orchestrate AI agents for website modification and deployment. It leverages CLI tools for LLM interactions and agent execution.

## Architecture

The application follows a modular architecture centered around an **Orchestrator** that manages the workflow.

### Core Components

- **Orchestrator** (`src/orchestrator.ts`): The main controller that initializes services and routes commands to the appropriate workflow (AI-driven or deterministic).
- **Planner** (`src/planner.ts`): Responsible for generating execution plans from user prompts. It uses the `gemini` CLI to interface with an LLM, converting natural language requests into structured YAML plans.
- **Executor** (`src/executor.ts`): Iterates through the tasks in a generated plan and delegates execution to the `AgentRunner`.
- **AgentRunner** (`src/services/AgentRunner.ts`): Discovers and executes agents. It supports YAML-defined agents that map to CLI commands.

### Services

- **FileSystemService**: Handles file I/O operations safely.
- **GitService**: Manages version control operations (commit, push, branch detection).
- **CloudflareService**: Handles deployments to Cloudflare Pages.
- **DeploymentService**: Orchestrates the deployment process, combining Git and Cloudflare operations.

### Task Execution Model

The application supports a **Directed Acyclic Graph (DAG)** execution model for plans. This allows for:

- **Parallel Execution**: Independent tasks are executed concurrently to speed up workflows.
- **Sequential Execution**: Tasks with dependencies wait for their prerequisites to complete.

**Plan Structure:**
Each task in the generated YAML plan includes:
- `id`: A unique identifier for the task.
- `dependencies`: A list of task IDs that must complete before this task can start.

The **Executor** builds a dependency graph and dynamically schedules tasks as their dependencies are met.

## Usage

### Prerequisites

- Node.js (v18+)
- `gemini` CLI tool installed and accessible in your PATH.
- Cloudflare account (for deployment features).

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

You can run the CLI using the `builder` script defined in `package.json`:

```bash
npm run builder -- [options]
```

#### Options

- `--prompt <text>`: Run an AI-driven workflow with the specified prompt.
- `--publish`: Trigger a production deployment.
- `--preview`: Trigger a preview deployment based on the current branch.
- `--help`: Show help information.

#### Interactive Mode

If no arguments are provided, the CLI enters an interactive chat mode:

```bash
npm run builder
```

## Agent Definition Patterns

Agents are defined as YAML files located in `plotris/agents/` (or `website/.plotris/agents/` for CLI development). This allows for flexible, data-driven agent configuration.

### Agent Profile Format (`.agent.yml`)

```yaml
name: "agent-name"
description: "Description of what the agent does."
prompt_template: "A template string with {variables}."
provider: "cli"
command: "cli-tool-name"
args:
  - "arg1"
  - "{prompt}"
  - "--file"
  - "{file_path}"
```

### Variable Interpolation

The `AgentRunner` supports variable interpolation in `prompt_template` and `args`. Available variables include:

- `{user_request}`: The original user prompt.
- `{file_path}`: Path to a file specified in the task parameters.
- `{file_content}`: Content of the file specified by `file_path`.
- `{prompt}`: The processed prompt (result of `prompt_template` interpolation).
- Any other keys present in the task's `params`.

## Development Strategy

### Directory Structure

- `src/`: Source code.
    - `data_models/`: TypeScript interfaces and classes for core entities (Plan, Task, Project, DeploymentConfig).
    - `services/`: Service implementations.
- `prompts`: Prompt templates for CLI use.
- `dist/`: Compiled JavaScript output.

### Building and Testing

- **Build**: `npm run build` (runs `tsc`).
- **Run**: `npm run builder` (runs `node dist/cli.js`).

### Extending the Application

1.  **Add a Service**: Create a new class in `src/services/` and inject it into the `Orchestrator`.
2.  **Add an Agent**: Create a new `.agent.yml` file in the project .plotris/agents directory. No code changes are required for CLI agents.
3.  **Modify Logic**: Update `src/planner.ts` or `src/executor.ts` to change how plans are generated or executed.

## Configuration

The application uses a YAML configuration file located at `.plotris/deploy.yml` to manage project settings and domain linking.

### `deploy.yml` Format

```yaml
project_name: "my-website-project"
production_domain: "example.com"
preview_domain: "staging.example.com"
```

- `project_name`: The Cloudflare Pages project name.
- `production_domain`: (Optional) The custom domain to link for production deployments.
- `preview_domain`: (Optional) The custom domain to link for preview deployments.

## Environment Variables

Create a `.env` file in the root directory for credentials:

```env
CLOUDFLARE_API_TOKEN=your_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
```


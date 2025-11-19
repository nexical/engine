# AI Architect

AI Architect is a Python-based Command Line Interface (CLI) that uses a multi-agent system to automate the end-to-end creation, modification, and deployment of static websites. It leverages a Planner-Executor model to translate high-level, natural language commands into a series of deterministic tasks that operate on the files within your website project directory.

## Core Concepts

### Planner-Executor Model

The system is composed of two main parts:

*   **The Planner (AI-driven):** A specialized AI agent that takes a user's "fuzzy" request (e.g., "add a new blog page") and converts it into a deterministic, step-by-step plan. This plan is stored as a YAML file for auditing and debugging.
*   **The Executor (Code-driven):** A non-AI workflow engine that takes the generated plan and executes each task in sequence, like a build script.

This separation provides both flexibility and reliability. The AI can create novel plans, while the execution is handled by predictable, testable Python code.

### Agents-as-Configuration

Specialist agents (e.g., for content, design, or development) are defined as `.yml` configuration files (profiles) within an `agents/` directory in your website project. A generic `AgentRunner` class in the application is responsible for parsing these YAML profiles and executing the tasks. This allows the system to be highly extensible—adding a new tool or capability is as simple as adding a new `.agent.yml` file.

## Getting Started

### Prerequisites

*   Python 3.8+
*   Git
*   An LLM API key from a provider supported by [LiteLLM](https://litellm.ai/) (e.g., OpenAI, Anthropic, Google).
*   (Optional) A Cloudflare account for deployments.

### Installation

1.  Clone this repository:
    ```bash
    git clone <repository_url>
    cd website-editor
    ```

2.  Install the required Python packages:
    ```bash
    pip install -r requirements.txt
    ```

### Configuration

1.  Create a `.env` file in the root of the `website-editor` directory to store your secret keys and configuration. You can copy the example file:
    ```bash
    cp .env.example .env
    ```

2.  Edit the `.env` file with your credentials:

    ```env
    # LLM Configuration (choose your provider)
    OPENAI_API_KEY="sk-..."
    # ANTHROPIC_API_KEY="sk-..."
    # GOOGLE_API_KEY="..."

    # LiteLLM model names
    LITELLM_MODEL="gpt-4"
    LITELLM_IMAGE_MODEL="dall-e-3"

    # Cloudflare Configuration (for --publish and --preview)
    CLOUDFLARE_API_TOKEN="your-cloudflare-api-token"
    CLOUDFLARE_ACCOUNT_ID="your-cloudflare-account-id"
    
    # The name of your Cloudflare Pages project
    PROJECT_NAME="my-website-project"
    ```

## How to Use

The `ai-architect` command operates on a website project directory. The CLI itself is run from the `website-editor/src` directory, but it uses the files within the website project directory to manage the website.

### Project Structure

Your website project should have the following structure:

```
/my-website-project/
├── .dev/                         # Internal state files for the AI Architect CLI
│   ├── research/                 # Agent research output (.md files)
│   └── history/                  # Stores past task.yml plans
├── agents/                       # Agent profiles (.yml files)
│   ├── content.agent.yml
│   ├── designer.agent.yml
│   └── capabilities.yml          # "Menu" of available agents for the Planner
├── build/                        # Output directory for the compiled static site
├── content/                      # Content files (e.g., YAML content)
├── src/                          # Astro JS source (e.g., HTML templates and components)
└── public/                       # Publicly accessible assets (images, CSS, JS, etc.)
```

### Running the CLI

You can run the CLI from within the `src` directory of the `website-editor` project. Make sure your current working directory is your website project.

```bash
cd /path/to/my-website-project
python /path/to/website-editor/src/main.py --prompt "Your request here"
```

**Commands**

*   **AI-Driven (Fuzzy) Prompt:**
    ```bash
    python src/main.py --prompt "Add a new page for 'Our Team' with 3 members."
    ```

*   **Interactive Mode:** For a chat-like experience, run the command with no arguments.
    ```bash
    python src/main.py
    ```
    You will be prompted for input. Type `exit` to quit.

*   **Production Deployment:**
    This command will compile the project, commit the changes to the `main` branch, push to your Git remote, and monitor the Cloudflare deployment.
    ```bash
    python src/main.py --publish
    ```

*   **Preview Deployment:**
    This command will compile, commit to the `preview` branch, push, and monitor the Cloudflare deployment for a preview environment.
    ```bash
    python src/main.py --preview
    ```

## Development

This application is designed to be extensible. You can add new capabilities by creating your own agent profiles.

### Agent Profiles

An agent profile is a YAML file in the `agents/` directory of your website project. It defines the agent's name, description, and how it operates.

**Example `content.agent.yml`:**
```yaml
name: "ContentAgent"
description: "Writes and edits Markdown content files."
engine: "llm"
prompt_template: |
  You are an expert content writer.
  The user's request is: "{user_request}"
  The specific task is: "{task_prompt}"
  The current file content of "{file_path}" is:
  ---
  {file_content}
  ---
  Based on the task, please generate the new, complete content for the file "{file_path}".
  Output ONLY the new file content.
```

### Capabilities Menu

The `agents/capabilities.yml` file provides a "menu" of available agents for the Planner AI, telling it what tools it can use to fulfill a user's request.

**Example `capabilities.yml`:**
```yaml
- name: "ResearcherAgent"
  description: "Performs research and answers questions to help guide content creation, theme design, and component development."
- name: "ContentAgent"
  description: "Writes, creates, or edits text-based content files, such as blog posts or page content in Markdown format."
- name: "DesignerAgent"
  description: "Creates or modifies theme files, CSS stylesheets, and generates images or icons."
```

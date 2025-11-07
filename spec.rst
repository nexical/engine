================================== AI Architect: Python CLI Specification

.. contents:: Table of Contents

Overview

This document defines the technical specification for the "AI Architect," a Python-based Command Line Interface (CLI) application. This tool functions as a multi-agent system designed to automate the end-to-end creation, modification, and deployment of static websites.

The system's core is a "Planner-Executor" agent architecture. It translates high-level, "fuzzy" user commands (e.g., "add a new blog page") into a series of "deterministic" tasks. These tasks are then executed by a workflow engine that calls a set of specialized "specialist agents" and hard-coded services.

The primary goal is to provide a "hands-off" experience where the AI handles complex reasoning and generation, while the application provides a robust, extensible, and auditable framework for execution.

Core Architectural Principles

The system is built on three fundamental principles.

2.1. Planner-Executor Model

The system's "brain" is not a single, monolithic AI. It is a two-part system:

The Planner (AI-driven): This is a specialized AI agent (the PlannerAgent). Its only job is to receive a "fuzzy" user request and convert it into a "deterministic," step-by-step plan, which is saved as a task.yml file.

The Executor (Code-driven): This is a "dumb" (non-AI) Python script (executor.py). Its only job is to read the task.yml file and execute each task in sequence, like a build script.

This separation allows for flexibility (the AI can create novel plans) and reliability (the execution of the plan is hard-coded and predictable).

2.2. Agents-as-Configuration

Specialist agents (e.g., ContentManager, Illustrator) are not defined as Python classes. They are defined as .yml configuration files in the /agents directory.

This principle allows the system to be highly extensible. To add a new tool or capability, a developer simply adds a new .agent.yml file and describes its function in capabilities.yml. The Planner AI will automatically learn how to incorporate this new tool into its plans without requiring any changes to the core application logic.

2.3. Deterministic-by-Default

The AI (Planner) is only used for tasks that require complex reasoning and generation (i.e., "fuzzy" requests).

Any task that is fixed, repeatable, and deterministic (e.g., "deploy the site," "compile the project") is implemented as a hard-coded Python function. The Orchestrator will route user commands (like --publish) directly to these hard-coded services, bypassing the AI Planner entirely. This saves costs, increases speed, and eliminates the risk of AI-generated errors for simple tasks.

System Components

3.1. The Orchestrator (orchestrator.py)

The main application router, implemented in Python. It is not an AI agent. Its responsibilities are:

Parsing user input from the CLI (e.g., argparse).

Routing the user's intent to the correct workflow.

Path 1 (AI-Driven): If the user provides a "fuzzy" prompt (e.g., --prompt "..."), the Orchestrator calls the Planner Agent to generate a task.yml, and then passes that plan to the Executor.

Path 2 (Human-Driven): If the user provides a "deterministic" command (e.g., --publish), the Orchestrator bypasses the Planner and calls the Deployment Service directly.

3.2. The Planner (AI Agent)

The "master agent" responsible for creating a plan. It is a process, not a file. It is invoked by the Orchestrator.

Input: The user's prompt (e.g., "Add a team page"), the content of capabilities.yml (the "tool menu"), and the current project.yml (the "state").

Action: Calls the Gemini CLI via the GeminiService with a master prompt (defined in planner.agent.yml) instructing it to generate a plan.

Output: A fully-formed task.yml file, which is saved to the project's history.

3.3. The Executor (executor.py)

A non-AI Python script that functions as a workflow engine.

Input: A file path to a task.yml file.

Action:

Parses the task.yml.

Loops through the tasks: list in sequence.

For each task, it prints the notice: field to the console.

It reads the agent: field (e.g., "ContentManager") and calls the corresponding service (e.g., GeminiService) with the parameters defined in the .agent.yml file and the task.

Output: A "Success" or "Failed" status.

3.4. Agent Definitions (/agents/*.yml)

YAML configuration files that define the "tools" the Planner can use. Each file defines one specialist agent.

3.5. Service Abstractions (/services/*.py)

A layer of hard-coded Python modules that provide all external functionality. This isolates the core logic from implementation details.

gemini_service.py: A wrapper around the Gemini CLI (subprocess.run()).

github_service.py: A wrapper for GitPython or git CLI commands.

cloudflare_service.py: A wrapper for the Cloudflare API (using requests).

deployment_service.py: The hard-coded logic for the --publish and --preview commands.

compiler.py: The hard-coded "Developer Agent" logic.

fs_service.py: A helper module for all file system I/O (reading/writing project.yml, etc.).

Data Models

The system's state is managed through a series of YAML files.

4.1. project.yml (The Website State)

The Single Source of Truth (SSOT) for the generated website. This file is the primary artifact that is read and mutated by the agents.

.. code-block:: yaml

# This is the SSOT for the website
site:
  title: "Piedmont Capital"
theme:
  styleGroups:
    button-primary: "bg-blue-600 text-white..."
pages:
  index:
    title: "Home"
    sections:
      - component: "layout:Hero"
        content:
          heading: "Welcome"
          image_prompt: "A minimalist icon of a mountain peak."


4.2. capabilities.yml (The Agent "Menu")

The "menu" of available tools that is provided to the Planner Agent.

.. note::
This file is the key to the system's extensibility. Adding a new tool here makes it available to the AI Planner.

.. code-block:: yaml

- name: "ContentManager"
  description: "Writes, updates, or refactors YAML content in the project.yml. Use for any content changes, adding pages, or modifying site structure."
- name: "IllustratorAgent"
  description: "Generates new images from a text prompt. Use when the user asks for a new picture, logo, or icon."
- name: "Compiler"
  description: "A hard-coded script that compiles the project.yml into the final /src directory. Call this after any file changes."


4.3. [agent_name].agent.yml (The Tool Definition)

Defines a single specialist agent's configuration.

.. code-block:: yaml

# /agents/content-manager.agent.yml
name: "ContentManager"
description: "Writes and updates YAML content."
executable: "gemini" # Tells the executor which service to use

# Defines how to build the CLI command
cli_options:
  command: "--prompt"

# The prompt template. The Executor will inject variables.
prompt_template: |
  You are an expert YAML content manager.
  The user's request is: "{user_request}"
  The specific task is: "{task_prompt}"

  Please read the following project.yml file, perform the task,
  and output ONLY the new, complete project.yml file.
  ---
  {project_yml_content}
  ---


4.4. task.yml (The Dynamic Plan)

The output of the Planner and the input for the Executor. This is a dynamically-generated "script" for the AI.

.. code-block:: yaml

plan_name: "Add new team page"
tasks:
  - name: "Generate Team Page Content"
    agent: "ContentManager"
    notice: "Okay, I'm writing the content for the new 'Team' page."
    params:
      task_prompt: "Generate a new 'pages.team' YAML block with 3 placeholder team members."

  - name: "Generate Team Headshots"
    agent: "IllustratorAgent"
    notice: "Generating placeholder headshots for the new team..."
    params:
      # This shows how an agent can create multiple sub-tasks
      loop:
        - user_prompt: "A professional headshot of a male CEO."
          output_file: "/public/images/team-01.png"
        - user_prompt: "A professional headshot of a female COO."
          output_file: "/public/images/team-02.png"

  - name: "Compile Site"
    agent: "Compiler"
    notice: "Compiling the new page..."
    params: {}


Core Workflows

5.1. AI-Driven (Fuzzy) Workflow

This is the flow for a complex, natural language request (e.S., ai-architect --prompt "...").

Input: The Orchestrator receives the user's prompt string.

Planning: The Orchestrator calls the Planner Agent (via GeminiService) with the prompt, capabilities.yml, and current project.yml.

Plan: The Planner Agent generates a new task.yml file.

Execution: The Orchestrator passes the task.yml file path to the Executor.

Task Loop: The Executor reads the task.yml and executes each task sequentially by calling the appropriate Service (e.g., GeminiService, CompilerService).

State Mutation: During execution, services like GeminiService (via the ContentManager agent) overwrite the project.yml with new content.

Completion: The Executor finishes and reports success to the Orchestrator.

5.2. Human-Driven (Deterministic) Workflow

This is the flow for a fixed, hard-coded command (e.g., ai-architect --publish).

Input: The Orchestrator detects the --publish argument.

Routing: The Orchestrator bypasses the Planner and Executor.

Execution: It directly calls the DeploymentService.run_production_deployment() function.

Fixed Sequence: This hard-coded function runs its own steps:

Call CompilerService.run().

Call GithubService.commit_and_push("main").

Call CloudflareService.wait_for_build("production").

Completion: The service reports success to the Orchestrator.

Proposed Directory Structure

.. code-block:: bash

/ai-architect-cli/
│
├── /agents/                      # YAML-based agent definitions
│   ├── capabilities.yml
│   ├── planner.agent.yml
│   ├── researcher.agent.yml
│   ├── content-manager.agent.yml
│   └── illustrator.agent.yml
│
├── /app/                         # Core application logic
│   ├── __init__.py
│   ├── orchestrator.py         # Main router logic
│   ├── executor.py             # The task.yml runner
│   └── compiler.py             # The hard-coded "Compiler" agent/service
│
├── /services/                    # Hard-coded wrappers for external tools
│   ├── __init__.py
│   ├── gemini_service.py         # Wraps subprocess.run("gemini ...")
│   ├── github_service.py         # Wraps GitPython or git commands
│   ├── cloudflare_service.py     # Wraps the Cloudflare API (requests)
│   ├── fs_service.py             # File I/O helpers
│   └── deployment_service.py     # Hard-coded deploy/preview logic
│
├── /common/                      # Shared data models
│   ├── __init__.py
│   └── models.py               # Pydantic or Dataclass models (Project, Task, etc.)
│
├── main.py                       # Entry point (handles argparse, calls orchestrator)
├── requirements.txt
└── .env


CLI Interface (API)

The user interacts with the application via main.py.

.. code-block:: bash

# Create a new project
ai-architect --new "Piedmont Capital"

# Run a "fuzzy" AI-driven prompt
ai-architect --prompt "Add a new page for 'Our Team' with 3 members."

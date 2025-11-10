==================================
AI Architect: Python CLI Specification

Overview

This document defines the technical specification for the "AI Architect," a Python-based Command Line Interface (CLI) application. The tool is designed to be run within a project directory, which contains the website's configuration and content. It functions as a multi-agent system to automate the end-to-end creation, modification, and deployment of static websites.

The system's core is a "Planner-Executor" agent architecture. It translates high-level, "fuzzy" user commands (e.g., "add a new blog page") into a series of "deterministic" tasks that operate on files within the project directory. These tasks are then executed by a workflow engine that calls a set of specialized "specialist agents."

The primary goal is to provide a "hands-off" experience where the AI handles complex reasoning and generation, while the application provides a robust, extensible, and auditable framework for execution.

Core Architectural Principles

The system is built on three fundamental principles.

2.1. Planner-Executor Model

The system's "brain" is not a single, monolithic AI. It is a two-part system:

The Planner (AI-driven): This is a specialized AI agent, implemented as a ``PlannerAgent`` class. Its only job is to receive a "fuzzy" user request and convert it into a "deterministic," step-by-step ``Plan`` object. This plan can be serialized to a ``task.yml`` file for auditing and debugging.

The Executor (Code-driven): This is a non-AI ``Executor`` class. Its only job is to take a ``Plan`` object and execute each ``Task`` in sequence, like a build script.

This separation allows for flexibility (the AI can create novel plans) and reliability (the execution of the plan is handled by predictable, testable Python classes).

2.2. Agents-as-Configuration

Specialist agents (e.g., ``ContentAgent``, ``DesignerAgent``) are not defined as individual Python classes. Instead, they are defined as ``.yml`` configuration files (profiles) within an ``agents/`` directory. These profiles specify the agent's capabilities, prompts, and the tools it uses.

A generic ``AgentRunner`` class in Python is responsible for parsing these YAML profiles and executing the tasks. This principle allows the system to be highly extensible. To add a new tool or capability, a developer simply adds a new ``.agent.yml`` file and describes its function in ``capabilities.yml``. The Planner AI will automatically learn how to incorporate this new tool into its plans without requiring any changes to the core application logic.

2.3. Deterministic-by-Default

The AI (Planner) is only used for tasks that require complex reasoning and generation (i.e., "fuzzy" requests).

Any task that is fixed, repeatable, and deterministic (e.g., "deploy the site," "compile the project") is implemented as a method within a dedicated Service class (e.g., ``DeploymentService``). The ``Orchestrator`` class will route user commands (like ``--publish``) directly to these service methods, bypassing the AI Planner entirely. This saves costs, increases speed, and eliminates the risk of AI-generated errors for simple tasks.

System Components

3.1. The Orchestrator (Orchestrator Class)

The main application router, implemented as an ``Orchestrator`` class. It is not an AI agent. Its responsibilities are:

Parsing user input from the CLI (e.g., using ``argparse``).

Routing the user's intent to the correct workflow by instantiating and calling other classes.

Path 1 (AI-Driven): If the user provides a "fuzzy" prompt (e.g., ``--prompt "..."``), the Orchestrator instantiates the ``PlannerAgent`` to generate a ``Plan`` object, and then passes that plan to an ``Executor`` instance.

Path 2 (Human-Driven): If the user provides a "deterministic" command (e.g., ``--publish``), the Orchestrator bypasses the Planner and directly calls methods on the appropriate Service class (e.g., ``DeploymentService``).

Path 3 (Interactive Mode): If the application is launched with no arguments, the Orchestrator enters an interactive "chat" mode. It will repeatedly prompt the user for input, treating each line as a "fuzzy" prompt and executing the AI-Driven workflow.

3.2. The Planner (PlannerAgent Class)

The "master agent" responsible for creating a plan, implemented as a ``PlannerAgent`` class inheriting from ``BaseAgent``. It is instantiated and invoked by the ``Orchestrator``.

Input: The user's prompt (e.g., "Add a team page"), a list of available agents from ``capabilities.yml`` (the "tool menu"), and a summary of the project's file structure.

Action: Constructs a master prompt and calls an external AI model (e.g., Gemini) via a ``LanguageModelService`` to generate a plan.

Output: A ``Plan`` object containing a list of ``Task`` objects. These tasks will contain instructions for agents to create, modify, or delete specific files in the project directory. This plan can be serialized to a ``task.yml`` file for auditing.

3.3. The Executor (Executor Class)

A non-AI Python class that functions as a workflow engine.

Input: A ``Plan`` object and the project path.

Action:

Loops through the ``Task`` objects in the ``Plan``.

For each task, it prints a notice to the console.

It identifies the required agent profile for the task (e.g., ``ContentAgent``).

It uses a generic ``AgentRunner`` to execute the task according to the agent's YAML profile, passing the task's parameters. This may involve calling a language model, running a script, or interacting with the file system.

Output: A "Success" or "Failed" status.

3.4. Agent Profiles (agents/)

A collection of YAML files that define the "tools" the Planner can use. Each file is a "profile" for a specialist agent.

A specialist agent is responsible for a specific domain. For example:
- ``ResearcherAgent``: Performs research that provides information to guide content, designs, and development tasks
- ``ContentAgent``: Writes and edits content files (e.g., Markdown).
- ``DesignerAgent``: Creates and modifies theme files, CSS, and generates background images.
- ``DeveloperAgent``: Creates new layouts, components, or other code-based project files.

3.5. Service Classes (services/)

A layer of hard-coded Python classes that provide abstractions for all external functionality. This isolates the core application logic from implementation details and facilitates mocking for tests.

``LanguageModelService``: A wrapper around an AI model API (e.g., Gemini).

``GitService``: A wrapper for Git commands (e.g., using GitPython).

``CloudflareService``: A wrapper for the Cloudflare API.

``DeploymentService``: Contains the hard-coded logic for the ``--publish`` and ``--preview`` commands. It utilizes other services like ``GitService`` and ``CloudflareService``.

``FileSystemService``: A helper class for all file system I/O.

Data Models

The system's state is the project directory itself. There is no single state file. Agents interact directly with the file system.

4.1. Project Directory (The Website State)

The file system is the Single Source of Truth (SSOT) for the generated website. Agents read, write, and delete files within the project directory to build and modify the site. This allows for a more flexible and extensible system where different agents can manage different types of files (content, themes, layouts, etc.).


4.2. capabilities.yml (The Agent "Menu")

A file that provides a descriptive "menu" of available agent classes for the Planner Agent.

.. note::
This file, in conjunction with the agent classes themselves, is the key to the system's extensibility. Registering a new agent class and describing it here makes it available to the AI Planner.

.. code-block:: yaml

- name: "ResearcherAgent"
  description: "Performs research and answers questions to help guide content creation, theme design, and component or section layout development.  Use before any requests to create content, updating site styling, or develop site components"
- name: "ContentAgent"
  description: "Writes, creates, or edits text-based content files, such as blog posts or page content in Markdown format. Use for any requests related to website text."
- name: "DesignerAgent"
  description: "Creates or modifies theme files, CSS stylesheets, and generates images or icons. Use for requests related to visual appearance, styling, logos, and color schemes."
- name: "DeveloperAgent"
  description: "Creates or modifies layout templates, page components, or other structural code files. Use for requests to add new page types or complex interactive widgets."


4.3. Agent Profile Definition (The Tool Implementation)

Defines a single specialist agent's configuration and prompt template in a YAML file.

.. code-block:: yaml

# agents/content.agent.yml
name: "ContentAgent"
description: "Writes and edits Markdown content files."
# Tells the AgentRunner which execution engine to use.
# 'llm' for language model, 'script' for a shell command.
engine: "llm"

# The prompt template. The AgentRunner will inject variables.
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


4.4. Plan and Task Objects (The Dynamic Plan)

The output of the ``PlannerAgent`` and the input for the ``Executor``. A ``Plan`` is a container for a list of ``Task`` objects. These are dynamically-generated "scripts" for the AI, which can be serialized to a ``task.yml`` file for storage in the project's ``.dev/history/`` directory.

.. code-block:: yaml

# Example task.yml (serialized Plan object)
plan_name: "Add new team page"
tasks:
  - name: "Perform Research on Popular Company Team Pages"
    agent: "ResearcherAgent"
    notice: "First, I'm going to research other successful company team pages to gather ideas for layout and content."
    params:
      task_prompt: "Perform a search of popular team pages to gather ideas pertaining to structuring team content"
      file_path: "research/team.md"

  - name: "Create Team Page Content"
    agent: "ContentAgent"
    notice: "Okay, I'm writing the content for the new 'Team' page."
    params:
      task_prompt: "Create a new page about the team with 3 placeholder members. Include a title and a short bio for each."
      file_path: "content/pages/team.md"

  - name: "Generate Team Headshots"
    agent: "DesignerAgent"
    notice: "Generating placeholder headshots for the new team..."
    params:
      # This shows how an agent can create multiple sub-tasks
      loop:
        - image_prompt: "A professional headshot of a male CEO, minimalist style."
          output_file: "public/_images/team-01.png"
        - image_prompt: "A professional headshot of a female COO, minimalist style."
          output_file: "public/_images/team-02.png"


Core Workflows

5.1. AI-Driven (Fuzzy) Workflow

This is the flow for a complex, natural language request (e.g., ``ai-architect --prompt "..."``).

Input: The ``Orchestrator`` receives the user's prompt string.

Planning: The ``Orchestrator`` instantiates the ``PlannerAgent`` and calls its ``generate_plan()`` method, passing the prompt and a summary of the project's file structure.

Plan: The ``PlannerAgent`` returns a ``Plan`` object.

Execution: The ``Orchestrator`` instantiates the ``Executor`` with the ``Plan`` object and project path, then calls its ``execute_plan()`` method.

Task Loop: The ``Executor`` iterates through the ``Task`` objects in the plan. For each task, it uses the ``AgentRunner`` service to execute the task based on the specified agent's YAML profile.

State Mutation: During execution, the ``AgentRunner``, guided by the agent profile, uses services like ``LanguageModelService`` and ``FileSystemService`` to create, delete, or overwrite files within the project directory.

Completion: The ``Executor`` finishes and reports success to the ``Orchestrator``.

5.2. Human-Driven (Deterministic) Workflow

This is the flow for a fixed, hard-coded command (e.g., ``ai-architect --publish``).

Input: The ``Orchestrator`` detects the ``--publish`` argument.

Routing: The ``Orchestrator`` bypasses the ``PlannerAgent`` and ``Executor``.

Execution: It directly instantiates and calls the relevant service class, e.g., ``DeploymentService.run_production_deployment()``.

Fixed Sequence: The service method runs its own steps, potentially using other services:

Instantiate and call the ``CompilerAgent`` via the ``AgentRunner``.

Instantiate and call ``GitService.commit_and_push("main")``.

Instantiate and call ``CloudflareService.wait_for_build("production")``.

Completion: The service method returns a success status to the ``Orchestrator``.

Project Directory Structure

The `ai-architect` command operates on a project directory. The CLI itself is installed globally, but it uses the files within the current working directory to manage the website. This allows for managing multiple projects in different terminal sessions.

The CLI application itself will contain the core logic (Orchestrator, Planner, Executor, Services). The user's project directory, where the ``ai-architect`` command is run, contains the website source files and agent configurations.

.. code-block:: bash

/my-website-project/
│
├── .dev/                         # Internal state files for the AI Architect CLI
│   ├── research/                 # Agent research output (.yml files)
│   └── history/                  # Stores past task.yml plans
│
├── agents/                       # Agent profiles (.yml files)
│   ├── content.agent.yml
│   ├── designer.agent.yml
│   └── capabilities.yml          # "Menu" of available agents for the Planner
│
├── build/                        # Output directory for the compiled static site
│
├── content/                      # Content files (e.g., YAML content)
│
├── src/                          # Astro JS source (e.g., HTML templates and components)
│
└── public/                       # User-managed assets (images, CSS, JS, etc.)


CLI Interface (API)

The user interacts with the application via main.py.

.. code-block:: bash

# Create a new project
ai-architect --new "Piedmont Capital"

# Run a "fuzzy" AI-driven prompt
ai-architect --prompt "Add a new page for 'Our Team' with 3 members."

# Enter interactive chat mode (if no arguments are provided)
ai-architect

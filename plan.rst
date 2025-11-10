================
MVP Development Plan
================

This plan outlines the development of the AI Architect MVP in testable phases.

Phase 1: Core Data Models and Services
--------------------------------------
Goal: Create the basic data structures and foundational services.

*   **Data Models**: Implement ``Plan`` and ``Task`` classes in ``src/ai_architect/data_models/plan.py``.
*   **File Service**: Implement ``FileSystemService`` in ``src/ai_architect/services/file_system_service.py``.
*   **Mock LM Service**: Create a mock ``LanguageModelService`` that returns hardcoded data for testing.
*   **Testing**: Unit test data models and file service.

Phase 2: Deterministic Plan Execution
-------------------------------------
Goal: Execute a hardcoded plan.

*   **Base Agent**: Define the ``BaseAgent`` abstract class in ``src/ai_architect/agents/base_agent.py``.
*   **Agent Runner**: Implement a simple ``AgentRunner`` in ``src/ai_architect/services/agent_runner.py``.
*   **Executor**: Implement the ``Executor`` class in ``src/ai_architect/executor.py`` to run tasks from a ``Plan`` object.
*   **Testing**: Integration test for the ``Executor`` running a manually created ``Plan``.

Phase 3: AI-Powered Planner
---------------------------
Goal: Generate a plan from a user prompt.

*   **Planner**: Implement the ``Planner`` class in ``src/ai_architect/planner.py``.
*   **Functionality**: The ``Planner`` will use the mock ``LanguageModelService`` to turn a prompt into a ``Plan`` object.
*   **Testing**: Unit test the ``Planner``, ensuring it correctly parses the mock service's response.

Phase 4: Orchestrator and CLI
-----------------------------
Goal: Connect all components and create a command-line interface.

*   **Orchestrator**: Implement the ``Orchestrator`` class in ``src/ai_architect/orchestrator.py`` to manage application flow.
*   **CLI**: Create the entry point in ``main.py`` to handle command-line arguments.
*   **Integration**: Wire the ``Planner`` and ``Executor`` together for the AI-driven workflow.
*   **Testing**: End-to-end test of the CLI using a prompt, with the mock language model.

Phase 5: Deterministic Commands
-------------------------------
Goal: Add support for non-AI commands like ``--publish``.

*   **Deployment Service**: Implement ``DeploymentService`` in ``src/ai_architect/services/deployment_service.py``.
*   **Mock Services**: Create mock ``GitService`` and ``CloudflareService``.
*   **Orchestrator Update**: Update the ``Orchestrator`` to handle deterministic commands.
*   **Testing**: End-to-end test for the ``--publish`` command.

Phase 6: Agents-as-Configuration
--------------------------------
Goal: Implement the dynamic agent loading from YAML files.

*   **Advanced Agent Runner**: Refactor ``AgentRunner`` to parse ``.agent.yml`` files.
*   **Agent Profiles**: Create sample agent profiles in an ``agents/`` directory.
*   **Planner Update**: Update ``Planner`` to read ``capabilities.yml`` and include it in its prompt.
*   **Real LM Service**: Replace the mock ``LanguageModelService`` with a real implementation.
*   **Testing**: Update end-to-end tests to use the YAML-based agent configuration.

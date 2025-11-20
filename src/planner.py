import os
import yaml
from src.data_models.plan import Plan
from src.services.language_model_service import LanguageModelService
from src.services.file_system_service import FileSystemService


class Planner:
    """
    Uses a language model to generate a Plan object from a user's
    natural language prompt.
    """

    def __init__(self, lm_service: LanguageModelService, fs_service: FileSystemService):
        """Initializes the planner with its dependencies."""
        self.lm_service = lm_service
        self.fs_service = fs_service

    def _get_agent_capabilities(self, project_path: str) -> str:
        """Reads the capabilities.yml file and returns it as a string."""
        capabilities_path = os.path.join(project_path, ".builder", "agents", "capabilities.yml")
        if os.path.exists(capabilities_path):
            return self.fs_service.read_file(capabilities_path)
        return "No agent capabilities file found."

    def generate_plan(self, prompt: str, project_path: str) -> Plan:
        """
        Takes a user prompt and project path, finds available agents,
        and generates a step-by-step plan.
        """
        agent_capabilities = self._get_agent_capabilities(project_path)

        # In a real implementation, we would also scan the file system
        # for more context.

        full_prompt = f"""
You are an AI Architect. Your job is to create a deterministic YAML plan to accomplish a user's goal.
The user's prompt is: "{prompt}"

Here are the tools (agents) you have available:
---
{agent_capabilities}
---

Based on the user's prompt and the available agents, please generate a YAML plan.
The plan should be a sequence of tasks. Each task must use one of the available agents.
The output must be only the YAML plan, starting with 'plan_name:'.
"""
        
        print("Generating plan for prompt:", prompt)
        plan_yaml = self.lm_service.query(full_prompt)
        
        return Plan.from_yaml(plan_yaml)

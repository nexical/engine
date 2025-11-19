import yaml
import os
import subprocess
from typing import Dict, Any

from src.data_models.plan import Task
from src.agents.base_agent import Project, BaseAgent
from src.services.language_model_service import LanguageModelService
from src.services.file_system_service import FileSystemService

# Import Python-based agents
from src.agents.compiler import CompilerAgent
from src.agents.content_manager import ContentManagerAgent
from src.agents.illustrator import IllustratorAgent


class AgentRunner:
    """
    The service responsible for discovering, loading, and executing agent tasks.
    """

    def __init__(
        self,
        project_path: str,
        lm_service: LanguageModelService,
        fs_service: FileSystemService,
        # In a real app, you'd have a real image service
        image_generation_service: Any = None,
    ):
        self.project_path = project_path
        self.lm_service = lm_service
        self.fs_service = fs_service
        self.image_generation_service = image_generation_service
        self._agents: Dict[str, BaseAgent] = self._load_python_agents()
        self._agent_profiles: Dict[str, Dict] = self._load_yaml_profiles()

    def _load_python_agents(self) -> Dict[str, BaseAgent]:
        """Loads instances of Python-defined agents."""
        # In a real app, services would be properly injected
        return {
            "CompilerAgent": CompilerAgent(),
            "ContentManagerAgent": ContentManagerAgent(self.lm_service, self.fs_service),
            "IllustratorAgent": IllustratorAgent(self.lm_service, self.fs_service),
        }

    def _load_yaml_profiles(self) -> Dict[str, Dict]:
        """Loads agent profiles from the agents/ directory."""
        profiles = {}
        agents_dir = os.path.join(self.project_path, "agents")
        if not os.path.isdir(agents_dir):
            return profiles

        for filename in os.listdir(agents_dir):
            if filename.endswith((".agent.yml", ".agent.yaml")):
                file_path = os.path.join(agents_dir, filename)
                with open(file_path, 'r') as f:
                    profile = yaml.safe_load(f)
                    if "name" in profile:
                        profiles[profile["name"]] = profile
        return profiles

    def run_agent(self, task: Task, project: Project, user_prompt: str) -> Project:
        """
        Executes a single task using the appropriate agent.
        """
        print(task.notice)

        # Priority 1: Check for a Python-based agent
        if task.agent in self._agents:
            agent = self._agents[task.agent]
            return agent.execute(task, project)

        # Priority 2: Check for a YAML-defined agent
        if task.agent in self._agent_profiles:
            return self._run_yaml_agent(task, project, user_prompt)

        print(f"Warning: Agent '{task.agent}' not found. Skipping task.")
        return project

    def _run_yaml_agent(self, task: Task, project: Project, user_prompt: str) -> Project:
        """Executes a task based on a YAML agent profile."""
        profile = self._agent_profiles[task.agent]
        engine = profile.get("engine")

        if engine == "llm":
            return self._execute_llm_agent(task, profile, project, user_prompt)
        elif engine == "script":
            return self._execute_script_agent(task, project)
        else:
            print(f"Unsupported engine '{engine}' for agent '{task.agent}'. Skipping.")
            return project

    def _execute_llm_agent(self, task: Task, profile: Dict, project: Project, user_prompt: str) -> Project:
        """Formats a prompt and uses the LM service to get a result."""
        prompt_template = profile.get("prompt_template", "")
        
        file_path = task.params.get("file_path")
        file_content = ""
        if file_path:
            full_path = os.path.join(project.project_path, file_path)
            file_content = self.fs_service.read_file(full_path)

        # Consolidate format arguments to avoid duplicate keys
        format_args = {
            "user_request": user_prompt,
            "file_path": file_path or "",
            "file_content": file_content or "",
        }
        # Add all task parameters, which might include 'task_prompt'
        format_args.update(task.params)

        # Interpolate variables into the prompt template
        prompt = prompt_template.format(**format_args)

        print(f"Running LLM-based agent: {task.agent}")
        new_content = self.lm_service.query(prompt)

        if file_path:
            full_path = os.path.join(project.project_path, file_path)
            self.fs_service.write_file(full_path, new_content)
            print(f"Agent '{task.agent}' updated file: {file_path}")

        # The project state isn't really changed here, but could be
        return project

    def _execute_script_agent(self, task: Task, project: Project) -> Project:
        """Executes a shell command for a script-based agent."""
        command = task.params.get("command")
        if not command:
            print(f"Warning: Agent '{task.agent}' requires a 'command' parameter. Skipping.")
            return project

        print(f"Running command: {command}")
        try:
            result = subprocess.run(
                command,
                shell=True,
                cwd=project.project_path,
                capture_output=True,
                text=True,
                check=False # Do not raise exception on non-zero exit codes
            )
            print("--- stdout ---")
            print(result.stdout)
            print("--- stderr ---")
            print(result.stderr)
            if result.returncode != 0:
                print(f"Warning: Command exited with code {result.returncode}")
            # A more advanced implementation could feed the output back to an LLM
            # to determine if the tests passed or failed.
        except Exception as e:
            print(f"An error occurred while executing the script: {e}")
        
        return project

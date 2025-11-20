import yaml
import os
import subprocess
from typing import Dict, Any, List

from src.data_models.plan import Task
from src.agents.base_agent import Project, BaseAgent
from src.services.file_system_service import FileSystemService

# Import Python-based agents
# None currently

class AgentRunner:
    """
    The service responsible for discovering, loading, and executing agent tasks.
    """

    def __init__(
        self,
        project_path: str,
        fs_service: FileSystemService,
        # In a real app, you'd have a real image service
        image_generation_service: Any = None,
    ):
        self.project_path = project_path
        self.fs_service = fs_service
        self.image_generation_service = image_generation_service
        self._agents: Dict[str, BaseAgent] = {}
        self._agent_profiles: Dict[str, Dict] = self._load_yaml_profiles()

    def _load_yaml_profiles(self) -> Dict[str, Dict]:
        """Loads agent profiles from the agents/ directory."""
        profiles = {}
        # Look in website/.builder/agents
        agents_dir = os.path.join(self.project_path, "website", ".builder", "agents")
        if not os.path.isdir(agents_dir):
            # Fallback to .builder/agents if website/ doesn't exist or isn't used
            agents_dir = os.path.join(self.project_path, ".builder", "agents")
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
        # Default to CLI execution as 'engine' field is deprecated
        return self._execute_cli_agent(task, profile, project, user_prompt)

    def _execute_cli_agent(self, task: Task, profile: Dict, project: Project, user_prompt: str) -> Project:
        """Formats a prompt and executes a CLI command."""
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

        # Get command and args from profile
        command_bin = profile.get("command", "gemini")
        args_template = profile.get("args", [])

        # Interpolate variables into args
        # We add 'prompt' to format_args for args interpolation
        format_args["prompt"] = prompt
        
        final_args = []
        for arg in args_template:
            final_args.append(arg.format(**format_args))

        full_command = [command_bin] + final_args

        print(f"Running CLI agent: {task.agent}")
        print(f"Command: {' '.join(full_command)}")

        try:
            result = subprocess.run(
                full_command,
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
            
        except Exception as e:
            print(f"An error occurred while executing the CLI agent: {e}")

        return project

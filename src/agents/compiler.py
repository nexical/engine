import subprocess
import os
from src.agents.base_agent import BaseAgent, Project
from src.data_models.plan import Task


class CompilerAgent(BaseAgent):
    """
    A deterministic agent for compiling the project by running a build command.
    """

    def __init__(self):
        """Initializes the agent."""
        pass

    def execute(self, task: Task, project: Project) -> Project:
        """
        Executes the build command specified in the task parameters.
        """
        print(f"Executing CompilerAgent: {task.name}")
        
        build_command = task.params.get("command")
        
        if not build_command:
            print("Error: No build command specified for the CompilerAgent.")
            return project

        print(f"Running build command: '{build_command}' in {project.project_path}")
        
        try:
            # Execute the command in the project's directory
            result = subprocess.run(
                build_command,
                shell=True,
                check=True,
                cwd=project.project_path,
                capture_output=True,
                text=True
            )
            print("Build successful.")
            print("stdout:", result.stdout)
            print("stderr:", result.stderr)
        except subprocess.CalledProcessError as e:
            print(f"Error during build command execution: {e}")
            print("stdout:", e.stdout)
            print("stderr:", e.stderr)
        except FileNotFoundError:
            print(f"Error: The command '{build_command}' could not be found.")
        
        return project

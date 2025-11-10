from src.agents.base_agent import BaseAgent, Project
from src.data_models.plan import Task


class CompilerAgent(BaseAgent):
    """
    A deterministic agent for compiling the project.
    """

    def __init__(self):
        """Initializes the agent."""
        pass

    def execute(self, task: Task, project: Project) -> Project:
        """
        Reads the project state and generates the necessary HTML, CSS,
        and JS files in the /src directory.
        """
        print(f"Executing CompilerAgent: {task.name}")
        print("Compiling project... (mock implementation)")
        # In a real implementation, this would involve transforming
        # project data into a static site.
        return project

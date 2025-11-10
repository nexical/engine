from src.agents.base_agent import BaseAgent, Project
from src.data_models.plan import Task
from src.services.language_model_service import LanguageModelService
from src.services.file_system_service import FileSystemService


class ContentManagerAgent(BaseAgent):
    """
    An agent for creating and modifying the content of project.yml.
    """

    def __init__(self, lm_service: LanguageModelService, fs_service: FileSystemService):
        """Initializes the agent."""
        self.lm_service = lm_service
        self.fs_service = fs_service

    def execute(self, task: Task, project: Project) -> Project:
        """
        Builds a prompt for the language model, gets the new YAML content,
        writes it to project.yml, and reloads the project state.
        """
        print(f"Executing ContentManagerAgent: {task.name}")
        
        prompt = task.params.get("prompt", "")
        file_path = task.params.get("file_path", "project.yml")
        full_path = f"{project.project_path}/{file_path}"
        
        current_content = self.fs_service.read_file(full_path)
        
        # This is a simplified prompt construction
        llm_prompt = f"""
The user wants to: {prompt}
The current content of {file_path} is:
---
{current_content}
---
Generate the new content for the file.
"""
        
        new_content = self.lm_service.query(llm_prompt)
        
        self.fs_service.write_file(full_path, new_content)
        print(f"Updated {file_path}.")
        
        # In a real implementation, we would reload the project state here.
        return project

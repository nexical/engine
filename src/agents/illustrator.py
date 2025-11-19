from src.agents.base_agent import BaseAgent, Project
from src.data_models.plan import Task
from src.services.language_model_service import LanguageModelService
from src.services.file_system_service import FileSystemService
import os

class IllustratorAgent(BaseAgent):
    """
    An agent for generating images using a language model.
    """

    def __init__(self, lm_service: LanguageModelService, fs_service: FileSystemService):
        """
        Initializes the agent with language model and file system services.
        """
        self.lm_service = lm_service
        self.fs_service = fs_service

    def execute(self, task: Task, project: Project) -> Project:
        """
        Generates images from prompts in the task and saves them to file paths.
        """
        print(f"Executing IllustratorAgent: {task.name}")
        
        image_prompts = task.params.get("loop", [])
        
        for item in image_prompts:
            image_prompt = item.get("image_prompt")
            output_file = item.get("output_file")
            
            if image_prompt and output_file:
                print(f"Generating image for prompt: '{image_prompt}'")
                
                # Construct the full path for the output file
                full_path = os.path.join(project.project_path, output_file)
                
                try:
                    # Use the language model service to generate the image
                    self.lm_service.imagine(
                        prompt=image_prompt,
                        output_path=full_path
                    )
                    print(f"Successfully generated and saved image to {full_path}")
                except Exception as e:
                    print(f"Error generating image for prompt '{image_prompt}': {e}")
                    # Decide on error handling: skip, stop, etc.
                    # For now, we'll just print the error and continue.

        return project

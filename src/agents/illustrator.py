from src.agents.base_agent import BaseAgent, Project
from src.data_models.plan import Task


class IllustratorAgent(BaseAgent):
    """
    An agent for generating images.
    """

    def __init__(self, image_generation_service: any):
        """Initializes the agent."""
        self.image_generation_service = image_generation_service

    def execute(self, task: Task, project: Project) -> Project:
        """
        Calls the image generation service for each prompt in the task's
        parameters and saves the resulting images to the specified file paths.
        """
        print(f"Executing IllustratorAgent: {task.name}")
        
        image_prompts = task.params.get("loop", [])
        
        for item in image_prompts:
            image_prompt = item.get("image_prompt")
            output_file = item.get("output_file")
            
            if image_prompt and output_file:
                print(f"Generating image for prompt: '{image_prompt}'")
                # In a real implementation, call the image generation service
                # image_data = self.image_generation_service.generate(image_prompt)
                # For now, create a placeholder file
                placeholder_content = f"Placeholder for: {image_prompt}"
                full_path = f"{project.project_path}/{output_file}"
                
                # This would use a file system service
                import os
                os.makedirs(os.path.dirname(full_path), exist_ok=True)
                with open(full_path, "w") as f:
                    f.write(placeholder_content)
                
                print(f"Saved placeholder image to {output_file}")

        return project

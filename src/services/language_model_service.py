class LanguageModelService:
    """Provides a wrapper around an external language model API."""

    def __init__(self, api_key: str = None):
        """Initializes the service with an API key."""
        self.api_key = api_key

    def query(self, prompt: str) -> str:
        """
        Sends a prompt to the language model and returns the text response.
        This is a mock implementation that returns a hardcoded plan.
        """
        mock_plan_yaml = """
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
      loop:
        - image_prompt: "A professional headshot of a male CEO, minimalist style."
          output_file: "public/_images/team-01.png"
        - image_prompt: "A professional headshot of a female COO, minimalist style."
          output_file: "public/_images/team-02.png"
"""
        return mock_plan_yaml

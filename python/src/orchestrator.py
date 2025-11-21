import argparse
import os
import sys
from typing import List

from src.planner import Planner
from src.executor import Executor
from src.services.language_model_service import LanguageModelService
from src.services.agent_runner import AgentRunner
from src.services.deployment_service import DeploymentService
from src.services.git_service import GitService
from src.services.cloudflare_service import CloudflareService
from src.services.file_system_service import FileSystemService


class Orchestrator:
    """
    Routes user commands to the appropriate workflow (AI-driven or deterministic).
    It acts as the main controller of the application.
    """

    def __init__(self, argv: List[str]):
        """Initializes the orchestrator with command-line arguments and services."""
        self.argv = argv
        self.argv = argv
        
        # Determine project path: check for 'website' subdirectory first
        cwd = os.getcwd()
        website_path = os.path.join(cwd, "website")
        if os.path.isdir(website_path):
            self.project_path = website_path
            print(f"Detected 'website' subdirectory. Using project path: {self.project_path}")
        else:
            self.project_path = cwd
            print(f"Using current directory as project path: {self.project_path}")

        # Load configuration from environment variables
        self.cloudflare_api_token = os.getenv("CLOUDFLARE_API_TOKEN")
        self.cloudflare_account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        self.project_name = os.getenv("PROJECT_NAME", "my-website-project")

        # Initialize services once
        self.lm_service = LanguageModelService()
        self.fs_service = FileSystemService()
        self.agent_runner = AgentRunner(
            project_path=self.project_path,
            lm_service=self.lm_service,
            fs_service=self.fs_service
        )
        self.git_service = GitService(repo_path=self.project_path)
        
        self.cloudflare_service = None
        if self.cloudflare_api_token and self.cloudflare_account_id:
            self.cloudflare_service = CloudflareService(
                api_token=self.cloudflare_api_token,
                account_id=self.cloudflare_account_id
            )

        self.deployment_service = DeploymentService(
            agent_runner=self.agent_runner,
            git_service=self.git_service,
            cloudflare_service=self.cloudflare_service,
            project_path=self.project_path,
            project_name=self.project_name
        )
        
        self.planner = Planner(lm_service=self.lm_service, fs_service=self.fs_service)
        self.executor = Executor(project_path=self.project_path, agent_runner=self.agent_runner)


    def run(self) -> None:
        """
        The main execution method. It parses arguments and decides which
        workflow to run.
        """
        parser = argparse.ArgumentParser(description="AI Architect CLI")
        parser.add_argument("--prompt", type=str, help="A 'fuzzy' AI-driven prompt.")
        parser.add_argument("--publish", action="store_true", help="Run a production deployment.")
        parser.add_argument("--preview", action="store_true", help="Run a preview deployment.")

        # If no arguments are given, enter interactive mode
        if len(self.argv) == 1:
            self.interactive_mode()
            return

        args = parser.parse_args(self.argv[1:])

        if args.prompt:
            self.run_ai_workflow(args.prompt)
        elif args.publish:
            self.run_deterministic_workflow("publish")
        elif args.preview:
            self.run_deterministic_workflow("preview")
        else:
            parser.print_help()

    def run_ai_workflow(self, prompt: str):
        """Handles the AI-driven workflow."""
        print("Starting AI-driven workflow...")
        plan = self.planner.generate_plan(prompt, self.project_path)
        self.executor.execute_plan(plan, user_prompt=prompt)

    def run_deterministic_workflow(self, command: str):
        """Handles fixed, deterministic commands."""
        print(f"Starting deterministic workflow: {command}")
        
        if not self.deployment_service or not self.cloudflare_service:
            print("Error: Cloudflare API token and Account ID must be set as environment variables for deployment.")
            return

        if command == "publish":
            self.deployment_service.run_production_deployment()
        elif command == "preview":
            self.deployment_service.run_preview_deployment()
        else:
            print(f"Unknown deterministic command: {command}")

    def interactive_mode(self):
        """Enters an interactive 'chat' mode."""
        print("Entering interactive mode. Type 'exit' to quit.")
        while True:
            try:
                prompt = input("ai-architect> ")
                if prompt.lower() == 'exit':
                    break
                if prompt:
                    self.run_ai_workflow(prompt)
            except KeyboardInterrupt:
                print("\nExiting interactive mode.")
                break
            except EOFError:
                print("\nExiting interactive mode.")
                break

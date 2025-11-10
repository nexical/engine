import argparse
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
        """Initializes the orchestrator with command-line arguments."""
        self.argv = argv
        self.project_path = "."  # Assuming current directory is the project

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
        # Initialize services
        # Using mock LM service for now. Phase 6 includes replacing this.
        lm_service = LanguageModelService()
        fs_service = FileSystemService()
        agent_runner = AgentRunner(
            project_path=self.project_path,
            lm_service=lm_service,
            fs_service=fs_service
        )

        # 1. Planner generates the plan
        planner = Planner(lm_service=lm_service, fs_service=fs_service)
        plan = planner.generate_plan(prompt, self.project_path)

        # 2. Executor executes the plan
        executor = Executor(project_path=self.project_path, agent_runner=agent_runner)
        executor.execute_plan(plan, user_prompt=prompt)

    def run_deterministic_workflow(self, command: str):
        """Handles fixed, deterministic commands."""
        print(f"Starting deterministic workflow: {command}")
        # Initialize services
        lm_service = LanguageModelService()
        fs_service = FileSystemService()
        agent_runner = AgentRunner(
            project_path=self.project_path,
            lm_service=lm_service,
            fs_service=fs_service
        )
        git_service = GitService(repo_path=self.project_path)
        cloudflare_service = CloudflareService(api_token="FAKE_TOKEN")

        deployment_service = DeploymentService(
            agent_runner=agent_runner,
            git_service=git_service,
            cloudflare_service=cloudflare_service,
            project_path=self.project_path
        )

        if command == "publish":
            deployment_service.run_production_deployment()
        elif command == "preview":
            deployment_service.run_preview_deployment()
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

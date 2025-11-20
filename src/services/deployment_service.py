import os
import yaml
from src.services.agent_runner import AgentRunner
from src.services.git_service import GitService
from src.services.cloudflare_service import CloudflareService
from src.agents.base_agent import Project
from src.data_models.plan import Task


class DeploymentService:
    """Handles the hard-coded workflows for --publish and --preview commands."""

    def __init__(
        self,
        agent_runner: AgentRunner,
        git_service: GitService,
        cloudflare_service: CloudflareService,
        project_path: str,
        project_name: str,
    ):
        """Initializes the service with its dependencies."""
        self.agent_runner = agent_runner
        self.git_service = git_service
        self.cloudflare_service = cloudflare_service
        self.project_path = project_path
        self.project_name = project_name
        print("DeploymentService initialized.")

    def _load_deploy_config(self):
        """Loads deployment configuration from .builder/deploy.yml."""
        config_path = os.path.join(self.project_path, ".builder", "deploy.yml")
        if not os.path.exists(config_path):
            print(f"Warning: No deploy.yml found at {config_path}. Using defaults.")
            return {}
        
        try:
            with open(config_path, 'r') as f:
                return yaml.safe_load(f) or {}
        except Exception as e:
            print(f"Error loading deploy.yml: {e}")
            return {}

    def _ensure_project_and_domain(self, project_name: str, domain: str = None):
        """Ensures the Cloudflare project exists and optionally links a domain."""
        if not self.cloudflare_service:
            print("Cloudflare service not available. Skipping project creation.")
            return

        # Check/Create Project
        project = self.cloudflare_service.get_project(project_name)
        if not project:
            print(f"Project '{project_name}' not found. Creating...")
            self.cloudflare_service.create_project(project_name)
        else:
            print(f"Project '{project_name}' exists.")

        # Link Domain
        if domain:
            self.cloudflare_service.add_domain(project_name, domain)

    def _run_deployment(self, environment: str, branch: str, commit_message: str, build_command: str, project_name: str):
        """Generic deployment workflow."""
        print(f"--- Starting {environment.capitalize()} Deployment ---")
        print(f"Target Project: {project_name}")

        # 1. Run compile task
        print("Step 1: Compiling project...")
        compile_task = Task(
            name=f"Compile Project for {environment}",
            agent="CompilerAgent",
            notice=f"Compiling the website for {environment}.",
            params={"command": build_command}
        )
        project = Project(project_path=self.project_path)
        self.agent_runner.run_agent(compile_task, project)
        print("Compilation step complete.")

        # 2. Commit and push
        print("\nStep 2: Committing and pushing changes...")
        self.git_service.commit_and_push(
            branch=branch,
            message=commit_message
        )
        print("Git step complete.")

        # 3. Wait for Cloudflare build
        print(f"\nStep 3: Waiting for Cloudflare deployment to '{environment}'...")
        if self.cloudflare_service:
            self.cloudflare_service.wait_for_build(
                project_name=project_name,
                environment=environment
            )
        else:
            print("Cloudflare service not configured. Skipping wait.")
        print("Cloudflare step complete.")
        
        print(f"\n--- {environment.capitalize()} Deployment Finished ---")

    def run_production_deployment(self, build_command: str = "npm run build") -> None:
        """
        Executes the sequence for a production deployment.
        """
        config = self._load_deploy_config()
        project_name = config.get("project_name", self.project_name)
        domain = config.get("production_domain")

        self._ensure_project_and_domain(project_name, domain)

        self._run_deployment(
            environment="production",
            branch="main",
            commit_message="Deploy: Build and deploy production website",
            build_command=build_command,
            project_name=project_name
        )

    def run_preview_deployment(self, build_command: str = "npm run build") -> None:
        """
        Executes the sequence for a preview deployment.
        """
        config = self._load_deploy_config()
        project_name = config.get("project_name", self.project_name)
        domain = config.get("preview_domain")

        self._ensure_project_and_domain(project_name, domain)

        self._run_deployment(
            environment="preview",
            branch="preview",
            commit_message="Deploy: Build and deploy preview website",
            build_command=build_command,
            project_name=project_name
        )

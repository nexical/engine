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

    def _run_deployment(self, environment: str, branch: str, commit_message: str, build_command: str):
        """Generic deployment workflow."""
        print(f"--- Starting {environment.capitalize()} Deployment ---")

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
        self.cloudflare_service.wait_for_build(
            project_name=self.project_name,
            environment=environment
        )
        print("Cloudflare step complete.")
        
        print(f"\n--- {environment.capitalize()} Deployment Finished ---")

    def run_production_deployment(self, build_command: str = "npm run build") -> None:
        """
        Executes the sequence for a production deployment.
        """
        self._run_deployment(
            environment="production",
            branch="main",
            commit_message="Deploy: Build and deploy production website",
            build_command=build_command
        )

    def run_preview_deployment(self, build_command: str = "npm run build") -> None:
        """
        Executes the sequence for a preview deployment.
        """
        self._run_deployment(
            environment="preview",
            branch="preview",
            commit_message="Deploy: Build and deploy preview website",
            build_command=build_command
        )

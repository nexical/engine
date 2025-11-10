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
    ):
        """Initializes the service with its dependencies."""
        self.agent_runner = agent_runner
        self.git_service = git_service
        self.cloudflare_service = cloudflare_service
        self.project_path = project_path
        print("DeploymentService initialized.")

    def run_production_deployment(self) -> None:
        """
        Executes the sequence for a production deployment:
        run compile task, commit, push, and wait for build.
        """
        print("--- Starting Production Deployment ---")
        
        # 1. Run compile task
        print("Step 1: Compiling project...")
        compile_task = Task(
            name="Compile Project",
            agent="CompilerAgent",
            notice="Compiling the website for production.",
            params={}
        )
        project = Project(project_path=self.project_path)
        # The mock agent runner will just print a message
        self.agent_runner.run_agent(compile_task, project)
        print("Compilation step complete.")

        # 2. Commit and push
        print("\nStep 2: Committing and pushing changes...")
        self.git_service.commit_and_push(
            branch="main",
            message="Deploy: Build and deploy production website"
        )
        print("Git step complete.")

        # 3. Wait for Cloudflare build
        print("\nStep 3: Waiting for Cloudflare deployment...")
        self.cloudflare_service.wait_for_build(
            project_name="my-website-project", # This would be dynamic
            environment="production"
        )
        print("Cloudflare step complete.")
        
        print("\n--- Production Deployment Finished ---")

    def run_preview_deployment(self) -> None:
        """
        Executes the sequence for a preview deployment.
        """
        print("--- Starting Preview Deployment ---")
        
        # 1. Run compile task
        print("Step 1: Compiling project...")
        compile_task = Task(
            name="Compile Project",
            agent="CompilerAgent",
            notice="Compiling the website for preview.",
            params={}
        )
        project = Project(project_path=self.project_path)
        self.agent_runner.run_agent(compile_task, project)
        print("Compilation step complete.")

        # 2. Commit and push to a preview branch
        print("\nStep 2: Committing and pushing changes...")
        self.git_service.commit_and_push(
            branch="preview",
            message="Deploy: Build and deploy preview website"
        )
        print("Git step complete.")

        # 3. Wait for Cloudflare build
        print("\nStep 3: Waiting for Cloudflare deployment...")
        self.cloudflare_service.wait_for_build(
            project_name="my-website-project",
            environment="preview"
        )
        print("Cloudflare step complete.")
        
        print("\n--- Preview Deployment Finished ---")

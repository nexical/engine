class GitService:
    """A wrapper for Git commands."""

    def __init__(self, repo_path: str):
        """Initializes the service with the path to the Git repository."""
        self.repo_path = repo_path
        print(f"GitService initialized for repo: {self.repo_path}")

    def commit_and_push(self, branch: str, message: str) -> None:
        """Commits all changes and pushes to the specified remote branch."""
        print(f"Mock Git: Adding all files in {self.repo_path}")
        print(f"Mock Git: Committing with message: '{message}'")
        print(f"Mock Git: Pushing to branch '{branch}'")
        print("Mock Git: Commit and push successful.")

import subprocess
import os

class GitService:
    """A wrapper for Git commands using the subprocess module."""

    def __init__(self, repo_path: str):
        """
        Initializes the service with the path to the Git repository.
        """
        if not os.path.isdir(os.path.join(repo_path, '.git')):
            raise ValueError(f"'{repo_path}' is not a valid Git repository.")
        self.repo_path = repo_path
        print(f"GitService initialized for repo: {self.repo_path}")

    def _run_git_command(self, command: list[str]):
        """A helper to run a Git command and handle errors."""
        try:
            result = subprocess.run(
                ['git'] + command,
                cwd=self.repo_path,
                check=True,
                capture_output=True,
                text=True
            )
            print(result.stdout)
            return result
        except subprocess.CalledProcessError as e:
            print(f"Error executing Git command: {' '.join(command)}")
            print(f"Stderr: {e.stderr}")
            print(f"Stdout: {e.stdout}")
            raise

    def add_all(self):
        """Stages all changes in the repository."""
        print("Staging all changes...")
        self._run_git_command(['add', '.'])

    def commit(self, message: str):
        """Commits the staged changes."""
        print(f"Committing with message: '{message}'")
        self._run_git_command(['commit', '-m', message])

    def push(self, branch: str, remote: str = 'origin'):
        """Pushes the commits to the specified remote branch."""
        print(f"Pushing to remote '{remote}' branch '{branch}'...")
        self._run_git_command(['push', remote, branch])

    def commit_and_push(self, branch: str, message: str, remote: str = 'origin') -> None:
        """Adds all changes, commits, and pushes to the specified remote branch."""
        self.add_all()
        self.commit(message)
        self.push(branch, remote)
        print("Commit and push successful.")

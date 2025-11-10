import os

class FileSystemService:
    """A helper for all file system I/O operations."""

    def read_file(self, file_path: str) -> str:
        """Reads the content of a file and returns it as a string."""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                return f.read()
        except FileNotFoundError:
            return ""

    def write_file(self, file_path: str, content: str) -> None:
        """Writes content to a specified file."""
        os.makedirs(os.path.dirname(file_path), exist_ok=True)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(content)

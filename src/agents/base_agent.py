from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any

from src.data_models.plan import Task


@dataclass
class Project:
    """Represents the state of the user's project."""
    project_path: str
    # In a real implementation, this would be a more complex object
    # representing the project's state. For now, it's just the path.


class BaseAgent(ABC):
    """
    An abstract base class that all specialist agents must inherit from.
    It ensures a consistent interface for the Executor.
    """

    @abstractmethod
    def execute(self, task: Task, project: Project) -> Project:
        """
        The primary method for an agent. It takes a task and the project state,
        performs an action, and returns the (potentially modified) project state.
        """
        pass

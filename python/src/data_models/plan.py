import yaml
from dataclasses import dataclass, field
from typing import Any, Dict, List

@dataclass
class Task:
    """A data class representing a single step in a plan."""
    name: str
    agent: str
    notice: str
    params: Dict[str, Any] = field(default_factory=dict)

@dataclass
class Plan:
    """A data class that contains a list of Task objects."""
    plan_name: str
    tasks: List[Task]

    def to_yaml(self) -> str:
        """Serializes the plan to a YAML string."""
        # Custom representer for dataclasses
        def dataclass_representer(dumper, data):
            return dumper.represent_dict(data.__dict__)
        
        yaml.add_representer(self.__class__, dataclass_representer)
        yaml.add_representer(Task, dataclass_representer)

        return yaml.dump(self)

    @classmethod
    def from_yaml(cls, yaml_string: str) -> "Plan":
        """A class method to create a Plan instance from a YAML string."""
        data = yaml.safe_load(yaml_string)
        tasks_data = data.get("tasks", [])
        tasks = [Task(**task_data) for task_data in tasks_data]
        return cls(plan_name=data["plan_name"], tasks=tasks)

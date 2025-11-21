from src.data_models.plan import Plan
from src.services.agent_runner import AgentRunner
from src.agents.base_agent import Project


class Executor:
    """
    A non-AI workflow engine that iterates through tasks in a Plan
    and uses the AgentRunner service to execute them.
    """

    def __init__(self, project_path: str, agent_runner: AgentRunner):
        """Initializes the executor."""
        self.project_path = project_path
        self.agent_runner = agent_runner

    def execute_plan(self, plan: Plan, user_prompt: str) -> None:
        """
        Loops through the tasks in the plan and calls the agent_runner
        to execute each one.
        """
        print(f"Executing plan: {plan.plan_name}")
        project = Project(project_path=self.project_path)
        for task in plan.tasks:
            project = self.agent_runner.run_agent(task, project, user_prompt)
        print("Plan execution complete.")

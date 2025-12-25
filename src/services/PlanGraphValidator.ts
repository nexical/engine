import { Plan } from '../domain/Plan.js';
import { Result } from '../domain/Result.js';
import { ISkillContext } from '../domain/SkillConfig.js';

// eslint-disable-next-line @typescript-eslint/require-await
export const PlanGraphValidator = async (context: ISkillContext): Promise<Result<boolean, Error>> => {
  const yamlContent = context['executionResult'] as string;
  if (!yamlContent) {
    return Result.fail(new Error('No execution result found in context for validation'));
  }

  try {
    const plan = Plan.fromYaml(yamlContent);

    // Perform Graph Validation
    validateDependenciesExist(plan);
    validateAcyclic(plan);

    return Result.ok(true);
  } catch (e) {
    return Result.fail(e instanceof Error ? e : new Error(String(e)));
  }
};

function validateAcyclic(plan: Plan): void {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  const tasks = plan.tasks;
  const taskMap = new Map(tasks.map((t) => [t.id, t]));

  function visit(taskId: string): void {
    if (recursionStack.has(taskId)) {
      throw new Error(`Cycle detected involving task ${taskId}`);
    }
    if (visited.has(taskId)) return;

    visited.add(taskId);
    recursionStack.add(taskId);

    const task = taskMap.get(taskId);
    if (task && task.dependencies) {
      for (const depId of task.dependencies) {
        visit(depId);
      }
    }

    recursionStack.delete(taskId);
  }

  for (const task of tasks) {
    if (!visited.has(task.id)) {
      visit(task.id);
    }
  }
}

function validateDependenciesExist(plan: Plan): void {
  const ids = new Set(plan.tasks.map((t) => t.id));
  for (const task of plan.tasks) {
    if (task.dependencies) {
      for (const depId of task.dependencies) {
        if (!ids.has(depId)) {
          throw new Error(`Task ${task.id} depends on non-existent task ${depId}`);
        }
      }
    }
  }
}

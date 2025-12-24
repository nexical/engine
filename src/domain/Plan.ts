import yaml from 'js-yaml';
import { z } from 'zod';

import { Task, TaskSchema } from './Task.js';

export const PlanSchema = z.object({
  plan_name: z.string(),
  tasks: z.array(TaskSchema),
});

export class Plan {
  public plan_name: string;
  public tasks: Task[];

  constructor(plan_name: string, tasks: Task[] = []) {
    this.plan_name = plan_name;
    this.tasks = tasks;
  }

  addTask(task: Task): void {
    this.tasks.push(task);
  }

  getTask(id: string): Task | undefined {
    return this.tasks.find((t) => t.id === id);
  }

  toYaml(): string {
    return yaml.dump(this);
  }

  static fromYaml(yamlString: string): Plan {
    const data = yaml.load(yamlString);
    const validated = PlanSchema.parse(data);
    return new Plan(
      validated.plan_name,
      validated.tasks.map((t: unknown) => Task.fromData(t)),
    );
  }

  /**
   * Returns tasks organized into layers.
   * Tasks in the same layer can be executed in parallel.
   * Tasks in layer N depend only on tasks in layers 0..N-1.
   */
  getExecutionLayers(): Task[][] {
    const layers: Task[][] = [];
    let pending = [...this.tasks];
    const completedIds = new Set<string>();

    while (pending.length > 0) {
      // Find tasks whose dependencies are all met
      const layer = pending.filter((task) => {
        if (!task.dependencies || task.dependencies.length === 0) {
          return true;
        }
        return task.dependencies.every((depId) => completedIds.has(depId));
      });

      if (layer.length === 0) {
        // Cycle detected or missing explicit dependency
        // In a real-world scenario, we might want to throw or handle this gracefully.
        // For now, if we can't resolve any more tasks effectively, we'll just push the rest as a sequential layer or throw.
        // Let's assume sequential fallback for the remainder to avoid infinite loops if the graph is bad.
        layers.push(pending);
        break;
      }

      layers.push(layer);

      // Update state for next iteration
      layer.forEach((t) => completedIds.add(t.id));
      pending = pending.filter((t) => !completedIds.has(t.id));
    }

    return layers;
  }
}

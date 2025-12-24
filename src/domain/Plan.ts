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
}

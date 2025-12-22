import { Task, TaskSchema } from './Task.js';
import yaml from 'js-yaml';
import { z } from 'zod';

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
        return this.tasks.find(t => t.id === id);
    }

    toYaml(): string {
        return yaml.dump(this);
    }

    static fromYaml(yamlString: string): Plan {
        const data = yaml.load(yamlString) as any;
        const validated = PlanSchema.parse(data);
        const tasks = validated.tasks.map((t: any) => Task.fromData(t));
        return new Plan(validated.plan_name, tasks);
    }
}

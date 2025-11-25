import { Task } from './Task.js';
import yaml from 'js-yaml';

export interface Plan {
    plan_name: string;
    tasks: Task[];
}

export class PlanUtils {
    static toYaml(plan: Plan): string {
        return yaml.dump(plan);
    }

    static fromYaml(yamlString: string): Plan {
        const data = yaml.load(yamlString) as any;
        return {
            plan_name: data.plan_name,
            tasks: data.tasks || [],
        };
    }
}

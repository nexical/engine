import { z } from 'zod';

export const TaskSchema = z.object({
    id: z.string().optional(),
    description: z.string(),
    message: z.string(),
    skill: z.string(),
    persona: z.string().optional(),
    dependencies: z.array(z.string()).optional(),
    params: z.record(z.string(), z.any()).optional(),
});

export class Task {
    public id: string;
    public message: string;
    public description: string;
    public skill: string;
    public persona?: string;
    public params?: Record<string, any>;
    public dependencies?: string[];

    constructor(
        id: string,
        message: string,
        description: string,
        skill: string,
        persona?: string,
        params?: Record<string, any>,
        dependencies?: string[]
    ) {
        this.id = id;
        this.message = message;
        this.description = description;
        this.skill = skill;
        this.persona = persona;
        this.params = params;
        this.dependencies = dependencies;
    }

    static fromData(data: any): Task {
        const validated = TaskSchema.parse(data);
        return new Task(
            validated.id || `task-${Math.random().toString(36).substr(2, 9)}`,
            validated.message,
            validated.description,
            validated.skill,
            validated.persona,
            validated.params,
            validated.dependencies
        );
    }
}

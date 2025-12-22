import { TaskSchema } from '../utils/validation.js';

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
            (data as any).persona, // persona not in schema yet, will add
            validated.params,
            validated.dependencies
        );
    }
}

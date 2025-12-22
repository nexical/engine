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
        return new Task(
            data.id,
            data.message,
            data.description,
            data.skill,
            data.persona,
            data.params,
            data.dependencies
        );
    }
}

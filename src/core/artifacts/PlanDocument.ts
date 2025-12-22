import yaml from 'js-yaml';

export class PlanDocument {
    public tasks: any[] = [];

    constructor(data?: any) {
        if (data) {
            this.tasks = data.tasks || [];
        }
    }

    static fromYaml(content: string): PlanDocument {
        const data = yaml.load(content);
        return new PlanDocument(data);
    }

    toYaml(): string {
        return yaml.dump({ tasks: this.tasks });
    }
}

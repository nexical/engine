export interface Task {
    id: string;
    message: string;
    description: string;
    skill: string;
    persona?: string;
    params?: Record<string, any>;
    dependencies?: string[];
}

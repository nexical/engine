export interface Task {
    id: string;
    message: string;
    description: string;
    agent: string;
    persona?: string;
    params?: Record<string, any>;
    dependencies?: string[];
}

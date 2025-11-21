export interface Task {
    id: string;
    name: string;
    agent: string;
    notice: string;
    params: Record<string, any>;
    dependencies?: string[];
}

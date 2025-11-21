export interface Task {
    name: string;
    agent: string;
    notice: string;
    params: Record<string, any>;
}

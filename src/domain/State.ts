import { Signal } from '../workflow/Signal.js';
import yaml from 'js-yaml';

export type OrchestratorStatus = 'IDLE' | 'ARCHITECTING' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';

export class EngineState {
    public session_id: string;
    public status: OrchestratorStatus;
    public current_plan?: string;
    public loop_count: number;
    public tasks: {
        completed: string[];
        failed: string[];
        pending: string[];
    };
    public last_signal?: Signal;
    public user_prompt: string = "";

    constructor(session_id: string) {
        this.session_id = session_id;
        this.status = 'IDLE';
        this.loop_count = 0;
        this.tasks = {
            completed: [],
            failed: [],
            pending: []
        };
        this.user_prompt = "";
    }

    updateStatus(status: OrchestratorStatus): void {
        this.status = status;
    }

    incrementLoop(): void {
        this.loop_count++;
    }

    resetLoop(): void {
        this.loop_count = 0;
    }

    recordSignal(signal: Signal): void {
        this.last_signal = signal;
    }

    completeTask(taskId: string): void {
        if (!this.tasks.completed.includes(taskId)) {
            this.tasks.completed.push(taskId);
        }
    }

    static fromYaml(yamlString: string): EngineState {
        const data = yaml.load(yamlString) as any;
        const state = new EngineState(data.session_id);
        state.status = data.status;
        state.current_plan = data.current_plan;
        state.loop_count = data.loop_count;
        if (data.tasks) {
            state.tasks = data.tasks;
        }
        state.last_signal = data.last_signal;
        state.user_prompt = data.user_prompt || "";
        return state;
    }

    toYaml(): string {
        return yaml.dump(this);
    }
}

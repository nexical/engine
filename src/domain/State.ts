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
    public interactive: boolean = false;
    public context: Record<string, unknown> = {};

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
        this.context = {};
    }

    public initialize(prompt: string, interactive: boolean = false): void {
        this.user_prompt = prompt;
        this.interactive = interactive;
        this.status = 'IDLE';
        this.loop_count = 0;
        this.tasks.failed = [];
        this.context = {};
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
        const data = yaml.load(yamlString) as Record<string, any>;
        if (!data || typeof data !== 'object') {
            throw new Error("Invalid state YAML");
        }

        const session_id = data.session_id || 'unknown';
        const state = new EngineState(session_id);

        if (data.status) state.status = data.status as OrchestratorStatus;
        if (data.current_plan) state.current_plan = data.current_plan;
        if (typeof data.loop_count === 'number') state.loop_count = data.loop_count;

        if (data.tasks) {
            state.tasks = {
                completed: Array.isArray(data.tasks.completed) ? data.tasks.completed : [],
                failed: Array.isArray(data.tasks.failed) ? data.tasks.failed : [],
                pending: Array.isArray(data.tasks.pending) ? data.tasks.pending : []
            };
        }

        if (data.last_signal) {
            state.last_signal = data.last_signal as Signal;
        }

        state.user_prompt = data.user_prompt || "";
        state.interactive = data.interactive || false;
        state.context = data.context || {};

        return state;
    }

    toYaml(): string {
        return yaml.dump(this);
    }
}

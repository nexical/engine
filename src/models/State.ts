export type OrchestratorStatus = 'IDLE' | 'ARCHITECTING' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';
import yaml from 'js-yaml';

export type SignalType = 'REPLAN' | 'REARCHITECT';

export interface Signal {
    type: SignalType;
    source: string;
    reason: string;
    timestamp: string;
    invalidates_previous_work?: boolean;
}

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

    constructor(session_id: string) {
        this.session_id = session_id;
        this.status = 'IDLE';
        this.loop_count = 0;
        this.tasks = {
            completed: [],
            failed: [],
            pending: []
        };
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
        state.tasks = data.tasks || { completed: [], failed: [], pending: [] };
        state.last_signal = data.last_signal;
        return state;
    }

    toYaml(): string {
        return yaml.dump(this);
    }
}

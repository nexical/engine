export type OrchestratorState = 'IDLE' | 'ARCHITECTING' | 'PLANNING' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';

export interface ExecutionState {
    session_id: string;
    status: OrchestratorState;
    current_plan?: string;
    loop_count: number;
    tasks: {
        completed: string[];
        failed: string[];
        pending: string[];
    };
    last_signal?: Signal;
}

export type SignalType = 'REPLAN' | 'REARCHITECT';

export interface Signal {
    type: SignalType;
    source: string;
    reason: string;
    timestamp: string;
    invalidates_previous_work?: boolean;
}

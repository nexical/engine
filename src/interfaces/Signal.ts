export type SignalType = 'REPLAN' | 'REARCHITECT';

export interface Signal {
    type: SignalType;
    source: string;
    reason: string;
    timestamp: string;
    invalidates_previous_work?: boolean;
}

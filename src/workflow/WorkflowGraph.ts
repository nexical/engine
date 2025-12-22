import { Signal, SignalType } from './Signal.js';

export interface Transition {
    trigger: SignalType;
    target: string;
}

export interface StateDefinition {
    name: string;
    transitions: Transition[];
}

export interface WorkflowConfig {
    initialState: string;
    states: StateDefinition[];
}

export class WorkflowGraph {
    private config: WorkflowConfig;
    private transitionMap: Map<string, Map<SignalType, string>>;

    constructor(config: WorkflowConfig) {
        this.config = config;
        this.transitionMap = new Map();
        this.validateAndBuild();
    }

    private validateAndBuild() {
        for (const stateDef of this.config.states) {
            const map = new Map<SignalType, string>();
            for (const trans of stateDef.transitions) {
                map.set(trans.trigger, trans.target);
            }
            this.transitionMap.set(stateDef.name, map);
        }
    }

    public getNextState(currentStateName: string, signal: Signal): string | undefined {
        const stateTransitions = this.transitionMap.get(currentStateName);
        if (!stateTransitions) return undefined;

        return stateTransitions.get(signal.type);
    }

    public getInitialState(): string {
        return this.config.initialState;
    }
}

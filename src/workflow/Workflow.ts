import { Signal, SignalType } from './Signal.js';
import { State } from './states/State.js';
import { ArchitectingState } from './states/ArchitectingState.js';
import { PlanningState } from './states/PlanningState.js';
import { ExecutingState } from './states/ExecutingState.js';
import { CompletedState } from './states/CompletedState.js';
import { Project } from '../domain/Project.js';
import { Brain } from '../agents/Brain.js';
import { Workspace } from '../domain/Workspace.js';
import { RuntimeHost } from '../common/interfaces/RuntimeHost.js';
import { EngineState, OrchestratorStatus } from '../domain/State.js';

export class Workflow {
    private currentState: State;
    private states: Map<string, State>;

    constructor(
        private brain: Brain,
        private project: Project,
        private workspace: Workspace,
        private host: RuntimeHost
    ) {
        // Initialize States
        this.states = new Map();
        this.states.set('ARCHITECTING', new ArchitectingState(brain, project, workspace));
        this.states.set('PLANNING', new PlanningState(brain, project, workspace));
        this.states.set('EXECUTING', new ExecutingState(brain, project, workspace));
        this.states.set('COMPLETED', new CompletedState(brain, project, workspace));

        // Default start state
        this.currentState = this.states.get('ARCHITECTING')!;
    }

    public async start(state: EngineState): Promise<void> {
        this.currentState = this.states.get('ARCHITECTING')!;

        while (true) {
            this.host.log('info', `[Workflow] Enter State: ${this.currentState.name}`);
            state.updateStatus(this.currentState.name as OrchestratorStatus);

            const signal = await this.currentState.run(state);
            this.host.log('debug', `[Workflow] Signal Received: ${signal.type}`);

            if (signal.type === SignalType.FAIL) {
                this.host.log('error', `Workflow Failed: ${signal.reason}`);
                state.updateStatus('FAILED');
                break;
            }

            if (signal.type === SignalType.COMPLETE && this.currentState.name === 'COMPLETED') {
                this.host.log('info', "Workflow Finished Successfully.");
                break;
            }

            // State Transition Logic
            this.currentState = this.getNextState(this.currentState, signal);

            if (!this.currentState) {
                this.host.log('error', "No valid next state found.");
                break;
            }
        }
    }

    private getNextState(current: State, signal: Signal): State {
        if (current.name === 'ARCHITECTING') {
            if (signal.type === SignalType.NEXT) return this.states.get('PLANNING')!;
        }
        else if (current.name === 'PLANNING') {
            if (signal.type === SignalType.NEXT) return this.states.get('EXECUTING')!;
        }
        else if (current.name === 'EXECUTING') {
            if (signal.type === SignalType.COMPLETE) return this.states.get('COMPLETED')!;
            // Future: Handle REARCHITECT -> ARCHITECTING
            // Future: Handle REPLAN -> PLANNING
        }

        // Fallback or terminal
        if (signal.type === SignalType.COMPLETE) return this.states.get('COMPLETED')!;

        throw new Error(`Invalid Transition: ${current.name} -> ${signal.type}`);
    }
}

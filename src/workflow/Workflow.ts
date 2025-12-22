import { Signal, SignalType } from './Signal.js';
import { State } from './states/State.js';
import { ArchitectingState } from './states/ArchitectingState.js';
import { PlanningState } from './states/PlanningState.js';
import { ExecutingState } from './states/ExecutingState.js';
import { CompletedState } from './states/CompletedState.js';
import { Project } from '../domain/Project.js';
import { Brain } from '../agents/Brain.js';
import { Workspace } from '../domain/Workspace.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
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
        this.states.set('ARCHITECTING', new ArchitectingState(brain, project, workspace, host));
        this.states.set('PLANNING', new PlanningState(brain, project, workspace, host));
        this.states.set('EXECUTING', new ExecutingState(brain, project, workspace, host));
        this.states.set('COMPLETED', new CompletedState(brain, project, workspace, host));

        // Default start state
        this.currentState = this.states.get('ARCHITECTING')!;
    }

    public async start(state: EngineState, onStateChange?: () => Promise<void>): Promise<void> {
        this.currentState = this.states.get(state.status === 'IDLE' ? 'ARCHITECTING' : state.status as string) || this.states.get('ARCHITECTING')!;

        while (true) {
            // Retry/Loop protection: Check before entering state
            if (state.loop_count > 10) {
                this.host.log('error', "Maximum retry limit reached (10 loops). Failing workflow.");
                state.updateStatus('FAILED');
                break;
            }

            this.host.log('info', `[Workflow] Enter State: ${this.currentState.name} (Loop: ${state.loop_count})`);
            state.updateStatus(this.currentState.name as OrchestratorStatus);
            if (onStateChange) await onStateChange();

            const signal = await this.currentState.run(state);
            this.host.log('debug', `[Workflow] Signal Received: ${signal.type}`);

            // Record Signal in Evolution Log if it's a departure from normal flow
            if ([SignalType.FAIL, SignalType.REPLAN, SignalType.REARCHITECT].includes(signal.type)) {
                await this.brain.getEvolution().recordFailure(this.currentState.name, signal, state.tasks.completed);
                state.incrementLoop();
            }

            if (signal.type === SignalType.FAIL) {
                this.host.log('error', `Workflow Failed: ${signal.reason}`);
                state.updateStatus('FAILED');
                break;
            }

            if (signal.type === SignalType.COMPLETE && this.currentState.name === 'COMPLETED') {
                this.host.log('info', "Workflow Finished Successfully.");
                state.resetLoop();
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
            if (signal.type === SignalType.REARCHITECT) return this.states.get('ARCHITECTING')!;
        }
        else if (current.name === 'PLANNING') {
            if (signal.type === SignalType.NEXT) return this.states.get('EXECUTING')!;
            if (signal.type === SignalType.REPLAN) return this.states.get('PLANNING')!;
            if (signal.type === SignalType.REARCHITECT) return this.states.get('ARCHITECTING')!;
        }
        else if (current.name === 'EXECUTING') {
            if (signal.type === SignalType.COMPLETE) return this.states.get('COMPLETED')!;
            if (signal.type === SignalType.REPLAN) return this.states.get('PLANNING')!;
            if (signal.type === SignalType.REARCHITECT) return this.states.get('ARCHITECTING')!;
        }

        // Fallback or terminal
        if (signal.type === SignalType.COMPLETE) return this.states.get('COMPLETED')!;

        throw new Error(`Invalid Transition: ${current.name} -> ${signal.type}`);
    }
}

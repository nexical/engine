import { Signal, SignalType } from './Signal.js';
import { State } from './states/State.js';
import { ArchitectingState } from './states/ArchitectingState.js';
import { PlanningState } from './states/PlanningState.js';
import { ExecutingState } from './states/ExecutingState.js';
import { CompletedState } from './states/CompletedState.js';
import { IProject } from '../domain/Project.js';
import { Brain } from '../agents/Brain.js';
import { IWorkspace } from '../domain/Workspace.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { EngineState, OrchestratorStatus } from '../domain/State.js';
import { WorkflowGraph, WorkflowConfig, DefaultWorkflowConfig } from './WorkflowGraph.js';

export class Workflow {
    private currentState: State;
    private states: Map<string, State>;
    private graph: WorkflowGraph;

    constructor(
        private brain: Brain,
        private project: IProject,
        private workspace: IWorkspace,
        private host: RuntimeHost,
        config: WorkflowConfig = DefaultWorkflowConfig
    ) {
        // Initialize States
        this.states = new Map();
        this.registerDefaultStates();

        this.graph = new WorkflowGraph(config);

        // Default start state (will be overridden by resume or start args)
        this.currentState = this.states.get(this.graph.getInitialState())!;
    }

    private registerDefaultStates(): void {
        this.registerState(new ArchitectingState(this.brain, this.project, this.workspace, this.host));
        this.registerState(new PlanningState(this.brain, this.project, this.workspace, this.host));
        this.registerState(new ExecutingState(this.brain, this.project, this.workspace, this.host));
        this.registerState(new CompletedState(this.brain, this.project, this.workspace, this.host));
    }

    public registerState(state: State): void {
        this.states.set(state.name, state);
    }

    public async start(state: EngineState, onStateChange?: () => Promise<void>): Promise<void> {
        // RESUME LOGIC: Check if we are resuming from a valid state on disk
        // Ideally Orchestrator decides this, but here we enforce state continuity.
        if (state.status !== 'IDLE') {
            const stateName = state.status as string;
            const restoredState = this.states.get(stateName);
            if (restoredState) {
                this.currentState = restoredState;
                this.host.log('info', `[Workflow] Resuming from state: ${stateName}`);
            }
        } else {
            this.currentState = this.states.get(this.graph.getInitialState())!;
        }

        while (true) {
            // Retry/Loop protection: Check before entering state
            if (state.loop_count > 10) {
                this.host.log('error', "Maximum retry limit reached (10 loops). Failing workflow.");
                state.updateStatus('FAILED');
                await this.workspace.saveState(state);
                break;
            }

            this.host.log('info', `[Workflow] Enter State: ${this.currentState.name} (Loop: ${state.loop_count})`);
            this.host.emit('state:enter', { state: this.currentState.name, loop: state.loop_count });
            state.updateStatus(this.currentState.name as OrchestratorStatus);
            await this.workspace.saveState(state);

            if (onStateChange) await onStateChange();

            let signal: Signal;
            try {
                signal = await this.currentState.run(state);
            } catch (error) {
                this.host.emit('error', { state: this.currentState.name, error: (error as Error).message });
                const errorTarget = this.graph.getErrorTarget(this.currentState.name);
                if (errorTarget) {
                    this.host.log('warn', `Error in ${this.currentState.name}. Recovering to ${errorTarget}.`);
                    const nextState = this.states.get(errorTarget);
                    if (nextState) {
                        this.currentState = nextState;
                        continue;
                    }
                }
                // No recovery found, bubble up as failure signal
                signal = Signal.fail(`Unhandled error in ${this.currentState.name}: ${(error as Error).message}`);
            }

            this.host.log('debug', `[Workflow] Signal Received: ${signal.type}`);
            this.host.emit('signal', { type: signal.type, reason: signal.reason, state: this.currentState.name });
            state.recordSignal(signal);
            await this.workspace.saveState(state);

            // Record Signal in Evolution Log if it's a departure from normal flow
            if ([SignalType.FAIL, SignalType.REPLAN, SignalType.REARCHITECT].includes(signal.type)) {
                await this.brain.getEvolution().recordFailure(this.currentState.name, signal, state.tasks.completed);
                state.incrementLoop();
                await this.workspace.saveState(state);
            }

            if (signal.type === SignalType.FAIL) {
                this.host.log('error', `Workflow Failed: ${signal.reason}`);
                state.updateStatus('FAILED');
                await this.workspace.saveState(state);
                break;
            }

            if (signal.type === SignalType.COMPLETE && this.currentState.name === 'COMPLETED') {
                this.host.log('info', "Workflow Finished Successfully.");
                state.resetLoop();
                this.host.emit('workflow:complete', {});
                await this.workspace.saveState(state);
                break;
            }

            // State Transition Logic (Graph Based)
            const nextStateName = this.graph.getNextState(this.currentState.name, signal);

            if (nextStateName) {
                const nextState = this.states.get(nextStateName);
                if (nextState) {
                    this.currentState = nextState;
                    continue;
                }
            } else if (signal.type === SignalType.COMPLETE) {
                // Implicit fallback if not in graph, though better to be explicit
                const completed = this.states.get('COMPLETED');
                if (completed) {
                    this.currentState = completed;
                    continue;
                }
            }

            // If we get here, no transition found
            this.host.log('error', `No valid next state found for ${this.currentState.name} -> ${signal.type}`);
            state.updateStatus('FAILED');
            await this.workspace.saveState(state);
            break;
        }
    }
}

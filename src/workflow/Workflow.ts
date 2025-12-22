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
import { WorkflowGraph, WorkflowConfig } from './WorkflowGraph.js';

export class Workflow {
    private currentState: State;
    private states: Map<string, State>;
    private graph: WorkflowGraph;

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

        // Define Default Graph (Can become config later)
        const defaultConfig: WorkflowConfig = {
            initialState: 'ARCHITECTING',
            states: [
                {
                    name: 'ARCHITECTING',
                    transitions: [
                        { trigger: SignalType.NEXT, target: 'PLANNING' },
                        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' }
                    ]
                },
                {
                    name: 'PLANNING',
                    transitions: [
                        { trigger: SignalType.NEXT, target: 'EXECUTING' },
                        { trigger: SignalType.REPLAN, target: 'PLANNING' },
                        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' }
                    ]
                },
                {
                    name: 'EXECUTING',
                    transitions: [
                        { trigger: SignalType.COMPLETE, target: 'COMPLETED' },
                        { trigger: SignalType.REPLAN, target: 'PLANNING' },
                        { trigger: SignalType.REARCHITECT, target: 'ARCHITECTING' }
                    ]
                }
            ]
        };
        this.graph = new WorkflowGraph(defaultConfig);

        // Default start state (will be overridden by resume or start args)
        this.currentState = this.states.get(this.graph.getInitialState())!;
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
            state.updateStatus(this.currentState.name as OrchestratorStatus);
            await this.workspace.saveState(state);

            if (onStateChange) await onStateChange();

            const signal = await this.currentState.run(state);
            this.host.log('debug', `[Workflow] Signal Received: ${signal.type}`);
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

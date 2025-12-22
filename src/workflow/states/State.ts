import { Signal } from '../Signal.js';
import { Brain } from '../../agents/Brain.js';
import { Project } from '../../domain/Project.js';
import { Workspace } from '../../domain/Workspace.js';
import { EngineState } from '../../domain/State.js';

export abstract class State {
    constructor(
        protected brain: Brain,
        protected project: Project,
        protected workspace: Workspace
    ) { }

    abstract get name(): string;

    /**
     * Executes the logic for this state.
     * @param state The current runtime engine state (mutable).
     * @returns A Promise resolving to a Signal indicating the next transition.
     */
    abstract run(state: EngineState): Promise<Signal>;
}

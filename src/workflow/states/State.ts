import { Signal } from '../Signal.js';
import { Brain } from '../../core/brain/Brain.js';
import { Project } from '../../core/domain/Project.js';
import { Workspace } from '../../core/domain/Workspace.js';
import { EngineState } from '../../models/State.js';

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

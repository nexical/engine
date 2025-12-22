import { Signal } from '../Signal.js';
import { Brain } from '../../agents/Brain.js';
import { Project } from '../../domain/Project.js';
import { Workspace } from '../../domain/Workspace.js';
import { EngineState } from '../../domain/State.js';
import { RuntimeHost } from '../../domain/RuntimeHost.js';

export abstract class State {
    constructor(
        protected brain: Brain,
        protected project: Project,
        protected workspace: Workspace,
        protected host: RuntimeHost
    ) { }

    abstract get name(): string;

    /**
     * Executes the logic for this state.
     * @param state The current runtime engine state (mutable).
     * @returns A Promise resolving to a Signal indicating the next transition.
     */
    abstract run(state: EngineState): Promise<Signal>;

    /**
     * Helper to ask for user approval if in interactive mode.
     * @param message The message to show to the user.
     * @param onFailSignal The signal to return if rejected.
     * @param onReplanSignal The signal to return if feedback is given.
     * @returns A Signal if interaction occurred, or null to continue.
     */
    protected async askApproval(
        state: EngineState,
        message: string,
        onFailSignal: Signal,
        onReplanSignal: (feedback: string) => Signal
    ): Promise<Signal | null> {
        if (!state.interactive) return null;

        const response = await this.host.ask(message);
        if (typeof response === 'string' && response.toLowerCase() !== 'yes') {
            return onReplanSignal(response);
        } else if (response === false) {
            return onFailSignal;
        }
        return null;
    }
}

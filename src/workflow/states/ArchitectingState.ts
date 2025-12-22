import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../models/State.js'; // Updated path
import { ArchitectAgent } from '../../core/agents/ArchitectAgent.js'; // Updated path

export class ArchitectingState extends State {
    get name(): string {
        return 'ARCHITECTING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            const architect = new ArchitectAgent(this.brain, this.project, this.workspace);
            await architect.design(state.user_prompt);
            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Architecture failed: ${(error as Error).message}`);
        }
    }
}

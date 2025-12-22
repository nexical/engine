import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../domain/State.js';
import { DeveloperAgent } from '../../agents/DeveloperAgent.js';

export class ExecutingState extends State {
    get name(): string {
        return 'EXECUTING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            const developer = new DeveloperAgent(this.brain, this.project);
            await developer.execute(state);
            return Signal.COMPLETE;
        } catch (error) {
            // Check if error is a Signal (future improvement for interrupts)
            return Signal.fail(`Execution failed: ${(error as Error).message}`);
        }
    }
}

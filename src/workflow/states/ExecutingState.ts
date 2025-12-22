import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../domain/State.js';
import { DeveloperAgent } from '../../agents/DeveloperAgent.js';
import { SignalDetectedError } from '../../errors/SignalDetectedError.js';

export class ExecutingState extends State {
    get name(): string {
        return 'EXECUTING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            const developer = this.brain.createDeveloper(this.workspace);
            await developer.execute(state);
            return Signal.COMPLETE;
        } catch (error) {
            if (error instanceof SignalDetectedError) {
                return error.signal;
            }
            return Signal.fail(`Execution failed: ${(error as Error).message}`);
        }
    }
}

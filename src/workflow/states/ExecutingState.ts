import { EngineState } from '../../domain/State.js';
import { SignalDetectedError } from '../../errors/SignalDetectedError.js';
import { Signal } from '../Signal.js';
import { State } from './State.js';

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

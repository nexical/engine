import { EngineState } from '../../domain/State.js';
import { Signal } from '../Signal.js';
import { State } from './State.js';

export class CompletedState extends State {
  get name(): string {
    return 'COMPLETED';
  }

  async run(_state: EngineState): Promise<Signal> {
    // Nothing to do
    return await Promise.resolve(Signal.COMPLETE);
  }
}

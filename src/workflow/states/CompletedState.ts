import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../domain/State.js';

export class CompletedState extends State {
    get name(): string {
        return 'COMPLETED';
    }

    async run(state: EngineState): Promise<Signal> {
        // Nothing to do
        return Signal.COMPLETE;
    }
}

import { RuntimeContext } from './RuntimeContext.js';
import { EngineState } from '../../domain/State.js';

export interface Agent {
    readonly name: string;
    readonly description: string;
    run(context: RuntimeContext, state: EngineState): Promise<void>;
}

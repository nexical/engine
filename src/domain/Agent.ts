import { RuntimeContext } from './RuntimeContext.js';
import { EngineState } from './State.js';

export interface Agent {
    readonly name: string;
    readonly description: string;
    run(context: RuntimeContext, state: EngineState): Promise<void>;
}

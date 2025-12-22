import { RuntimeContext } from '../interfaces/RuntimeContext.js';
import { EngineState } from '../models/State.js';

export interface Agent {
    readonly name: string;
    readonly description: string;
    run(context: RuntimeContext, state: EngineState): Promise<void>;
}

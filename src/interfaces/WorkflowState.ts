import { RuntimeContext } from '../interfaces/RuntimeContext.js';
import { EngineState } from '../models/State.js';

export interface WorkflowState {
    name: string;
    execute(context: RuntimeContext, state: EngineState): Promise<WorkflowState | null>;
}

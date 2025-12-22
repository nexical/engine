import { RuntimeContext } from '../domain/RuntimeContext.js';
import { EngineState } from '../domain/State.js';

export interface WorkflowState {
    name: string;
    execute(context: RuntimeContext, state: EngineState): Promise<WorkflowState | null>;
}

import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../models/State.js'; // Updated path
import { PlannerAgent } from '../../core/agents/PlannerAgent.js'; // Updated path

export class PlanningState extends State {
    get name(): string {
        return 'PLANNING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            // Architecture doc should have been loaded into Workspace by ArchitectingState
            const architectureDoc = await this.workspace.getArchitecture('current');
            if (!architectureDoc) {
                return Signal.fail("No architecture document found.");
            }

            const planner = new PlannerAgent(this.brain, this.project, this.workspace);
            await planner.plan(architectureDoc, state.user_prompt);

            // Mark current plan in state
            state.current_plan = 'current';

            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Planning failed: ${(error as Error).message}`);
        }
    }
}

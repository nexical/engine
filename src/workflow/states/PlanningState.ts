import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../domain/State.js';
import { PlannerAgent } from '../../agents/PlannerAgent.js';

export class PlanningState extends State {
    get name(): string {
        return 'PLANNING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            // Architecture doc should have been loaded into Workspace by ArchitectingState
            const Architecture = await this.workspace.getArchitecture('current');
            if (!Architecture) {
                return Signal.fail("No architecture document found.");
            }

            const planner = new PlannerAgent(this.brain, this.project, this.workspace);
            await planner.plan(Architecture, state.user_prompt);

            // Mark current plan in state
            state.current_plan = 'current';

            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Planning failed: ${(error as Error).message}`);
        }
    }
}

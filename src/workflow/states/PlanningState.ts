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

            // Interactive Approval
            if (state.interactive) {
                const response = await this.host.ask("Plan generated. Approve? (yes/feedback)");
                if (typeof response === 'string' && response.toLowerCase() !== 'yes') {
                    return Signal.replan("User feedback on plan", { feedback: response });
                } else if (response === false) {
                    return Signal.fail("User rejected plan.");
                }
            }

            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Planning failed: ${(error as Error).message}`);
        }
    }
}

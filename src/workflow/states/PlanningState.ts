import { EngineState } from '../../domain/State.js';
import { Signal } from '../Signal.js';
import { State } from './State.js';

export class PlanningState extends State {
  get name(): string {
    return 'PLANNING';
  }

  async run(state: EngineState): Promise<Signal> {
    try {
      // Architecture doc should have been loaded into Workspace by ArchitectingState
      const Architecture = await this.workspace.getArchitecture('current');
      if (!Architecture) {
        return Signal.fail('No architecture document found.');
      }

      const planner = this.brain.createPlanner(this.workspace);
      await planner.plan(Architecture, state.user_prompt);

      // Mark current plan in state
      state.current_plan = 'current';

      // Interactive Approval
      const approval = await this.askApproval(
        state,
        'Plan generated. Approve? (yes/feedback)',
        Signal.fail('User rejected plan.'),
        (feedback) => Signal.replan('User feedback on plan', { feedback }),
      );
      if (approval) return approval;

      return Signal.NEXT;
    } catch (error) {
      return Signal.fail(`Planning failed: ${(error as Error).message}`);
    }
  }
}

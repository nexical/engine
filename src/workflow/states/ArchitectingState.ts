import { EngineState } from '../../domain/State.js';
import { Signal } from '../Signal.js';
import { State } from './State.js';

export class ArchitectingState extends State {
  get name(): string {
    return 'ARCHITECTING';
  }

  async run(state: EngineState): Promise<Signal> {
    try {
      const architect = this.brain.createArchitect(this.workspace);
      await architect.design(state.user_prompt);

      // Interactive Approval
      const approval = await this.askApproval(
        state,
        'Architecture generated. Approve? (yes/feedback)',
        Signal.fail('User rejected architecture.'),
        (feedback) => Signal.rearchitect('User feedback on architecture', { feedback }),
      );
      if (approval) return approval;

      return Signal.NEXT;
    } catch (error) {
      return Signal.fail(`Architecture failed: ${(error as Error).message}`);
    }
  }
}

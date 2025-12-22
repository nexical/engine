import { State } from './State.js';
import { Signal, SignalType } from '../Signal.js';
import { EngineState } from '../../domain/State.js';
import { ArchitectAgent } from '../../agents/ArchitectAgent.js';

export class ArchitectingState extends State {
    get name(): string {
        return 'ARCHITECTING';
    }

    async run(state: EngineState): Promise<Signal> {
        try {
            const architect = new ArchitectAgent(this.brain, this.project, this.workspace);
            await architect.design(state.user_prompt);

            // Interactive Approval
            const approval = await this.askApproval(
                state,
                "Architecture generated. Approve? (yes/feedback)",
                Signal.fail("User rejected architecture."),
                (feedback) => Signal.rearchitect("User feedback on architecture", { feedback })
            );
            if (approval) return approval;

            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Architecture failed: ${(error as Error).message}`);
        }
    }
}

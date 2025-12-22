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
            if (state.interactive) {
                const response = await this.host.ask("Architecture generated. Approve? (yes/feedback)");
                if (typeof response === 'string' && response.toLowerCase() !== 'yes') {
                    return Signal.rearchitect("User feedback on architecture", { feedback: response });
                } else if (response === false) {
                    return Signal.fail("User rejected architecture.");
                }
            }

            return Signal.NEXT;
        } catch (error) {
            return Signal.fail(`Architecture failed: ${(error as Error).message}`);
        }
    }
}

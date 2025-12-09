import { BaseCommand, Command } from '../models/Command.js';

export class SaveCommand extends BaseCommand implements Command {
    name = 'save';
    description = 'Save changes to current branch and trigger deployment. Usage: /save <message>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /save <message>');
            return;
        }

        const message = args.join(' ');

        // Add all changes
        this.core.git.add('.');

        // Commit
        try {
            this.core.git.commit(message);
        } catch (e: any) {
            // If nothing to commit, that's fine, but we should probably warn or just proceed to push
            if (!e.message.includes('nothing to commit')) {
                throw e;
            }
        }

        const currentBranch = this.core.git.getCurrentBranch();

        // Pull updates
        try {
            this.core.git.pull('origin', currentBranch);
        } catch (e) {
            // If pull fails (e.g. conflict), we should stop
            console.error(`Failed to pull remote changes: ${e}`);
            throw e;
        }

        // Push
        this.core.git.push('origin', currentBranch);

        console.log(`Saved changes to ${currentBranch} and triggered preview deployment.`);
    }
}

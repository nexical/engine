import { BaseCommand, Command } from '../models/Command.js';

export class StartCommand extends BaseCommand implements Command {
    name = 'start';
    description = 'Start a new feature branch. Usage: /start <branch name>';

    async execute(args: string[]): Promise<void> {
        if (!args || args.length < 1) {
            console.error('Usage: /start <branch name>');
            return;
        }

        const branchName = args[0];

        try {
            this.core.git.checkout('main');
            this.core.git.pull('origin', 'main');
            this.core.git.checkout(branchName, true);
        } catch (error: any) {
            console.error(`Failed to start branch: ${error.message}`);
            throw error;
        }

        console.log(`Started work on branch ${branchName}`);
    }
}

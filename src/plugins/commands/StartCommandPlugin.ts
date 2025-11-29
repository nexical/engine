import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { GitService } from '../../services/GitService.js';

export class StartCommandPlugin extends BasePlugin {
    private git: GitService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.git = new GitService(core);
    }

    getName(): string {
        return 'start';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 1) {
            throw new Error('Usage: /start <branch name>');
        }

        const branchName = args[0];

        // Ensure we are on main and up to date?
        // The prompt says "creates a new Git branch from the main branch identified by name and switches into it"
        // It implies we should probably checkout main first and pull?
        // But if the user has uncommitted changes, that might fail.
        // Let's assume we just branch off current if it's main, or we try to checkout main.

        // Safer approach:
        // 1. Checkout main (might fail if dirty)
        // 2. Pull main
        // 3. Checkout -b new_branch

        try {
            this.git.checkout('main');
            this.git.pull('origin', 'main');
            this.git.checkout(branchName, true);
        } catch (error: any) {
            throw new Error(`Failed to start branch: ${error.message}`);
        }

        return `Started work on branch ${branchName}`;
    }
}

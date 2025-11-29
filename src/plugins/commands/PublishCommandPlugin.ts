import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { GitService } from '../../services/GitService.js';
import { SaveCommandPlugin } from './SaveCommandPlugin.js';

export class PublishCommandPlugin extends BasePlugin {
    private git: GitService;
    private savePlugin: SaveCommandPlugin;

    constructor(protected core: Orchestrator) {
        super(core);
        this.git = new GitService(core);
        this.savePlugin = new SaveCommandPlugin(core);
    }

    getName(): string {
        return 'publish';
    }

    async execute(args: string[]): Promise<string> {
        const message = args.length > 0 ? args.join(' ') : 'Publishing changes';

        // 1. Run save on current branch
        await this.savePlugin.execute([message]);

        const currentBranch = this.git.getCurrentBranch();

        if (currentBranch === 'main') {
            return 'Already on main. Changes saved and pushed.';
        }

        // 2. Checkout main
        try {
            this.git.checkout('main');
        } catch (e) {
            throw new Error(`Failed to checkout main: ${e}`);
        }

        // 3. Merge current branch into main
        try {
            this.git.merge(currentBranch);
        } catch (e) {
            throw new Error(`Failed to merge ${currentBranch} into main: ${e}`);
        }

        // 4. Pull updates from remote main (to avoid push conflicts)
        try {
            this.git.pull('origin', 'main');
        } catch (e) {
            throw new Error(`Failed to pull remote main: ${e}`);
        }

        // 5. Push main
        try {
            this.git.push('origin', 'main');
        } catch (e) {
            throw new Error(`Failed to push main: ${e}`);
        }

        // 6. Switch back to feature branch? 
        // The prompt doesn't explicitly say to switch back, but it's usually good practice.
        // However, "The purpose of this command is to make a production deployment."
        // Usually after publishing, you might be done with the feature branch.
        // Let's stay on main or maybe switch back.
        // Given the workflow, staying on main might be safer to avoid confusion, or the user might want to continue working.
        // Let's switch back to be nice.
        this.git.checkout(currentBranch);

        return `Published ${currentBranch} to production (merged to main and pushed).`;
    }
}

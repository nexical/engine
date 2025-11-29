import { BasePlugin, CommandPlugin } from '../../models/Plugins.js';
import { SaveCommandPlugin } from './SaveCommandPlugin.js';

export class PublishCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'publish';
    description = 'Publish changes to production. Usage: /publish [message]';

    private savePlugin!: SaveCommandPlugin;

    protected initialize() {
        this.savePlugin = new SaveCommandPlugin(this.core);
    }

    async execute(args: string[]): Promise<void> {
        const message = args.length > 0 ? args.join(' ') : 'Publishing changes';

        // 1. Run save on current branch
        await this.savePlugin.execute([message]);

        const currentBranch = this.core.git.getCurrentBranch();

        if (currentBranch === 'main') {
            console.log('Already on main. Changes saved and pushed.');
            return;
        }

        // 2. Checkout main
        try {
            this.core.git.checkout('main');
        } catch (e) {
            console.error(`Failed to checkout main: ${e}`);
            throw e;
        }

        // 3. Merge current branch into main
        try {
            this.core.git.merge(currentBranch);
        } catch (e) {
            console.error(`Failed to merge ${currentBranch} into main: ${e}`);
            throw e;
        }

        // 4. Pull updates from remote main (to avoid push conflicts)
        try {
            this.core.git.pull('origin', 'main');
        } catch (e) {
            console.error(`Failed to pull remote main: ${e}`);
            throw e;
        }

        // 5. Push main
        try {
            this.core.git.push('origin', 'main');
        } catch (e) {
            console.error(`Failed to push main: ${e}`);
            throw e;
        }

        // 6. Switch back to feature branch
        this.core.git.checkout(currentBranch);

        console.log(`Published ${currentBranch} to production (merged to main and pushed).`);
    }
}

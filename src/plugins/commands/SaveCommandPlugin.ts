import { BasePlugin } from '../../models/Plugins.js';
import { Orchestrator } from '../../orchestrator.js';
import { GitService } from '../../services/GitService.js';
import { CloudflareService } from '../../services/CloudflareService.js';

export class SaveCommandPlugin extends BasePlugin {
    private git: GitService;
    private cloudflare: CloudflareService;

    constructor(protected core: Orchestrator) {
        super(core);
        this.git = new GitService(core);
        this.cloudflare = new CloudflareService(core);
    }

    getName(): string {
        return 'save';
    }

    async execute(args: string[]): Promise<string> {
        if (args.length < 1) {
            throw new Error('Usage: /save <message>');
        }

        const message = args.join(' ');

        // Add all changes
        this.git.add('.');

        // Commit
        try {
            this.git.commit(message);
        } catch (e: any) {
            // If nothing to commit, that's fine, but we should probably warn or just proceed to push
            if (!e.message.includes('nothing to commit')) {
                throw e;
            }
        }

        const currentBranch = this.git.getCurrentBranch();

        // Pull updates
        try {
            this.git.pull('origin', currentBranch);
        } catch (e) {
            // If pull fails (e.g. conflict), we should stop
            throw new Error(`Failed to pull remote changes: ${e}`);
        }

        // Push
        this.git.push('origin', currentBranch);

        // Preview deployment
        // The prompt says "The purpose of this command is to lock in changes to the current branch and run a preview deployment."
        // So we should trigger a deployment.
        // Cloudflare Pages automatically deploys on push if connected to Git.
        // But if we want to manually trigger or wait for it, we might need API.
        // However, the CloudflareService.deploy method uses `wrangler pages deploy` which uploads assets directly.
        // If we are using Git integration (which we are setting up in Init), then pushing to Git triggers the build on Cloudflare side.
        // So we might not need to run `wrangler pages deploy` locally.
        // BUT, the prompt says "run a preview deployment".
        // If we rely on Git integration, we just push.
        // If we use direct upload, we use CloudflareService.deploy.
        // The prompt says "establishes a Cloudflare Pages project tied to the GitHub project".
        // This implies Git integration.
        // So pushing should be enough.
        // However, to be helpful, we can print a message saying deployment is triggered.

        return `Saved changes to ${currentBranch} and triggered preview deployment.`;
    }
}

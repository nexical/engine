import debug from 'debug';
import { CommandPlugin, BasePlugin } from '../../data_models/Plugins.js';
import { DeployUtils } from '../../data_models/Deployment.js';
import { GitService } from '../../services/GitService.js';
import { CloudflareService } from '../../services/CloudflareService.js';

const log = debug('command:preview');

export class PreviewCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'preview';
    description = 'Deploy the website preview environment. Usage: /preview';

    async execute(args?: string[]): Promise<void> {
        const deploymentConfig = DeployUtils.loadConfig(this.config);
        const gitService = new GitService(this.config);
        const cloudflareService = new CloudflareService(this.config);

        log("Starting preview deployment...");

        try {
            const branch = gitService.getCurrentBranch();
            await cloudflareService.deploy(deploymentConfig.project_name, '.', branch);
            log(`Preview deployment triggered for branch ${branch}.`);

            if (deploymentConfig.preview_domain) {
                await cloudflareService.linkDomain(deploymentConfig.project_name, deploymentConfig.preview_domain);
            }
        } catch (e) {
            console.error("Preview deployment failed:", e);
        }
    }
}

import debug from 'debug';
import { CommandPlugin, BasePlugin } from '../../models/Plugins.js';
import { DeployUtils } from '../../models/Deployment.js';
import { CloudflareService } from '../../services/CloudflareService.js';

const log = debug('command:preview');

export class PreviewCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'preview';
    description = 'Deploy the website preview environment. Usage: /preview';

    async execute(args?: string[]): Promise<void> {
        const deploymentConfig = DeployUtils.loadConfig(this.core.config);
        const cloudflareService = new CloudflareService(this.core);

        log("Starting preview deployment...");

        try {
            const branch = this.core.git.getCurrentBranch();
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

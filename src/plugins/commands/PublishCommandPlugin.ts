import debug from 'debug';
import { CommandPlugin, BasePlugin } from '../../models/Plugins.js';
import { DeployUtils } from '../../models/Deployment.js';
import { CloudflareService } from '../../services/CloudflareService.js';

const log = debug('command:publish');

export class PublishCommandPlugin extends BasePlugin implements CommandPlugin {
    name = 'publish';
    description = 'Deploy the website to production environment. Usage: /publish';

    async execute(args?: string[]): Promise<void> {
        const deploymentConfig = DeployUtils.loadConfig(this.core.config);
        const cloudflareService = new CloudflareService(this.core);

        log("Starting production deployment...");

        // 1. Verify clean git state
        try {
            const status = this.core.git.runCommand(['status', '--porcelain']);
            if (status) {
                log("Uncommitted changes detected. Committing...");
                this.core.git.commit("Auto-commit before deployment");
            }
        } catch (e) {
            console.error("Git check failed:", e);
            return;
        }

        // 2. Deploy to Cloudflare
        try {
            await cloudflareService.deploy(deploymentConfig.project_name, '.', 'main');
            log("Production deployment triggered.");

            if (deploymentConfig.production_domain) {
                await cloudflareService.linkDomain(deploymentConfig.project_name, deploymentConfig.production_domain);
            }
        } catch (e) {
            console.error("Deployment failed:", e);
        }
    }
}

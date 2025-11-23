import fs from 'fs-extra';
import yaml from 'js-yaml';
import { DeploymentConfig } from './data_models/DeploymentConfig.js';
import { AppConfig } from './data_models/AppConfig.js';
import { GitService } from './services/GitService.js';
import { CloudflareService } from './services/CloudflareService.js';

export class Deployer {
    private deploymentConfig: DeploymentConfig;
    private gitService: GitService;
    private cloudflareService: CloudflareService;

    constructor(
        private config: AppConfig
    ) {
        this.deploymentConfig = this.loadDeploymentConfig();
        this.gitService = new GitService(this.config);
        this.cloudflareService = new CloudflareService(this.config);
    }

    private loadDeploymentConfig(): DeploymentConfig {
        if (fs.existsSync(this.config.deployConfigPath)) {
            const content = fs.readFileSync(this.config.deployConfigPath, 'utf-8');
            const config = yaml.load(content) as DeploymentConfig;
            if (config && config.project_name) {
                return config;
            }
        }
        throw new Error(`${this.config.deployConfigPath} not found`);
    }

    async runProductionDeployment(): Promise<void> {
        console.log("Starting production deployment...");

        // 1. Verify clean git state
        try {
            const status = this.gitService.runCommand(['status', '--porcelain']);
            if (status) {
                console.log("Uncommitted changes detected. Committing...");
                this.gitService.commit("Auto-commit before deployment");
            }
        } catch (e) {
            console.error("Git check failed:", e);
            return;
        }

        // 2. Deploy to Cloudflare
        try {
            await this.cloudflareService.deploy(this.deploymentConfig.project_name, '.', 'main');
            console.log("Production deployment triggered.");

            if (this.deploymentConfig.production_domain) {
                await this.cloudflareService.linkDomain(this.deploymentConfig.project_name, this.deploymentConfig.production_domain);
            }
        } catch (e) {
            console.error("Deployment failed:", e);
        }
    }

    async runPreviewDeployment(): Promise<void> {
        console.log("Starting preview deployment...");

        try {
            const branch = this.gitService.getCurrentBranch();
            await this.cloudflareService.deploy(this.deploymentConfig.project_name, '.', branch);
            console.log(`Preview deployment triggered for branch ${branch}.`);

            if (this.deploymentConfig.preview_domain) {
                // Note: Preview domains are usually per-branch, so linking a single static preview domain might not be desired 
                // unless it's a specific "staging" branch. For now, we'll link it if provided.
                await this.cloudflareService.linkDomain(this.deploymentConfig.project_name, this.deploymentConfig.preview_domain);
            }
        } catch (e) {
            console.error("Preview deployment failed:", e);
        }
    }
}

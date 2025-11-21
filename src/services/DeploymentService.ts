import path from 'path';
import { AgentRunner } from './AgentRunner.js';
import { GitService } from './GitService.js';
import { CloudflareService } from './CloudflareService.js';
import { Project } from '../data_models/Project.js';
import { DeploymentConfig } from '../data_models/DeploymentConfig.js';

export class DeploymentService {
    constructor(
        private agentRunner: AgentRunner,
        private gitService: GitService,
        private cloudflareService: CloudflareService | null,
        private projectPath: string,
        private config: DeploymentConfig
    ) { }

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
        if (this.cloudflareService) {
            try {
                await this.cloudflareService.deploy(this.config.project_name, '.', 'main');
                console.log("Production deployment triggered.");

                if (this.config.production_domain) {
                    await this.cloudflareService.linkDomain(this.config.project_name, this.config.production_domain);
                }
            } catch (e) {
                console.error("Deployment failed:", e);
            }
        } else {
            console.log("Cloudflare service not configured. Skipping deployment.");
        }
    }

    async runPreviewDeployment(): Promise<void> {
        console.log("Starting preview deployment...");

        if (this.cloudflareService) {
            try {
                const branch = this.gitService.getCurrentBranch();
                await this.cloudflareService.deploy(this.config.project_name, '.', branch);
                console.log(`Preview deployment triggered for branch ${branch}.`);

                if (this.config.preview_domain) {
                    // Note: Preview domains are usually per-branch, so linking a single static preview domain might not be desired 
                    // unless it's a specific "staging" branch. For now, we'll link it if provided.
                    await this.cloudflareService.linkDomain(this.config.project_name, this.config.preview_domain);
                }
            } catch (e) {
                console.error("Preview deployment failed:", e);
            }
        } else {
            console.log("Cloudflare service not configured. Skipping deployment.");
        }
    }
}

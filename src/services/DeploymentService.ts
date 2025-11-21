import path from 'path';
import { AgentRunner } from './AgentRunner.js';
import { GitService } from './GitService.js';
import { CloudflareService } from './CloudflareService.js';
import { Project } from '../data_models/Project.js';

export class DeploymentService {
    constructor(
        private agentRunner: AgentRunner,
        private gitService: GitService,
        private cloudflareService: CloudflareService | null,
        private projectPath: string,
        private projectName: string
    ) { }

    runProductionDeployment(): void {
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

        // 2. Build (if necessary) - handled by Cloudflare usually, but we can add a build step here if needed

        // 3. Deploy to Cloudflare
        if (this.cloudflareService) {
            try {
                this.cloudflareService.deploy(this.projectName, '.', 'main');
                console.log("Production deployment triggered.");
            } catch (e) {
                console.error("Deployment failed:", e);
            }
        } else {
            console.log("Cloudflare service not configured. Skipping deployment.");
        }
    }

    runPreviewDeployment(): void {
        console.log("Starting preview deployment...");

        if (this.cloudflareService) {
            try {
                const branch = this.gitService.getCurrentBranch();
                this.cloudflareService.deploy(this.projectName, '.', branch);
                console.log(`Preview deployment triggered for branch ${branch}.`);
            } catch (e) {
                console.error("Preview deployment failed:", e);
            }
        } else {
            console.log("Cloudflare service not configured. Skipping deployment.");
        }
    }
}

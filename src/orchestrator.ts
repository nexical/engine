import path from 'path';
import fs from 'fs-extra';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { AgentRunner } from './services/AgentRunner.js';
import { DeploymentService } from './services/DeploymentService.js';
import { GitService } from './services/GitService.js';
import { CloudflareService } from './services/CloudflareService.js';
import { FileSystemService } from './services/FileSystemService.js';

export class Orchestrator {
    private projectPath: string;
    private cloudflareApiToken: string | undefined;
    private cloudflareAccountId: string | undefined;
    private projectName: string;

    private fsService: FileSystemService;
    private agentRunner: AgentRunner;
    private gitService: GitService;
    private cloudflareService: CloudflareService | null;
    private deploymentService: DeploymentService;
    private planner: Planner;
    private executor: Executor;

    constructor(argv: string[]) {
        const cwd = process.cwd();
        const websitePath = path.join(cwd, 'website');

        if (fs.existsSync(websitePath) && fs.statSync(websitePath).isDirectory()) {
            this.projectPath = websitePath;
            console.log(`Detected 'website' subdirectory. Using project path: ${this.projectPath}`);
        } else {
            this.projectPath = cwd;
            console.log(`Using current directory as project path: ${this.projectPath}`);
        }

        this.cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
        this.cloudflareAccountId = process.env.CLOUDFLARE_ACCOUNT_ID;
        this.projectName = process.env.PROJECT_NAME || 'my-website-project';

        this.fsService = new FileSystemService();
        this.agentRunner = new AgentRunner(this.projectPath, this.fsService);
        this.gitService = new GitService(this.projectPath);

        this.cloudflareService = null;
        if (this.cloudflareApiToken && this.cloudflareAccountId) {
            this.cloudflareService = new CloudflareService(
                this.cloudflareApiToken,
                this.cloudflareAccountId
            );
        }

        this.deploymentService = new DeploymentService(
            this.agentRunner,
            this.gitService,
            this.cloudflareService,
            this.projectPath,
            this.projectName
        );

        this.planner = new Planner(this.fsService);
        this.executor = new Executor(this.projectPath, this.agentRunner);
    }

    runAiWorkflow(prompt: string): void {
        console.log("Starting AI-driven workflow...");
        try {
            const plan = this.planner.generatePlan(prompt, this.projectPath);
            this.executor.executePlan(plan, prompt);
        } catch (e) {
            console.error("AI workflow failed:", e);
        }
    }

    runDeterministicWorkflow(command: string): void {
        console.log(`Starting deterministic workflow: ${command}`);

        if (!this.deploymentService || !this.cloudflareService) {
            console.error("Error: Cloudflare API token and Account ID must be set as environment variables for deployment.");
            return;
        }

        if (command === 'publish') {
            this.deploymentService.runProductionDeployment();
        } else if (command === 'preview') {
            this.deploymentService.runPreviewDeployment();
        } else {
            console.error(`Unknown deterministic command: ${command}`);
        }
    }
}

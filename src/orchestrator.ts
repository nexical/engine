import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { Plan, PlanUtils } from './data_models/Plan.js';
import { AppConfig } from './data_models/AppConfig.js';
import { FileSystemService } from './services/FileSystemService.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { Deployer } from './deployer.js';


export class Orchestrator {
    private config: AppConfig;
    private fsService: FileSystemService;
    private planner: Planner;
    private executor: Executor;
    private deployer: Deployer;

    constructor(argv: string[]) {
        this.config = {} as AppConfig;
        const cwd = process.cwd();
        const websitePath = path.join(cwd, 'website');

        if (fs.existsSync(websitePath) && fs.statSync(websitePath).isDirectory()) {
            this.config.projectPath = websitePath;
        } else {
            this.config.projectPath = cwd;
        }

        console.debug(`Project path: ${this.config.projectPath}`);
        console.debug('');

        this.config.appPath = path.dirname(fileURLToPath(import.meta.url));
        this.config.builderPath = path.join(this.config.projectPath, '.builder');
        this.config.agentsPath = path.join(this.config.builderPath, 'agents')
        this.config.historyPath = path.join(this.config.builderPath, 'history')
        this.config.deployConfigPath = path.join(this.config.builderPath, 'deploy.yml');

        this.fsService = new FileSystemService();

        this.planner = new Planner(this.config);
        this.executor = new Executor(this.config);
        this.deployer = new Deployer(this.config);
    }

    private savePlanToHistory(plan: Plan): void {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        const filename = `plan-${year}-${month}-${day}.${hours}-${minutes}-${seconds}.yml`;
        const filePath = path.join(this.config.historyPath, filename);

        const yamlContent = PlanUtils.toYaml(plan);
        this.fsService.writeFile(filePath, yamlContent);
        console.log(`Saved plan history to: ${filePath}`);
    }

    async runAIWorkflow(prompt: string): Promise<void> {
        console.log("Starting AI-driven workflow...");
        try {
            const plan = this.planner.generatePlan(prompt);
            this.savePlanToHistory(plan);
            // this.executor.executePlan(plan, prompt);
        } catch (e) {
            console.error("AI workflow failed:", e);
        }
    }

    async runPreviewDeployment(): Promise<void> {
        await this.deployer.runPreviewDeployment();
    }

    async runProductionDeployment(): Promise<void> {
        await this.deployer.runProductionDeployment();
    }
}

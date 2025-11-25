import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import { fileURLToPath } from 'url';
import { Plan, PlanUtils } from './models/Plan.js';
import { Application } from './models/Application.js';
import { FileSystemService } from './services/FileSystemService.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { CommandRegistry } from './plugins/CommandRegistry.js';
import { AgentRegistry } from './plugins/AgentRegistry.js';
import { PreviewCommandPlugin } from './plugins/commands/PreviewCommandPlugin.js';
import { PublishCommandPlugin } from './plugins/commands/PublishCommandPlugin.js';
import { GeminiCliAgentPlugin } from './plugins/agents/GeminiAgentPlugin.js';

const log = debug('orchestrator');

export class Orchestrator {
    private config: Application;
    private fsService: FileSystemService;
    private planner: Planner;
    private executor: Executor;
    private commandRegistry: CommandRegistry;
    private agentRegistry: AgentRegistry;

    constructor(argv: string[]) {
        this.config = {} as Application;
        const cwd = process.cwd();
        const websitePath = path.join(cwd, 'website');

        if (fs.existsSync(websitePath) && fs.statSync(websitePath).isDirectory()) {
            this.config.projectPath = websitePath;
        } else {
            this.config.projectPath = cwd;
        }

        log(`Project path: ${this.config.projectPath}`);

        this.config.appPath = path.dirname(fileURLToPath(import.meta.url));
        this.config.builderPath = path.join(this.config.projectPath, '.builder');
        this.config.agentsPath = path.join(this.config.builderPath, 'agents')
        this.config.historyPath = path.join(this.config.builderPath, 'history')
        this.config.deployConfigPath = path.join(this.config.builderPath, 'deploy.yml');

        this.fsService = new FileSystemService();

        // Initialize Registries
        this.commandRegistry = new CommandRegistry();
        this.agentRegistry = new AgentRegistry();

        // Register Plugins
        this.commandRegistry.register(new PreviewCommandPlugin(this.config));
        this.commandRegistry.register(new PublishCommandPlugin(this.config));
        this.agentRegistry.register(new GeminiCliAgentPlugin(this.config), true); // Default agent plugin

        this.planner = new Planner(this.config, this.agentRegistry);
        this.executor = new Executor(this.config, this.agentRegistry);
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
        log(`Saved plan history to: ${filePath}`);
    }

    async runAIWorkflow(prompt: string): Promise<void> {
        log("Starting AI-driven workflow...");
        try {
            const plan = await this.planner.generatePlan(prompt);
            this.savePlanToHistory(plan);
            await this.executor.executePlan(plan, prompt);
        } catch (e) {
            console.error("AI workflow failed:", e);
        }
    }

    async runPreviewDeployment(): Promise<void> {
        const deployCmd = this.commandRegistry.get('preview');
        if (deployCmd) {
            await deployCmd.execute();
        } else {
            console.error("Preview command not found.");
        }
    }

    async runProductionDeployment(): Promise<void> {
        const deployCmd = this.commandRegistry.get('publish');
        if (deployCmd) {
            await deployCmd.execute();
        } else {
            console.error("Publish command not found.");
        }
    }
}

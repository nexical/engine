import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Application } from './models/Application.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { CommandRegistry } from './plugins/CommandRegistry.js';
import { AgentRegistry } from './plugins/AgentRegistry.js';
import { GitService } from './services/GitService.js';
import { GitHubService } from './services/GitHubService.js';
import { FileSystemService } from './services/FileSystemService.js';

const log = debug('orchestrator');

export class Orchestrator {
    public config: Application;
    public disk: FileSystemService;
    public git: GitService;
    public github: GitHubService;
    public commandRegistry: CommandRegistry;
    public agentRegistry: AgentRegistry;

    private planner: Planner;
    private executor: Executor;

    constructor(argv: string[]) {
        this.config = {} as Application;
        const cwd = process.cwd();
        const projectPath = path.join(cwd, 'dev_project');

        if (fs.existsSync(projectPath) && fs.statSync(projectPath).isDirectory()) {
            this.config.projectPath = projectPath;
        } else {
            this.config.projectPath = cwd;
        }

        log(`Project path: ${this.config.projectPath}`);

        this.config.appPath = path.dirname(fileURLToPath(import.meta.url));
        this.config.plotrisPath = path.join(this.config.projectPath, '.plotris');
        this.config.agentsPath = path.join(this.config.plotrisPath, 'agents')
        this.config.historyPath = path.join(this.config.plotrisPath, 'history')
        this.config.configPath = path.join(this.config.plotrisPath, 'config.yml');

        // Load environment variables from .plotris/.env
        const envPath = path.join(this.config.plotrisPath, '.env');
        if (fs.existsSync(envPath)) {
            dotenv.config({ path: envPath });
            log(`Loaded environment variables from ${envPath}`);
        } else {
            // Fallback to root .env if .plotris/.env doesn't exist (backward compatibility or initial setup)
            dotenv.config({ path: path.join(this.config.projectPath, '.env') });
        }

        // Initialize Registries
        this.commandRegistry = new CommandRegistry();
        this.agentRegistry = new AgentRegistry();

        // Initialize shared services
        this.disk = new FileSystemService();
        this.git = new GitService(this);
        this.github = new GitHubService(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.executor = new Executor(this);
    }

    async init(): Promise<void> {
        const pluginsDir = path.join(this.config.appPath, 'plugins');

        await this.commandRegistry.load(path.join(pluginsDir, 'commands'));
        await this.agentRegistry.load(path.join(pluginsDir, 'agents'));
    }

    async runAIWorkflow(prompt: string): Promise<void> {
        log("Starting AI-driven workflow...");
        try {
            const plan = await this.planner.generatePlan(prompt);
            await this.executor.executePlan(plan, prompt);
        } catch (e) {
            console.error("AI workflow failed:", e);
        }
    }

    async execute(input: string): Promise<void> {
        input = input.trim();
        if (input.startsWith('/')) {
            // Command execution
            const parts = input.slice(1).split(' ');
            const commandName = parts[0];
            const args = parts.slice(1);

            const command = this.commandRegistry.get(commandName);
            if (command) {
                log(`Executing command: ${commandName}`);
                await command.execute(args);
            } else {
                console.error(`Unknown command: /${commandName}`);
            }
        } else {
            // AI Workflow
            await this.runAIWorkflow(input);
        }
    }
}

import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { fileURLToPath } from 'url';
import { Application } from './models/Application.js';
import { CommandPlugin, AgentPlugin } from './models/Plugins.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { CommandRegistry } from './plugins/CommandRegistry.js';
import { AgentRegistry } from './plugins/AgentRegistry.js';
import { GitService } from './services/GitService.js';
import { FileSystemService } from './services/FileSystemService.js';

const log = debug('orchestrator');

export class Orchestrator {
    public config: Application;
    public disk: FileSystemService;
    public git: GitService;
    public commandRegistry: CommandRegistry;
    public agentRegistry: AgentRegistry;

    private planner: Planner;
    private executor: Executor;

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
        this.config.plotrisPath = path.join(this.config.projectPath, '.plotris');
        this.config.agentsPath = path.join(this.config.plotrisPath, 'agents')
        this.config.historyPath = path.join(this.config.plotrisPath, 'history')
        this.config.deployConfigPath = path.join(this.config.plotrisPath, 'deploy.yml');

        // Initialize Registries
        this.commandRegistry = new CommandRegistry();
        this.agentRegistry = new AgentRegistry();

        // Initialize shared services
        this.disk = new FileSystemService();
        this.git = new GitService(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.executor = new Executor(this);
    }

    async init(): Promise<void> {
        await this.loadPlugins();
    }

    private async loadPlugins(): Promise<void> {
        const pluginsDir = path.join(this.config.appPath, 'plugins');
        const commandsDir = path.join(pluginsDir, 'commands');
        const agentsDir = path.join(pluginsDir, 'agents');

        await this.loadCommandPlugins(commandsDir);
        await this.loadAgentPlugins(agentsDir);
    }

    private async loadCommandPlugins(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

        const files = await readdir(dir);
        for (const file of files) {
            if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
                try {
                    const modulePath = path.join(dir, file);
                    const module = await import(modulePath);

                    // Iterate over exports to find classes implementing CommandPlugin
                    for (const key in module) {
                        const ExportedClass = module[key];
                        if (typeof ExportedClass === 'function') {
                            try {
                                const instance = new ExportedClass(this);
                                if (this.isCommandPlugin(instance)) {
                                    log(`Registering command plugin: ${instance.name}`);
                                    this.commandRegistry.register(instance);
                                }
                            } catch (e) {
                                // Ignore if instantiation fails (e.g. not a class or needs args)
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load command plugin from ${file}:`, e);
                }
            }
        }
    }

    private async loadAgentPlugins(dir: string): Promise<void> {
        if (!fs.existsSync(dir)) return;

        const files = await readdir(dir);
        for (const file of files) {
            if ((file.endsWith('.ts') || file.endsWith('.js')) && !file.endsWith('.d.ts')) {
                try {
                    const modulePath = path.join(dir, file);
                    const module = await import(modulePath);

                    for (const key in module) {
                        const ExportedClass = module[key];
                        if (typeof ExportedClass === 'function') {
                            try {
                                const instance = new ExportedClass(this);
                                if (this.isAgentPlugin(instance)) {
                                    const isDefault = instance.name === 'cli';
                                    log(`Registering agent plugin: ${instance.name} (Default: ${isDefault})`);
                                    this.agentRegistry.register(instance, isDefault);
                                }
                            } catch (e) {
                                // Ignore
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Failed to load agent plugin from ${file}:`, e);
                }
            }
        }
    }

    private isCommandPlugin(obj: any): obj is CommandPlugin {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function';
    }

    private isAgentPlugin(obj: any): obj is AgentPlugin {
        return obj && typeof obj.name === 'string' && typeof obj.execute === 'function';
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

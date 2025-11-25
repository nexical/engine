import path from 'path';
import fs from 'fs-extra';
import { readdir } from 'fs/promises';
import debug from 'debug';
import { fileURLToPath } from 'url';
import { Plan, PlanUtils } from './models/Plan.js';
import { Application } from './models/Application.js';
import { FileSystemService } from './services/FileSystemService.js';
import { Planner } from './planner.js';
import { Executor } from './executor.js';
import { CommandRegistry } from './plugins/CommandRegistry.js';
import { AgentRegistry } from './plugins/AgentRegistry.js';
import { CommandPlugin, AgentPlugin } from './models/Plugins.js';

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

        this.planner = new Planner(this.config, this.agentRegistry);
        this.executor = new Executor(this.config, this.agentRegistry);
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
                                const instance = new ExportedClass(this.config);
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
                                const instance = new ExportedClass(this.config);
                                if (this.isAgentPlugin(instance)) {
                                    const isDefault = instance.name === 'gemini-cli'; // Convention for default
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
        const cmd = this.commandRegistry.get('preview');
        if (cmd) {
            await cmd.execute();
        } else {
            console.error("Preview command not found.");
        }
    }

    async runProductionDeployment(): Promise<void> {
        const cmd = this.commandRegistry.get('publish');
        if (cmd) {
            await cmd.execute();
        } else {
            console.error("Publish command not found.");
        }
    }
}

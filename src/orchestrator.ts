import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { Application, RuntimeConfig, JobContext } from './models/Application.js';
import { IdentityManager } from './services/IdentityManager.js';
import { Planner } from './workflow/planner.js';
import { Architect } from './workflow/architect.js';
import { Executor } from './workflow/executor.js';
import { CommandRegistry } from './services/CommandRegistry.js';
import { SkillRegistry } from './services/SkillRegistry.js';
import { GitService } from './services/GitService.js';
import { GitHubService } from './services/GitHubService.js';
import { CloudflareService } from './services/CloudflareService.js';
import { FileSystemService } from './services/FileSystemService.js';
import { PromptEngine } from './services/PromptEngine.js';
import { ExecutionState, OrchestratorState, Signal } from './models/State.js';
import { SignalDetectedError } from './errors/SignalDetectedError.js';
import yaml from 'js-yaml';

const log = debug('orchestrator');

export class Orchestrator {
    public config: Application;
    public disk: FileSystemService;
    public git: GitService;
    public github: GitHubService;
    public cloudflare: CloudflareService;
    public commandRegistry: CommandRegistry;
    public skillRegistry: SkillRegistry;
    public promptEngine: PromptEngine;
    public identityManager?: IdentityManager;

    public jobContext?: JobContext;

    private planner: Planner;
    private architect: Architect;
    private executor: Executor;

    private state!: ExecutionState;

    constructor(runtimeConfig: RuntimeConfig) {
        this.config = {} as Application;
        this.disk = new FileSystemService();
        this.identityManager = runtimeConfig.identityManager;
        this.jobContext = runtimeConfig.jobContext;

        this.config.workingDirectory = runtimeConfig.workingDirectory;
        // Legacy support or specific logic for project path can be adjusted here.
        // For now, we assume the working directory IS the project path or contains it.
        // The original code used a 'dev_project' subdir if present, or cwd.
        // We will adhere to the directive: "Orchestrator must be strictly sandboxed within dynamically generated paths."
        // So projectPath = workingDirectory.
        this.config.projectPath = this.config.workingDirectory;

        log(`Project path: ${this.config.projectPath}`);

        this.config.appPath = path.dirname(fileURLToPath(import.meta.url));
        this.config.nexicalPath = path.join(this.config.projectPath, '.nexical');
        this.config.agentsPath = path.join(this.config.nexicalPath, 'agents')
        this.config.historyPath = path.join(this.config.nexicalPath, 'history')
        this.config.configPath = path.join(this.config.nexicalPath, 'config.yml');

        this.config.statePath = path.join(this.config.nexicalPath, 'state.yml');
        this.config.signalsPath = path.join(this.config.nexicalPath, 'signals');
        this.config.archivePath = path.join(this.config.nexicalPath, 'archive');
        this.config.logPath = path.join(this.config.projectPath, 'log.md');
        this.config.agentsDefinitionPath = path.join(this.config.projectPath, 'AGENTS.md');
        this.config.architecturePath = path.join(this.config.nexicalPath, 'architecture.md');
        this.config.personasPath = path.join(this.config.nexicalPath, 'personas/');
        this.config.planPath = path.join(this.config.nexicalPath, 'plan.yml');
        this.config.capabilitiesPath = path.join(this.config.agentsPath, 'capabilities.yml');

        // Initialize shared services
        this.git = new GitService(this);
        this.github = new GitHubService(this);
        this.cloudflare = new CloudflareService();
        this.promptEngine = new PromptEngine(this);

        // Ensure directories exist
        this.disk.ensureDir(this.config.nexicalPath);
        this.disk.ensureDir(this.config.signalsPath);
        this.disk.ensureDir(this.config.archivePath);

        // Env vars are now expected to be injected by the worker/runtime, 
        // removing internal dotenv loading as per directives.

        // Initialize Registries
        this.commandRegistry = new CommandRegistry(this);
        this.skillRegistry = new SkillRegistry(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.architect = new Architect(this);
        this.executor = new Executor(this);
    }

    private loadState(): void {
        if (this.disk.exists(this.config.statePath)) {
            const content = this.disk.readFile(this.config.statePath);
            this.state = yaml.load(content) as ExecutionState;
            log(`Loaded state: ${this.state.session_id} (${this.state.status})`);
        } else {
            this.state = {
                session_id: new Date().toISOString().replace(/[:.]/g, '-'),
                status: 'IDLE',
                loop_count: 0,
                tasks: {
                    completed: [],
                    failed: [],
                    pending: []
                }
            };
            log(`Initialized new state: ${this.state.session_id}`);
        }
    }

    private saveState(): void {
        const content = yaml.dump(this.state);
        this.disk.writeFileAtomic(this.config.statePath, content);
    }

    private appendEvolutionLog(signal: Signal): void {
        const entry = `
## [Session ${this.state.session_id}] ${signal.type}
- **Source:** ${signal.source}
- **Reason:** ${signal.reason}
- **Timestamp:** ${signal.timestamp}
`;
        this.disk.appendFile(this.config.logPath, entry);
    }

    private archiveSignal(signalFile: string): void {
        const source = path.join(this.config.signalsPath, signalFile);
        const dest = path.join(this.config.archivePath, signalFile);
        if (this.disk.exists(source)) {
            this.disk.move(source, dest, { overwrite: true });
        }
    }

    async init(): Promise<void> {
        const commandsDir = path.join(this.config.appPath, 'commands');
        const skillsDir = path.join(this.config.appPath, 'skills');

        await this.commandRegistry.load(commandsDir);
        await this.skillRegistry.load(skillsDir);
    }

    async runAIWorkflow(prompt: string): Promise<void> {
        log("Starting AI-driven workflow...");
        this.loadState();

        // If resuming, check if we need to reset loop count or handle previous interruption
        if (this.state.status === 'INTERRUPTED') {
            log("Resuming interrupted session...");
            this.state.status = 'PLANNING'; // Default resume state
        } else {
            this.state.status = 'ARCHITECTING';
            this.saveState();
        }

        try {
            await this.runLoop(prompt);
        } catch (e) {
            console.error("AI workflow failed:", e);
        }
    }

    private async runLoop(prompt: string): Promise<void> {
        const MAX_LOOPS = 5;

        while (this.state.status !== 'COMPLETED' && this.state.status !== 'FAILED') {
            if (this.state.loop_count > MAX_LOOPS) {
                log("Max loops reached. Stopping.");
                this.state.status = 'FAILED';
                this.saveState();
                break;
            }

            try {
                switch (this.state.status) {
                    case 'ARCHITECTING':
                        log("State: ARCHITECTING");
                        await this.architect.generateArchitecture(prompt);
                        this.state.status = 'PLANNING';
                        this.saveState();
                        break;

                    case 'PLANNING': {
                        log("State: PLANNING");
                        // Pass active signal if exists (logic to be added in Planner)
                        const plan = await this.planner.generatePlan(prompt, this.state.last_signal, this.state.tasks.completed);
                        this.state.current_plan = plan.plan_name; // Assuming plan has a name or we use filename
                        this.state.status = 'EXECUTING';
                        this.saveState();
                        break;
                    }

                    case 'EXECUTING': {
                        log("State: EXECUTING");
                        // We need to load the plan. For now, assuming Planner saved it to .nexical/plan.yml
                        // In a real scenario, we might need to pass the plan object or ID.
                        // But Executor reads from file or we pass it? 
                        // The original code passed 'plan' object. 
                        // Let's re-read the plan from file to be safe/consistent with state.
                        const planPath = this.config.planPath;
                        // We need to import PlanUtils to read it, or just let Executor handle it if we pass the object.
                        // But wait, Planner returns the plan object.
                        // If we are resuming, we might not have the plan object in memory.
                        // So we should read it.
                        // For now, let's assume we can get it from Planner or read it.
                        // To avoid circular dependency or extra imports, let's just use what Planner returned if available, 
                        // or read it if we are resuming.
                        // Actually, let's just call planner.generatePlan again if we are in PLANNING.
                        // If we are in EXECUTING, we assume plan.yml is valid.

                        // We need to read the plan file.
                        // Let's import PlanUtils? No, let's just read it as JSON/YAML.
                        // Actually, Executor.executePlan takes a Plan object.
                        // Let's read it using fs and yaml.
                        const planContent = this.disk.readFile(planPath);
                        const plan = yaml.load(planContent) as any; // Cast to any or Plan interface if available

                        await this.executor.executePlan(plan, prompt, this.state.tasks.completed);

                        // If execution finishes without error, we are done
                        this.state.status = 'COMPLETED';
                        this.saveState();
                        break;
                    }
                    case 'INTERRUPTED':
                        log("State: INTERRUPTED - Resuming to PLANNING");
                        this.state.status = 'PLANNING';
                        this.saveState();
                        break;
                }
            } catch (e) {
                if (e instanceof SignalDetectedError) {
                    log(`Signal detected: ${e.signal.type}`);
                    this.state.last_signal = e.signal;
                    this.state.status = 'INTERRUPTED'; // Or back to PLANNING/ARCHITECTING based on signal
                    this.state.loop_count++;

                    this.appendEvolutionLog(e.signal);

                    if (e.signal.type === 'REARCHITECT') {
                        this.state.status = 'ARCHITECTING';
                        if (e.signal.invalidates_previous_work) {
                            this.state.tasks.completed = [];
                        }
                    } else if (e.signal.type === 'REPLAN') {
                        this.state.status = 'PLANNING';
                    }

                    this.saveState();

                    // Archive the signal file
                    // We need to find the file name. The signal object doesn't have the filename.
                    // But we know it's in the signals directory.
                    // We should probably pass the filename in the error or search for it.
                    // For now, let's assume we clean up all signals in the directory.
                    const files = this.disk.listFiles(this.config.signalsPath);
                    for (const file of files) {
                        this.archiveSignal(file);
                    }

                } else {
                    log("Unexpected error:", e);
                    this.state.status = 'FAILED';
                    this.saveState();
                    throw e;
                }
            }
        }
    }

    async runCommand(commandName: string, args: string[]): Promise<void> {
        const command = this.commandRegistry.get(commandName);
        if (command) {
            log(`Executing command: ${commandName}`);
            await command.execute(args);
        } else {
            console.error(`Unknown command: /${commandName}`);
        }
    }

    async execute(input: string): Promise<void> {
        input = input.trim();
        if (input.startsWith('/')) {
            // Command execution
            const parts = input.slice(1).split(' ');
            await this.runCommand(parts[0], parts.slice(1));
        } else {
            // AI Workflow
            await this.runAIWorkflow(input);
        }
    }
}

import path from 'path';
import fs from 'fs-extra';
import debug from 'debug';
import { fileURLToPath } from 'url';
import { Application } from './models/Application.js';
import { Planner } from './workflow/planner.js';
import { Architect } from './workflow/architect.js';
import { Executor } from './workflow/executor.js';

import { DriverRegistry } from './services/DriverRegistry.js';
import { GitService } from './services/GitService.js';
import { GitHubService } from './services/GitHubService.js';
import { CloudflareService } from './services/CloudflareService.js';
import { FileSystemService } from './services/FileSystemService.js';
import { PromptEngine } from './services/PromptEngine.js';
import { ExecutionState, Signal } from './models/State.js';
import { SignalDetectedError } from './errors/SignalDetectedError.js';
import { RuntimeHost } from './interfaces/RuntimeHost.js';
import { AgentSession } from './interfaces/AgentSession.js';
import yaml from 'js-yaml';

const log = debug('orchestrator');

export class Orchestrator {
    public config: Application;
    public disk: FileSystemService;
    public git: GitService;
    public github: GitHubService;
    public cloudflare: CloudflareService;

    public driverRegistry: DriverRegistry;
    public promptEngine: PromptEngine;

    public host: RuntimeHost;
    public session: AgentSession;

    private planner: Planner;
    private architect: Architect;
    private executor: Executor;

    private state!: ExecutionState;

    constructor(host: RuntimeHost, workingDirectory: string) {
        this.host = host;
        this.config = {} as Application;
        this.disk = new FileSystemService();

        this.config.workingDirectory = workingDirectory;
        // this.config.projectPath = this.config.workingDirectory; // Removed

        this.host.log('info', `Project path: ${this.config.workingDirectory}`);

        this.config.appPath = path.dirname(fileURLToPath(import.meta.url));
        this.config.nexicalPath = path.join(this.config.workingDirectory, '.nexical');
        this.config.skillsDir = path.join(this.config.nexicalPath, 'skills');
        this.config.historyPath = path.join(this.config.nexicalPath, 'history')
        this.config.configPath = path.join(this.config.nexicalPath, 'config.yml');

        this.config.statePath = path.join(this.config.nexicalPath, 'state.yml');
        this.config.signalsPath = path.join(this.config.nexicalPath, 'signals');
        this.config.archivePath = path.join(this.config.nexicalPath, 'archive');
        this.config.logPath = path.join(this.config.workingDirectory, 'log.md');
        this.config.skillsDefinitionPath = path.join(this.config.workingDirectory, 'SKILLS.md');
        this.config.architecturePath = path.join(this.config.nexicalPath, 'architecture.md');
        this.config.personasPath = path.join(this.config.nexicalPath, 'personas/');
        this.config.planPath = path.join(this.config.nexicalPath, 'plan.yml');
        this.config.skillsPath = path.join(this.config.skillsDir, 'skills.yml');
        this.config.driversDir = path.join(this.config.nexicalPath, 'drivers');

        // Initialize session
        this.session = {
            id: new Date().toISOString().replace(/[:.]/g, '-'),
            profile: { name: 'default' }, // Minimal profile stub since we removed Profile interface
            workspacePath: workingDirectory,
            history: [],
            memory: {}
        };

        // Initialize shared services
        this.git = new GitService(this);
        this.github = new GitHubService(this);
        this.cloudflare = new CloudflareService();
        this.promptEngine = new PromptEngine(this);

        // Ensure directories exist
        this.disk.ensureDir(this.config.nexicalPath);
        this.disk.ensureDir(this.config.signalsPath);
        this.disk.ensureDir(this.config.archivePath);

        // Initialize Registries

        this.driverRegistry = new DriverRegistry(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.architect = new Architect(this);
        this.executor = new Executor(this);

        this.loadConfig();
    }

    private loadConfig(): void {
        // Placeholder for config loading logic.
        // In future this will read .nexical/config.yml
        if (this.disk.exists(this.config.configPath)) {
            try {
                const content = this.disk.readFile(this.config.configPath);
                const projectConfig = yaml.load(content);
                this.host.log('info', `Loaded project config from ${this.config.configPath}`);
                // Apply config to this.config or other services if needed
            } catch (e) {
                this.host.log('error', `Failed to load config: ${e}`);
            }
        }
    }

    private loadState(): void {
        if (this.disk.exists(this.config.statePath)) {
            const content = this.disk.readFile(this.config.statePath);
            this.state = yaml.load(content) as ExecutionState;
            this.session.id = this.state.session_id; // Sync session ID
            this.host.log('info', `Loaded state: ${this.state.session_id} (${this.state.status})`);
        } else {
            this.state = {
                session_id: this.session.id,
                status: 'IDLE',
                loop_count: 0,
                tasks: {
                    completed: [],
                    failed: [],
                    pending: []
                }
            };
            this.host.log('debug', `Initialized new state: ${this.state.session_id}`);
        }
    }

    private saveState(): void {
        const content = yaml.dump(this.state);
        this.disk.writeFileAtomic(this.config.statePath, content);
        this.host.status(this.state.status);
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
        const driversDir = path.join(this.config.appPath, 'drivers');

        await this.driverRegistry.load(driversDir);

        // Load project-specific drivers
        if (this.disk.exists(this.config.driversDir)) {
            await this.driverRegistry.load(this.config.driversDir);
        }

        this.loadState();
    }

    /**
     * Start the workflow with a user prompt.
     */
    async start(prompt: string): Promise<void> {
        this.host.log('info', "Starting AI-driven workflow...");

        // If resuming, check if we need to reset loop count or handle previous interruption
        if (this.state.status === 'INTERRUPTED') {
            this.host.log('info', "Resuming interrupted session...");
            this.state.status = 'PLANNING'; // Default resume state
        } else {
            this.state.status = 'ARCHITECTING';
            // TODO: Store prompt in session/state so Architect can access it without passing it around?
            // For now, we will pass it.
        }
        this.saveState();

        // You can run the loop here or let the caller drive it via step()
        // For backward compatibility / ease of use, we can have a run() method.
        await this.run(prompt);
    }

    /**
     * Run the workflow loop until completion or failure.
     */
    async run(prompt: string): Promise<void> {
        const MAX_LOOPS = 5;

        while (this.state.status !== 'COMPLETED' && this.state.status !== 'FAILED') {
            if (this.state.loop_count > MAX_LOOPS) {
                this.host.log('error', "Max loops reached. Stopping.");
                this.state.status = 'FAILED';
                this.saveState();
                break;
            }
            await this.step(prompt);
        }

        if (this.state.status === 'COMPLETED') {
            this.host.log('info', "Workflow Completed.");
        }
    }

    /**
     * Execute a single step of the state machine.
     */
    async step(prompt: string): Promise<void> {
        try {
            switch (this.state.status) {
                case 'ARCHITECTING':
                    this.host.log('info', "State: ARCHITECTING");
                    await this.architect.generateArchitecture(prompt);
                    this.state.status = 'PLANNING';
                    this.saveState();
                    break;

                case 'PLANNING': {
                    this.host.log('info', "State: PLANNING");
                    const plan = await this.planner.generatePlan(prompt, this.state.last_signal, this.state.tasks.completed);
                    this.state.current_plan = plan.plan_name;
                    this.state.status = 'EXECUTING';
                    this.saveState();
                    break;
                }

                case 'EXECUTING': {
                    this.host.log('info', "State: EXECUTING");
                    const planPath = this.config.planPath;
                    const planContent = this.disk.readFile(planPath);
                    const plan = yaml.load(planContent) as any;

                    await this.executor.executePlan(plan, prompt, this.state.tasks.completed);

                    this.state.status = 'COMPLETED';
                    this.saveState();
                    break;
                }
                case 'INTERRUPTED':
                    this.host.log('warn', "State: INTERRUPTED - Resuming to PLANNING");
                    this.state.status = 'PLANNING';
                    this.saveState();
                    break;

                case 'IDLE':
                    this.host.log('debug', "State: IDLE - No active task.");
                    break;

                case 'COMPLETED':
                    this.host.log('info', "Workflow Completed.");
                    break;
            }
        } catch (e) {
            if (e instanceof SignalDetectedError) {
                this.host.log('warn', `Signal detected: ${e.signal.type}`);
                this.state.last_signal = e.signal;
                this.state.status = 'INTERRUPTED';
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

                const files = this.disk.listFiles(this.config.signalsPath);
                for (const file of files) {
                    this.archiveSignal(file);
                }

            } else {
                this.host.log('error', `Unexpected error: ${(e as Error).message}`);
                this.state.status = 'FAILED';
                this.saveState();
                throw e;
            }
        }
    }

    async execute(input: string): Promise<void> {
        input = input.trim();
        await this.start(input);
    }
}

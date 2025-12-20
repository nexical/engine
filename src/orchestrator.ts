import { SignalDetectedError } from './errors/SignalDetectedError.js';
import { RuntimeHost } from './interfaces/RuntimeHost.js';
import { ProjectProfile } from './interfaces/ProjectProfile.js';
import { Application } from './models/Application.js';
import { EngineState, Signal } from './models/State.js';
import { AgentSession } from './models/AgentSession.js';
import { Planner } from './workflow/planner.js';
import { Architect } from './workflow/architect.js';
import { Executor } from './workflow/executor.js';
import { GitService } from './services/GitService.js';
import { FileSystemService } from './services/FileSystemService.js';
import { PromptEngine } from './services/PromptEngine.js';
import { DriverRegistry } from './drivers/Registry.js';
import yaml from 'js-yaml';
import path from 'path';
import debug from 'debug';

const log = debug('orchestrator');

export class Orchestrator {
    public config: Application;
    public state!: EngineState;

    public disk: FileSystemService;
    public git: GitService;

    public driverRegistry: DriverRegistry;
    public promptEngine: PromptEngine;

    public host: RuntimeHost;
    public session: AgentSession;
    public profile!: ProjectProfile;

    private planner: Planner;
    private architect: Architect;
    private executor: Executor;

    constructor(rootDirectory: string, host: RuntimeHost) {
        this.host = host;
        this.disk = new FileSystemService();
        this.config = new Application(rootDirectory, this.disk);

        this.host.log('info', `Project path: ${this.config.rootDirectory}`);

        // Initialize session
        this.session = new AgentSession(this.config);
        this.loadConfig();

        // Initialize shared services
        this.git = new GitService(this);
        this.promptEngine = new PromptEngine(this);

        // Initialize Registries
        this.driverRegistry = new DriverRegistry(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.architect = new Architect(this);
        this.executor = new Executor(this);
    }

    private loadConfig(): void {
        this.profile = {} as ProjectProfile;

        if (this.disk.exists(this.config.configPath)) {
            try {
                const content = this.disk.readFile(this.config.configPath);
                this.profile = yaml.load(content) as ProjectProfile;
                this.host.log('info', `Loaded project config from ${this.config.configPath}`);
            } catch (e) {
                this.host.log('error', `Failed to load config: ${e}`);
            }
        }
    }

    private loadState(): void {
        if (this.disk.exists(this.config.statePath)) {
            const content = this.disk.readFile(this.config.statePath);
            this.state = EngineState.fromYaml(content);
            this.session.id = this.state.session_id; // Sync session ID
            this.host.log('info', `Loaded state: ${this.state.session_id} (${this.state.status})`);
        } else {
            this.state = new EngineState(this.session.id);
            this.host.log('debug', `Initialized new state: ${this.state.session_id}`);
        }
    }

    private saveState(): void {
        const content = this.state.toYaml();
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
            this.state.updateStatus('PLANNING'); // Default resume state
        } else {
            this.state.updateStatus('ARCHITECTING');
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
                this.state.updateStatus('FAILED');
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
                    this.state.updateStatus('PLANNING');
                    this.saveState();
                    break;

                case 'PLANNING': {
                    this.host.log('info', "State: PLANNING");
                    const plan = await this.planner.generatePlan(prompt, this.state.last_signal, this.state.tasks.completed);
                    this.state.current_plan = plan.plan_name;
                    this.state.updateStatus('EXECUTING');
                    this.saveState();
                    break;
                }

                case 'EXECUTING': {
                    this.host.log('info', "State: EXECUTING");
                    const planPath = this.config.planPath;
                    const planContent = this.disk.readFile(planPath);
                    // Updated to use Plan.fromYaml
                    // But wait, Executor expects Plan object or json?
                    // Executor.executePlan signature is likely specific.
                    // Let's assume for now we load it as any or Plan.
                    // But `planContent` is string.
                    // Check Executor signature later. 
                    // However, we imported Plan, so let's use it if Executor supports it.
                    // The old code was `yaml.load(planContent)`.
                    // We need to verify `executor.ts`.
                    // For now, let's keep it as `yaml.load` BUT cast to any to be safe OR refactor usage if I fix executor.
                    // But I AM refactoring executor. So I should use the proper class here if I can.

                    // Actually, let's look at `executor.ts` in the next step.
                    // Here I will use `yaml.load` compatible with old way OR better, use `Plan.fromYaml(planContent)`.
                    // I will change it to `import { Plan } from './models/Plan.js'` (already imported?)
                    // It is NOT imported in replacement content above. I should add `import { Plan } from './models/Plan.js';`
                    // Ah, I missed adding `Plan` to imports.

                    // Let's defer strict typing of this call until I verify Executor.
                    const plan = yaml.load(planContent) as any;

                    await this.executor.executePlan(plan, prompt, this.state.tasks.completed);

                    this.state.updateStatus('COMPLETED');
                    this.saveState();
                    break;
                }
                case 'INTERRUPTED':
                    this.host.log('warn', "State: INTERRUPTED - Resuming to PLANNING");
                    this.state.updateStatus('PLANNING');
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
                this.state.recordSignal(e.signal);
                this.state.updateStatus('INTERRUPTED');
                this.state.incrementLoop();

                this.appendEvolutionLog(e.signal);

                if (e.signal.type === 'REARCHITECT') {
                    this.state.updateStatus('ARCHITECTING');
                    if (e.signal.invalidates_previous_work) {
                        this.state.tasks.completed = [];
                    }
                } else if (e.signal.type === 'REPLAN') {
                    this.state.updateStatus('PLANNING');
                }

                this.saveState();

                const files = this.disk.listFiles(this.config.signalsPath);
                for (const file of files) {
                    this.archiveSignal(file);
                }

            } else {
                this.host.log('error', `Unexpected error: ${(e as Error).message}`);
                this.state.updateStatus('FAILED');
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

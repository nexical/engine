import { SignalDetectedError } from './errors/SignalDetectedError.js';
import { RuntimeHost } from './interfaces/RuntimeHost.js';
import { Signal } from './interfaces/Signal.js';
import { Application } from './models/Application.js';
import { EngineState } from './models/State.js';
import { AgentSession } from './models/AgentSession.js';
import { ProjectProfile } from './models/ProjectProfile.js';
import { Planner } from './workflow/planner.js';
import { Architect } from './workflow/architect.js';
import { Executor } from './workflow/executor.js';
import { GitService } from './services/GitService.js';
import { FileSystemService } from './services/FileSystemService.js';
import { PromptEngine } from './services/PromptEngine.js';
import { SkillRunner } from './services/SkillRunner.js';
import { DriverRegistry } from './drivers/Registry.js';
import yaml from 'js-yaml';
import path from 'path';

export class Orchestrator {
    public config: Application;
    public state!: EngineState;

    public disk: FileSystemService;
    public git: GitService;

    public driverRegistry: DriverRegistry;
    public promptEngine: PromptEngine;
    public skillRunner: SkillRunner;

    public host: RuntimeHost;
    public session: AgentSession;
    public profile!: ProjectProfile;

    private planner: Planner;
    private architect: Architect;
    private executor: Executor;

    public interactive: boolean = false;

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
        this.skillRunner = new SkillRunner(this);

        // Initialize Registries
        this.driverRegistry = new DriverRegistry(this);

        // Initialize orchestrator components
        this.planner = new Planner(this);
        this.architect = new Architect(this);
        this.executor = new Executor(this);
    }

    private loadConfig(): void {
        this.profile = ProjectProfile.load(this.config.configPath);
        this.host.log('info', `Loaded project config from ${this.config.configPath}`);
    }

    private loadState(): void {
        if (this.disk.exists(this.config.statePath)) {
            const content = this.disk.readFile(this.config.statePath);
            try {
                this.state = EngineState.fromYaml(content);
                this.session.id = this.state.session_id; // Sync session ID
                this.host.log('info', `Loaded state: ${this.state.session_id} (${this.state.status})`);
            } catch (e) {
                this.host.log('warn', `Failed to load state: ${(e as Error).message}. Initializing new state.`);
                this.state = new EngineState(this.session.id);
            }
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
        let history: any[] = [];
        if (this.disk.exists(this.config.logPath)) {
            try {
                const content = this.disk.readFile(this.config.logPath);
                history = yaml.load(content) as any[] || [];
            } catch (e) {
                this.host.log('warn', `Failed to load evolution log: ${(e as Error).message}. Starting new log.`);
                history = [];
            }
        }

        const entry = {
            session_id: this.state.session_id,
            type: signal.type,
            source: signal.source,
            reason: signal.reason,
            timestamp: signal.timestamp
        };

        history.push(entry);
        this.disk.writeFileAtomic(this.config.logPath, yaml.dump(history));
    }

    private archiveSignal(signalFile: string): void {
        const source = path.join(this.config.signalsDirectory, signalFile);
        const dest = path.join(this.config.archiveDirectory, signalFile);
        if (this.disk.exists(source)) {
            this.disk.move(source, dest, { overwrite: true });
        }
    }

    async init(interactive: boolean = false): Promise<void> {
        this.interactive = interactive;

        const driversDir = path.join(this.config.appDirectory, '../drivers');
        await this.driverRegistry.load(driversDir);

        // Load project-specific drivers
        if (this.disk.exists(this.config.driversDirectory)) {
            await this.driverRegistry.load(this.config.driversDirectory);
        }

        // Validate all available skills
        await this.skillRunner.validateAvailableSkills();

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
            this.state.resetLoop(); // Ensure loop count is fresh for new workflow
        }
        this.saveState();

        await this.run(prompt);
    }

    /**
     * Run the workflow loop until completion or failure.
     */
    async run(prompt: string): Promise<void> {
        const MAX_LOOPS = 5;
        let currentPrompt = prompt;

        while (true) {
            // Inner loop: Execute current goal
            while (this.state.status !== 'COMPLETED' && this.state.status !== 'FAILED') {
                if (this.state.loop_count > MAX_LOOPS) {
                    this.host.log('error', "Max loops reached. Stopping.");
                    this.state.updateStatus('FAILED');
                    this.saveState();
                    break;
                }

                await this.step(currentPrompt);
            }

            if (this.state.status === 'COMPLETED') {
                this.host.log('info', "Workflow Completed.");

                // --- Git Diff Display ---
                try {
                    this.host.log('info', "Showing changes:");
                } catch (e) {
                    this.host.log('error', "Could not retrieve git diff.");
                }
            }

            // --- Interactive Session Loop ---
            if (this.interactive) {
                const nextInstruction = await this.host.ask(
                    this.state.status === 'FAILED'
                        ? "Workflow detected failure. What would you like to do next?"
                        : "Workflow finished. Enter new instruction or type 'exit' to quit.",
                    'text'
                );

                if (typeof nextInstruction === 'string' && nextInstruction.toLowerCase() !== 'exit') {
                    // Reset for next instruction
                    this.host.log('info', `New instruction received: ${nextInstruction}`);
                    currentPrompt = nextInstruction;

                    // Reset state for new Architecture cycle
                    this.state.updateStatus('ARCHITECTING');
                    this.state.resetLoop();
                    this.state.tasks.completed = [];
                    this.state.tasks.failed = [];
                    // Keep session ID? Yes. 
                    this.saveState();
                    continue; // Re-enter inner loop
                } else {
                    this.host.log('info', "Exiting session.");
                    break; // Exit outer loop
                }
            } else {
                break; // Non-interactive mode exits after completion
            }
        }
    }

    /**
     * Execute a single step of the state machine.
     */
    async step(prompt: string): Promise<void> {
        try {
            switch (this.state.status) {
                case 'ARCHITECTING': {
                    this.host.log('info', "State: ARCHITECTING");
                    let architectureFeedback = "";

                    // Loop for Architecture Review
                    while (true) {
                        // Append feedback to prompt if it exists (simple mechanism)
                        const promptWithFeedback = architectureFeedback
                            ? `${prompt}\n\nFEEDBACK_HISTORY:\n${architectureFeedback}`
                            : prompt;

                        await this.architect.generateArchitecture(promptWithFeedback);

                        // Interactive Review Gate
                        if (this.interactive) {
                            const archContent = this.disk.readFile(this.config.architecturePath);

                            // Re-check host usage. If we need a complex review (display markdown + input), we assume `ask` handles the prompt display.
                            const userResponse = await this.host.ask(archContent, 'text');

                            if (typeof userResponse === 'string') {
                                if (userResponse.trim().toLowerCase() === 'yes') {
                                    break; // Proceed
                                } else {
                                    this.host.log('info', "Feedback received. Refining Architecture...");
                                    architectureFeedback += `\n- ${userResponse}`;
                                    continue; // Rework architecture
                                }
                            }
                        } else {
                            break; // Non-interactive assumes approval
                        }
                    }

                    this.state.updateStatus('PLANNING');
                    this.saveState();
                    break;
                }

                case 'PLANNING': {
                    this.host.log('info', "State: PLANNING");
                    let planFeedback = "";

                    while (true) {
                        const promptWithFeedback = planFeedback
                            ? `${prompt}\n\nFEEDBACK_HISTORY:\n${planFeedback}`
                            : prompt;

                        const plan = await this.planner.generatePlan(promptWithFeedback, this.state.last_signal, this.state.tasks.completed);

                        // Interactive Review Gate
                        if (this.interactive) {
                            const planYaml = plan.toYaml();
                            const userResponse = await this.host.ask(planYaml, 'text');

                            if (typeof userResponse === 'string') {
                                if (userResponse.trim().toLowerCase() === 'yes') {
                                    this.state.current_plan = plan.plan_name; // Confirm plan name
                                    break; // Proceed
                                } else {
                                    this.host.log('info', "Feedback received. Refining Plan...");
                                    planFeedback += `\n- ${userResponse}`;
                                    continue; // Rework plan
                                }
                            }
                        } else {
                            this.state.current_plan = plan.plan_name;
                            break;
                        }
                    }

                    this.state.updateStatus('EXECUTING');
                    this.saveState();
                    break;
                }

                case 'EXECUTING': {
                    this.host.log('info', "State: EXECUTING");
                    const planPath = this.config.planPath;
                    const planContent = this.disk.readFile(planPath);
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

                const files = this.disk.listFiles(this.config.signalsDirectory);
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
        await this.start(input.trim());
    }
}

import { RuntimeHost } from './common/interfaces/RuntimeHost.js';
import { Project } from './domain/Project.js';
import { Workspace } from './domain/Workspace.js';
import { Session } from './domain/Session.js';
import { Brain } from './agents/Brain.js';

export class Orchestrator {
    public project!: Project;
    public brain!: Brain;
    public workspace!: Workspace;
    public session!: Session;

    constructor(
        public readonly rootDirectory: string,
        public readonly host: RuntimeHost
    ) { }

    async init(): Promise<void> {
        // 1. Initialize Project (Configuration & Paths)
        this.project = new Project(this.rootDirectory);

        // 2. Initialize Brain (Cognitive Services)
        this.brain = new Brain(this.project, this.host);
        await this.brain.init();

        // 3. Initialize Workspace (Mutable state)
        this.workspace = new Workspace(this.project);

        // 4. Initialize Session (Execution State)
        this.session = new Session(this.project, this.workspace, this.brain, this.host);
    }

    async start(prompt: string): Promise<void> {
        if (!this.session) {
            throw new Error("Orchestrator not initialized. Call init() first.");
        }
        await this.session.start(prompt);
    }

    async execute(input: string): Promise<void> {
        await this.start(input.trim());
    }
}

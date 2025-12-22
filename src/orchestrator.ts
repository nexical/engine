import { RuntimeHost } from './domain/RuntimeHost.js';
import { Project } from './domain/Project.js';
import { Workspace } from './domain/Workspace.js';
import { Session } from './domain/Session.js';
import { Brain } from './agents/Brain.js';

export class Orchestrator {
    private _project?: Project;
    private _brain?: Brain;
    private _workspace?: Workspace;
    private _session?: Session;

    public get project(): Project {
        if (!this._project) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._project;
    }

    public get brain(): Brain {
        if (!this._brain) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._brain;
    }

    public get workspace(): Workspace {
        if (!this._workspace) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._workspace;
    }

    public get session(): Session {
        if (!this._session) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._session;
    }

    constructor(
        public readonly rootDirectory: string,
        public readonly host: RuntimeHost
    ) { }

    async init(): Promise<void> {
        // 1. Initialize Project (Configuration & Paths)
        this._project = new Project(this.rootDirectory);

        // 2. Initialize Brain (Cognitive Services)
        this._brain = new Brain(this._project, this.host);
        await this._brain.init();

        // 3. Initialize Workspace (Mutable state)
        this._workspace = new Workspace(this._project);

        // 4. Initialize Session (Execution State)
        this._session = new Session(this._project, this._workspace, this._brain, this.host);
    }

    async start(prompt: string, interactive: boolean = true): Promise<void> {
        await this.session.start(prompt.trim(), interactive);
    }

    async execute(prompt: string): Promise<void> {
        await this.start(prompt, false);
    }
}

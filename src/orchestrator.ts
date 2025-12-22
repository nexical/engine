import { RuntimeHost } from './domain/RuntimeHost.js';
import { Project, IProject } from './domain/Project.js';
import { Workspace, IWorkspace } from './domain/Workspace.js';
import { Session } from './domain/Session.js';
import { Brain } from './agents/Brain.js';
import { EventEmitter } from 'events';

import { ServiceFactory } from './services/ServiceFactory.js';

export class Orchestrator extends EventEmitter {
    private _project?: IProject;
    private _brain?: Brain;
    private _workspace?: IWorkspace;
    private _session?: Session;

    public get project(): IProject {
        if (!this._project) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._project;
    }

    public get brain(): Brain {
        if (!this._brain) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._brain;
    }

    public get workspace(): IWorkspace {
        if (!this._workspace) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._workspace;
    }

    public get session(): Session {
        if (!this._session) throw new Error("Orchestrator not initialized. Call init() first.");
        return this._session;
    }

    public readonly host: RuntimeHost;

    constructor(
        public readonly rootDirectory: string,
        host: RuntimeHost
    ) {
        super();
        // Wrap host to bubble events to Orchestrator
        this.host = {
            ...host,
            emit: (event: string, data: any) => {
                host.emit(event, data);
                this.emit(event, data);
            }
        };
    }

    async init(): Promise<void> {
        const services = await ServiceFactory.createServices(this.rootDirectory, this.host);

        // Wire up services
        this._project = services.project;
        this._brain = services.brain;
        this._workspace = services.workspace;
        this._session = services.session;
    }

    async start(prompt: string, interactive: boolean = true): Promise<void> {
        await this.session.start(prompt.trim(), interactive);
    }

    async execute(prompt: string): Promise<void> {
        await this.start(prompt, false);
    }
}

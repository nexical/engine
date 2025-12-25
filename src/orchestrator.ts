import { EventEmitter } from 'events';

import { Brain } from './agents/Brain.js';
import { IProject } from './domain/Project.js';
import { IRuntimeHost } from './domain/RuntimeHost.js';
import { Session } from './domain/Session.js';
import { IWorkspace } from './domain/Workspace.js';
import { ServiceFactory } from './services/ServiceFactory.js';

export class Orchestrator extends EventEmitter {
  private _project?: IProject;
  private _brain?: Brain;
  private _workspace?: IWorkspace;
  private _session?: Session;

  public get project(): IProject {
    if (!this._project) throw new Error('Orchestrator not initialized. Call init() first.');
    return this._project;
  }

  public get brain(): Brain {
    if (!this._brain) throw new Error('Orchestrator not initialized. Call init() first.');
    return this._brain;
  }

  public get workspace(): IWorkspace {
    if (!this._workspace) throw new Error('Orchestrator not initialized. Call init() first.');
    return this._workspace;
  }

  public get session(): Session {
    if (!this._session) throw new Error('Orchestrator not initialized. Call init() first.');
    return this._session;
  }

  public readonly host: IRuntimeHost;

  constructor(
    public readonly rootDirectory: string,
    host: IRuntimeHost,
  ) {
    super();
    // Wrap host to bubble events to Orchestrator
    this.host = {
      ...host,
      emit: (event: string, data: unknown): void => {
        host.emit(event, data);
        this.emit(event, data);
      },
    };
  }

  async init(skipBrainInit = false): Promise<void> {
    const services = await ServiceFactory.createServices(this.rootDirectory, this.host);

    // Wire up services
    this._project = services.project;
    this._brain = services.brain;
    this._workspace = services.workspace;
    this._session = services.session;

    if (!skipBrainInit) {
      await this._brain.init();
    }
  }

  async start(prompt: string, interactive: boolean = true): Promise<void> {
    await this.session.start(prompt.trim(), interactive);
  }

  async execute(prompt: string): Promise<void> {
    await this.start(prompt, false);
  }
}

import { EngineState } from './State.js';
import { IProject } from './Project.js';
import { IWorkspace } from './Workspace.js';
import { RuntimeHost } from './RuntimeHost.js';
import { Brain } from '../agents/Brain.js';
import { Workflow } from '../workflow/Workflow.js';

export class Session {
    public readonly id: string;
    public state: EngineState;
    public workflow: Workflow | null = null;

    constructor(
        private project: IProject,
        private workspace: IWorkspace,
        private brain: Brain,
        private host: RuntimeHost
    ) {
        this.id = new Date().toISOString().replace(/[:.]/g, '-');
        this.state = new EngineState(this.id);
    }

    public async start(prompt: string, interactive: boolean = false): Promise<void> {
        this.state.initialize(prompt, interactive);
        this.host.log('info', `Session ${this.id} started.`);
        // Note: Workflow/Workspace handles initial state save
        await this.runWorkflow();
    }

    public async resume(): Promise<void> {
        // Load state from workspace
        const loaded = await this.workspace.loadState();
        if (loaded) {
            this.state = loaded;
            this.host.log('info', `Resuming session ${this.state.session_id} at state ${this.state.status}`);
            await this.runWorkflow();
        } else {
            throw new Error("No saved state found to resume.");
        }
    }

    private async runWorkflow(): Promise<void> {
        const { Workflow } = await import('../workflow/Workflow.js');
        this.workflow = new Workflow(this.brain, this.project, this.workspace, this.host);
        await this.workflow.start(this.state);
    }
}

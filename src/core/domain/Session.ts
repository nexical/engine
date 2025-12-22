import { EngineState } from '../../models/State.js';
import { Project } from './Project.js';
import { Workspace } from './Workspace.js';
import { RuntimeHost } from '../../interfaces/RuntimeHost.js';
import { Brain } from '../brain/Brain.js';

export class Session {
    public readonly id: string;
    public state: EngineState;
    public workflow: any = null; // Type as Workflow (lazy import)

    constructor(
        private project: Project,
        private workspace: Workspace,
        private brain: Brain,
        private host: RuntimeHost
    ) {
        this.id = new Date().toISOString().replace(/[:.]/g, '-');
        this.state = new EngineState(this.id);
    }

    public async start(prompt: string, interactive: boolean = false): Promise<void> {
        this.state.user_prompt = prompt;
        // this.state.updateStatus('STARTING'); // Workflow will update status
        this.host.log('info', `Session ${this.id} started.`);

        const { Workflow } = await import('../../workflow/Workflow.js');
        this.workflow = new Workflow(this.brain, this.project, this.workspace, this.host);

        await this.workflow.start(this.state);
    }

    public async resume(): Promise<void> {
        // Load state logic
    }
}

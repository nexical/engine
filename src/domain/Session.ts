import { EngineState } from './State.js';
import { Project } from './Project.js';
import { Workspace } from './Workspace.js';
import { RuntimeHost } from './RuntimeHost.js';
import { Brain } from '../agents/Brain.js';
import { FileSystemService } from '../services/FileSystemService.js';

export class Session {
    public readonly id: string;
    public state: EngineState;
    public workflow: any = null; // Type as Workflow (lazy import)
    private disk: FileSystemService;

    constructor(
        private project: Project,
        private workspace: Workspace,
        private brain: Brain,
        private host: RuntimeHost
    ) {
        this.id = new Date().toISOString().replace(/[:.]/g, '-');
        this.state = new EngineState(this.id);
        this.disk = new FileSystemService();
    }

    public async start(prompt: string, interactive: boolean = false): Promise<void> {
        this.state.initialize(prompt, interactive);
        this.host.log('info', `Session ${this.id} started.`);
        await this.saveState();
        await this.runWorkflow();
    }

    public async resume(): Promise<void> {
        await this.loadState();
        this.host.log('info', `Resuming session ${this.state.session_id} at state ${this.state.status}`);
        await this.runWorkflow();
    }

    private async runWorkflow(): Promise<void> {
        const { Workflow } = await import('../workflow/Workflow.js');
        this.workflow = new Workflow(this.brain, this.project, this.workspace, this.host);

        // Pass save callback to workflow if we want periodic saves
        await this.workflow.start(this.state, async () => await this.saveState());
    }

    public async saveState(): Promise<void> {
        this.disk.writeFileAtomic(this.project.paths.state, this.state.toYaml());
    }

    public async loadState(): Promise<void> {
        if (this.disk.exists(this.project.paths.state)) {
            const content = this.disk.readFile(this.project.paths.state);
            this.state = EngineState.fromYaml(content);
        } else {
            throw new Error(`State file not found at ${this.project.paths.state}`);
        }
    }
}

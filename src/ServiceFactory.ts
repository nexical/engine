import { RuntimeHost } from './domain/RuntimeHost.js';
import { Project, IProject } from './domain/Project.js';
import { Workspace, IWorkspace } from './domain/Workspace.js';
import { Brain } from './agents/Brain.js';
import { Session } from './domain/Session.js';
import { IFileSystem } from './domain/IFileSystem.js';

export interface EngineServices {
    project: IProject;
    brain: Brain;
    workspace: IWorkspace;
    session: Session;
}

export class ServiceFactory {
    public static async createServices(
        rootDirectory: string,
        host: RuntimeHost,
        fileSystem?: IFileSystem
    ): Promise<EngineServices> {
        // 1. Initialize Project (Configuration & Paths)
        const project = new Project(rootDirectory, fileSystem);

        // 2. Initialize Brain (Cognitive Services)
        const brain = new Brain(project, host);
        await brain.init();

        // 3. Initialize Workspace (Mutable state)
        const workspace = new Workspace(project);

        // 4. Initialize Session (Execution State)
        const session = new Session(project, workspace, brain, host);

        return {
            project,
            brain,
            workspace,
            session
        };
    }
}

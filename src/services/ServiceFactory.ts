import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project, IProject } from '../domain/Project.js';
import { Workspace, IWorkspace } from '../domain/Workspace.js';
import { Brain } from '../agents/Brain.js';
import { Session } from '../domain/Session.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { DIContainer } from '../DIContainer.js';
import { FileSystemService } from './FileSystemService.js';
import { ArchitectAgent } from '../agents/ArchitectAgent.js';
import { PlannerAgent } from '../agents/PlannerAgent.js';
import { DeveloperAgent } from '../agents/DeveloperAgent.js';
import { DriverRegistry } from '../drivers/DriverRegistry.js';
import { PromptEngine } from './PromptEngine.js';
import { SkillRunner } from './SkillRunner.js';
import { EvolutionService } from './EvolutionService.js';

export interface EngineServices {
    project: IProject;
    brain: Brain;
    workspace: IWorkspace;
    session: Session;
    container: DIContainer;
}

export class ServiceFactory {
    public static async createServices(
        rootDirectory: string,
        host: RuntimeHost,
        fileSystem?: IFileSystem
    ): Promise<EngineServices> {
        const container = new DIContainer();

        // 1. Register Core Dependencies
        container.register('rootDirectory', rootDirectory);
        container.register('host', host);
        container.register('fileSystem', fileSystem || new FileSystemService());

        // 2. Register Project
        container.registerFactory('project', () => {
            return new Project(
                container.resolve('rootDirectory'),
                container.resolve('fileSystem')
            );
        });

        // 3. Register Sub-Services
        container.registerFactory('driverRegistry', () => {
            const project = container.resolve<Project>('project');
            const host = container.resolve<RuntimeHost>('host');
            const config = {
                ...project.paths,
                rootDirectory: project.rootDirectory
            };
            return new DriverRegistry(host, config, project.fileSystem);
        });

        container.registerFactory('promptEngine', () => {
            const project = container.resolve<Project>('project');
            const host = container.resolve<RuntimeHost>('host');
            const config = {
                promptDirectory: project.paths.prompts,
                appDirectory: project.rootDirectory
            };
            return new PromptEngine(config, host);
        });

        container.registerFactory('skillRunner', () => {
            const project = container.resolve<Project>('project');
            // Resolve registry to pass it, rather than depending on Brain internal.
            // But wait, Brain usually creates SkillRunner. 
            // If we register SkillRunner here, we need DriverRegistry.
            const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
            const promptEngine = container.resolve<PromptEngine>('promptEngine');
            const host = container.resolve<RuntimeHost>('host');
            return new SkillRunner(project, driverRegistry, promptEngine, host);
        });

        container.registerFactory('evolutionService', () => {
            const project = container.resolve<Project>('project');
            return new EvolutionService(project);
        });

        // 4. Register Brain
        // Brain needs careful construction as it might have its own internal dependencies
        container.registerFactory('brain', () => {
            const project = container.resolve<Project>('project');
            const host = container.resolve<RuntimeHost>('host');

            // Resolve sub-services
            const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
            const promptEngine = container.resolve<PromptEngine>('promptEngine');
            const skillRunner = container.resolve<SkillRunner>('skillRunner');
            const evolution = container.resolve<EvolutionService>('evolutionService');

            const brain = new Brain(project, host, {
                driverRegistry,
                promptEngine,
                skillRunner,
                evolution
            });

            // Register Default Agents using resolved dependencies
            brain.registerAgent('architect', (workspace) => new ArchitectAgent(project, workspace, promptEngine, driverRegistry, evolution));
            brain.registerAgent('planner', (workspace) => new PlannerAgent(project, workspace, promptEngine, driverRegistry, skillRunner, evolution));
            brain.registerAgent('developer', (workspace) => new DeveloperAgent(project, workspace, skillRunner, host));

            return brain;
        });

        // Resolve and Initialize what needs initialization
        const project = container.resolve<Project>('project');
        const brain = container.resolve<Brain>('brain');
        await brain.init();

        const workspace = container.resolve<Workspace>('workspace');
        const session = container.resolve<Session>('session');

        return {
            project,
            brain,
            workspace,
            session,
            container
        };
    }
}


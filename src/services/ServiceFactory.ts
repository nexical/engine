import { ArchitectAgent } from '../agents/ArchitectAgent.js';
import { Brain } from '../agents/Brain.js';
import { Executor } from '../agents/Executor.js';
import { PlannerAgent } from '../agents/PlannerAgent.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { IProject, Project } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { Session } from '../domain/Session.js';
import { IWorkspace, Workspace } from '../domain/Workspace.js';
import { DriverRegistry, IDriverRegistry } from '../drivers/DriverRegistry.js';
import { DIContainer } from './DIContainer.js';
import { EvolutionService, IEvolutionService } from './EvolutionService.js';
import { FileSystemBus } from './FileSystemBus.js';
import { FileSystemService } from './FileSystemService.js';
import { GitService } from './GitService.js';
import { IPromptEngine, PromptEngine } from './PromptEngine.js';
import { ISkillRegistry, SkillRegistry } from './SkillRegistry.js';

export interface IEngineServices {
  project: IProject;
  brain: Brain;
  workspace: IWorkspace;
  session: Session;
  container: DIContainer;
}

export class ServiceFactory {
  public static async createServices(
    rootDirectory: string,
    host: IRuntimeHost,
    fileSystem?: IFileSystem,
  ): Promise<IEngineServices> {
    const container = new DIContainer();

    // 1. Register Core Dependencies
    container.register('rootDirectory', rootDirectory);
    container.register('host', host);
    container.register('fileSystem', fileSystem || new FileSystemService(host));

    // 2. Register Project
    container.registerFactory('project', () => {
      return new Project(container.resolve<string>('rootDirectory'), container.resolve<IFileSystem>('fileSystem'));
    });

    // 3. Register Workspace
    container.registerFactory('workspace', () => {
      const project = container.resolve<IProject>('project');
      return new Workspace(project);
    });

    // 4. Register Sub-Services
    container.registerFactory('driverRegistry', () => {
      const project = container.resolve<IProject>('project');
      const host = container.resolve<IRuntimeHost>('host');
      const fs = container.resolve<IFileSystem>('fileSystem');
      const config = {
        ...project.paths,
        rootDirectory: project.rootDirectory,
      };
      return new DriverRegistry(host, config, fs);
    });

    container.registerFactory('promptEngine', () => {
      const project = container.resolve<IProject>('project');
      const host = container.resolve<IRuntimeHost>('host');
      const config = {
        promptDirectory: project.paths.prompts,
        appDirectory: project.rootDirectory,
      };
      return new PromptEngine(config, host);
    });

    container.registerFactory('skillRegistry', () => {
      const project = container.resolve<IProject>('project');
      const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
      const host = container.resolve<IRuntimeHost>('host');
      return new SkillRegistry(project, driverRegistry, host);
    });

    container.registerFactory('evolutionService', () => {
      const project = container.resolve<IProject>('project');
      const fs = container.resolve<IFileSystem>('fileSystem');
      return new EvolutionService(project as Project, fs as FileSystemService);
    });

    container.registerFactory('gitService', () => {
      const host = container.resolve<IRuntimeHost>('host');
      const rootDirectory = container.resolve<string>('rootDirectory');
      return new GitService(host, rootDirectory);
    });

    container.registerFactory('fileSystemBus', () => {
      const project = container.resolve<IProject>('project');
      const fs = container.resolve<IFileSystem>('fileSystem');
      return new FileSystemBus(project, fs);
    });

    // 5. Register Brain
    container.registerFactory('brain', () => {
      const project = container.resolve<IProject>('project');
      const host = container.resolve<IRuntimeHost>('host');

      const driverRegistry = container.resolve<IDriverRegistry>('driverRegistry');
      const promptEngine = container.resolve<IPromptEngine>('promptEngine');
      const skillRegistry = container.resolve<ISkillRegistry>('skillRegistry');
      const evolution = container.resolve<IEvolutionService>('evolutionService');

      const brain = new Brain(project, host, {
        driverRegistry,
        promptEngine,
        skillRegistry,
        evolution,
      });

      // Register Default Agents
      container.registerFactory('architect', () => {
        const project = container.resolve<IProject>('project');
        const skillRegistry = container.resolve<ISkillRegistry>('skillRegistry');
        const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
        const evolution = container.resolve<IEvolutionService>('evolutionService');
        const host = container.resolve<IRuntimeHost>('host');
        const bus = container.resolve<FileSystemBus>('fileSystemBus');
        const promptEngine = container.resolve<IPromptEngine>('promptEngine');

        return (workspace: IWorkspace): ArchitectAgent =>
          new ArchitectAgent(project, workspace, skillRegistry, driverRegistry, evolution, host, bus, promptEngine);
      });

      container.registerFactory('planner', () => {
        const project = container.resolve<IProject>('project');
        const skillRegistry = container.resolve<ISkillRegistry>('skillRegistry');
        const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
        const evolution = container.resolve<IEvolutionService>('evolutionService');
        const host = container.resolve<IRuntimeHost>('host');
        const bus = container.resolve<FileSystemBus>('fileSystemBus');
        const promptEngine = container.resolve<IPromptEngine>('promptEngine');

        return (workspace: IWorkspace): PlannerAgent =>
          new PlannerAgent(project, workspace, skillRegistry, driverRegistry, evolution, host, bus, promptEngine);
      });

      brain.registerAgent('architect', (workspace) =>
        container.resolve<(workspace: IWorkspace) => ArchitectAgent>('architect')(workspace),
      );
      brain.registerAgent('planner', (workspace) =>
        container.resolve<(workspace: IWorkspace) => PlannerAgent>('planner')(workspace),
      );
      brain.registerAgent('executor', (workspace) => {
        const gitService = container.resolve<GitService>('gitService');
        const skillRegistry = container.resolve<ISkillRegistry>('skillRegistry');
        const driverRegistry = container.resolve<DriverRegistry>('driverRegistry');
        const bus = container.resolve<FileSystemBus>('fileSystemBus');
        const promptEngine = container.resolve<IPromptEngine>('promptEngine');
        return new Executor(project, workspace, skillRegistry, driverRegistry, host, gitService, bus, promptEngine);
      });

      return brain;
    });

    // 6. Register Session
    container.registerFactory('session', () => {
      const project = container.resolve<IProject>('project');
      const workspace = container.resolve<IWorkspace>('workspace');
      const brain = container.resolve<Brain>('brain');
      const host = container.resolve<IRuntimeHost>('host');
      return new Session(project, workspace, brain, host);
    });

    // Resolve and Initialize what needs initialization
    const project = container.resolve<IProject>('project');
    const brain = container.resolve<Brain>('brain');

    // Note: Brain initialization is now the responsibility of the Orchestrator


    const workspace = container.resolve<IWorkspace>('workspace');
    const session = container.resolve<Session>('session');

    return {
      project,
      brain,
      workspace,
      session,
      container,
    };
  }
}

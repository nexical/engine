import { ArchitectAgent } from '../agents/ArchitectAgent.js';
import { Brain } from '../agents/Brain.js';
import { DeveloperAgent } from '../agents/DeveloperAgent.js';
import { PlannerAgent } from '../agents/PlannerAgent.js';
import { IFileSystem } from '../domain/IFileSystem.js';
import { IProject, Project } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { Session } from '../domain/Session.js';
import { IWorkspace, Workspace } from '../domain/Workspace.js';
import { DriverRegistry, IDriverRegistry } from '../drivers/DriverRegistry.js';
import { DIContainer } from './DIContainer.js';
import { EvolutionService, IEvolutionService } from './EvolutionService.js';
import { FileSystemService } from './FileSystemService.js';
import { GitService } from './GitService.js';
import { IPromptEngine, PromptEngine } from './PromptEngine.js';
import { ISkillRunner, SkillRunner } from './SkillRunner.js';

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

    container.registerFactory('skillRunner', () => {
      const project = container.resolve<IProject>('project');
      const driverRegistry = container.resolve<IDriverRegistry>('driverRegistry');
      const promptEngine = container.resolve<IPromptEngine>('promptEngine');
      const host = container.resolve<IRuntimeHost>('host');
      return new SkillRunner(project, driverRegistry as DriverRegistry, promptEngine as PromptEngine, host);
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

    // 5. Register Brain
    container.registerFactory('brain', () => {
      const project = container.resolve<IProject>('project');
      const host = container.resolve<IRuntimeHost>('host');

      const driverRegistry = container.resolve<IDriverRegistry>('driverRegistry');
      const promptEngine = container.resolve<IPromptEngine>('promptEngine');
      const skillRunner = container.resolve<ISkillRunner>('skillRunner');
      const evolution = container.resolve<IEvolutionService>('evolutionService');

      const brain = new Brain(project, host, {
        driverRegistry,
        promptEngine,
        skillRunner,
        evolution,
      });

      // Register Default Agents
      brain.registerAgent(
        'architect',
        (workspace) =>
          new ArchitectAgent(project, workspace, promptEngine, driverRegistry, skillRunner, evolution, host),
      );
      brain.registerAgent(
        'planner',
        (workspace) => new PlannerAgent(project, workspace, promptEngine, driverRegistry, skillRunner, evolution, host),
      );
      brain.registerAgent('developer', (workspace) => {
        const gitService = container.resolve<GitService>('gitService');
        return new DeveloperAgent(project, workspace, skillRunner, host, gitService);
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
    await brain.init();

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

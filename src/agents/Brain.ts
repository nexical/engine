import { IDriver } from '../domain/Driver.js';
import { IProject } from '../domain/Project.js';
import { IRuntimeHost } from '../domain/RuntimeHost.js';
import { IWorkspace } from '../domain/Workspace.js';
import { IDriverRegistry } from '../drivers/DriverRegistry.js';
import { IEvolutionService } from '../services/EvolutionService.js';
import { IPromptEngine } from '../services/PromptEngine.js';
import { ISkillRunner } from '../services/SkillRunner.js';
import type { ArchitectAgent } from './ArchitectAgent.js';
import type { Executor } from './Executor.js';
import type { PlannerAgent } from './PlannerAgent.js';

export class Brain {
  private promptEngine: IPromptEngine;
  private driverRegistry: IDriverRegistry;
  private skillRunner: ISkillRunner;
  private evolution: IEvolutionService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agentFactories: Map<string, (workspace: IWorkspace) => any> = new Map();

  constructor(
    private project: IProject,
    public readonly host: IRuntimeHost,
    dependencies: {
      promptEngine: IPromptEngine;
      driverRegistry: IDriverRegistry;
      skillRunner: ISkillRunner;
      evolution: IEvolutionService;
    },
  ) {
    this.promptEngine = dependencies.promptEngine;
    this.driverRegistry = dependencies.driverRegistry;
    this.skillRunner = dependencies.skillRunner;
    this.evolution = dependencies.evolution;
  }

  public registerAgent<T>(name: string, factory: (workspace: IWorkspace) => T): void {
    this.agentFactories.set(name, factory);
  }

  public createAgent<T>(name: string, workspace: IWorkspace): T {
    const factory = this.agentFactories.get(name);
    if (!factory) {
      throw new Error(`Agent type '${name}' not registered.`);
    }
    return factory(workspace) as T;
  }

  public async init(): Promise<void> {
    await this.driverRegistry.load(this.project.paths.drivers);
    await this.skillRunner.init();
    await this.skillRunner.validateAvailableSkills();
  }

  public getPromptEngine(): IPromptEngine {
    return this.promptEngine;
  }

  public getSkillRunner(): ISkillRunner {
    return this.skillRunner;
  }

  public getEvolution(): IEvolutionService {
    return this.evolution;
  }

  public getDriver(name: string): IDriver | undefined {
    return this.driverRegistry.get(name);
  }

  public getDefaultDriver(): IDriver | undefined {
    return this.driverRegistry.getDefault();
  }

  public createArchitect(workspace: IWorkspace): ArchitectAgent {
    return this.createAgent<ArchitectAgent>('architect', workspace);
  }

  public createPlanner(workspace: IWorkspace): PlannerAgent {
    return this.createAgent<PlannerAgent>('planner', workspace);
  }

  public createExecutor(workspace: IWorkspace): Executor {
    return this.createAgent<Executor>('executor', workspace);
  }
}

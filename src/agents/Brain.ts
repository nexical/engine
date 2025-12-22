import { PromptEngine, IPromptEngine, PromptEngineConfig } from '../services/PromptEngine.js';
import { DriverRegistry, IDriverRegistry } from '../drivers/DriverRegistry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project, IProject } from '../domain/Project.js';
import { IWorkspace } from '../domain/Workspace.js';
import { Driver } from '../domain/Driver.js';
import { SkillRunner, ISkillRunner } from '../services/SkillRunner.js';
import { EvolutionService, IEvolutionService } from '../services/EvolutionService.js';
import { FileSystemService } from '../services/FileSystemService.js';
import type { ArchitectAgent } from './ArchitectAgent.js';
import type { PlannerAgent } from './PlannerAgent.js';
import type { DeveloperAgent } from './DeveloperAgent.js';

export class Brain {
    private promptEngine: IPromptEngine;
    private driverRegistry: IDriverRegistry;
    private skillRunner: ISkillRunner;
    private evolution: IEvolutionService;
    private agentFactories: Map<string, (workspace: IWorkspace) => any> = new Map();

    constructor(
        private project: IProject,
        public readonly host: RuntimeHost,
        dependencies: {
            promptEngine: IPromptEngine;
            driverRegistry: IDriverRegistry;
            skillRunner: ISkillRunner;
            evolution: IEvolutionService;
        }
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

    public getDriver(name: string): Driver | undefined {
        return this.driverRegistry.get(name);
    }

    public getDefaultDriver(): Driver | undefined {
        return this.driverRegistry.getDefault();
    }

    public createArchitect(workspace: IWorkspace): ArchitectAgent {
        return this.createAgent<ArchitectAgent>('architect', workspace);
    }

    public createPlanner(workspace: IWorkspace): PlannerAgent {
        return this.createAgent<PlannerAgent>('planner', workspace);
    }

    public createDeveloper(workspace: IWorkspace): DeveloperAgent {
        return this.createAgent<DeveloperAgent>('developer', workspace);
    }
}

import { PromptEngine, IPromptEngine, PromptEngineConfig } from '../services/PromptEngine.js';
import { DriverRegistry, IDriverRegistry } from '../drivers/DriverRegistry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project, IProject } from '../domain/Project.js';
import { IWorkspace } from '../domain/Workspace.js';
import { Driver } from '../domain/Driver.js';
import { SkillRunner, ISkillRunner } from '../services/SkillRunner.js';
import { EvolutionService, IEvolutionService } from '../services/EvolutionService.js';
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
        dependencies?: {
            promptEngine?: IPromptEngine;
            driverRegistry?: IDriverRegistry;
            skillRunner?: ISkillRunner;
            evolution?: IEvolutionService;
        }
    ) {
        // Initialize dependencies if not provided
        if (dependencies?.promptEngine) {
            this.promptEngine = dependencies.promptEngine;
        } else {
            const promptConfig: PromptEngineConfig = {
                promptDirectory: project.paths.prompts,
                appDirectory: project.rootDirectory
            };
            this.promptEngine = new PromptEngine(promptConfig, host);
        }

        if (dependencies?.driverRegistry) {
            this.driverRegistry = dependencies.driverRegistry;
        } else {
            const driverConfig = {
                ...project.paths,
                rootDirectory: project.rootDirectory
            };
            this.driverRegistry = new DriverRegistry(host, driverConfig, project.fileSystem);
        }

        if (dependencies?.skillRunner) {
            this.skillRunner = dependencies.skillRunner;
        } else {
            this.skillRunner = new SkillRunner(project as Project, this.driverRegistry as DriverRegistry, this.promptEngine as PromptEngine, host);
        }

        if (dependencies?.evolution) {
            this.evolution = dependencies.evolution;
        } else {
            this.evolution = new EvolutionService(project as Project);
        }
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
        // Load drivers
        await this.driverRegistry.load(this.project.paths.drivers);

        // Init skills
        await this.skillRunner.init();

        // Validate skills
        await this.skillRunner.validateAvailableSkills();
    }

    public getPromptEngine(): IPromptEngine {
        return this.promptEngine;
    }

    public getSkillRunner(): ISkillRunner { // Return SkillRunner
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

    // Factory methods for Agents
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

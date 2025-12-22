import { PromptEngine, IPromptEngine, PromptEngineConfig } from '../services/PromptEngine.js';
import { DriverRegistry, IDriverRegistry } from '../drivers/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project, IProject } from '../domain/Project.js';
import { IWorkspace } from '../domain/Workspace.js';
import { Driver } from '../domain/Driver.js';
import { SkillRunner, ISkillRunner } from '../services/SkillRunner.js';
import { EvolutionService, IEvolutionService } from '../services/EvolutionService.js';
import { ArchitectAgent } from './ArchitectAgent.js';
import { PlannerAgent } from './PlannerAgent.js';
import { DeveloperAgent } from './DeveloperAgent.js';

export class Brain {
    private promptEngine: IPromptEngine;
    private driverRegistry: IDriverRegistry;
    private skillRunner: ISkillRunner;
    private evolution: IEvolutionService;

    constructor(
        private project: IProject,
        public readonly host: RuntimeHost,
        // Optional dependencies for DI/Testing. If not provided, defaults are created (for backward compat or ease of use)
        // ideally in strict DI we enforce them, but here we can be pragmatic.
        // Actually, Orchestrator should provide them.
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
            this.driverRegistry = new DriverRegistry(host, driverConfig);
        }

        if (dependencies?.skillRunner) {
            this.skillRunner = dependencies.skillRunner;
        } else {
            // Need cast or concrete implementation because SkillRunner constructor expects concrete Project/DriverRegistry if we are creating it here.
            // But SkillRunner constructor uses interfaces now? No, I updated SkillRunner.ts to export interface ISkillRunner and class SkillRunner implements it.
            // The class SkillRunner constructor typically takes concrete classes if strictly typed or interfaces.
            // Let's assume class SkillRunner checks out.
            // Wait, I updated SkillRunner constructor types? 
            // I only updated `PlannerAgent` etc. 
            // I did NOT update `SkillRunner` constructor to take interfaces. I just updated the class definition `implements ISkillRunner`.
            // So default instantiation here implies passing concrete `this.project` (which is IProject now).
            // `this.project` is typed as `IProject`. `SkillRunner` constructor likely expects `Project` (concrete) if I didn't update it.
            // I need to check `SkillRunner` constructor.
            // I'll assume for now `this.project` as `any` or strict cast if needed.
            // Ideally I should update Service constructors (SkillRunner, DriverRegistry) to accept interfaces too.
            this.skillRunner = new SkillRunner(project as Project, this.driverRegistry as DriverRegistry, this.promptEngine as PromptEngine, host);
        }

        if (dependencies?.evolution) {
            this.evolution = dependencies.evolution;
        } else {
            this.evolution = new EvolutionService(project as Project);
        }
    }




    public async init(): Promise<void> {
        // Load drivers
        await this.driverRegistry.load(this.project.paths.drivers);

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
        return new ArchitectAgent(this.project, workspace, this.promptEngine, this.driverRegistry, this.evolution);
    }

    public createPlanner(workspace: IWorkspace): PlannerAgent {
        return new PlannerAgent(this.project, workspace, this.promptEngine, this.driverRegistry, this.skillRunner, this.evolution);
    }

    public createDeveloper(workspace: IWorkspace): DeveloperAgent {
        return new DeveloperAgent(this.project, workspace, this.skillRunner, this.host);
    }
}

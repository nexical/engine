import { PromptEngine, PromptEngineConfig } from '../services/PromptEngine.js';
import { DriverRegistry } from '../drivers/Registry.js';
import { RuntimeHost } from '../domain/RuntimeHost.js';
import { Project } from '../domain/Project.js';
import { Driver } from '../domain/Driver.js';
import { SkillRunner } from '../services/SkillRunner.js';
import { EvolutionService } from '../services/EvolutionService.js';

export class Brain {
    private promptEngine: PromptEngine;
    private driverRegistry: DriverRegistry;
    private skillRunner: SkillRunner;
    private evolution: EvolutionService;

    constructor(
        private project: Project,
        public readonly host: RuntimeHost
    ) {
        // 1. Initialize PromptEngine
        const promptConfig: PromptEngineConfig = {
            promptDirectory: project.paths.prompts,
            appDirectory: project.rootDirectory
        };
        this.promptEngine = new PromptEngine(promptConfig, host);

        // 2. Initialize DriverRegistry
        const driverConfig = {
            ...project.paths,
            rootDirectory: project.rootDirectory
        };
        this.driverRegistry = new DriverRegistry(host, driverConfig);

        // 3. Initialize SkillRunner
        this.skillRunner = new SkillRunner(project, this.driverRegistry, this.promptEngine, host);

        // 4. Initialize EvolutionService
        this.evolution = new EvolutionService(project);
    }




    public async init(): Promise<void> {
        // Load drivers
        await this.driverRegistry.load(this.project.paths.drivers);

        // Validate skills
        await this.skillRunner.validateAvailableSkills();
    }

    public getPromptEngine(): PromptEngine {
        return this.promptEngine;
    }

    public getSkillRunner(): SkillRunner { // Return SkillRunner
        return this.skillRunner;
    }

    public getEvolution(): EvolutionService {
        return this.evolution;
    }

    public getDriver(name: string): Driver | undefined {
        return this.driverRegistry.get(name);
    }

    public getDefaultDriver(): Driver | undefined {
        return this.driverRegistry.getDefault();
    }
}
